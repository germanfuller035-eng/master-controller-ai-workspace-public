// campaigns/service.mjs
// ============================================================
// Campaign Governor (Phase 2) — campaign / cohort orchestration layer.
// ------------------------------------------------------------
// Models a controlled outreach campaign as a first-class object that sits ON TOP
// of the existing lead pipeline + ledger. It NEVER sends, NEVER mutates the lead
// store, and NEVER creates a second send path. It only governs *which* leads are
// released for outreach, in *what* cohort size, and *when* the next cohort may
// start — always behind an explicit owner gate.
//
// Ideas borrowed from Mautic/listmonk (campaign, cohort, observation window,
// suppression, delivery outcome) but implemented natively on the SAME atomic +
// revision writer (updateStoreWithRevision with a separate storePath). No new
// persistence mechanism, no second canonical writer for leads.
//
// State machine (campaign.status):
//   DRAFT --activate--> ACTIVE
//   ACTIVE --release cohort--> ACTIVE (cohort: PLANNED -> RELEASED -> OBSERVING)
//   ACTIVE --pause--> PAUSED --resume--> ACTIVE
//   ACTIVE/PAUSED --complete--> COMPLETED --archive--> ARCHIVED
//
// Cohort gate: a cohort can only be RELEASED if the previous cohort is CLOSED and
// the owner has approved progression (advanceCohort sets owner_approved). The first
// cohort needs activation only. Observation window must elapse before close.
import crypto from 'node:crypto';
import { CAMPAIGNS_STORE_PATH } from '../shared/config.mjs';
import { updateStoreWithRevision } from '../shared/store_access.mjs';
import fs from 'node:fs';

