// owner_center/service.mjs
// ============================================================
// Owner Command & Autonomy Center (0.8.0) — deterministic core.
// ------------------------------------------------------------
// A single operational domain that turns raw system signals into the four
// owner-facing answers: what happened / how important / what the system already
// did / what decision is needed. It sits ON TOP of the existing canonical API,
// queue, Campaign Governor, Conversation Hub, reply monitor and follow-up planner.
//
// HARD INVARIANTS:
//   - Uses the SAME atomic+revision writer (updateStoreWithRevision, separate
//     storePath). No second lead store / ledger / queue / approval truth.
//   - Append-only, idempotent events (dedup by deduplication_key).
//   - NEVER sends, NEVER opens a send gate, NEVER writes the canonical lead store,
//     NEVER lifts suppression, NEVER changes price, NEVER deletes canonical data.
//   - Owner-facing text is Russian; raw codes live only in metadata.
//   - AI is optional; absent provider => DETERMINISTIC_ONLY (not a blocker).
import crypto from 'node:crypto';
import fs from 'node:fs';
import { OWNER_CENTER_STORE_PATH } from '../shared/config.mjs';
import { updateStoreWithRevision } from '../shared/store_access.mjs';

export const OWNER_CENTER_VERSION = 'owner_center_v1';
export const SEVERITIES = Object.freeze(['P0', 'P1', 'P2', 'P3']);
export const ENTITY_TYPES = Object.freeze(['LEAD', 'JOB', 'CAMPAIGN', 'COHORT', 'CONVERSATION', 'MESSAGE', 'SOURCE', 'SERVICE', 'BACKUP', 'SECURITY', 'COST']);
export const NOTIFICATION_CHANNELS = Object.freeze(['APP_INBOX', 'ANDROID_PUSH', 'TELEGRAM_OWNER']);
export const NOTIFICATION_STATES = Object.freeze(['unread', 'read', 'acknowledged', 'resolved', 'expired', 'muted']);
export const INCIDENT_STATES = Object.freeze(['OPEN', 'MITIGATING', 'OBSERVING', 'RESOLVED', 'ACKNOWLEDGED', 'MUTED']);
export const DECISION_CATEGORIES = Object.freeze(['CLIENT', 'CAMPAIGN', 'REPLY', 'CHANNEL', 'COST', 'LEGAL_POLICY', 'SYSTEM', 'SECURITY']);
export const DECISION_ACTIONS = Object.freeze(['APPROVE', 'REQUEST_CHANGES', 'DEFER', 'REJECT', 'OPEN_EVIDENCE', 'STOP_PROCESS']);
export const AUTOPILOT_MODES = Object.freeze(['OBSERVE', 'PREPARE', 'MANAGED', 'LIMITED_AUTOMATION']);
export const DEFAULT_AUTOPILOT = 'MANAGED';

// Outbound posture is NEVER decided here; surfaced read-only for the UI.
export const SENDS_FROM_OWNER_CENTER = false;

// ---------- pure helpers ----------
function nowISO() { return new Date().toISOString(); }
function newId(p) { return p + '_' + crypto.randomBytes(6).toString('hex'); }
function shortHash(s) { return crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 16); }

