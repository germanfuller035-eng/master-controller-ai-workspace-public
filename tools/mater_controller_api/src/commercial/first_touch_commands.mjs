// tools/mater_controller_api/src/commercial/first_touch_commands.mjs
// First Touch owner COMMAND layer (no-send). Each command runs through the single canonical writer
// (updateStoreWithRevision) with expectedRevision + idempotency. Owner decisions/drafts are stored in
// namespaced sections (first_touch.drafts, first_touch.decisions, first_touch.pilot) and an idempotency
// map (_first_touch_idem). NEVER imports an SMTP/send/transport adapter. NEVER appends to the send
// ledger. NEVER sets sent / awaiting_reply / follow-up. approve-text-only != approve-send.
import crypto from 'node:crypto';
import { updateStoreWithRevision, readStore, STORE_PATH, leadsArray } from '../shared/store_access.mjs';
import firstTouch from './first_touch_service.mjs';

const DRAFTS = 'first_touch.drafts';
const DECISIONS = 'first_touch.decisions';
const PILOT = 'first_touch.pilot';
const IDEM = '_first_touch_idem';

function newId(prefix) { return `${prefix}_${crypto.randomBytes(8).toString('hex')}`; }
function nowIso(at) { return at || new Date().toISOString(); }

// Validation: a lead must exist and be eligible-ish to receive a draft (real audit + contact).
function findLead(store, leadId) {
    return leadsArray(store).find((l) => String(l.lead_id) === String(leadId)) || null;
}

// Generic command runner: validates, applies a pure mutate to the working sections, dedupes by
// idempotency key (replay returns the prior result without bumping revision), and records an audit
// event. mutate(ctx) must return { ok, result } | { ok:false, code }. ctx = { store, sections, lead, at }.
function runCommand({ idempotencyKey, expectedRevision, updatedBy }, validate, mutate) {
    if (!idempotencyKey) return { ok: false, code: 'MISSING_IDEMPOTENCY' };
    let outcome = null;
    let replay = null;
    const res = updateStoreWithRevision((store) => {
        const idemMap = store[IDEM] || {};
        if (idemMap[idempotencyKey]) { replay = idemMap[idempotencyKey]; return null; } // idempotent replay, no write
        store[DRAFTS] = store[DRAFTS] || {};
        store[DECISIONS] = store[DECISIONS] || {};
        store[PILOT] = store[PILOT] || {};
        const v = validate ? validate(store) : { ok: true };
        if (!v.ok) { outcome = v; return null; }
        const m = mutate({ store, at: nowIso() });
        if (!m || !m.ok) { outcome = m || { ok: false, code: 'ABORTED' }; return null; }
        // audit event (append-only, no-send)
        store[DECISIONS][m.eventId || newId('fte')] = {
            type: m.eventType, lead_id: m.leadId || null, artifact_id: m.artifactId || null,
            by: updatedBy || 'owner', at: nowIso(), no_send: true, detail: m.detail || null,
        };
        const recorded = { ok: true, ...m.result, no_send: true, transport_enabled: false };
        store[IDEM] = { ...idemMap, [idempotencyKey]: recorded };
        outcome = recorded;
        return store;
    }, { expectedRevision, idempotencyKey, updatedBy: updatedBy || 'first_touch_owner' });

    if (replay) return { ...replay, ok: true, written: false, idempotent: true, revision: res.revision };
    if (!res.written) return outcome || { ok: false, code: 'ABORTED' };
    return { ...outcome, ok: true, written: true, revision: res.revision };
}

// ---- commands ----

// Generate (or refresh) a no-send draft artifact for a lead and persist it.
export function generateDraft({ leadId, idempotencyKey, expectedRevision, updatedBy }) {
    return runCommand({ idempotencyKey, expectedRevision, updatedBy },
        (store) => {
            const lead = findLead(store, leadId);
            if (!lead) return { ok: false, code: 'LEAD_NOT_FOUND' };
            return { ok: true };
        },
        ({ store }) => {
            const art = firstTouch.buildArtifact(leadId, { store });
            if (!art) return { ok: false, code: 'ARTIFACT_BUILD_FAILED' };
            const draftId = newId('ftd');
            store[DRAFTS][draftId] = {
                draft_id: draftId, lead_id: String(leadId), artifact: art, content_hash: art.content_hash,
                status: art.status, selected_subject_id: art.recommended_subject_id,
                selected_body_id: art.recommended_body_id, text_approved: false, created_at: nowIso(),
            };
            return { ok: true, eventType: 'GENERATE_DRAFT', leadId, artifactId: art.content_hash,
                result: { draft_id: draftId, lead_id: String(leadId), content_hash: art.content_hash, status: art.status } };
        });
}

function withDraft(store, draftId) { return store[DRAFTS] && store[DRAFTS][draftId] ? store[DRAFTS][draftId] : null; }

export function selectSubject({ draftId, subjectId, idempotencyKey, expectedRevision, updatedBy }) {
    return runCommand({ idempotencyKey, expectedRevision, updatedBy },
        (store) => withDraft(store, draftId) ? { ok: true } : { ok: false, code: 'DRAFT_NOT_FOUND' },
        ({ store }) => {
            const d = store[DRAFTS][draftId];
            const exists = (d.artifact.subject_variants || []).some((s) => s.id === subjectId);
            if (!exists) return { ok: false, code: 'SUBJECT_NOT_FOUND' };
            d.selected_subject_id = subjectId; d.updated_at = nowIso();
            return { ok: true, eventType: 'SELECT_SUBJECT', leadId: d.lead_id, artifactId: d.content_hash,
                detail: { subjectId }, result: { draft_id: draftId, selected_subject_id: subjectId } };
        });
}

