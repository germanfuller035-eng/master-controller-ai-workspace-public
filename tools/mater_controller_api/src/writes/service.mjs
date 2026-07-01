// writes/service.mjs
// ============================================================
// Canonical WRITE service for the Master Controller API.
// ------------------------------------------------------------
// This is the ONLY API path that mutates the canonical lead store, and it does so
// exclusively through updateStoreWithRevision (atomic temp+rename + lock +
// optimistic store_revision + operation_id). It NEVER sends email (that stays in
// the canonical router via mini_audit.performApprovedSend) and NEVER creates a
// second store or ledger.
//
// Guarantees required by Release 2:
//   - Every mutation is transactional: confirmed persistence BEFORE the caller
//     returns 2xx (updateStoreWithRevision writes the temp file and renames before
//     returning; we surface {written:true, revision} only on success).
//   - operation_id idempotency: a repeated operation_id is a no-op that returns the
//     prior result instead of applying twice.
//   - optional expectedRevision: a stale writer gets STORE_REVISION_CONFLICT (409).
// ============================================================
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { WORKSPACE, STORE_PATH } from '../shared/config.mjs';
import { updateStoreWithRevision, readStore } from '../shared/store_access.mjs';

// Reserved status set that the API may set (mirrors lead_store STATUS values used today).
export const WRITABLE_STATUSES = new Set([
    'verified_ready', 'ready', 'needs_identity_verification', 'hold_no_public_email',
    'written_channel_search_queue', 'hold_later', 'waiting_reply', 'send_uncertain',
    'rejected', 'contacted', 'interested', 'won', 'opt_out',
]);

// Resolve a lead inside the store regardless of shape (object-map is the production
// shape; array is also supported). Returns { get, set } accessors or null if absent.
function leadRef(store, leadId) {
    const id = String(leadId || '').trim();
    if (store && store.leads && !Array.isArray(store.leads) && typeof store.leads === 'object') {
        // object map keyed by lead_id (production shape)
        // find by key first, then by inner lead_id field
        if (Object.prototype.hasOwnProperty.call(store.leads, id)) {
            return { get: () => store.leads[id], set: (v) => { store.leads[id] = v; } };
        }
        for (const k of Object.keys(store.leads)) {
            const v = store.leads[k];
            if (v && String(v.lead_id || v.id || '').trim() === id) {
                return { get: () => store.leads[k], set: (nv) => { store.leads[k] = nv; } };
            }
        }
        return null;
    }
    if (Array.isArray(store.leads)) {
        const idx = store.leads.findIndex((l) => String(l.lead_id || l.id || '').trim() === id);
        if (idx < 0) return null;
        return { get: () => store.leads[idx], set: (v) => { store.leads[idx] = v; } };
    }
    return null;
}

// Has this operation_id already been applied? (idempotency)
function priorOperation(store, operationId) {
    if (!operationId) return null;
    const log = store._operation_log || {};
    return log[operationId] || null;
}

function recordOperation(store, operationId, summary) {
    if (!operationId) return;
    if (!store._operation_log) store._operation_log = {};
    // bound the log so it can't grow without limit on a 1 GB box
    const keys = Object.keys(store._operation_log);
    if (keys.length > 5000) delete store._operation_log[keys[0]];
    store._operation_log[operationId] = { at: new Date().toISOString(), ...summary };
}

