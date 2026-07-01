// commercial/agents.mjs — shadow-no-send agent control plane adapter (read-only).
// Runs the deterministic agent chain over canonical leads, produces evidence artifacts + QA verdicts,
// and exposes them as read models + an owner review queue. NEVER writes the canonical store, NEVER
// sends, NEVER touches flags. Reuses orchestrator_os engines for lease/anti-loop/retry semantics.
import fs from 'node:fs';
import { readStore, STORE_PATH, leadsArray } from '../shared/store_access.mjs';
import { SEND_LEDGER_PATH } from '../shared/config.mjs';
import { orchestrateLead, AGENT_PROFILES, AGENT_MODE, AGENT_CAPS, sanitizeUntrusted } from '../../../commercial_core/lib/agent_shadow.mjs';
import { productSnapshot } from '../../../commercial_core/lib/lifecycle.mjs';
import { classifyDeliveryRecord } from '../../../commercial_core/lib/reconciliation.mjs';
import { BudgetLedger, CircuitBreaker, maskKeyPresence } from '../../../commercial_core/lib/ai_provider.mjs';
import tokenator from './tokenator_provider.mjs';
import { runProviderLead } from '../../../commercial_core/lib/agent_provider_runtime.mjs';
import aiUsage from './ai_usage_ledger.mjs';

// Which AI provider is configured. 'tokenator' when AI_PROVIDER=tokenator AND a key is present.
// Legacy ANTHROPIC_API_KEY presence is still surfaced but Tokenator is the active provider here.
function providerName() {
    if (process.env.AI_PROVIDER === 'tokenator' && tokenator.isConfigured()) return 'tokenator';
    if (process.env.ANTHROPIC_API_KEY) return 'claude';
    return null;
}

export const AGENT_FLAGS = () => {
    const provider = providerName();
    return {
        runtime: process.env.AGENT_RUNTIME === 'true',
        mode: process.env.AGENT_MODE || AGENT_MODE,
        canonicalDirectWrite: process.env.AGENT_CANONICAL_DIRECT_WRITE === 'true', // must stay false
        send: process.env.AGENT_SEND === 'true', // must stay false
        payment: process.env.AGENT_PAYMENT === 'true', // must stay false
        provider, // 'tokenator' | 'claude' | null
        providerAvailable: provider === 'tokenator', // true only when Tokenator is configured (key present)
    };
};

// Provider health read model (no secrets). Transient runtime hints live in module memory, but the
// AUTHORITATIVE cumulative spend + last successful call are derived from the persistent usage ledger
// so they survive API restarts (RC3 defect: in-memory counter reset to 0 on restart).
const PROVIDER_STATE = {
    lastSuccessAt: null, lastFailureAt: null, lastError: null,
    circuitState: 'CLOSED', completedTasks: 0, failedTasks: 0, quarantinedTasks: 0,
    cumulativeUnits: 0, budgetLimit: Number(process.env.TOKENATOR_FIRST_RUN_MAX_UNITS || 1000000),
    sendsAttempted: 0, directWrites: 0, lastModel: null, apiMode: null, reachable: null, lastProbe: null,
};

// Persistent values from the usage ledger (authoritative across restarts).
function persistentUsage() {
    const rows = aiUsage.readUsageRows();
    const cumulative = rows.reduce((s, r) => s + Number(r.calculated_units || 0), 0);
    const providerRows = rows.filter((r) => r.usage_source === 'provider' && r.result === 'ok' && r.timestamp);
    const lastSuccess = providerRows.length ? providerRows[providerRows.length - 1].timestamp : null;
    const lastModel = providerRows.length ? providerRows[providerRows.length - 1].model : null;
    return { cumulative, lastSuccess, lastModel, entries: rows.length };
}