export function selectBody({ draftId, bodyId, idempotencyKey, expectedRevision, updatedBy }) {
    return runCommand({ idempotencyKey, expectedRevision, updatedBy },
        (store) => withDraft(store, draftId) ? { ok: true } : { ok: false, code: 'DRAFT_NOT_FOUND' },
        ({ store }) => {
            const d = store[DRAFTS][draftId];
            const exists = (d.artifact.body_variants || []).some((b) => b.id === bodyId);
            if (!exists) return { ok: false, code: 'BODY_NOT_FOUND' };
            d.selected_body_id = bodyId; d.updated_at = nowIso();
            return { ok: true, eventType: 'SELECT_BODY', leadId: d.lead_id, artifactId: d.content_hash,
                detail: { bodyId }, result: { draft_id: draftId, selected_body_id: bodyId } };
        });
}

export function requestChanges({ draftId, note, idempotencyKey, expectedRevision, updatedBy }) {
    return runCommand({ idempotencyKey, expectedRevision, updatedBy },
        (store) => withDraft(store, draftId) ? { ok: true } : { ok: false, code: 'DRAFT_NOT_FOUND' },
        ({ store }) => {
            const d = store[DRAFTS][draftId];
            d.status = 'CHANGES_REQUESTED'; d.text_approved = false;
            d.change_note = String(note || '').slice(0, 1000); d.updated_at = nowIso();
            return { ok: true, eventType: 'REQUEST_CHANGES', leadId: d.lead_id, artifactId: d.content_hash,
                detail: { note: d.change_note }, result: { draft_id: draftId, status: d.status } };
        });
}

// approve-text-only: owner approves the WORDING. This is NOT approval to send. It cannot set any send
// state, cannot issue a send token, cannot enable transport.
export function approveTextOnly({ draftId, idempotencyKey, expectedRevision, updatedBy }) {
    return runCommand({ idempotencyKey, expectedRevision, updatedBy },
        (store) => withDraft(store, draftId) ? { ok: true } : { ok: false, code: 'DRAFT_NOT_FOUND' },
        ({ store }) => {
            const d = store[DRAFTS][draftId];
            d.text_approved = true; d.status = 'TEXT_APPROVED'; d.text_approved_at = nowIso();
            return { ok: true, eventType: 'APPROVE_TEXT_ONLY', leadId: d.lead_id, artifactId: d.content_hash,
                result: { draft_id: draftId, text_approved: true, status: 'TEXT_APPROVED',
                    send_allowed_live: false, approval_token_issued: false } };
        });
}

export function reject({ draftId, reason, idempotencyKey, expectedRevision, updatedBy }) {
    return runCommand({ idempotencyKey, expectedRevision, updatedBy },
        (store) => withDraft(store, draftId) ? { ok: true } : { ok: false, code: 'DRAFT_NOT_FOUND' },
        ({ store }) => {
            const d = store[DRAFTS][draftId];
            d.status = 'REJECTED'; d.text_approved = false; d.reject_reason = String(reason || '').slice(0, 500); d.updated_at = nowIso();
            return { ok: true, eventType: 'REJECT', leadId: d.lead_id, artifactId: d.content_hash,
                detail: { reason: d.reject_reason }, result: { draft_id: draftId, status: 'REJECTED' } };
        });
}

export function returnToAudit({ draftId, idempotencyKey, expectedRevision, updatedBy }) {
    return runCommand({ idempotencyKey, expectedRevision, updatedBy },
        (store) => withDraft(store, draftId) ? { ok: true } : { ok: false, code: 'DRAFT_NOT_FOUND' },
        ({ store }) => {
            const d = store[DRAFTS][draftId];
            d.status = 'RETURNED_TO_AUDIT'; d.text_approved = false; d.updated_at = nowIso();
            return { ok: true, eventType: 'RETURN_TO_AUDIT', leadId: d.lead_id, artifactId: d.content_hash,
                result: { draft_id: draftId, status: 'RETURNED_TO_AUDIT' } };
        });
}

// select-pilot: marks ONE lead as the chosen pilot. Does NOT enable transport or issue a send token.
export function selectPilot({ leadId, idempotencyKey, expectedRevision, updatedBy }) {
    return runCommand({ idempotencyKey, expectedRevision, updatedBy },
        (store) => findLead(store, leadId) ? { ok: true } : { ok: false, code: 'LEAD_NOT_FOUND' },
        ({ store }) => {
            store[PILOT].selected_lead_id = String(leadId);
            store[PILOT].selected_at = nowIso();
            store[PILOT].send_allowed_live = false;
            store[PILOT].approval_token_issued = false;
            return { ok: true, eventType: 'SELECT_PILOT', leadId,
                result: { selected_pilot: String(leadId), send_allowed_live: false, approval_token_issued: false } };
        });
}

export default {
    generateDraft, selectSubject, selectBody, requestChanges, approveTextOnly, reject, returnToAudit, selectPilot,
};