function emptyStore() {
    return {
        store_revision: 0, owner_center_version: OWNER_CENTER_VERSION,
        events: [], notifications: [], incidents: [], decisions: [],
        autopilot: { mode: DEFAULT_AUTOPILOT, updated_at: null },
        kill_switch: { enabled: false, updated_at: null },
        remediations: [],
    };
}
function ensureStoreFile(p) {
    try { if (!fs.existsSync(p)) fs.writeFileSync(p, JSON.stringify(emptyStore(), null, 2) + '\n', 'utf8'); }
    catch { /* updateStoreWithRevision surfaces real errors */ }
}
function readStoreSafe() {
    try { return JSON.parse(fs.readFileSync(OWNER_CENTER_STORE_PATH, 'utf8')); } catch { return emptyStore(); }
}
function mutate(fn, { operationId = null, updatedBy = 'owner_center', expectedRevision = null } = {}) {
    ensureStoreFile(OWNER_CENTER_STORE_PATH);
    let outcome = { ok: false, code: 'UNKNOWN' };
    const res = updateStoreWithRevision((store) => {
        for (const k of ['events', 'notifications', 'incidents', 'decisions', 'remediations']) if (!Array.isArray(store[k])) store[k] = [];
        if (!store.autopilot) store.autopilot = { mode: DEFAULT_AUTOPILOT, updated_at: null };
        if (!store.kill_switch) store.kill_switch = { enabled: false, updated_at: null };
        return fn(store, (o) => { outcome = o; });
    }, { expectedRevision, updatedBy, operationId, storePath: OWNER_CENTER_STORE_PATH });
    if (res && res.written) return { ...outcome, written: true, revision: res.revision };
    if (res && res.reason === 'ABORTED') return { ...outcome, written: false };
    return { ...outcome, written: false };
}

// ---------- Unified Event Bus (append-only, idempotent) ----------
// Validates the documented contract; fills defaults; dedups by deduplication_key.
export function buildEvent(input = {}) {
    const sev = SEVERITIES.includes(input.severity) ? input.severity : 'P2';
    const occurred = input.occurred_at || nowISO();
    const dedup = input.deduplication_key || shortHash(`${input.event_type}|${input.entity_type}|${input.entity_id}|${input.title_ru}`);
    return {
        event_id: input.event_id || newId('evt'),
        event_type: String(input.event_type || 'GENERIC'),
        severity: sev,
        entity_type: ENTITY_TYPES.includes(input.entity_type) ? input.entity_type : 'SERVICE',
        entity_id: input.entity_id || null,
        lead_id: input.lead_id || null,
        campaign_id: input.campaign_id || null,
        conversation_id: input.conversation_id || null,
        job_id: input.job_id || null,
        correlation_id: input.correlation_id || newId('corr'),
        trace_id: input.trace_id || newId('trace'),
        canonical_revision: Number(input.canonical_revision || 0),
        occurred_at: occurred,
        title_ru: String(input.title_ru || 'Событие системы'),
        summary_ru: String(input.summary_ru || ''),
        impact_ru: String(input.impact_ru || ''),
        automatic_actions: Array.isArray(input.automatic_actions) ? input.automatic_actions : [],
        owner_action_required: !!input.owner_action_required,
        owner_action_type: input.owner_action_type || null,
        deep_link: input.deep_link || null,
        deduplication_key: dedup,
        expires_at: input.expires_at || null,
        test_only: !!input.test_only,
        metadata: (input.metadata && typeof input.metadata === 'object') ? input.metadata : {},
    };
}

// Publish an event. Idempotent by deduplication_key within a bounded window.
// Auto-generates an APP_INBOX notification, and routes P0/P1 to push/telegram.
export function publishEvent(input = {}, { operationId = null } = {}) {
    const ev = buildEvent(input);
    return mutate((store, set) => {
        const dup = store.events.find((e) => e.deduplication_key === ev.deduplication_key && !isExpired(e));
        if (dup) { set({ ok: true, idempotent: true, eventId: dup.event_id }); return null; }
        store.events.push(ev);
        // bound the log
        if (store.events.length > 5000) store.events.splice(0, store.events.length - 5000);
        // generate notification routing
        const channels = routeChannels(ev);
        const notif = {
            notification_id: newId('ntf'),
            event_id: ev.event_id, severity: ev.severity,
            title_ru: ev.title_ru, summary_ru: ev.summary_ru, impact_ru: ev.impact_ru,
            automatic_actions: ev.automatic_actions, owner_action_required: ev.owner_action_required,
            deep_link: ev.deep_link, channels, state: 'unread',
            test_only: ev.test_only, created_at: nowISO(), expires_at: ev.expires_at,
        };
        store.notifications.push(notif);
        if (store.notifications.length > 5000) store.notifications.splice(0, store.notifications.length - 5000);
        set({ ok: true, eventId: ev.event_id, notificationId: notif.notification_id, channels });
        return store;
    }, { operationId });
}