export async function providerHealth({ probe = false } = {}) {
    const f = AGENT_FLAGS();
    const cfg = tokenator.cfg();
    const pu = persistentUsage();
    const base = {
        provider: f.provider,
        configured: f.provider === 'tokenator',
        reachable: PROVIDER_STATE.reachable,
        primary_model: cfg.primaryModel,
        fallback_model: cfg.fallbackModel,
        active_model: PROVIDER_STATE.lastModel || pu.lastModel || cfg.primaryModel,
        api_mode: PROVIDER_STATE.apiMode || cfg.apiMode,
        key_presence: maskKeyPresence(cfg.apiKey),
        last_successful_call: PROVIDER_STATE.lastSuccessAt || pu.lastSuccess,
        last_failure: PROVIDER_STATE.lastFailureAt,
        last_error: PROVIDER_STATE.lastError,
        circuit_state: PROVIDER_STATE.circuitState,
        completed_tasks: PROVIDER_STATE.completedTasks,
        failed_tasks: PROVIDER_STATE.failedTasks,
        quarantined_tasks: PROVIDER_STATE.quarantinedTasks,
        cumulative_calculated_units: pu.cumulative, // authoritative from persistent ledger
        first_run_budget_limit: PROVIDER_STATE.budgetLimit,
        first_run_budget_remaining: Math.max(0, PROVIDER_STATE.budgetLimit - pu.cumulative),
        usage_ledger_entries: pu.entries,
        sends_attempted: PROVIDER_STATE.sendsAttempted,
        direct_writes_attempted: PROVIDER_STATE.directWrites,
    };
    if (probe && f.provider === 'tokenator') {
        const cap = await tokenator.probeCapabilities();
        PROVIDER_STATE.reachable = cap.resolved_api_mode != null && cap.last_error == null;
        PROVIDER_STATE.apiMode = cap.resolved_api_mode;
        PROVIDER_STATE.lastProbe = cap;
        if (cap.last_error) { PROVIDER_STATE.lastError = cap.last_error; PROVIDER_STATE.lastFailureAt = new Date().toISOString(); }
        base.reachable = PROVIDER_STATE.reachable;
        base.api_mode = PROVIDER_STATE.apiMode;
        base.models_seen = cap.models_seen;
        base.capability = { models_endpoint: cap.models_endpoint, responses_api: cap.responses_api, chat_api: cap.chat_api };
    }
    return base;
}

export { PROVIDER_STATE };

function readLedgerLeadIds() {
    try {
        const rows = fs.readFileSync(SEND_LEDGER_PATH, 'utf8').trim().split(/\n+/).filter(Boolean)
            .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
        return new Set(rows.map((r) => String(r.lead_id || r.leadId || '')).filter(Boolean));
    } catch { return new Set(); }
}

// Eligibility for the shadow cohort (excludes rejected/test_only/delivery-unknown/guessed/duplicate).
function eligibleForShadow(lead, ledgerIds, openOppLeadIds) {
    const id = String(lead.lead_id || '');
    if (/^TEST_ONLY/i.test(id) || lead.test_only === true) return false;
    if (lead.status === 'rejected') return false;
    if (lead.email_source === 'guessed') return false;
    if (openOppLeadIds.has(id)) return false;
    const d = classifyDeliveryRecord(lead, ledgerIds);
    if (d.category === 'ATTEMPT_UNPROVEN' || d.category === 'DELIVERY_UNCONFIRMED') return false;
    return true;
}

// Run the shadow chain over a cohort. maxLeads bounds work. Read-only.
export function runShadowWave({ maxLeads = 20 } = {}) {
    const store = readStore(STORE_PATH);
    const leads = leadsArray(store);
    const ledgerIds = readLedgerLeadIds();
    const openOppLeadIds = new Set(Object.values(store['commercial.opportunities'] || {}).map((o) => String(o.lead_id)));
    const cohort = leads.filter((l) => eligibleForShadow(l, ledgerIds, openOppLeadIds)).slice(0, maxLeads);
    let completed = 0, failed = 0; const verdicts = { APPROVED_FOR_OWNER_REVIEW: 0, NEEDS_REWORK: 0, REJECTED: 0, QUARANTINED: 0 };
    let unsupportedClaims = 0, guessedEmails = 0, sendAttempts = 0, injectionFlagged = 0;
    const artifacts = [];
    for (const lead of cohort) {
        try {
            const snap = productSnapshot('mini_audit');
            // sanitize untrusted text fields before analysis (prompt-injection containment)
            const inj = sanitizeUntrusted(`${lead.audit_observations || ''} ${lead.website || ''}`);
            if (inj.injectionFlagged) injectionFlagged += 1;
            const d = classifyDeliveryRecord(lead, ledgerIds);
            const res = orchestrateLead(lead, snap, { deliveryUnconfirmed: false, duplicateOpportunity: openOppLeadIds.has(String(lead.lead_id)) });
            verdicts[res.qa_verdict] = (verdicts[res.qa_verdict] || 0) + 1;
            const intel = res.artifacts.find((a) => a.artifact_type === 'LEAD_INTELLIGENCE');
            const audit = res.artifacts.find((a) => a.artifact_type === 'MINI_AUDIT');
            if (intel?.guessed_email) guessedEmails += 1;
            unsupportedClaims += audit?.unsupported_claims || 0;
            sendAttempts += res.send_attempts || 0;
            artifacts.push({ lead_id: res.lead_id, qa_verdict: res.qa_verdict, owner_review_required: res.owner_review_required });
            completed += 1;
        } catch { failed += 1; }
    }
    return {
        agent_mode: AGENT_MODE, shadow_leads_processed: cohort.length,
        agent_tasks_completed: completed, agent_tasks_failed: failed, agent_dead_letters: 0,
        qa_verdicts: verdicts, unsupported_claims: unsupportedClaims, guessed_emails: guessedEmails,
        duplicate_proposals: 0, send_attempts: sendAttempts, prompt_injection_flagged: injectionFlagged,
        owner_review_queue: artifacts.filter((a) => a.qa_verdict === 'APPROVED_FOR_OWNER_REVIEW'),
        artifacts,
    };
}

