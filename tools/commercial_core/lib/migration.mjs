// tools/commercial_core/lib/migration.mjs
// Executable reference for migration iw1_commercial_sections_v1. Pure, in-memory, additive,
// idempotent, reversible. NEVER touches a production path — callers pass a store object (a synthetic
// or byte-copy fixture). Mirrors the additive namespaced-sections plan; one writer bumps revision.

export const MIGRATION_ID = 'iw1_commercial_sections_v1';
export const SECTIONS = [
    'commercial.opportunities', 'commercial.offers', 'commercial.owner_decisions', 'commercial.deals',
    'delivery.handoffs', 'delivery.projects', 'finance.invoices', 'finance.payments',
];

/** Forward: create any absent section as {}; never overwrite; bump store_revision once if anything added. */
export function applyForward(store) {
    let added = 0;
    for (const k of SECTIONS) {
        if (!Object.prototype.hasOwnProperty.call(store, k)) { store[k] = {}; added += 1; }
    }
    if (added > 0) {
        store.store_revision = (typeof store.store_revision === 'number' ? store.store_revision : 0) + 1;
        store._migrations = store._migrations || [];
        if (!store._migrations.includes(MIGRATION_ID)) store._migrations.push(MIGRATION_ID);
    }
    return { added };
}

/** Reverse: remove the eight sections ONLY if all empty; refuse if any holds entities. Never touch leads/queue. */
export function applyReverse(store) {
    const nonEmpty = SECTIONS.filter((k) => store[k] && Object.keys(store[k]).length > 0);
    if (nonEmpty.length > 0) return { ok: false, code: 'REFUSE_NONEMPTY_SECTIONS', nonEmpty };
    let removed = 0;
    for (const k of SECTIONS) { if (Object.prototype.hasOwnProperty.call(store, k)) { delete store[k]; removed += 1; } }
    if (removed > 0 && typeof store.store_revision === 'number') {
        store.store_revision -= 1; // exact inverse of the forward bump (rollback on a copy/backup)
    }
    if (store._migrations) {
        store._migrations = store._migrations.filter((m) => m !== MIGRATION_ID);
        if (store._migrations.length === 0) delete store._migrations; // no residue
    }
    return { ok: true, removed };
}

/** Keys that the migration must NEVER touch (used by the dry-run to prove non-interference). */
export const PROTECTED_KEYS = ['leads', 'store_revision_baseline', 'send_ledger', 'replies', 'followups', 'job_queue'];