function isExpired(o, now = Date.now()) {
    return !!(o.expires_at && Date.parse(o.expires_at) && Date.parse(o.expires_at) < now);
}

// Notification routing policy (pure): which channels a severity reaches.
export function routeChannels(ev) {
    const ch = ['APP_INBOX'];
    if (ev.severity === 'P0') { ch.push('ANDROID_PUSH', 'TELEGRAM_OWNER'); return ch; }
    if (ev.severity === 'P1') {
        ch.push('ANDROID_PUSH');
        // Telegram only for the allowed P1 classes
        if (['POSITIVE_REPLY', 'PRICE_REQUEST', 'DECISION_SLA', 'OUTBOUND_GATE_CHANGED', 'ANDROID_NOTIFS_DOWN'].includes(ev.event_type)) ch.push('TELEGRAM_OWNER');
        return ch;
    }
    // P2/P3 stay in-app (push optional per owner prefs, applied client-side)
    return ch;
}

// ---------- Incident Engine (grouping + dedup + lifecycle) ----------
// Groups many events under one incident by (entity_type, group_key).
export function recordIncidentSignal({ groupKey, severity, title_ru, summary_ru, entity_type = 'SERVICE', metadata = {}, test_only = false }, { operationId = null } = {}) {
    return mutate((store, set) => {
        const key = groupKey || shortHash(`${entity_type}|${title_ru}`);
        let inc = store.incidents.find((i) => i.group_key === key && !['RESOLVED', 'MUTED'].includes(i.state));
        if (!inc) {
            inc = {
                incident_id: newId('inc'), group_key: key, severity: SEVERITIES.includes(severity) ? severity : 'P2',
                entity_type, title_ru: title_ru || 'Инцидент', summary_ru: summary_ru || '',
                state: 'OPEN', event_count: 0, first_seen: nowISO(), last_seen: nowISO(),
                automatic_actions: [], test_only: !!test_only, metadata,
            };
            store.incidents.push(inc);
        }
        inc.event_count += 1;
        inc.last_seen = nowISO();
        if (summary_ru) inc.summary_ru = summary_ru;
        set({ ok: true, incidentId: inc.incident_id, eventCount: inc.event_count, state: inc.state });
        return store;
    }, { operationId });
}

export function transitionIncident({ incidentId, state, automaticAction = null }, { operationId = null } = {}) {
    if (!INCIDENT_STATES.includes(state)) return { ok: false, code: 'INVALID_STATE', written: false };
    return mutate((store, set) => {
        const inc = store.incidents.find((i) => i.incident_id === incidentId);
        if (!inc) { set({ ok: false, code: 'INCIDENT_NOT_FOUND' }); return null; }
        if (inc.state === state) { set({ ok: true, idempotent: true, incidentId }); return null; }
        inc.state = state; inc.last_seen = nowISO();
        if (automaticAction) inc.automatic_actions.push({ action: automaticAction, at: nowISO() });
        set({ ok: true, incidentId, state });
        return store;
    }, { operationId });
}