// Update a lead's status. Transactional + idempotent.
//   returns { ok, written, revision, code?, leadId, status } or throws on revision conflict.
export function updateLeadStatus({ leadId, status, operationId = null, expectedRevision = null, updatedBy = 'api' }) {
    const id = String(leadId || '').trim();
    if (!id) return { ok: false, code: 'LEAD_ID_REQUIRED' };
    if (!WRITABLE_STATUSES.has(status)) return { ok: false, code: 'STATUS_NOT_WRITABLE', status };

    let outcome = { ok: false, code: 'UNKNOWN' };
    const res = updateStoreWithRevision((store) => {
        const prior = priorOperation(store, operationId);
        if (prior) { outcome = { ok: true, idempotent: true, ...prior.result }; return null; } // no-op

        const ref = leadRef(store, id);
        if (!ref) { outcome = { ok: false, code: 'LEAD_NOT_FOUND' }; return null; }
        const lead = ref.get();
        const before = lead.status || null;
        lead.status = status;
        lead.status_updated_at = new Date().toISOString();
        ref.set(lead);
        outcome = { ok: true, leadId: id, status, previousStatus: before };
        recordOperation(store, operationId, { kind: 'status', result: outcome });
        return store;
    }, { expectedRevision, updatedBy, operationId, backup: false, storePath: STORE_PATH });

    if (res && res.written) return { ...outcome, written: true, revision: res.revision };
    if (res && res.reason === 'ABORTED') return { ...outcome, written: false };
    return { ...outcome, written: false };
}

// Save/replace a draft on a lead (draft preparation; never sends).
export function saveLeadDraft({ leadId, draft, operationId = null, expectedRevision = null, updatedBy = 'api' }) {
    const id = String(leadId || '').trim();
    if (!id) return { ok: false, code: 'LEAD_ID_REQUIRED' };
    if (!draft || typeof draft !== 'object') return { ok: false, code: 'DRAFT_REQUIRED' };

    let outcome = { ok: false, code: 'UNKNOWN' };
    const res = updateStoreWithRevision((store) => {
        const prior = priorOperation(store, operationId);
        if (prior) { outcome = { ok: true, idempotent: true, ...prior.result }; return null; }
        const ref = leadRef(store, id);
        if (!ref) { outcome = { ok: false, code: 'LEAD_NOT_FOUND' }; return null; }
        const lead = ref.get();
        const version = (lead.draft_version || 0) + 1;
        lead.draft = { ...draft, version, updated_at: new Date().toISOString() };
        lead.draft_version = version;
        ref.set(lead);
        outcome = { ok: true, leadId: id, draftVersion: version };
        recordOperation(store, operationId, { kind: 'draft', result: outcome });
        return store;
    }, { expectedRevision, updatedBy, operationId, storePath: STORE_PATH });

    if (res && res.written) return { ...outcome, written: true, revision: res.revision };
    return { ...outcome, written: false };
}

// Reject (clear) a lead's draft. Transactional + idempotent.
export function rejectLeadDraft({ leadId, reason = '', operationId = null, expectedRevision = null, updatedBy = 'api' }) {
    const id = String(leadId || '').trim();
    if (!id) return { ok: false, code: 'LEAD_ID_REQUIRED' };

    let outcome = { ok: false, code: 'UNKNOWN' };
    const res = updateStoreWithRevision((store) => {
        const prior = priorOperation(store, operationId);
        if (prior) { outcome = { ok: true, idempotent: true, ...prior.result }; return null; }
        const ref = leadRef(store, id);
        if (!ref) { outcome = { ok: false, code: 'LEAD_NOT_FOUND' }; return null; }
        const lead = ref.get();
        lead.draft_rejected = { reason: String(reason || ''), at: new Date().toISOString() };
        if (lead.draft) lead.draft.rejected = true;
        ref.set(lead);
        outcome = { ok: true, leadId: id, rejected: true };
        recordOperation(store, operationId, { kind: 'reject_draft', result: outcome });
        return store;
    }, { expectedRevision, updatedBy, operationId, storePath: STORE_PATH });

    if (res && res.written) return { ...outcome, written: true, revision: res.revision };
    return { ...outcome, written: false };
}

// Current store revision (for clients that want to send expectedRevision).
export function currentRevision() {
    try { return Number(readStore(STORE_PATH).store_revision) || 0; } catch { return 0; }
}

export default { updateLeadStatus, saveLeadDraft, rejectLeadDraft, currentRevision, WRITABLE_STATUSES };