// ---------- constants ----------
export const CAMPAIGN_GOVERNOR_VERSION = 'campaign_v1';
// Production posture: the governor plans/observes campaigns but cohort SEND execution
// is hard-disabled. There is no code path here that enqueues a send or calls SMTP.
export const GOVERNOR_MODE = 'ACTIVE_NO_SEND';
export const COHORT_SEND_EXECUTION_ENABLED = false; // hard guard — never flip here
export const CAMPAIGN_STATUSES = Object.freeze(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED']);
export const COHORT_STATUSES = Object.freeze(['PLANNED', 'RELEASED', 'OBSERVING', 'CLOSED']);
// canonical cohort sizes from the brief (cohort 10 then cohort 20)
export const DEFAULT_COHORT_SIZES = Object.freeze([10, 20]);
export const DEFAULT_OBSERVATION_HOURS = 48;
export const PAUSE_REASONS = Object.freeze([
    'OWNER_REQUEST', 'HIGH_BOUNCE', 'LOW_RESPONSE', 'NEGATIVE_REPLIES', 'BUDGET', 'INVESTIGATION', 'OTHER',
]);

// ---------- pure helpers ----------
function nowISO() { return new Date().toISOString(); }
function newId(prefix) { return prefix + '_' + crypto.randomBytes(6).toString('hex'); }

// Empty store skeleton (created on first write if file is absent).
function emptyStore() {
    return { store_revision: 0, governor_version: CAMPAIGN_GOVERNOR_VERSION, campaigns: {} };
}

// Ensure the campaigns store file exists so updateStoreWithRevision can read it.
function ensureStoreFile(storePath) {
    try {
        if (!fs.existsSync(storePath)) {
            fs.writeFileSync(storePath, JSON.stringify(emptyStore(), null, 2) + '\n', 'utf8');
        }
    } catch { /* ignore — updateStoreWithRevision will surface a real error */ }
}

function campaignsMap(store) { if (!store.campaigns || typeof store.campaigns !== 'object') store.campaigns = {}; return store.campaigns; }

// Pure: validate a status transition.
export function canTransition(from, to) {
    const allowed = {
        DRAFT: ['ACTIVE', 'ARCHIVED'],
        ACTIVE: ['PAUSED', 'COMPLETED', 'ARCHIVED'],
        PAUSED: ['ACTIVE', 'COMPLETED', 'ARCHIVED'],
        COMPLETED: ['ARCHIVED'],
        ARCHIVED: [],
    };
    return !!allowed[from] && allowed[from].includes(to);
}

// Pure: has the observation window elapsed for a released cohort?
export function observationElapsed(cohort, now = new Date()) {
    if (!cohort || !cohort.released_at) return false;
    const releasedMs = Date.parse(cohort.released_at);
    if (Number.isNaN(releasedMs)) return false;
    const hours = Number(cohort.observation_hours || DEFAULT_OBSERVATION_HOURS);
    return (now.getTime() - releasedMs) >= hours * 3600000;
}

// Pure: compute aggregate delivery/response stats for a cohort from its outcomes[].
export function summarizeCohort(cohort) {
    const outcomes = Array.isArray(cohort?.delivery_outcomes) ? cohort.delivery_outcomes : [];
    const s = { released: cohort?.lead_ids?.length || 0, accepted: 0, delivered: 0, bounced: 0, replied: 0, opted_out: 0 };
    for (const o of outcomes) {
        if (o.smtp_accepted) s.accepted++;
        if (o.delivered) s.delivered++;
        if (o.bounced) s.bounced++;
        if (o.replied) s.replied++;
        if (o.opted_out) s.opted_out++;
    }
    s.bounce_rate = s.released ? Math.round((s.bounced / s.released) * 1000) / 1000 : 0;
    s.reply_rate = s.released ? Math.round((s.replied / s.released) * 1000) / 1000 : 0;
    return s;
}

// ---------- transactional ops (all via updateStoreWithRevision) ----------
function mutate(fn, { operationId = null, updatedBy = 'campaign_governor', expectedRevision = null } = {}) {
    ensureStoreFile(CAMPAIGNS_STORE_PATH);
    let outcome = { ok: false, code: 'UNKNOWN' };
    const res = updateStoreWithRevision((store) => {
        if (!store.governor_version) store.governor_version = CAMPAIGN_GOVERNOR_VERSION;
        const r = fn(store, (o) => { outcome = o; });
        return r;
    }, { expectedRevision, updatedBy, operationId, storePath: CAMPAIGNS_STORE_PATH });
    if (res && res.written) return { ...outcome, written: true, revision: res.revision };
    if (res && res.reason === 'ABORTED') return { ...outcome, written: false };
    return { ...outcome, written: false };
}

// Create a DRAFT campaign with a planned cohort schedule.
export function createCampaign({ name, niche = null, region = null, cohortSizes = DEFAULT_COHORT_SIZES, observationHours = DEFAULT_OBSERVATION_HOURS, testOnly = false, operationId = null }) {
    if (!name || typeof name !== 'string' || !name.trim()) return { ok: false, code: 'NAME_REQUIRED', written: false };
    const sizes = Array.isArray(cohortSizes) && cohortSizes.length ? cohortSizes.map((n) => Math.max(1, Number(n) || 1)) : DEFAULT_COHORT_SIZES.slice();
    return mutate((store, set) => {
        const map = campaignsMap(store);
        const id = newId('camp');
        const cohorts = sizes.map((size, i) => ({
            cohort_id: newId('coh'), index: i, planned_size: size, status: 'PLANNED',
            observation_hours: Number(observationHours) || DEFAULT_OBSERVATION_HOURS,
            owner_approved: i === 0, // first cohort needs only campaign activation
            lead_ids: [], delivery_outcomes: [], released_at: null, closed_at: null, created_at: nowISO(),
        }));
        map[id] = {
            campaign_id: id, name: name.trim(), niche: niche || null, region: region || null,
            status: 'DRAFT', governor_version: CAMPAIGN_GOVERNOR_VERSION,
            // TEST_ONLY entities are excluded from owner commercial KPI by default.
            test_only: !!testOnly,
            cohorts, suppression: [], pause_history: [],
            created_at: nowISO(), updated_at: nowISO(),
        };
        set({ ok: true, campaignId: id, status: 'DRAFT', cohorts: cohorts.length, testOnly: !!testOnly });
        return store;
    }, { operationId });
}

function getRef(store, campaignId) {
    const map = campaignsMap(store);
    return map[campaignId] ? map[campaignId] : null;
}

// Generic status transition (activate/pause/resume/complete/archive share this).
function transition(campaignId, to, extra = {}, operationId = null) {
    return mutate((store, set) => {
        const c = getRef(store, campaignId);
        if (!c) { set({ ok: false, code: 'CAMPAIGN_NOT_FOUND' }); return null; }
        if (c.status === to) { set({ ok: true, idempotent: true, status: to }); return null; }
        if (!canTransition(c.status, to)) { set({ ok: false, code: 'ILLEGAL_TRANSITION', from: c.status, to }); return null; }
        c.status = to;
        c.updated_at = nowISO();
        if (to === 'PAUSED') {
            c.pause_history.push({ reason: extra.reason || 'OWNER_REQUEST', at: nowISO(), note: extra.note || null });
        }
        set({ ok: true, campaignId, status: to });
        return store;
    }, { operationId });
}

export function activateCampaign({ campaignId, operationId = null }) { return transition(campaignId, 'ACTIVE', {}, operationId); }
export function pauseCampaign({ campaignId, reason = 'OWNER_REQUEST', note = null, operationId = null }) {
    const r = PAUSE_REASONS.includes(reason) ? reason : 'OTHER';
    return transition(campaignId, 'PAUSED', { reason: r, note }, operationId);
}
export function resumeCampaign({ campaignId, operationId = null }) { return transition(campaignId, 'ACTIVE', {}, operationId); }
export function completeCampaign({ campaignId, operationId = null }) { return transition(campaignId, 'COMPLETED', {}, operationId); }
export function archiveCampaign({ campaignId, operationId = null }) { return transition(campaignId, 'ARCHIVED', {}, operationId); }

// Owner gate: approve progression to the NEXT planned cohort. Requires the prior
// cohort to be CLOSED. This is the explicit "cohort 10 -> 20" decision.
export function advanceCohort({ campaignId, operationId = null }) {
    return mutate((store, set) => {
        const c = getRef(store, campaignId);
        if (!c) { set({ ok: false, code: 'CAMPAIGN_NOT_FOUND' }); return null; }
        if (c.status !== 'ACTIVE') { set({ ok: false, code: 'CAMPAIGN_NOT_ACTIVE', status: c.status }); return null; }
        const next = c.cohorts.find((co) => co.status === 'PLANNED');
        if (!next) { set({ ok: false, code: 'NO_PLANNED_COHORT' }); return null; }
        if (next.index > 0) {
            const prev = c.cohorts[next.index - 1];
            if (!prev || prev.status !== 'CLOSED') { set({ ok: false, code: 'PREVIOUS_COHORT_NOT_CLOSED', previousStatus: prev?.status || null }); return null; }
        }
        if (next.owner_approved) { set({ ok: true, idempotent: true, cohortId: next.cohort_id }); return null; }
        next.owner_approved = true;
        next.approved_at = nowISO();
        c.updated_at = nowISO();
        set({ ok: true, campaignId, cohortId: next.cohort_id, cohortIndex: next.index });
        return store;
    }, { operationId });
}

// Release an owner-approved cohort: attach the selected lead_ids and start the
// observation window. Does NOT send — it only marks which leads are released.
export function releaseCohort({ campaignId, leadIds = [], operationId = null }) {
    if (!Array.isArray(leadIds) || leadIds.length === 0) return { ok: false, code: 'LEAD_IDS_REQUIRED', written: false };
    return mutate((store, set) => {
        const c = getRef(store, campaignId);
        if (!c) { set({ ok: false, code: 'CAMPAIGN_NOT_FOUND' }); return null; }
        if (c.status !== 'ACTIVE') { set({ ok: false, code: 'CAMPAIGN_NOT_ACTIVE', status: c.status }); return null; }
        const co = c.cohorts.find((x) => x.status === 'PLANNED' && x.owner_approved);
        if (!co) { set({ ok: false, code: 'NO_APPROVED_COHORT' }); return null; }
        // suppression filter: never release a suppressed lead
        const suppressed = new Set((c.suppression || []).map((s) => s.lead_id));
        const accepted = [];
        for (const id of leadIds) {
            if (suppressed.has(id)) continue;
            if (accepted.length >= co.planned_size) break;
            if (!accepted.includes(id)) accepted.push(id);
        }
        if (accepted.length === 0) { set({ ok: false, code: 'ALL_LEADS_SUPPRESSED' }); return null; }
        co.lead_ids = accepted;
        co.status = 'RELEASED';
        co.released_at = nowISO();
        c.updated_at = nowISO();
        set({ ok: true, campaignId, cohortId: co.cohort_id, released: accepted.length, requested: leadIds.length });
        return store;
    }, { operationId });
}

// Record a delivery/response outcome for a lead in a cohort (fed from the ledger).
// Keeps the listmonk-style accounting (accepted vs delivered vs bounced vs replied).
export function recordOutcome({ campaignId, cohortId, leadId, outcome = {}, operationId = null }) {
    return mutate((store, set) => {
        const c = getRef(store, campaignId);
        if (!c) { set({ ok: false, code: 'CAMPAIGN_NOT_FOUND' }); return null; }
        const co = c.cohorts.find((x) => x.cohort_id === cohortId);
        if (!co) { set({ ok: false, code: 'COHORT_NOT_FOUND' }); return null; }
        if (!Array.isArray(co.delivery_outcomes)) co.delivery_outcomes = [];
        // idempotent per (leadId): replace existing outcome rather than duplicate
        const rec = {
            lead_id: leadId,
            smtp_accepted: !!outcome.smtp_accepted,
            delivered: !!outcome.delivered, // proven delivery, distinct from accepted
            bounced: !!outcome.bounced,
            replied: !!outcome.replied,
            opted_out: !!outcome.opted_out,
            at: nowISO(),
        };
        const idx = co.delivery_outcomes.findIndex((o) => o.lead_id === leadId);
        if (idx >= 0) co.delivery_outcomes[idx] = rec; else co.delivery_outcomes.push(rec);
        // auto-suppress on bounce / opt-out
        if (rec.bounced || rec.opted_out) {
            if (!c.suppression.some((s) => s.lead_id === leadId)) {
                c.suppression.push({ lead_id: leadId, reason: rec.opted_out ? 'OPT_OUT' : 'BOUNCED', at: nowISO() });
            }
        }
        c.updated_at = nowISO();
        set({ ok: true, campaignId, cohortId, leadId, summary: summarizeCohort(co) });
        return store;
    }, { operationId });
}

// Close a RELEASED cohort once its observation window has elapsed.
export function closeCohort({ campaignId, cohortId, force = false, now = new Date(), operationId = null }) {
    return mutate((store, set) => {
        const c = getRef(store, campaignId);
        if (!c) { set({ ok: false, code: 'CAMPAIGN_NOT_FOUND' }); return null; }
        const co = c.cohorts.find((x) => x.cohort_id === cohortId);
        if (!co) { set({ ok: false, code: 'COHORT_NOT_FOUND' }); return null; }
        if (co.status === 'CLOSED') { set({ ok: true, idempotent: true, cohortId }); return null; }
        if (co.status !== 'RELEASED' && co.status !== 'OBSERVING') { set({ ok: false, code: 'COHORT_NOT_RELEASED', status: co.status }); return null; }
        if (!force && !observationElapsed(co, now)) { set({ ok: false, code: 'OBSERVATION_NOT_ELAPSED', observationHours: co.observation_hours }); return null; }
        co.status = 'CLOSED';
        co.closed_at = nowISO();
        co.final_summary = summarizeCohort(co);
        c.updated_at = nowISO();
        set({ ok: true, campaignId, cohortId, summary: co.final_summary });
        return store;
    }, { operationId });
}

// Manually suppress a lead (owner action; never released afterwards).
export function suppressLead({ campaignId, leadId, reason = 'OWNER_REQUEST', operationId = null }) {
    return mutate((store, set) => {
        const c = getRef(store, campaignId);
        if (!c) { set({ ok: false, code: 'CAMPAIGN_NOT_FOUND' }); return null; }
        if (!Array.isArray(c.suppression)) c.suppression = [];
        if (c.suppression.some((s) => s.lead_id === leadId)) { set({ ok: true, idempotent: true, leadId }); return null; }
        c.suppression.push({ lead_id: leadId, reason: String(reason || 'OWNER_REQUEST'), at: nowISO() });
        c.updated_at = nowISO();
        set({ ok: true, campaignId, leadId, suppressed: true });
        return store;
    }, { operationId });
}

// ---------- reads (no IO mutation) ----------
function readStoreSafe() {
    try { return JSON.parse(fs.readFileSync(CAMPAIGNS_STORE_PATH, 'utf8')); } catch { return emptyStore(); }
}
export function listCampaigns({ includeTest = false } = {}) {
    const store = readStoreSafe();
    return Object.values(store.campaigns || {})
        // TEST_ONLY campaigns are hidden from owner commercial truth unless explicitly requested.
        .filter((c) => includeTest || !c.test_only)
        .map((c) => ({
            campaign_id: c.campaign_id, name: c.name, status: c.status,
            niche: c.niche, region: c.region, test_only: !!c.test_only,
            cohorts: (c.cohorts || []).map((co) => ({ cohort_id: co.cohort_id, index: co.index, status: co.status, planned_size: co.planned_size, released: co.lead_ids?.length || 0, summary: summarizeCohort(co) })),
            suppressed: (c.suppression || []).length, updated_at: c.updated_at,
        }));
}
export function getCampaign(campaignId) {
    const store = readStoreSafe();
    const c = (store.campaigns || {})[campaignId];
    if (!c) return null;
    return { ...c, cohorts: (c.cohorts || []).map((co) => ({ ...co, summary: summarizeCohort(co) })) };
}

export default {
    CAMPAIGN_GOVERNOR_VERSION, GOVERNOR_MODE, COHORT_SEND_EXECUTION_ENABLED,
    CAMPAIGN_STATUSES, COHORT_STATUSES, DEFAULT_COHORT_SIZES, DEFAULT_OBSERVATION_HOURS, PAUSE_REASONS,
    canTransition, observationElapsed, summarizeCohort,
    createCampaign, activateCampaign, pauseCampaign, resumeCampaign, completeCampaign, archiveCampaign,
    advanceCohort, releaseCohort, recordOutcome, closeCohort, suppressLead,
    listCampaigns, getCampaign,
};
