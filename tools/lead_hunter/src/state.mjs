// state.mjs — Lead Hunter explicit state machine + legal transitions.
// Pure constants/helpers, no IO. A candidate lives in exactly one state.
export const STATE = Object.freeze({
    DISCOVERED: 'DISCOVERED',
    NORMALIZED: 'NORMALIZED',
    DEDUPED: 'DEDUPED',
    ENRICHMENT_PENDING: 'ENRICHMENT_PENDING',
    ENRICHED: 'ENRICHED',
    VERIFICATION_PENDING: 'VERIFICATION_PENDING',
    VERIFIED: 'VERIFIED',
    VERIFIED_NO_WEBSITE: 'VERIFIED_NO_WEBSITE',
    VERIFIED_NO_EMAIL: 'VERIFIED_NO_EMAIL',
    REJECTED: 'REJECTED',
    SCORED: 'SCORED',
    READY_FOR_AUDIT: 'READY_FOR_AUDIT',
    READY_FOR_REVIEW: 'READY_FOR_REVIEW',
    PROMOTION_APPROVED: 'PROMOTION_APPROVED',
    PROMOTED: 'PROMOTED',
});

export const ALL_STATES = Object.freeze(Object.values(STATE));

// Allowed transitions (from -> [to...]). Anything else is rejected by canTransition.
const T = {
    DISCOVERED: ['NORMALIZED', 'REJECTED'],
    NORMALIZED: ['DEDUPED', 'REJECTED'],
    DEDUPED: ['ENRICHMENT_PENDING', 'REJECTED'],
    ENRICHMENT_PENDING: ['ENRICHED', 'REJECTED'],
    ENRICHED: ['VERIFICATION_PENDING', 'REJECTED'],
    VERIFICATION_PENDING: ['VERIFIED', 'VERIFIED_NO_WEBSITE', 'VERIFIED_NO_EMAIL', 'REJECTED'],
    VERIFIED: ['SCORED', 'REJECTED'],
    VERIFIED_NO_WEBSITE: ['SCORED', 'REJECTED'],
    VERIFIED_NO_EMAIL: ['SCORED', 'REJECTED'],
    SCORED: ['READY_FOR_AUDIT', 'READY_FOR_REVIEW', 'REJECTED'],
    READY_FOR_AUDIT: ['READY_FOR_REVIEW', 'PROMOTION_APPROVED', 'REJECTED'],
    READY_FOR_REVIEW: ['PROMOTION_APPROVED', 'REJECTED'],
    PROMOTION_APPROVED: ['PROMOTED', 'REJECTED'],
    PROMOTED: [],
    REJECTED: [],
};

export function canTransition(from, to) {
    if (!ALL_STATES.includes(from) || !ALL_STATES.includes(to)) return false;
    return (T[from] || []).includes(to);
}

// Terminal states cannot transition further.
export function isTerminal(s) { return s === STATE.PROMOTED || s === STATE.REJECTED; }