// ---------- Auto-Remediation Engine (safe playbook registry) ----------
// Playbooks are DECLARATIVE here: the engine records intent + result. It NEVER
// performs a forbidden action; the allowed set is enforced as data.
export const ALLOWED_PLAYBOOKS = Object.freeze([
    'RESTART_WORKER', 'RETRY_IDEMPOTENT_JOB', 'RECOVER_EXPIRED_LEASE', 'RECOVER_MISSED_SCHEDULER',
    'ISOLATE_SOURCE_TEMP', 'REDUCE_CONCURRENCY', 'APPLY_BACKOFF', 'SWITCH_FREE_FALLBACK_SOURCE',
    'CLEAN_TEMP_CACHE', 'PAUSE_CAMPAIGN', 'ENABLE_OUTBOUND_KILL_SWITCH', 'HEALTH_RECHECK',
]);
export const FORBIDDEN_PLAYBOOKS = Object.freeze([
    'RETRY_SMTP_UNKNOWN', 'LIFT_SUPPRESSION', 'SEND_CLIENT', 'SEND_FOLLOWUP',
    'ENABLE_PAID_SOURCE', 'CHANGE_PRICE', 'WEAKEN_GATES', 'DELETE_CANONICAL', 'ENABLE_SEND_LIVE',
]);
export function isPlaybookAllowed(name) { return ALLOWED_PLAYBOOKS.includes(name) && !FORBIDDEN_PLAYBOOKS.includes(name); }

export function recordRemediation({ playbook, trigger, actions = [], result = 'pending', recoveryEvidence = null, test_only = false }, { operationId = null } = {}) {
    if (!isPlaybookAllowed(playbook)) return { ok: false, code: 'PLAYBOOK_FORBIDDEN', playbook, written: false };
    return mutate((store, set) => {
        const rem = {
            remediation_id: newId('rem'), playbook, trigger: trigger || null,
            actions, result, recovery_evidence: recoveryEvidence, test_only: !!test_only, at: nowISO(),
        };
        store.remediations.push(rem);
        if (store.remediations.length > 2000) store.remediations.splice(0, store.remediations.length - 2000);
        set({ ok: true, remediationId: rem.remediation_id, playbook, result });
        return store;
    }, { operationId });
}

// ---------- Owner Decision Center ----------
export function createDecision(input = {}, { operationId = null } = {}) {
    if (!DECISION_CATEGORIES.includes(input.category)) return { ok: false, code: 'INVALID_CATEGORY', written: false };
    if (!input.title_ru) return { ok: false, code: 'TITLE_REQUIRED', written: false };
    return mutate((store, set) => {
        const d = {
            decision_id: newId('dec'), category: input.category,
            priority: ['P0', 'P1', 'P2'].includes(input.priority) ? input.priority : 'P1',
            title_ru: input.title_ru, facts: input.facts || [], evidence: input.evidence || [],
            recommendation: input.recommendation || {}, alternatives: input.alternatives || [],
            risks: input.risks || [], consequence_ru: input.consequence_ru || '',
            performs_outbound: false, // owner-center decisions never perform outbound directly
            reversible: input.reversible !== false, expires_at: input.expires_at || null,
            status: 'OPEN', decision_revision: 0,
            allowed_actions: (input.allowed_actions || DECISION_ACTIONS).filter((a) => DECISION_ACTIONS.includes(a)),
            test_only: !!input.test_only, created_at: nowISO(), resolved_at: null, resolution: null,
        };
        store.decisions.push(d);
        set({ ok: true, decisionId: d.decision_id, priority: d.priority });
        return store;
    }, { operationId });
}

// Resolve a decision. Transactional + idempotent by (decisionId, expectedDecisionRevision).
// NEVER performs outbound — only records the owner's choice and emits an event.
export function resolveDecision({ decisionId, action, note = null, expectedDecisionRevision = null }, { operationId = null } = {}) {
    if (!DECISION_ACTIONS.includes(action)) return { ok: false, code: 'INVALID_ACTION', written: false };
    return mutate((store, set) => {
        const d = store.decisions.find((x) => x.decision_id === decisionId);
        if (!d) { set({ ok: false, code: 'DECISION_NOT_FOUND' }); return null; }
        if (d.status !== 'OPEN') { set({ ok: true, idempotent: true, status: d.status }); return null; }
        if (expectedDecisionRevision != null && Number(expectedDecisionRevision) !== Number(d.decision_revision)) {
            set({ ok: false, code: 'DECISION_REVISION_CONFLICT', currentRevision: d.decision_revision }); return null;
        }
        if (!d.allowed_actions.includes(action)) { set({ ok: false, code: 'ACTION_NOT_ALLOWED' }); return null; }
        d.status = action === 'APPROVE' ? 'APPROVED' : action === 'REJECT' ? 'REJECTED' : action === 'DEFER' ? 'DEFERRED' : action === 'STOP_PROCESS' ? 'STOPPED' : 'CHANGES_REQUESTED';
        d.resolution = { action, note: note || null, at: nowISO() };
        d.decision_revision += 1;
        d.resolved_at = nowISO();
        set({ ok: true, decisionId, status: d.status, performsOutbound: false });
        return store;
    }, { operationId });
}