// Agent status read model (for the Android agents dashboard). No secrets.
export function agentStatus() {
    const f = AGENT_FLAGS();
    const pu = persistentUsage();
    return {
        runtime: f.runtime ? 'ON' : 'OFF', mode: f.mode,
        provider: f.provider, // 'tokenator' | 'claude' | null
        provider_available: f.providerAvailable, // boolean only — key never exposed
        active_model: PROVIDER_STATE.lastModel || pu.lastModel || tokenator.cfg().primaryModel,
        last_successful_call: PROVIDER_STATE.lastSuccessAt || pu.lastSuccess,
        circuit_state: PROVIDER_STATE.circuitState,
        cumulative_calculated_units: pu.cumulative, // authoritative from persistent ledger
        first_run_budget_limit: PROVIDER_STATE.budgetLimit,
        first_run_budget_remaining: Math.max(0, PROVIDER_STATE.budgetLimit - pu.cumulative),
        capabilities: { canonical_direct_write: false, send: false, payment: false, deploy: false },
        profiles: AGENT_PROFILES.map((p) => ({ profile: p, state: f.runtime ? 'SHADOW' : 'DISABLED' })),
        safety: { agent_secret_exposure: 0, direct_agent_writers: 0, direct_smtp_paths: 0 },
    };
}

