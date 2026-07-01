// mini_audit/service.mjs
// Shared Mini Audit service for the Master Controller API.
// REUSES the existing canonical business logic — it does NOT reimplement it:
//   - getMiniAuditOperatorState  (buckets, next action, eligibility)  from operator mode
//   - computeLeadEligibility      (send gate)                          from queue_navigation
//   - resolvePreviewSource        (canonical preview resolver)         from queue_navigation
//   - sendApprovedMessage         (canonical outbound seam)            from outbound_channel_router
// No second store, no second ledger, no second send path.
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { WORKSPACE, STORE_PATH, SEND_LEDGER_PATH } from '../shared/config.mjs';
import { readStore, leadsArray } from '../shared/store_access.mjs';
import { leadCountReconciliation, sendReconciliation, deliveryContainment } from '../../../commercial_core/lib/reconciliation.mjs';
import ownerTruth from '../commercial/owner_commercial_truth.mjs';

const GW = path.join(WORKSPACE, 'tools', 'telegram_gateway');
const fileUrl = (name) => pathToFileURL(path.join(GW, name)).href;

// Dynamic imports keep the service resilient if a module path shifts.
const operator = await import(fileUrl('mini_audit_operator_mode.mjs'));
const queueNav = await import(fileUrl('queue_navigation.mjs'));
const router = await import(fileUrl('outbound_channel_router.mjs'));

const { getMiniAuditOperatorState, buildFollowupDraft } = operator;
const { computeLeadEligibility, resolvePreviewSource } = queueNav;
const { sendApprovedMessage, describeChannelReadiness } = router;

// A TEST_ONLY lead must NEVER surface on any real owner mini-audit surface (buckets, KPI counts,
// next action, owner brief). This screen has no acceptance/includeTest mode, so test leads are
// stripped from the canonical store BEFORE operator-state is computed. Real leads are untouched.
const isTestLead = (l) => !!l && (l.test_only === true || /^TEST_ONLY|^INTERNAL_|^TEST_|_E2E$|^selftest|VALIDATION_ONLY/i.test(String(l.lead_id || '')));

function stripTestLeads(store) {
    if (!store || typeof store !== 'object') return store;
    const next = { ...store };
    if (Array.isArray(store.leads)) next.leads = store.leads.filter((l) => !isTestLead(l));
    else if (store.leads && typeof store.leads === 'object') {
        next.leads = Object.fromEntries(Object.entries(store.leads).filter(([, l]) => !isTestLead(l)));
    }
    return next;
}

function loadState(now = new Date()) {
    const store = stripTestLeads(readStore(STORE_PATH));
    return getMiniAuditOperatorState(store, { now });
}

function leadId(l) { return String(l.lead_id || l.id || '').trim(); }
function company(l) { return String(l.company || l.company_name || l.name || leadId(l) || '—').trim(); }

// Map an internal lead object to a safe API DTO (no secrets, stable fields).
export function leadDto(lead, state) {
    const elig = computeLeadEligibility(lead);
    const isDue = state ? state.followupCandidates.some((l) => leadId(l) === leadId(lead)) : false;
    return {
        leadId: leadId(lead),
        company: company(lead),
        website: lead.website || lead.domain || null,
        niche: lead.niche || null,
        region: lead.region || lead.city || null,
        email: elig.emailAvailable ? (lead.email || lead.recipient || null) : null,
        emailPresent: elig.emailAvailable,
        phone: lead.phone || null,
        score: lead.score ?? null,
        source: lead.source || lead.source_provider || null,
        verificationStatus: lead.identity_verified ? 'verified' : (lead.status || null),
        status: lead.status || null,
        auditReady: elig.auditAvailable,
        emailPreviewReady: elig.auditAvailable,
        sendProof: lead.send_proof_status || null,
        smtpCode: lead.smtp_response_code ?? null,
        sentAt: lead.last_sent_at || lead.last_contacted_at || null,
        followupDue: isDue,
        replyState: lead.reply_state || null,
        sendable: elig.sendable,
        category: elig.category,
        blockingReasons: elig.reasons,
        nextActionHint: elig.sendable ? 'send' : (elig.category || 'review'),
    };
}

