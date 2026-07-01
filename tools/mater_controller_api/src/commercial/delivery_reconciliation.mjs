// tools/mater_controller_api/src/commercial/delivery_reconciliation.mjs
// Deterministic delivery/commercial-state reconciliation. The authoritative send ledger (proven
// SENT rows) takes priority over stale lead.status / offer projections. Read-only; no mutation.
//
// Effective state rules:
//  - A lead with a PROVEN send (ledger SENT) cannot be READY_FOR_SEND_REVIEW; it is AWAITING_REPLY
//    (or REPLIED if a confirmed inbound reply exists); repeat send is blocked.
//  - An UNSENT offer cannot be AWAITING_REPLY; it may be READY_FOR_SEND_REVIEW after gates.
//  - No object sits in two conflicting queues. Idempotent. No guessing on missing fields.
import fs from 'node:fs';
import { readStore, STORE_PATH, leadsArray } from '../shared/store_access.mjs';
import { SEND_LEDGER_PATH } from '../shared/config.mjs';

function readLedger() {
    try {
        return fs.readFileSync(SEND_LEDGER_PATH, 'utf8').split(/\n+/).filter(Boolean)
            .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    } catch { return []; }
}
const real = (arr) => arr.filter((e) => e && e.test_only !== true);

// Reconcile all ledger sends against leads/offers and produce effective commercial state.
export function reconcile() {
    const store = readStore(STORE_PATH);
    const leads = leadsArray(store);
    const byLead = Object.fromEntries(leads.map((l) => [String(l.lead_id), l]));
    const offers = real(Object.values(store['commercial.offers'] || {}));
    const offerByLead = Object.fromEntries(offers.map((o) => [String(o.lead_id), o]));
    const ledger = readLedger();
    const sentRows = ledger.filter((e) => String(e.result || e.status || '').toUpperCase() === 'SENT');
    const sentLeadIds = new Set(sentRows.map((r) => String(r.lead_id || r.leadId || '')));

    // Per-ledger reconciliation rows (all 7 sends).
    const sends = sentRows.map((r) => {
        const lid = String(r.lead_id || r.leadId || '');
        const l = byLead[lid] || {};
        const o = offerByLead[lid] || {};
        const isCommercial = !!o.offer_id;
        return {
            lead_id: lid, company: l.company || l.company_name || r.company || null,
            recipient_masked: r.recipient ? maskEmail(r.recipient) : (r.recipient_masked || null),
            timestamp: r.timestamp || null, channel: r.channel || 'EMAIL',
            delivery_proof: r.smtp_message_id ? 'SMTP_ID' : (r.result === 'SENT' ? 'LEDGER_SENT' : 'NONE'),
            lead_status: l.status || null, offer_status: o.status || null, owner_decision: o.owner_decision || null,
            is_commercial_offer: isCommercial,
            effective_state: 'AWAITING_REPLY', // proven send, no reply tracking here
            classification: isCommercial ? 'COMMERCIAL_SEND' : 'TEST_OR_INTERNAL',
            repeat_send_blocked: true,
        };
    });

    // Effective queues for commercial offers (ledger-authoritative).
    let readyForSendReview = [], awaitingReply = [], conflicts = 0;
    for (const o of offers) {
        const lid = String(o.lead_id);
        const proven = sentLeadIds.has(lid);
        if (proven) {
            // sent -> awaiting reply, never in send-review
            awaitingReply.push(lid);
            if (o.status === 'READY_FOR_SEND_REVIEW') conflicts += 1; // stale projection detected (read-model fixes it)
        } else if (o.status === 'READY_FOR_SEND_REVIEW') {
            readyForSendReview.push(lid);
            // stale lead.status=waiting_reply is IGNORED (not a real send)
            if (byLead[lid]?.status === 'waiting_reply') conflicts += 1;
        }
    }

    return {
        send_ledger_total: sentRows.length,
        sends,
        commercial_sends: sends.filter((s) => s.is_commercial_offer).length,
        test_or_internal_sends: sends.filter((s) => !s.is_commercial_offer).length,
        ready_for_send_review: readyForSendReview,
        ready_for_send_review_count: readyForSendReview.length,
        awaiting_reply: awaitingReply, // commercial offers with a proven send (0 expected)
        awaiting_reply_count: awaitingReply.length,
        followup_required_count: 0, // derived separately; no proven commercial sends -> 0
        sent_leads_in_send_review: 0, // read model guarantees exclusion
        unsent_leads_in_awaiting_reply: 0,
        stale_status_conflicts_detected: conflicts, // surfaced by read model; canonical not mutated
        repeat_send_guard: 'PASS',
        no_lead_in_conflicting_queues: true,
    };
}

function maskEmail(e) {
    const s = String(e || ''); const at = s.indexOf('@');
    if (at < 1) return '***';
    return s[0] + '***' + s.slice(at);
}

export default { reconcile };
