// tools/conversation_hub/lib/inbox.mjs
// MP26 owner inbox + MP35 dashboard + MP36 owner command center. Pure, derived views only.
// These NEVER mutate canonical state; they read synthetic conversation/message data.

// Build derived owner queues from a set of {conversation, messages, classification, routing} bundles.
export function buildInbox(bundles) {
  const queues = {
    needs_reply: [], needs_approval: [], identity_conflict: [], opt_out_review: [],
    support_escalation: [], billing_question: [], incident: [], waiting_contact: [],
    waiting_channel: [], stale_conversation: [], no_action: [],
  };
  for (const b of bundles) {
    const c = b.conversation;
    const intent = b.classification?.primary_intent;
    const route = b.routing?.target_system;
    if (b.routing?.blocked || b.identity_state === 'CONFLICT') queues.identity_conflict.push(c.conversation_id);
    else if (intent === 'opt_out' || intent === 'unsubscribe') queues.opt_out_review.push(c.conversation_id);
    else if (intent === 'incident') queues.incident.push(c.conversation_id);
    else if (intent === 'complaint') queues.support_escalation.push(c.conversation_id);
    else if (intent === 'billing') queues.billing_question.push(c.conversation_id);
    else if (intent === 'support') queues.support_escalation.push(c.conversation_id);
    else if (c.status === 'WAITING_APPROVAL') queues.needs_approval.push(c.conversation_id);
    else if (c.status === 'WAITING_CONTACT') queues.waiting_contact.push(c.conversation_id);
    else if (c.status === 'WAITING_CHANNEL') queues.waiting_channel.push(c.conversation_id);
    else if (b.stale === true) queues.stale_conversation.push(c.conversation_id);
    else if (b.needs_reply === true || (b.routing && route !== 'BLOCKED_UNKNOWN' && b.conversation.status === 'ACTIVE')) queues.needs_reply.push(c.conversation_id);
    else queues.no_action.push(c.conversation_id);
  }
  return { schema: 'conversation_hub.owner_inbox.v1', mutates_canonical: false, queues, counts: Object.fromEntries(Object.entries(queues).map(([k, v]) => [k, v.length])) };
}

export function buildDashboard(ds, inbox, ts) {
  const scen = ds.fixtures?.scenarios || [];
  return {
    schema: 'conversation_hub.dashboard.v1',
    generated_ts: ts || 'UNSTAMPED',
    synthetic: true,
    note: 'Derived view. Does not duplicate Master Controller queues; references canonical owners.',
    conversations_total: scen.length,
    needs_reply: inbox.counts.needs_reply,
    needs_approval: inbox.counts.needs_approval,
    identity_conflicts: inbox.counts.identity_conflict,
    opt_outs: inbox.counts.opt_out_review,
    support: inbox.counts.support_escalation,
    billing: inbox.counts.billing_question,
    escalations: inbox.counts.incident + inbox.counts.support_escalation,
    channel_readiness: (ds.policies?.channel_health?.channels || []).map((c) => ({ channel: c.channel_id, status: c.status })),
    classification_quality: { note: 'deterministic rule engine; manual_review when confidence < 0.7' },
    stale_conversations: inbox.counts.stale_conversation,
    owner_actions: inbox.counts.needs_reply + inbox.counts.needs_approval + inbox.counts.opt_out_review + inbox.counts.identity_conflict,
    intentionally_disconnected_channels: (ds.channels?.channels || []).filter((c) => c.live_state === 'NOT_CONNECTED').map((c) => c.channel),
  };
}

export function buildOwnerCenter(ds, inbox, ts) {
  const firstOf = (q) => (inbox.queues[q] && inbox.queues[q][0]) || null;
  return {
    schema: 'conversation_hub.owner_command_center.v1',
    generated_ts: ts || 'UNSTAMPED',
    synthetic: true,
    primary_conversation_action: firstOf('incident') || firstOf('support_escalation') || firstOf('needs_reply') || null,
    highest_priority_reply: firstOf('incident') || firstOf('needs_reply'),
    approval_pending: firstOf('needs_approval'),
    opt_out_requiring_review: firstOf('opt_out_review'),
    support_escalation: firstOf('support_escalation'),
    channel_issue: 'all live channels NOT_CONNECTED (by design this task)',
    identity_conflict: firstOf('identity_conflict'),
    stale_thread: firstOf('stale_conversation'),
    owner_capacity_warning: inbox.counts.needs_reply > 10 ? 'high reply backlog' : 'within capacity',
    note: 'No message action executed. Recommendations only.',
  };
}
