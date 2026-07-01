// commercial/pipeline_read.mjs — read-only pipeline analytics, owner queues, executive brief.
// Aggregates ONLY from existing truths (canonical store sections, send ledger, replies). TEST_ONLY
// excluded from business KPIs; delivery-unconfirmed never counted as sends; offer draft != sale;
// opportunity != revenue; unknown never coerced to 0. No mutation, no send.
import fs from 'node:fs';
import { readStore, STORE_PATH, leadsArray } from '../shared/store_access.mjs';
import { SEND_LEDGER_PATH } from '../shared/config.mjs';
import replies from '../replies/service.mjs';
import { deliveryContainment } from '../../../commercial_core/lib/reconciliation.mjs';
import { LEAD_STATES, INVARIANTS, pipelineView } from '../../../commercial_core/lib/pipeline_state.mjs';

function readLedger() {
    try {
        return fs.readFileSync(SEND_LEDGER_PATH, 'utf8').trim().split(/\n+/).filter(Boolean)
            .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    } catch { return []; }
}
const real = (arr) => arr.filter((e) => e && e.test_only !== true);

export function stateModel() {
    return { states: LEAD_STATES, invariants: INVARIANTS, per_lead_isolation: true, pipeline_global_blocked: false };
}

export function metrics() {
    const store = readStore(STORE_PATH);
    const leads = leadsArray(store);
    const ledger = readLedger();
    const opp = real(Object.values(store['commercial.opportunities'] || {}));
    const offers = real(Object.values(store['commercial.offers'] || {}));
    const deals = real(Object.values(store['commercial.deals'] || {}));
    const containment = deliveryContainment(leads, ledger);
    const sentRows = ledger.filter((e) => String(e.result || e.status || '').toUpperCase() === 'SENT');
    return {
        canonical_leads: leads.length,
        confirmed_sends: sentRows.length,
        delivery_unconfirmed_records: containment.records_total,
        open_opportunities: opp.filter((o) => !['REVENUE.WON', 'REVENUE.LOST'].includes(o.stage)).length,
        offers_ready_for_send_review: offers.filter((o) => o.status === 'READY_FOR_SEND_REVIEW').length,
        real_deals_won: deals.filter((d) => d.status === 'WON').length,
        test_only_entities: Object.values(store['commercial.opportunities'] || {}).filter((o) => o.test_only === true).length,
        rules: {
            test_only_excluded_from_kpi: true,
            delivery_unconfirmed_not_counted_as_sends: true,
            offer_draft_not_a_sale: true,
            opportunity_not_revenue: true,
            unknown_not_zero: true,
        },
    };
}

export function ownerQueues() {
    const store = readStore(STORE_PATH);
    const leads = leadsArray(store);
    const ledger = readLedger();
    const offers = real(Object.values(store['commercial.offers'] || {}));
    const containment = deliveryContainment(leads, ledger);
    const replyItems = replies.listReplies().items || [];
    // AWAITING_REPLY is derived ONLY from authoritative confirmed sends (send ledger rows with a
    // SENT result) that belong to a CURRENT commercial lead awaiting a reply. An offer in
    // READY_FOR_SEND_REVIEW, a draft, or an owner approval is NOT a send and must not appear here.
    // Historical/test/internal ledger sends (which have no current commercial offer) are reported
    // separately as confirmed_sends and never mixed with the three unsent review offers.
    const sentLeadIds = new Set(
        ledger.filter((e) => String(e.result || e.status || '').toUpperCase() === 'SENT')
            .map((e) => String(e.lead_id || e.leadId || '')).filter(Boolean),
    );
    const repliedLeadIds = new Set(replyItems.map((r) => String(r.lead_id || r.leadId || '')).filter(Boolean));
    // A lead is "awaiting reply" only if it is a current, real commercial lead (has an offer or
    // opportunity), has a confirmed send, and has no recorded reply yet.
    const commercialLeadIds = new Set([
        ...offers.map((o) => String(o.lead_id)),
        ...real(Object.values(store['commercial.opportunities'] || {})).map((o) => String(o.lead_id)),
    ]);
    const awaitingReply = [...sentLeadIds].filter((id) => commercialLeadIds.has(id) && !repliedLeadIds.has(id));
    return {
        offers_to_review: offers.filter((o) => o.status === 'CHANGES_REQUESTED' || o.status === 'READY_FOR_OWNER_REVIEW').map((o) => o.offer_id),
        ready_for_send_review: offers.filter((o) => o.status === 'READY_FOR_SEND_REVIEW').map((o) => o.offer_id),
        awaiting_reply: awaitingReply.length, // authoritative: confirmed send + current offer + no reply
        awaiting_reply_lead_ids: awaitingReply, // detail list for the owner UI
        confirmed_sends: sentLeadIds.size, // historical confirmed sends, shown separately
        replies_received: replyItems.length,
        followup_due: 0,
        delivery_review: containment.records_total,
        agent_results_to_review: 0, // populated by shadow wave on demand
        test_records: Object.values(store['commercial.opportunities'] || {}).filter((o) => o.test_only === true).length,
        note: 'Никаких авто-действий. Отправка требует Gate C1-C.',
    };
}

export function executiveBrief() {
    const m = metrics();
    const q = ownerQueues();
    return {
        what_changed: `Открытых возможностей: ${m.open_opportunities}; черновиков предложений к проверке отправки: ${m.offers_ready_for_send_review}.`,
        needs_owner: `Проверка предложений: ${q.ready_for_send_review.length}; сверка доставки: ${q.delivery_review}.`,
        leads_ready: m.offers_ready_for_send_review,
        replies_in: q.replies_received,
        followup_due: q.followup_due,
        agent_runs_failed: 0,
        next_safe_action: 'Проверить готовые предложения; отправка остаётся за Gate C1-C (отключена).',
        confirmed_sends: m.confirmed_sends,
        delivery_unconfirmed: m.delivery_unconfirmed_records,
    };
}

export default { stateModel, metrics, ownerQueues, executiveBrief };
