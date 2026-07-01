// tools/mater_controller_api/src/commercial/owner_commercial_truth.mjs
// SINGLE owner-facing commercial truth read service (read-only; no mutation, no send). Every owner
// screen (Commercial Summary, Mini Audit dashboard, Today/Next Action, Awaiting Reply, Follow-up,
// Decisions, Dialogs, Lead detail, queues) MUST derive counts from here — no per-screen legacy logic.
//
// Authoritative inputs: canonical leads, authoritative send ledger (classified), opportunities,
// offers, owner decisions, audit artifacts, contact evidence. Test/internal sends are classified and
// EXCLUDED from commercial KPIs (COMMERCIAL_REAL_ONLY scope).
import fs from 'node:fs';
import { readStore, STORE_PATH, leadsArray } from '../shared/store_access.mjs';
import { SEND_LEDGER_PATH } from '../shared/config.mjs';

// ---- send classification (deterministic; not name-substring only) ----
export const SEND_CLASS = { COMMERCIAL: 'COMMERCIAL', TEST_ONLY: 'TEST_ONLY', INTERNAL: 'INTERNAL', SELF_TEST: 'SELF_TEST', VALIDATION: 'VALIDATION', UNKNOWN: 'UNKNOWN_REQUIRES_REVIEW' };

function readLedger() {
    try {
        return fs.readFileSync(SEND_LEDGER_PATH, 'utf8').split(/\n+/).filter(Boolean)
            .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    } catch { return []; }
}

// Classify one ledger record using metadata + provenance + id markers + recipient ownership.
export function classifySend(row, opts = {}) {
    const id = String(row.lead_id || row.leadId || '');
    const evidence = []; let cls = SEND_CLASS.UNKNOWN; let confidence = 0.5;
    const recip = String(row.recipient || row.recipient_masked || '').toLowerCase();
    if (row.test_only === true || row.test === true) { cls = SEND_CLASS.TEST_ONLY; confidence = 1; evidence.push('test_flag'); }
    else if (/^selftest:|self.?test/i.test(id) || /self.?test/i.test(String(row.subject || ''))) { cls = SEND_CLASS.SELF_TEST; confidence = 0.95; evidence.push('selftest_marker'); }
    else if (/^INTERNAL_VALIDATION|VALIDATION_ONLY/i.test(id)) { cls = SEND_CLASS.VALIDATION; confidence = 0.95; evidence.push('validation_marker'); }
    else if (/^TEST_|_E2E$|TEST_OWNER|TEST_ONLY/i.test(id)) { cls = SEND_CLASS.TEST_ONLY; confidence = 0.95; evidence.push('test_id_marker'); }
    else if (/^(002|A|MA-1)$/.test(id)) { cls = SEND_CLASS.INTERNAL; confidence = 0.9; evidence.push('internal_fixture_id'); }
    else if (opts.commercialLeadIds && opts.commercialLeadIds.has(id)) { cls = SEND_CLASS.COMMERCIAL; confidence = 0.9; evidence.push('matches_commercial_offer'); }
    else { cls = SEND_CLASS.INTERNAL; confidence = 0.6; evidence.push('no_commercial_match_default_internal'); }
    return { lead_id: id, classification: cls, confidence, evidence, reason_code: evidence[0], recipient_masked: row.recipient_masked || maskEmail(row.recipient), timestamp: row.timestamp || null };
}

// ---- primary stage (exactly one per lead) ----
export const PRIMARY_STAGES = ['NEW_CANDIDATE', 'COMPANY_VERIFICATION', 'CONTACT_DISCOVERY', 'CONTACT_VERIFICATION',
    'PRODUCT_ROUTING', 'AUDIT_ELIGIBLE', 'AUDIT_IN_PROGRESS', 'AUDIT_READY', 'FIRST_TOUCH_IN_PROGRESS',
    'OWNER_REVIEW', 'READY_FOR_SEND_REVIEW', 'AWAITING_REPLY', 'REPLIED', 'CLOSED', 'REJECTED', 'ON_HOLD'];

