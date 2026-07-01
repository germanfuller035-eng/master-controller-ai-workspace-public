// tools/commercial_core/lib/conversation_read.mjs
// PURE read-only conversation timeline + pre-sale communication-health indicators.
// Builds a unified, chronological view from ALREADY-RESOLVED inputs (lead, opportunity, offer, send
// approval, send-ledger rows, replies, follow-up plan) — it does NOT define a second conversation
// truth, never sends, never mutates. The API layer resolves the inputs and calls these projections.

function ts(x) { return x ? Date.parse(x) || 0 : 0; }

/**
 * Build a unified timeline for one lead/conversation from its related entities.
 * @param ctx { lead, opportunity, offer, sendApproval, ledgerRows[], replies[], followupPlan }
 * Returns events sorted ascending by time; never includes raw email body/recipient (redacted refs only).
 */
export function buildTimeline(ctx = {}) {
    const events = [];
    const { lead, opportunity, offer, sendApproval, ledgerRows = [], replies = [], followupPlan } = ctx;
    const leadId = String(lead?.lead_id || lead?.leadId || opportunity?.lead_id || '');
    if (lead) events.push({ at: lead.created_at || null, type: 'LEAD_CREATED', ref: leadId });
    if (opportunity) events.push({ at: opportunity.created_at || null, type: 'OPPORTUNITY_CREATED', ref: opportunity.opportunity_id, stage: opportunity.stage });
    if (offer) {
        events.push({ at: offer.created_at || null, type: 'OFFER_DRAFT_PREPARED', ref: offer.offer_id, status: offer.status });
        if (offer.owner_decision) events.push({ at: offer.updated_at || null, type: 'OWNER_DECISION', ref: offer.offer_id, decision: offer.owner_decision, status: offer.status });
    }
    if (sendApproval) events.push({ at: sendApproval.approved_at || null, type: 'SEND_APPROVAL_PREPARED', ref: sendApproval.approval_id, expiresAt: sendApproval.expires_at, consumed: sendApproval.consumed === true });
    for (const row of ledgerRows) events.push({ at: row.timestamp || row.at || null, type: 'MESSAGE_SENT_LEDGER', ref: row.draft_id || row.smtp_message_id || null, result: row.result || null });
    for (const r of replies) events.push({ at: r.received_at || r.created_at || null, type: 'REPLY_RECEIVED', ref: r.reply_id || null, category: r.category || null });
    if (followupPlan) events.push({ at: followupPlan.due_at || followupPlan.created_at || null, type: 'FOLLOWUP_PLANNED', ref: followupPlan.status || null, autosend: 'OFF' });
    events.sort((a, b) => ts(a.at) - ts(b.at));
    return {
        conversation_id: leadId ? `conv_${leadId}` : null,
        lead_id: leadId || null,
        events,
        event_count: events.length,
        send_capability: 'NONE',
    };
}

/**
 * Pre-sale communication-health indicator. Uses conversation signals only (no Customer Success
 * post-sale lifecycle). nowIso is passed in (no Date.now in pure code).
 */
export function presaleHealth(ctx = {}, nowIso) {
    const { lead, opportunity, offer, ledgerRows = [], replies = [], deliveryRecord } = ctx;
    const now = Date.parse(nowIso || '') || 0;
    const lastSentMs = ledgerRows.reduce((m, r) => Math.max(m, ts(r.timestamp || r.at)), 0);
    const lastActionMs = Math.max(lastSentMs, ts(offer?.updated_at), ts(opportunity?.updated_at));
    const replyReceived = replies.length > 0;
    const daysSince = lastActionMs ? Math.floor((now - lastActionMs) / 86400000) : null;

    let state = 'PRE_SALE';
    if (replyReceived) state = 'OWNER_REVIEW';
    else if (offer?.status === 'READY_FOR_SEND_REVIEW') state = 'OWNER_REVIEW';
    else if (lastSentMs) state = 'AWAITING_REPLY';

    // Delivery confidence: only a ledger-backed confirmed send is HIGH; unproven → LOW.
    const deliveryConfidence = deliveryRecord?.confirmedSent ? 'HIGH'
        : deliveryRecord ? 'LOW' : (lastSentMs ? 'MEDIUM' : 'NONE');

    const ownerAttentionReason = deliveryRecord && deliveryRecord.ownerReviewRequired
        ? 'delivery_unconfirmed'
        : (replyReceived ? 'reply_received'
            : (daysSince != null && daysSince >= 5 ? 'followup_due' : null));

    return {
        lead_id: String(lead?.lead_id || opportunity?.lead_id || '') || null,
        state,
        communication_health: replyReceived ? 'ENGAGED' : (lastSentMs ? 'CONTACTED_AWAITING' : 'NOT_CONTACTED'),
        days_since_last_action: daysSince,
        reply_received: replyReceived,
        followup_due: daysSince != null && daysSince >= 5 && !replyReceived,
        delivery_status_confidence: deliveryConfidence,
        owner_attention_reason: ownerAttentionReason,
        // pre-sale: no surveys, no support, no renewal — and never auto.
        allowed_states: ['PRE_SALE', 'AWAITING_REPLY', 'FOLLOWUP_DUE', 'OWNER_REVIEW'],
    };
}