export function getStatus() {
    const s = loadState();
    // Commercial-facing KPIs are overlaid from the UNIFIED truth (COMMERCIAL_REAL_ONLY) so this
    // legacy dashboard no longer contradicts the Commercial Summary. Test/internal sends excluded;
    // no false awaiting-reply / follow-up. Legacy bucket sizes remain for non-commercial diagnostics.
    let unified = null;
    try { unified = ownerTruth.miniAuditUnifiedMetrics(); } catch { /* fall back to legacy if truth fails */ }
    return {
        // commercial truth (authoritative)
        commercial_successful_sends: unified ? unified.commercial_successful_sends : 0,
        readySend: unified ? unified.ready_for_send_review : s.readySend.length,
        waitingReply: unified ? unified.awaiting_reply : s.waitingReply.length,
        followupDue: unified ? unified.followup_required : s.followupCandidates.length,
        sendUncertain: unified ? unified.commercial_uncertain_deliveries : s.sendUncertain.length,
        test_internal_ledger_records: unified ? unified.test_internal_ledger_records : null,
        scope: 'COMMERCIAL_REAL_ONLY',
        // legacy operational bucket sizes (kept for funnel diagnostics; not commercial KPIs)
        preparing: s.auditNoEmailDraft.length,
        needsCheck: s.needsCheck.length,
        total: s.leads.length,
        total_leads: unified ? unified.total_leads : s.leads.length,
        primary_stage_counts: unified ? unified.primary_stage_counts : null,
        autosend: 'BLOCKED',
        truth_model_version: unified ? unified.truth_model_version : 'legacy',
    };
}

export function getMetrics() { return getStatus(); }

export function getNextAction() {
    const s = loadState();
    const a = s.nextAction;
    // Guard against the RC6 false-followup defect: a follow-up / await-reply next action is valid
    // ONLY when the lead has an authoritative COMMERCIAL send (unified truth). Since commercial
    // sends are 0, any legacy followup/await suggestion (derived from stale sendProof/SMTP) is
    // suppressed and replaced with the correct owner review action for a ready-for-send-review offer.
    let unified = null;
    try { unified = ownerTruth.truth(); } catch { /* fall back to legacy below */ }
    const commercialSent = unified ? new Set(unified.send_classification
        .filter((c) => c.classification === 'COMMERCIAL').map((c) => c.lead_id)) : null;
    const isFalseFollowup = a && (a.kind === 'followup' || a.kind === 'check_reply' || a.kind === 'await_reply')
        && a.lead && commercialSent && !commercialSent.has(String(a.lead.leadId || a.lead.lead_id));
    if (isFalseFollowup) {
        const reviewLeadId = unified && unified.ready_for_send_review.length ? unified.ready_for_send_review[0] : null;
        const reviewLead = reviewLeadId ? s.leads.find((l) => String(l.lead_id) === String(reviewLeadId)) : null;
        return {
            kind: 'review_first_touch_draft',
            reason: 'Коммерческой отправки ещё не было. Проверьте текст первого обращения: можно одобрить текст, запросить исправления или отклонить черновик.',
            lead: reviewLead ? leadDto(reviewLead, s) : null,
            scope: 'COMMERCIAL_REAL_ONLY',
            suppressed_false_followup: true,
        };
    }
    return {
        kind: a.kind,
        reason: a.reason,
        lead: a.lead ? leadDto(a.lead, s) : null,
        scope: 'COMMERCIAL_REAL_ONLY',
    };
}

const BUCKETS = {
    all: (s) => s.leads,
    ready_send: (s) => s.readySend,
    waiting_reply: (s) => s.waitingReply,
    followups: (s) => s.followupCandidates,
    needs_check: (s) => s.needsCheck.map((x) => x.lead),
    send_uncertain: (s) => s.sendUncertain,
    preparing: (s) => s.auditNoEmailDraft,
};

export function getLeads({ bucket = 'all', search = '', page = 1, pageSize = 25 } = {}) {
    const s = loadState();
    const pick = BUCKETS[bucket] || BUCKETS.all;
    let list = pick(s).map((l) => leadDto(l, s));
    if (search) {
        const q = String(search).toLowerCase();
        list = list.filter((d) =>
            (d.company || '').toLowerCase().includes(q) ||
            (d.website || '').toLowerCase().includes(q) ||
            (d.email || '').toLowerCase().includes(q) ||
            (d.leadId || '').toLowerCase().includes(q));
    }
    const total = list.length;
    const p = Math.max(1, Number(page) || 1);
    const ps = Math.max(1, Math.min(100, Number(pageSize) || 25));
    const items = list.slice((p - 1) * ps, p * ps);
    return { items, total, page: p, pageSize: ps, bucket };
}

export function getLead(id) {
    const s = loadState();
    const lead = s.leads.find((l) => leadId(l) === String(id));
    if (!lead) return null;
    return leadDto(lead, s);
}

export function getAudit(id) {
    const s = loadState();
    const lead = s.leads.find((l) => leadId(l) === String(id));
    if (!lead) return null;
    const preview = resolvePreviewSource(lead);
    return {
        leadId: String(id),
        available: preview.status === 'ready',
        body: preview.status === 'ready' ? preview.body : null,
        source: preview.source,
        missingReason: preview.status === 'ready' ? null : 'audit_not_generated',
    };
}