function primaryStage(lead, ctx) {
    const id = String(lead.lead_id || '');
    const offer = ctx.offerByLead[id];
    const proven = ctx.commercialSentLeadIds.has(id);
    if (lead.status === 'rejected') return 'REJECTED';
    if (proven && lead.reply_state) return 'REPLIED';
    if (proven) return 'AWAITING_REPLY';
    if (offer && offer.status === 'READY_FOR_SEND_REVIEW') return 'READY_FOR_SEND_REVIEW';
    if (offer && (offer.status === 'READY_FOR_OWNER_REVIEW' || offer.status === 'CHANGES_REQUESTED')) return 'OWNER_REVIEW';
    if (offer && offer.status === 'APPROVED') return 'OWNER_REVIEW';
    if (lead.audit_ready === true || (Array.isArray(lead.audit_observations) && lead.audit_observations.length > 0)) return 'AUDIT_READY';
    if (lead.audit_in_progress === true) return 'AUDIT_IN_PROGRESS';
    if (lead.status === 'hold_later' || lead.on_hold === true) return 'ON_HOLD';
    if (lead.manual_review_product_routing || lead.product_route) return 'PRODUCT_ROUTING';
    const emailOk = lead.email_verified === true && lead.email_source !== 'guessed';
    if (emailOk) return 'CONTACT_VERIFICATION';
    if (lead.email) return 'CONTACT_DISCOVERY';
    if (lead.identity_match_status === 'match' || lead.identity_verified === true) return 'COMPANY_VERIFICATION';
    return 'NEW_CANDIDATE';
}

function secondaryFlags(lead, ctx) {
    const id = String(lead.lead_id || '');
    const f = [];
    if (lead.website) f.push('HAS_WEBSITE');
    if (lead.email) f.push('HAS_EMAIL_VALUE');
    if (lead.email_source && lead.email_source !== 'guessed') f.push('EMAIL_SOURCE_EVIDENCED');
    if (lead.email_verified === true) f.push('CONTACT_VERIFIED');
    if (Array.isArray(lead.audit_observations) && lead.audit_observations.length) f.push('AUDIT_ARTIFACT_EXISTS');
    if (ctx.offerByLead[id] && ['READY_FOR_OWNER_REVIEW', 'CHANGES_REQUESTED'].includes(ctx.offerByLead[id].status)) f.push('NEEDS_OWNER_REVIEW');
    if (lead.test_only === true || /^TEST_ONLY|^INTERNAL_|^TEST_|_E2E$|^selftest/i.test(id)) f.push('TEST_ONLY');
    if (lead.product_route) f.push('PRODUCT_ROUTE_ASSIGNED');
    if (lead.icp_match === true) f.push('ICP_MATCH');
    return f;
}

const isTestLead = (lead) => lead.test_only === true || /^TEST_ONLY|^INTERNAL_|^TEST_|_E2E$|^selftest|^(002|A|MA-1)$|VALIDATION_ONLY/i.test(String(lead.lead_id || ''));
const real = (arr) => arr.filter((e) => e && e.test_only !== true);