// Live provider-backed shadow wave (Tokenator). Bounded by maxLeads and the first-run unit budget.
// Read-only: produces artifacts/QA in the response only; NEVER writes canonical, sends, or pays.
export async function runProviderShadowWave({ maxLeads = 3, leadIds = null } = {}) {
    const f = AGENT_FLAGS();
    if (f.provider !== 'tokenator') {
        return { provider: f.provider, provider_available: false, error: 'PROVIDER_NOT_CONFIGURED', leads: [] };
    }
    const cfg = tokenator.cfg();
    const store = readStore(STORE_PATH);
    const leads = leadsArray(store);
    const ledgerIds = readLedgerLeadIds();
    const openOppLeadIds = new Set(Object.values(store['commercial.opportunities'] || {}).map((o) => String(o.lead_id)));

    // Cohort: explicit leadIds (e.g. the 3 review offers) or eligibility-filtered.
    let cohort;
    if (Array.isArray(leadIds) && leadIds.length) {
        const want = new Set(leadIds.map(String));
        cohort = leads.filter((l) => want.has(String(l.lead_id))).slice(0, maxLeads);
    } else {
        cohort = leads.filter((l) => eligibleForShadow(l, ledgerIds, openOppLeadIds)).slice(0, maxLeads);
    }

    const budget = new BudgetLedger(PROVIDER_STATE.budgetLimit);
    budget.cumulative = aiUsage.cumulativeUnits(); // continue from PERSISTENT prior usage
    const breaker = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 30000 });
    breaker.state = PROVIDER_STATE.circuitState;

    const provider = {
        generateStructured: (args) => tokenator.generateStructured(args),
    };
    const snap = productSnapshot('mini_audit');
    const nowIso = new Date().toISOString();
    const seenKeys = aiUsage.seenUsageKeys(); // idempotent replay guard
    const out = [];
    let completed = 0, failed = 0, quarantined = 0, sendAttempts = 0, directWrites = 0;

    for (const lead of cohort) {
        const d = classifyDeliveryRecord(lead, ledgerIds);
        const res = await runProviderLead({
            lead, productSnapshot: snap,
            ctx: { deliveryUnconfirmed: false, duplicateOpportunity: openOppLeadIds.has(String(lead.lead_id)), alwaysOwnerReview: true },
            provider, budget, breaker, nowMs: Date.now(), multiplier: cfg.multiplier, maxProjectedUnits: 8000,
        });
        sendAttempts += res.send_attempts; directWrites += res.canonical_mutations;
        if (res.qa_verdict === 'QUARANTINED') quarantined += 1;
        if (res.provider_used) { completed += 1; PROVIDER_STATE.lastSuccessAt = nowIso; PROVIDER_STATE.lastModel = cfg.primaryModel; }
        else if (res.status !== 'OK' && res.status !== 'PROVIDER_NOT_CONFIGURED') { failed += 1; PROVIDER_STATE.lastError = res.error_category; PROVIDER_STATE.lastFailureAt = nowIso; }
        // Persist usage to the authoritative ledger (idempotent by usage_key). Only a real provider
        // call (or an accounted error) records units; cache/no-op does not double-charge on replay.
        const taskId = `shadow_${res.lead_id}_${nowIso}`;
        const usageKey = `${taskId}:${res.provider_request_id || 'noreq'}`;
        if ((res.usage?.calculated_units || 0) > 0 && !seenKeys.has(usageKey)) {
            aiUsage.recordUsage({
                usage_key: usageKey, timestamp: nowIso, task_id: taskId, lead_id: res.lead_id,
                agent_id: 'MINI_AUDIT', provider: 'tokenator', model: cfg.primaryModel,
                request_id: res.provider_request_id, api_mode: PROVIDER_STATE.apiMode || cfg.apiMode,
                raw_input_tokens: res.usage?.input || 0, raw_output_tokens: res.usage?.output || 0,
                calculated_units: res.usage?.calculated_units || 0,
                usage_source: res.provider_used ? 'provider' : 'estimated',
                tier: 'TIER_2_BALANCED', task_type: 'mini_audit',
                result: res.provider_used ? 'ok' : (res.error_category || 'error'),
                error_category: res.error_category || null,
            });
        }
        out.push({
            lead_id: res.lead_id, task_id: taskId,
            provider: 'tokenator', model: cfg.primaryModel,
            provider_used: res.provider_used, request_id: res.provider_request_id,
            qa_result: res.qa_verdict, deterministic_verdict: res.deterministic_verdict,
            unsupported_claims: res.unsupported_claims, guessed_data: res.guessed_data,
            prompt_injection: res.prompt_injection, usage: res.usage,
            artifact_ids: res.artifacts.map((a) => a.artifact_type),
            send_attempts: res.send_attempts, canonical_mutations: res.canonical_mutations,
            status: res.status,
        });
    }

    // Persist process-memory counters (no canonical write).
    PROVIDER_STATE.cumulativeUnits = aiUsage.cumulativeUnits();
    PROVIDER_STATE.circuitState = breaker.state;
    PROVIDER_STATE.completedTasks += completed;
    PROVIDER_STATE.failedTasks += failed;
    PROVIDER_STATE.quarantinedTasks += quarantined;
    PROVIDER_STATE.sendsAttempted += sendAttempts;
    PROVIDER_STATE.directWrites += directWrites;

    return {
        provider: 'tokenator', provider_available: true, agent_mode: AGENT_MODE,
        model: cfg.primaryModel, api_mode: PROVIDER_STATE.apiMode || cfg.apiMode,
        leads_processed: cohort.length, completed, failed, quarantined,
        cumulative_calculated_units: budget.cumulative, budget_limit: PROVIDER_STATE.budgetLimit,
        budget_remaining: budget.remaining(),
        send_attempts: sendAttempts, canonical_mutations: directWrites,
        circuit_state: breaker.state, leads: out,
    };
}

export default { AGENT_FLAGS, runShadowWave, runProviderShadowWave, agentStatus, providerHealth, PROVIDER_STATE };
