// tools/commercial_core/lib/pipeline_state.mjs
// PURE asynchronous per-lead commercial state model. No I/O, no send. Each lead advances through its
// own state independently — one lead in AWAITING_REPLY never blocks another lead or the global
// pipeline. Used by read models + the agent/pilot orchestration to compute next safe actions.

export const LEAD_STATES = [
    'DISCOVERED', 'VERIFICATION_PENDING', 'VERIFIED', 'AUDIT_PENDING', 'AUDIT_READY',
    'QA_PENDING', 'QA_APPROVED', 'OPPORTUNITY_READY', 'OFFER_DRAFT_READY', 'READY_FOR_SEND_REVIEW',
    'APPROVED_FOR_SEND', 'SENT_CONFIRMED', 'DELIVERY_UNCONFIRMED', 'AWAITING_REPLY', 'REPLY_RECEIVED',
    'FOLLOWUP_DUE', 'OWNER_REVIEW', 'QUALIFIED', 'NOT_INTERESTED', 'CLOSED_NO_RESPONSE',
];

// Forward transitions allowed in this no-send wave. APPROVED_FOR_SEND → SENT_CONFIRMED is GATED
// (requires Gate C1-C) and is NOT auto-traversable here.
const FORWARD = {
    DISCOVERED: ['VERIFICATION_PENDING'],
    VERIFICATION_PENDING: ['VERIFIED', 'OWNER_REVIEW'],
    VERIFIED: ['AUDIT_PENDING'],
    AUDIT_PENDING: ['AUDIT_READY', 'OWNER_REVIEW'],
    AUDIT_READY: ['QA_PENDING'],
    QA_PENDING: ['QA_APPROVED', 'OWNER_REVIEW'],
    QA_APPROVED: ['OPPORTUNITY_READY'],
    OPPORTUNITY_READY: ['OFFER_DRAFT_READY'],
    OFFER_DRAFT_READY: ['READY_FOR_SEND_REVIEW'],
    READY_FOR_SEND_REVIEW: ['APPROVED_FOR_SEND', 'OWNER_REVIEW'], // APPROVE_TEXT_ONLY stays here
    APPROVED_FOR_SEND: ['SENT_CONFIRMED'], // GATED — Gate C1-C only
    SENT_CONFIRMED: ['AWAITING_REPLY', 'DELIVERY_UNCONFIRMED'],
    DELIVERY_UNCONFIRMED: ['OWNER_REVIEW'],
    AWAITING_REPLY: ['REPLY_RECEIVED', 'FOLLOWUP_DUE'],
    FOLLOWUP_DUE: ['OWNER_REVIEW', 'CLOSED_NO_RESPONSE'],
    REPLY_RECEIVED: ['QUALIFIED', 'NOT_INTERESTED', 'OWNER_REVIEW'],
    QUALIFIED: [], NOT_INTERESTED: [], CLOSED_NO_RESPONSE: [], OWNER_REVIEW: [],
};

// States that require a GATE (owner action / Gate C1-C) and are never auto-traversed by the pipeline.
const GATED_TRANSITIONS = new Set(['READY_FOR_SEND_REVIEW->APPROVED_FOR_SEND', 'APPROVED_FOR_SEND->SENT_CONFIRMED']);

// States that block ONLY this lead (not the pipeline).
const PER_LEAD_BLOCKING = new Set(['AWAITING_REPLY', 'OWNER_REVIEW', 'DELIVERY_UNCONFIRMED']);

export function canTransition(from, to) {
    if (!LEAD_STATES.includes(from) || !LEAD_STATES.includes(to)) return { ok: false, code: 'UNKNOWN_STATE' };
    if (!(FORWARD[from] || []).includes(to)) return { ok: false, code: 'ILLEGAL_TRANSITION' };
    if (GATED_TRANSITIONS.has(`${from}->${to}`)) return { ok: false, code: 'GATED', gate: 'C1C_OWNER_SEND_APPROVAL' };
    return { ok: true };
}

// The next SAFE (non-gated) action for a lead in the no-send wave. Returns null when the lead is
// terminal or waiting on an external event (reply) / owner.
export function nextSafeState(from) {
    const outs = FORWARD[from] || [];
    for (const to of outs) {
        if (GATED_TRANSITIONS.has(`${from}->${to}`)) continue;
        if (PER_LEAD_BLOCKING.has(to)) continue;
        return to;
    }
    return null;
}

export function isPerLeadBlocking(state) { return PER_LEAD_BLOCKING.has(state); }

// Per-lead state isolation: given a cohort of {leadId, state}, compute which leads are actionable now
// vs blocked-on-self. A blocked lead NEVER marks the pipeline globally blocked.
export function pipelineView(cohort = []) {
    const actionable = [];
    const blockedSelf = [];
    const terminal = [];
    for (const { leadId, state } of cohort) {
        if (['QUALIFIED', 'NOT_INTERESTED', 'CLOSED_NO_RESPONSE'].includes(state)) terminal.push(leadId);
        else if (isPerLeadBlocking(state)) blockedSelf.push({ leadId, state });
        else actionable.push({ leadId, state, next: nextSafeState(state) });
    }
    return {
        total: cohort.length,
        actionable, blocked_self: blockedSelf, terminal,
        pipeline_global_blocked: false, // by construction: a blocked lead blocks only itself
        per_lead_state_isolation: true,
    };
}

// Invariants enforced elsewhere but declared here for the read model / tests.
export const INVARIANTS = {
    ONE_ACTIVE_SEND_PER_LEAD: true,
    ONE_OPEN_OPPORTUNITY_PER_PRODUCT_PER_LEAD: true,
    NO_DEAL_WON_BEFORE_VALID_DECISION: true,
    NO_HANDOFF_BEFORE_DEAL: true,
    NO_PROJECT_BEFORE_HANDOFF: true,
    NO_INVOICE_BEFORE_ALLOWED_STAGE: true,
};