export function getEmailPreview(id) {
    const s = loadState();
    const lead = s.leads.find((l) => leadId(l) === String(id));
    if (!lead) return null;
    const elig = computeLeadEligibility(lead);
    return {
        leadId: String(id),
        recipient: elig.emailAvailable ? (lead.email || lead.recipient) : null,
        subject: elig.subject,
        body: elig.body,
        available: elig.auditAvailable && elig.emailAvailable,
        sendable: elig.sendable,
        blockingReasons: elig.reasons,
    };
}

export function getFollowups() {
    const s = loadState();
    return s.followupCandidates.map((l) => {
        const draft = buildFollowupDraft(l);
        const dto = leadDto(l, s);
        return { ...dto, followupSubject: draft ? draft.subject : null };
    });
}

export function getFollowupPreview(id) {
    const s = loadState();
    const lead = s.followupCandidates.find((l) => leadId(l) === String(id));
    if (!lead) return null;
    const draft = buildFollowupDraft(lead);
    return {
        leadId: String(id),
        initialSentAt: lead.last_sent_at || null,
        proof: lead.send_proof_status || null,
        stage: 'followup_1',
        subject: draft ? draft.subject : null,
        body: draft ? draft.body : null,
    };
}

export function getSendUncertain() {
    const s = loadState();
    return s.sendUncertain.map((l) => {
        const dto = leadDto(l, s);
        return {
            ...dto,
            attemptedAt: l.last_send_attempt_at || l.last_sent_at || null,
            proofMissing: true,
            ledgerMissing: l.send_proof_status === 'missing',
            recommendedAction: 'check_proof',
        };
    });
}

// ---- Reconciliation read models (pure logic in commercial_core/lib/reconciliation.mjs) ----

// Read the authoritative send ledger (JSONL). Returns [] if absent/unreadable.
function readSendLedger() {
    try {
        const raw = fs.readFileSync(SEND_LEDGER_PATH, 'utf8');
        return raw.trim().split(/\n+/).filter(Boolean).map((ln) => {
            try { return JSON.parse(ln); } catch { return null; }
        }).filter(Boolean);
    } catch { return []; }
}

// Explain canonical_total vs mini_audit_operational as a set difference.
export function getLeadCountReconciliation() {
    const store = readStore(STORE_PATH);
    const canonicalLeads = leadsArray(store);
    const s = loadState();
    const operationalIds = s.leads.map((l) => leadId(l));
    return leadCountReconciliation(canonicalLeads, operationalIds);
}

// Reconcile lead-level send markers against the authoritative ledger (never invents a send).
export function getSendReconciliation() {
    const store = readStore(STORE_PATH);
    const canonicalLeads = leadsArray(store);
    return sendReconciliation(canonicalLeads, readSendLedger());
}

// Delivery-status containment: precise classification + owner-review queue. Auto-resend/followup
// are forbidden for unproven delivery. Read-only — never changes the ledger.
export function getDeliveryContainment() {
    const store = readStore(STORE_PATH);
    const canonicalLeads = leadsArray(store);
    return deliveryContainment(canonicalLeads, readSendLedger());
}

// Re-check eligibility for a lead (used before any approval/send).
export function checkEligibility(id) {
    const s = loadState();
    const lead = s.leads.find((l) => leadId(l) === String(id));
    if (!lead) return { found: false };
    const elig = computeLeadEligibility(lead);
    return { found: true, lead, eligibility: elig };
}

// Owner-confirmed real send. Goes ONLY through the canonical router. In test/
// no-send mode (MATER_NO_SEND=true or no real_send_enabled) the router uses a
// mock adapter / returns a blocked result — never real SMTP during tests.
export async function performApprovedSend(id, { dryRun = true } = {}) {
    const { found, lead, eligibility } = checkEligibility(id);
    if (!found) return { ok: false, code: 'LEAD_NOT_FOUND' };
    if (!eligibility.sendable) {
        return { ok: false, code: 'LEAD_NOT_SENDABLE', reasons: eligibility.reasons };
    }
    const payload = {
        to: lead.email || lead.recipient,
        subject: eligibility.subject || `Мини-аудит: ${company(lead)}`,
        body: eligibility.body,
        channel: 'email',
        lead,
        company: company(lead),
        website: lead.website || '',
    };
    const realSend = process.env.MATER_NO_SEND !== 'true' && process.env.EMAIL_REAL_SEND_ENABLED === 'true' && !dryRun;
    const result = await sendApprovedMessage(payload, {
        owner_confirmed: true,
        approved_by: 'Dmitry',
        autosend: false,
        mass_send: false,
        message_count: 1,
        channel: 'email',
        real_send_enabled: realSend,
        // In dry-run/test, inject a mock adapter so no network is touched.
        adapters: realSend ? undefined : { email: { send: async () => ({ ok: false, status: 'dry_run', reason: 'MATER_DRY_RUN' }) } },
        env: process.env,
    });
    return { ok: result.ok === true, result };
}

export function channelReadiness() {
    return describeChannelReadiness({ env: process.env });
}