// ---------- Notification commands ----------
export function setNotificationState({ notificationId, state }, { operationId = null } = {}) {
    if (!NOTIFICATION_STATES.includes(state)) return { ok: false, code: 'INVALID_STATE', written: false };
    return mutate((store, set) => {
        const n = store.notifications.find((x) => x.notification_id === notificationId);
        if (!n) { set({ ok: false, code: 'NOTIFICATION_NOT_FOUND' }); return null; }
        if (n.state === state) { set({ ok: true, idempotent: true }); return null; }
        n.state = state; n.updated_at = nowISO();
        set({ ok: true, notificationId, state });
        return store;
    }, { operationId });
}

// ---------- Autopilot + kill switch ----------
export function setAutopilotMode({ mode }, { operationId = null } = {}) {
    if (!AUTOPILOT_MODES.includes(mode)) return { ok: false, code: 'INVALID_MODE', written: false };
    // LIMITED_AUTOMATION is owner-only and intentionally not enabled programmatically here.
    if (mode === 'LIMITED_AUTOMATION') return { ok: false, code: 'LIMITED_AUTOMATION_OWNER_ONLY', written: false };
    return mutate((store, set) => {
        store.autopilot = { mode, updated_at: nowISO() };
        set({ ok: true, mode });
        return store;
    }, { operationId });
}
export function enableKillSwitch({ reason = 'OWNER_REQUEST' }, { operationId = null } = {}) {
    return mutate((store, set) => {
        store.kill_switch = { enabled: true, reason, updated_at: nowISO() };
        set({ ok: true, killSwitch: true });
        return store;
    }, { operationId });
}

// ---------- Next Best Action (deterministic) ----------
// Pure: given a lead-like fact object, return the single next best action.
export function leadNextBestAction(lead = {}) {
    const mk = (action_type, reason_ru, opts = {}) => ({ action_type, priority: opts.priority || 2, reason_ru, automatic: !!opts.automatic, owner_action_required: !!opts.owner, due_at: opts.due_at || null, deep_link: opts.deep_link || `/leads/${lead.lead_id || ''}` });
    if (lead.opt_out || lead.status === 'opt_out') return mk('CLOSE_LEAD', 'Лид отказался от связи', { priority: 3 });
    if (lead.email_status === 'BOUNCED') return mk('CLOSE_LEAD', 'Адрес недоставляем', { priority: 3 });
    if (!lead.website) return mk('WAIT', 'Нет сайта — ожидаем других сигналов', { priority: 3, automatic: true });
    if (lead.website_status === 'FOUND' && lead.email_source !== 'website_official_page' && lead.email_status === 'UNCONFIRMED') return mk('RETRY_CRAWL', 'Контакт не найден — повторить обход сайта', { priority: 2, automatic: true });
    if (lead.email_source === 'website_official_page' && lead.status === 'verified_pending_score') return mk('RUN_SCORE', 'Контакт подтверждён — запустить скоринг', { priority: 1, automatic: true });
    if (lead.status === 'verified_ready' && !lead.audit_status) return mk('GENERATE_AUDIT', 'Готов к аудиту', { priority: 1, automatic: true });
    if (lead.audit_status === 'AUDIT_READY' && !lead.first_touch) return mk('PREPARE_FIRST_TOUCH', 'Аудит готов — подготовить первое касание', { priority: 1, automatic: true });
    if (lead.first_touch && lead.first_touch.status === 'APPROVAL_PENDING') return mk('OWNER_REVIEW_FIRST_TOUCH', 'Первое касание готово — нужно решение владельца', { priority: 1, owner: true });
    return mk('WAIT', 'Нет действий — ожидаем', { priority: 3, automatic: true });
}

