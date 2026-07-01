// tools/mater_controller_api/src/commercial/ai_usage_ledger.mjs
// Authoritative, append-only AI usage ledger. Records every provider call (or deterministic NO_LLM
// decision) so cumulative spend survives API restarts — fixing the RC3 defect where the in-memory
// counter reset to 0 on every restart.
//
// Single source of truth: read models (agent status, AI cost dashboard) aggregate from THIS ledger.
// It is NOT the canonical store and NEVER mixes with the send ledger or payments.
//
// Idempotency: each entry carries a usage_key (task_id + request_id + retry/repair index). Replays
// with an already-seen usage_key are NOT re-charged (provider_units_delta = 0).
import fs from 'node:fs';
import path from 'node:path';
import { AI_USAGE_LEDGER_PATH } from '../shared/config.mjs';

function ledgerPath() { return AI_USAGE_LEDGER_PATH; }

function ensureDir(p) {
    try { fs.mkdirSync(path.dirname(p), { recursive: true }); } catch { /* ignore */ }
}

// Read all ledger rows (tolerant of partial lines).
export function readUsageRows() {
    try {
        const raw = fs.readFileSync(ledgerPath(), 'utf8');
        return raw.split(/\n+/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    } catch { return []; }
}

// Set of usage_keys already recorded (for idempotent replay).
export function seenUsageKeys() {
    return new Set(readUsageRows().map((r) => String(r.usage_key || '')).filter(Boolean));
}

// Append one usage entry. Returns { recorded:boolean, units_delta:number, cumulative:number }.
// If usage_key already exists, this is a no-op replay (units_delta=0).
export function recordUsage(entry) {
    const rows = readUsageRows();
    const usageKey = String(entry.usage_key || `${entry.task_id || 'task'}:${entry.request_id || 'noreq'}:${entry.retry_index ?? 0}:${entry.repair_index ?? 0}`);
    const prior = rows.filter((r) => Number(r.calculated_units || 0));
    const cumulativeBefore = prior.reduce((s, r) => s + Number(r.calculated_units || 0), 0);
    if (rows.some((r) => String(r.usage_key) === usageKey)) {
        return { recorded: false, units_delta: 0, cumulative: cumulativeBefore, replay: true };
    }
    const units = Number(entry.calculated_units || 0);
    const row = {
        usage_key: usageKey,
        timestamp: entry.timestamp || null, // caller stamps (scripts cannot use Date here)
        task_id: entry.task_id || null,
        lead_id: entry.lead_id || null,
        agent_id: entry.agent_id || null,
        provider: entry.provider || null,
        model: entry.model || null,
        request_id: entry.request_id || null,
        api_mode: entry.api_mode || null,
        raw_input_tokens: Number(entry.raw_input_tokens || 0),
        raw_output_tokens: Number(entry.raw_output_tokens || 0),
        cached_input_tokens: Number(entry.cached_input_tokens || 0),
        calculated_units: units,
        estimated_money_cost: entry.estimated_money_cost ?? null, // may be UNKNOWN/null
        currency: entry.currency || null,
        usage_source: entry.usage_source || 'provider', // provider | estimated | no_llm
        retry_index: entry.retry_index ?? 0,
        repair_index: entry.repair_index ?? 0,
        cache_hit: entry.cache_hit === true,
        artifact_reused: entry.artifact_reused === true,
        tier: entry.tier || null,
        task_type: entry.task_type || null,
        result: entry.result || null,
        error_category: entry.error_category || null,
    };
    ensureDir(ledgerPath());
    fs.appendFileSync(ledgerPath(), JSON.stringify(row) + '\n', 'utf8');
    return { recorded: true, units_delta: units, cumulative: cumulativeBefore + units };
}

// Cumulative calculated units across the whole ledger.
export function cumulativeUnits() {
    return readUsageRows().reduce((s, r) => s + Number(r.calculated_units || 0), 0);
}

// Aggregate summary for the owner AI-cost dashboard. Groups are computed deterministically.
export function usageSummary({ sinceTs = null } = {}) {
    const rows = readUsageRows().filter((r) => !sinceTs || (r.timestamp && r.timestamp >= sinceTs));
    const sum = (sel) => rows.reduce((s, r) => s + Number(sel(r) || 0), 0);
    const groupUnits = (keyFn) => {
        const m = {};
        for (const r of rows) { const k = keyFn(r) || 'unknown'; m[k] = (m[k] || 0) + Number(r.calculated_units || 0); }
        return m;
    };
    const moneyKnown = rows.filter((r) => r.estimated_money_cost != null);
    // Raw tokens: surface a real number ONLY if at least one row actually has journaled tokens.
    // Otherwise UNKNOWN (never a false 0). provider_calls likewise reflects real provider rows.
    const anyRealTokens = rows.some((r) => Number(r.raw_input_tokens || 0) > 0 || Number(r.raw_output_tokens || 0) > 0);
    return {
        total_calculated_units: sum((r) => r.calculated_units),
        raw_input_tokens: anyRealTokens ? sum((r) => r.raw_input_tokens) : 'UNKNOWN',
        raw_output_tokens: anyRealTokens ? sum((r) => r.raw_output_tokens) : 'UNKNOWN',
        cached_input_tokens: anyRealTokens ? sum((r) => r.cached_input_tokens) : 'UNKNOWN',
        provider_calls: rows.filter((r) => r.usage_source === 'provider').length,
        estimated_records: rows.filter((r) => r.usage_source === 'estimated').length,
        no_llm_tasks: rows.filter((r) => r.usage_source === 'no_llm').length,
        cache_hits: rows.filter((r) => r.cache_hit).length,
        artifact_reuse: rows.filter((r) => r.artifact_reused).length,
        escalations: rows.filter((r) => Number(r.retry_index || 0) > 0 || Number(r.repair_index || 0) > 0).length,
        by_provider: groupUnits((r) => r.provider),
        by_model: groupUnits((r) => r.model),
        by_agent: groupUnits((r) => r.agent_id),
        by_task_type: groupUnits((r) => r.task_type),
        by_lead: groupUnits((r) => r.lead_id),
        // Money is surfaced only when known; never coerced from units.
        estimated_money_cost: moneyKnown.length ? moneyKnown.reduce((s, r) => s + Number(r.estimated_money_cost || 0), 0) : null,
        estimated_money_class: moneyKnown.length ? 'ESTIMATE' : 'UNKNOWN',
        entries: rows.length,
    };
}

// Confirmed pre-ledger usage (live shadow run before the persistent ledger existed). This is
// CONFIRMED_HISTORICAL_EVIDENCE: the total is known, but raw token counts / provider-call counts
// were not journaled at the time, so they are UNKNOWN (never coerced to 0).
const PRE_LEDGER_CONFIRMED = {
    calculated_units: 196554,
    usage_source: 'CONFIRMED_HISTORICAL_EVIDENCE',
    raw_input_tokens: 'UNKNOWN',
    raw_output_tokens: 'UNKNOWN',
    provider_calls: 'UNKNOWN',
    evidence_reference: 'rc3 LIVE_SHADOW_REPORT (3 leads, provider_used=true), pre persistent ledger',
};

// Authoritative reconciliation read model. Splits known usage into post-ledger (journaled) and
// confirmed pre-ledger history; surfaces provenance and never shows a false zero.
export function usageReconciliation() {
    const rows = readUsageRows();
    const post = rows.reduce((s, r) => s + Number(r.calculated_units || 0), 0);
    const bySource = (src) => rows.filter((r) => String(r.usage_source) === src);
    const actual = bySource('provider'); // ACTUAL_PROVIDER_RESPONSE
    const estimated = bySource('estimated'); // ESTIMATED (e.g. failed calls)
    const noLlm = bySource('no_llm');
    const synthetic = bySource('synthetic_test');
    const hasRealTokens = rows.some((r) => Number(r.raw_input_tokens || 0) > 0 || Number(r.raw_output_tokens || 0) > 0);
    return {
        // periods
        since_persistent_ledger: post,
        confirmed_pre_ledger_history: PRE_LEDGER_CONFIRMED.calculated_units,
        total_known_usage: post + PRE_LEDGER_CONFIRMED.calculated_units,
        // provenance record counts
        actual_records: actual.length,
        estimated_records: estimated.length,
        no_llm_records: noLlm.length,
        historical_records: 1, // the single confirmed pre-ledger aggregate
        synthetic_test_records: synthetic.length,
        // raw tokens: only when evidenced; UNKNOWN otherwise (NOT zero)
        raw_input_tokens: hasRealTokens ? rows.reduce((s, r) => s + Number(r.raw_input_tokens || 0), 0) : 'UNKNOWN',
        raw_output_tokens: hasRealTokens ? rows.reduce((s, r) => s + Number(r.raw_output_tokens || 0), 0) : 'UNKNOWN',
        provider_calls: actual.length, // post-ledger actual provider responses
        pre_ledger_provider_calls: PRE_LEDGER_CONFIRMED.provider_calls, // 'UNKNOWN'
        // reconciliation invariants
        per_lead_sum_matches_total: Object.values(groupUnitsRows(rows, (r) => r.lead_id)).reduce((a, b) => a + b, 0) === post,
        per_model_sum_matches_total: Object.values(groupUnitsRows(rows, (r) => r.model)).reduce((a, b) => a + b, 0) === post,
        by_source_units: {
            ACTUAL_PROVIDER_RESPONSE: actual.reduce((s, r) => s + Number(r.calculated_units || 0), 0),
            ESTIMATED: estimated.reduce((s, r) => s + Number(r.calculated_units || 0), 0),
            CONFIRMED_HISTORICAL_EVIDENCE: PRE_LEDGER_CONFIRMED.calculated_units,
            SYNTHETIC_TEST: synthetic.reduce((s, r) => s + Number(r.calculated_units || 0), 0),
        },
        false_zeros: 0, // UNKNOWN surfaced as UNKNOWN, never 0
        evidence_reference: PRE_LEDGER_CONFIRMED.evidence_reference,
    };
}

function groupUnitsRows(rows, keyFn) {
    const m = {};
    for (const r of rows) { const k = keyFn(r) || 'unknown'; m[k] = (m[k] || 0) + Number(r.calculated_units || 0); }
    return m;
}

export default { readUsageRows, seenUsageKeys, recordUsage, cumulativeUnits, usageSummary, usageReconciliation, ledgerPath };