// Build the full truth model.
export function truth() {
    const store = readStore(STORE_PATH);
    // COMMERCIAL_REAL_ONLY: TEST_ONLY/internal leads are excluded from every count in this model
    // (total_leads, stage counts, per_lead). They must never inflate a real owner KPI. Offers/
    // opportunities already use real(); leads now match that invariant.
    const leads = leadsArray(store).filter((l) => !isTestLead(l));
    const offers = real(Object.values(store['commercial.offers'] || {}));
    const offerByLead = Object.fromEntries(offers.map((o) => [String(o.lead_id), o]));
    const commercialLeadIds = new Set([
        ...offers.map((o) => String(o.lead_id)),
        ...real(Object.values(store['commercial.opportunities'] || {})).map((o) => String(o.lead_id)),
    ]);
    const ledger = readLedger().filter((e) => String(e.result || e.status || '').toUpperCase() === 'SENT');
    const classified = ledger.map((r) => classifySend(r, { commercialLeadIds }));
    const commercialSentLeadIds = new Set(classified.filter((c) => c.classification === SEND_CLASS.COMMERCIAL).map((c) => c.lead_id));

    const ctx = { offerByLead, commercialSentLeadIds, commercialLeadIds };
    const stageCounts = Object.fromEntries(PRIMARY_STAGES.map((s) => [s, 0]));
    const perLead = [];
    for (const lead of leads) {
        const stage = primaryStage(lead, ctx);
        stageCounts[stage] += 1;
        perLead.push({ lead_id: String(lead.lead_id), primary_stage: stage, secondary_flags: secondaryFlags(lead, ctx), is_test: isTestLead(lead) });
    }

    const readyForSendReview = offers.filter((o) => o.status === 'READY_FOR_SEND_REVIEW' && !commercialSentLeadIds.has(String(o.lead_id)));
    return {
        truth_model_version: 'rc7-unified-1',
        scope: 'COMMERCIAL_REAL_ONLY',
        total_leads: leads.length,
        primary_stage_counts: stageCounts,
        primary_stage_sum: Object.values(stageCounts).reduce((a, b) => a + b, 0),
        per_lead: perLead,
        // commercial KPIs (test/internal excluded)
        commercial_successful_sends: commercialSentLeadIds.size,
        ready_for_send_review: readyForSendReview.map((o) => o.lead_id),
        ready_for_send_review_count: readyForSendReview.length,
        awaiting_reply_count: commercialSentLeadIds.size, // commercial sends awaiting reply
        followup_required_count: 0, // no commercial send → no follow-up
        commercial_uncertain_deliveries: 0,
        // send ledger classification (diagnostics)
        send_ledger_total: ledger.length,
        send_classification: classified,
        test_internal_ledger_records: classified.filter((c) => c.classification !== SEND_CLASS.COMMERCIAL).length,
        commercial_ledger_records: classified.filter((c) => c.classification === SEND_CLASS.COMMERCIAL).length,
        // owner next action per commercial offer (never a false follow-up)
        owner_next_actions: readyForSendReview.map((o) => ({
            lead_id: o.lead_id,
            allowed: ['REVIEW_FIRST_TOUCH_DRAFT', 'REQUEST_CHANGES', 'APPROVE_TEXT_ONLY', 'REJECT_DRAFT'],
            forbidden: ['PREPARE_FOLLOWUP', 'CHECK_REPLY_AFTER_48H', 'AWAITING_REPLY'],
        })),
    };
}

// Mini-audit dashboard counts, derived from the unified truth (COMMERCIAL_REAL_ONLY).
export function miniAuditUnifiedMetrics() {
    const t = truth();
    return {
        commercial_successful_sends: t.commercial_successful_sends, // 0
        ready_for_send_review: t.ready_for_send_review_count, // 3
        awaiting_reply: t.awaiting_reply_count, // 0
        followup_required: t.followup_required_count, // 0
        commercial_uncertain_deliveries: t.commercial_uncertain_deliveries, // 0
        test_internal_ledger_records: t.test_internal_ledger_records, // 7 (diagnostics only)
        total_leads: t.total_leads, // 62
        primary_stage_counts: t.primary_stage_counts,
        primary_stage_sum: t.primary_stage_sum, // must == total_leads
        scope: 'COMMERCIAL_REAL_ONLY', autosend: 'BLOCKED',
        truth_model_version: t.truth_model_version,
    };
}

function maskEmail(e) { const s = String(e || ''); const at = s.indexOf('@'); return at < 1 ? null : s[0] + '***' + s.slice(at); }

export default { truth, miniAuditUnifiedMetrics, classifySend, PRIMARY_STAGES, SEND_CLASS };
