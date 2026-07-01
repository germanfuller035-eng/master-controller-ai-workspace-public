// tools/commercial_core/lib/store.mjs
// Single production mutation boundary for the commercial core (offline reference impl).
// Mirrors Master Controller's store_access contract: ONE writer, revision-guarded, idempotent,
// atomic. OS engines NEVER write here directly — they produce command objects that this seam
// validates and commits. There is exactly one ledger and one approval/deal/payment truth.
import crypto from 'node:crypto';

export const SECTIONS = [
    'commercial.opportunities', 'commercial.offers', 'commercial.deals',
    'delivery.handoffs', 'delivery.projects',
    'finance.invoices', 'finance.payments',
];

export function emptyStore() {
    const s = { schema_version: 1, store_revision: 0, updated_at: null, sections: {} };
    for (const k of SECTIONS) s.sections[k] = {};
    return s;
}

// Deterministic id derived from kind + natural key (no Date.now/random → replay-safe in tests).
export function makeId(kind, naturalKey) {
    const h = crypto.createHash('sha256').update(`${kind}:${naturalKey}`).digest('hex').slice(0, 12);
    return `${kind}_${h}`;
}

const SECTION_FOR = {
    opportunity: 'commercial.opportunities', offer: 'commercial.offers', deal: 'commercial.deals',
    handoff: 'delivery.handoffs', project: 'delivery.projects',
    invoice: 'finance.invoices', payment: 'finance.payments',
};

/**
 * The ONLY mutation entry point. Validates expectedRevision (409 on mismatch), enforces
 * idempotency (a repeated key returns the prior committed result with no second mutation), then
 * applies `mutate(section)` and bumps the global store revision. Returns a structured result; it
 * NEVER sends, never touches a second store, never fabricates success.
 */
export function commit(store, { entity, idempotencyKey, expectedRevision, at, mutate }) {
    const section = SECTION_FOR[entity];
    if (!section) return { ok: false, code: 'UNKNOWN_ENTITY' };
    if (!idempotencyKey) return { ok: false, code: 'MISSING_IDEMPOTENCY' };
    store._idem = store._idem || {};
    if (store._idem[idempotencyKey]) {
        return { ok: true, replayed: true, ...store._idem[idempotencyKey], revision: store.store_revision };
    }
    if (expectedRevision != null && expectedRevision !== store.store_revision) {
        return { ok: false, code: 'REVISION_CONFLICT', status: 409, expected: expectedRevision, actual: store.store_revision };
    }
    const bag = store.sections[section];
    const outcome = mutate(bag); // mutate returns { id, data } or { code } to abort
    if (outcome && outcome.code) return { ok: false, code: outcome.code, status: outcome.status || 422 };
    store.store_revision += 1;
    store.updated_at = at || null;
    const result = { id: outcome.id, entity, revision: store.store_revision };
    store._idem[idempotencyKey] = { id: outcome.id, entity };
    return { ok: true, ...result };
}

export function get(store, entity, id) {
    const section = SECTION_FOR[entity];
    return store.sections[section]?.[id] || null;
}
export function list(store, entity) {
    const section = SECTION_FOR[entity];
    return Object.values(store.sections[section] || {});
}
