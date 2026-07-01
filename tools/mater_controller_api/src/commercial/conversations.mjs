// commercial/conversations.mjs — read-only conversation timeline + pre-sale health (Gate transport-readiness).
// Reuses the single commercial store projection, the existing reply service, and the pure
// conversation_read projections. NO second conversation truth, NO send, NO mutation.
import { readStore, STORE_PATH } from '../shared/store_access.mjs';
import { SEND_LEDGER_PATH } from '../shared/config.mjs';
import fs from 'node:fs';
import replies from '../replies/service.mjs';
import { buildTimeline, presaleHealth } from '../../../commercial_core/lib/conversation_read.mjs';
import { classifyDeliveryRecord } from '../../../commercial_core/lib/reconciliation.mjs';

export const CONVERSATION_FLAGS = () => ({
    conversationRead: process.env.CONVERSATION_READ_API === 'true',
    customerSuccessRead: process.env.CUSTOMER_SUCCESS_READ_API === 'true',
});

const SECTIONS = ['commercial.opportunities', 'commercial.offers', 'commercial.deals'];

function readLedger() {
    try {
        return fs.readFileSync(SEND_LEDGER_PATH, 'utf8').trim().split(/\n+/).filter(Boolean)
            .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    } catch { return []; }
}

// Resolve the per-lead context (lead-id keyed) from the canonical store + ledger + replies.
function contextFor(leadId, store, ledger, replyItems) {
    const opps = Object.values(store['commercial.opportunities'] || {});
    const offers = Object.values(store['commercial.offers'] || {});
    const opportunity = opps.find((o) => String(o.lead_id) === String(leadId)) || null;
    const offer = offers.find((o) => String(o.lead_id) === String(leadId)) || null;
    const ledgerRows = ledger.filter((r) => String(r.lead_id || r.leadId) === String(leadId));
    const leadReplies = (replyItems || []).filter((r) => String(r.leadId || r.lead_id) === String(leadId));
    const ledgerIds = new Set(ledger.map((r) => String(r.lead_id || r.leadId || '')).filter(Boolean));
    const leadObj = { lead_id: leadId };
    // Build a delivery record from the ledger rows / offer-less lead is fine.
    const deliveryRecord = ledgerRows.length || opportunity ? classifyDeliveryRecord({ lead_id: leadId }, ledgerIds) : null;
    return { lead: leadObj, opportunity, offer, ledgerRows, replies: leadReplies, deliveryRecord };
}

// List conversations = one per lead that has an opportunity OR a reply OR a ledger row.
// Owner mode EXCLUDES test/internal/self-test/validation entities (they appear only in the
// diagnostics view). The 7 ledger rows are all test/internal, so without this filter they would
// surface as owner "dialogs" (RC6 defect E). Test entities are preserved, just not shown here.
const isTestLeadId = (id) => /^TEST_ONLY|^INTERNAL_|^TEST_|_E2E$|^selftest|^(002|A|MA-1)$|VALIDATION_ONLY/i.test(String(id || ''));
export function listConversations({ includeTest = false } = {}) {
    const store = readStore(STORE_PATH);
    const ledger = readLedger();
    const replyItems = replies.listReplies().items || [];
    const ids = new Set();
    for (const o of Object.values(store['commercial.opportunities'] || {})) ids.add(String(o.lead_id));
    for (const r of ledger) if (r.lead_id) ids.add(String(r.lead_id));
    for (const r of replyItems) if (r.leadId) ids.add(String(r.leadId));
    const items = Array.from(ids).filter(Boolean)
        .filter((leadId) => includeTest || !isTestLeadId(leadId))
        .map((leadId) => {
            const ctx = contextFor(leadId, store, ledger, replyItems);
            const tl = buildTimeline(ctx);
            return {
                conversation_id: tl.conversation_id, lead_id: leadId,
                event_count: tl.event_count,
                last_event: tl.events[tl.events.length - 1] || null,
                has_offer: !!ctx.offer, has_reply: ctx.replies.length > 0,
                send_capability: 'NONE',
            };
        });
    return { items, total: items.length, scope: includeTest ? 'ALL' : 'REAL_COMMERCIAL_ONLY' };
}

export function getConversation(leadId) {
    const store = readStore(STORE_PATH);
    const ctx = contextFor(leadId, store, readLedger(), replies.listReplies().items || []);
    if (!ctx.opportunity && ctx.ledgerRows.length === 0 && ctx.replies.length === 0) return null;
    const tl = buildTimeline(ctx);
    return { ...tl, has_offer: !!ctx.offer, offer_status: ctx.offer?.status || null };
}

export function getTimeline(leadId) {
    const c = getConversation(leadId);
    return c ? { conversation_id: c.conversation_id, lead_id: c.lead_id, events: c.events } : null;
}

export function getReplies(leadId) {
    const items = (replies.listReplies().items || []).filter((r) => String(r.leadId || r.lead_id) === String(leadId));
    return { items, total: items.length };
}

export function getFollowups(leadId) {
    // Follow-up plans are read-only; delivery-unconfirmed leads are excluded from follow-up.
    const store = readStore(STORE_PATH);
    const ctx = contextFor(leadId, store, readLedger(), []);
    const excluded = ctx.deliveryRecord && ctx.deliveryRecord.ownerReviewRequired === true;
    return {
        lead_id: String(leadId), items: [], followup_autosend: 'OFF',
        excluded_delivery_unconfirmed: !!excluded,
        note: excluded ? 'Лид с неподтверждённой доставкой исключён из повторного контакта.' : null,
    };
}

// Pre-sale communication health (Customer Success read mode, pre-sale only).
export function getPresaleHealth(leadId, nowIso) {
    const store = readStore(STORE_PATH);
    const ctx = contextFor(leadId, store, readLedger(), replies.listReplies().items || []);
    return presaleHealth(ctx, nowIso);
}

export default { CONVERSATION_FLAGS, listConversations, getConversation, getTimeline, getReplies, getFollowups, getPresaleHealth };