// ---------- read models ----------
export function listEvents({ severity = null, limit = 100, includeTest = false } = {}) {
    const s = readStoreSafe();
    let rows = (s.events || []).filter((e) => includeTest || !e.test_only);
    if (severity) rows = rows.filter((e) => e.severity === severity);
    rows = rows.filter((e) => !isExpired(e));
    rows.sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)));
    return { items: rows.slice(0, limit), total: rows.length };
}
export function eventsSummary({ includeTest = false } = {}) {
    const s = readStoreSafe();
    const rows = (s.events || []).filter((e) => (includeTest || !e.test_only) && !isExpired(e));
    const by = { P0: 0, P1: 0, P2: 0, P3: 0 };
    for (const e of rows) by[e.severity] = (by[e.severity] || 0) + 1;
    return { total: rows.length, by_severity: by };
}
export function listNotifications({ state = null, includeTest = false } = {}) {
    const s = readStoreSafe();
    let rows = (s.notifications || []).filter((n) => (includeTest || !n.test_only) && !isExpired(n));
    if (state) rows = rows.filter((n) => n.state === state);
    rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return { items: rows, total: rows.length };
}
export function unreadCount({ includeTest = false } = {}) {
    const s = readStoreSafe();
    const n = (s.notifications || []).filter((x) => (includeTest || !x.test_only) && x.state === 'unread' && !isExpired(x)).length;
    return { unread: n };
}
export function listDecisions({ status = 'OPEN', includeTest = false } = {}) {
    const s = readStoreSafe();
    let rows = (s.decisions || []).filter((d) => includeTest || !d.test_only);
    if (status) rows = rows.filter((d) => d.status === status);
    rows.sort((a, b) => String(a.priority).localeCompare(String(b.priority)));
    return { items: rows, total: rows.length };
}
export function listIncidents({ includeTest = false, activeOnly = true } = {}) {
    const s = readStoreSafe();
    let rows = (s.incidents || []).filter((i) => includeTest || !i.test_only);
    if (activeOnly) rows = rows.filter((i) => !['RESOLVED', 'MUTED'].includes(i.state));
    rows.sort((a, b) => String(a.severity).localeCompare(String(b.severity)));
    return { items: rows, total: rows.length };
}
export function incidentsSummary({ includeTest = false } = {}) {
    const s = readStoreSafe();
    const rows = (s.incidents || []).filter((i) => includeTest || !i.test_only);
    const active = rows.filter((i) => !['RESOLVED', 'MUTED'].includes(i.state));
    return { total: rows.length, active: active.length, p0: active.filter((i) => i.severity === 'P0').length };
}
export function getAutopilot() { const s = readStoreSafe(); return { ...s.autopilot, kill_switch: s.kill_switch, sends: SENDS_FROM_OWNER_CENTER }; }

export default {
    OWNER_CENTER_VERSION, SEVERITIES, ENTITY_TYPES, NOTIFICATION_CHANNELS, NOTIFICATION_STATES,
    INCIDENT_STATES, DECISION_CATEGORIES, DECISION_ACTIONS, AUTOPILOT_MODES, DEFAULT_AUTOPILOT,
    ALLOWED_PLAYBOOKS, FORBIDDEN_PLAYBOOKS, isPlaybookAllowed,
    buildEvent, publishEvent, routeChannels,
    recordIncidentSignal, transitionIncident, recordRemediation,
    createDecision, resolveDecision, setNotificationState, setAutopilotMode, enableKillSwitch,
    leadNextBestAction,
    listEvents, eventsSummary, listNotifications, unreadCount, listDecisions, listIncidents, incidentsSummary, getAutopilot,
};
