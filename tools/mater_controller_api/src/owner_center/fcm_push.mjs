// owner_center/fcm_push.mjs
// ============================================================
// FCM Push transport (0.8.0) — secure token lifecycle + routing + DISABLED-by-default delivery.
// ------------------------------------------------------------
// Bridges owner-center notifications to Android push. It holds device push tokens and per-device
// notification preferences, decides which notifications a device should receive, and (only when a
// real Firebase service credential is present AND push is explicitly enabled) would deliver them.
//
// HARD INVARIANTS:
//   - This is OWNER-FACING operational push, NOT client outbound. It never messages a lead/client,
//     never opens a send gate, never touches the canonical store or ledgers.
//   - DISABLED by default. Delivery requires BOTH: MATER_FCM_ENABLED=true AND a real credentials file
//     present (FCM_CREDENTIALS_PATH). Absent credentials => state CREDENTIAL_REQUIRED, no fake creds,
//     no live send. We NEVER invent a server key and NEVER store a secret here or in Git.
//   - Tokens are stored hashed-at-rest for logging; the raw token is kept only to target delivery.
//   - Preferences are advisory client-side filters; severity routing still comes from owner-center.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PUSH_STORE_PATH, FCM_CREDENTIALS_PATH } from '../shared/config.mjs';
import { updateStoreWithRevision } from '../shared/store_access.mjs';
import { routeChannels, buildEvent } from './service.mjs';

export const FCM_PUSH_VERSION = 'fcm_push_v1';

// Per-device notification preferences (advisory; default = operational signals only, never spammy).
export const DEFAULT_PREFS = Object.freeze({
    enabled: true,            // device opted into push at all
    min_severity: 'P1',       // P0/P1 by default; P2/P3 stay in-app unless raised
    decisions: true,          // owner decisions needing attention
    incidents: true,          // P0/P1 incidents
    daily_brief: false,       // the P3 brief — off by default (not urgent)
});

function nowISO() { return new Date().toISOString(); }
function tokenHash(t) { return crypto.createHash('sha256').update(String(t)).digest('hex').slice(0, 16); }

function emptyStore() {
    return { store_revision: 0, fcm_push_version: FCM_PUSH_VERSION, tokens: [], delivery_log: [] };
}
function ensureStoreFile(p) {
    try { if (!fs.existsSync(p)) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(emptyStore(), null, 2) + '\n', 'utf8'); } }
    catch { /* updateStoreWithRevision surfaces real errors */ }
}
function readStoreSafe() {
    try { return JSON.parse(fs.readFileSync(PUSH_STORE_PATH, 'utf8')); } catch { return emptyStore(); }
}
function mutate(fn, { operationId = null } = {}) {
    ensureStoreFile(PUSH_STORE_PATH);
    let outcome = { ok: false, code: 'UNKNOWN' };
    const res = updateStoreWithRevision((store) => {
        if (!Array.isArray(store.tokens)) store.tokens = [];
        if (!Array.isArray(store.delivery_log)) store.delivery_log = [];
        return fn(store, (o) => { outcome = o; });
    }, { storePath: PUSH_STORE_PATH, updatedBy: 'fcm_push', operationId });
    if (res && res.written) return { ...outcome, written: true, revision: res.revision };
    return { ...outcome, written: false };
}

// ---- credential / enabled posture (no secrets ever returned) ----
export function credentialPresent() {
    try { return fs.existsSync(FCM_CREDENTIALS_PATH) && fs.statSync(FCM_CREDENTIALS_PATH).size > 0; } catch { return false; }
}
export function pushEnabledFlag() { return process.env.MATER_FCM_ENABLED === 'true'; }

// Delivery is LIVE only when explicitly enabled AND a real credential is present.
export function deliveryState() {
    if (!credentialPresent()) return 'CREDENTIAL_REQUIRED';
    if (!pushEnabledFlag()) return 'DISABLED_BY_CONFIG';
    return 'LIVE';
}

export function status() {
    const store = readStoreSafe();
    const active = (store.tokens || []).filter((t) => t.active !== false);
    return {
        fcm_push_version: FCM_PUSH_VERSION,
        delivery_state: deliveryState(),       // CREDENTIAL_REQUIRED | DISABLED_BY_CONFIG | LIVE
        credential_present: credentialPresent(), // boolean only — never the secret
        enabled_flag: pushEnabledFlag(),
        registered_tokens: active.length,
        total_tokens_seen: (store.tokens || []).length,
        deliveries_attempted: (store.delivery_log || []).length,
        deliveries_live: (store.delivery_log || []).filter((d) => d.state === 'LIVE').length,
        deliveries_suppressed: (store.delivery_log || []).filter((d) => d.state !== 'LIVE').length,
        // owner-facing push is operational, never client outbound
        sends_client_messages: false,
        channel: 'ANDROID_PUSH',
    };
}

// ---- token lifecycle ----
// Register/refresh a device token. Idempotent by (deviceId, token). Rotating a token deactivates the
// previous token for that device. Raw token kept to target delivery; hash kept for safe logging.
export function registerToken({ deviceId, token, platform = 'android', appVersion = null, prefs = null }, { operationId = null } = {}) {
    if (!deviceId) return { ok: false, code: 'DEVICE_REQUIRED', written: false };
    if (!token || String(token).length < 10) return { ok: false, code: 'TOKEN_INVALID', written: false };
    return mutate((store, set) => {
        const existing = store.tokens.find((t) => t.device_id === deviceId && t.token === token);
        if (existing) {
            existing.active = true; existing.last_seen = nowISO();
            if (appVersion) existing.app_version = appVersion;
            if (prefs) existing.prefs = sanitizePrefs(prefs);
            set({ ok: true, idempotent: true, tokenHash: existing.token_hash });
            return store;
        }
        // rotate: deactivate other tokens for this device
        for (const t of store.tokens) if (t.device_id === deviceId) t.active = false;
        const rec = {
            device_id: deviceId, token, token_hash: tokenHash(token), platform,
            app_version: appVersion, prefs: sanitizePrefs(prefs || DEFAULT_PREFS),
            active: true, registered_at: nowISO(), last_seen: nowISO(),
        };
        store.tokens.push(rec);
        if (store.tokens.length > 200) store.tokens.splice(0, store.tokens.length - 200);
        set({ ok: true, tokenHash: rec.token_hash });
        return store;
    }, { operationId });
}

export function unregisterToken({ deviceId, token = null }, { operationId = null } = {}) {
    if (!deviceId) return { ok: false, code: 'DEVICE_REQUIRED', written: false };
    return mutate((store, set) => {
        let n = 0;
        for (const t of store.tokens) {
            if (t.device_id === deviceId && (!token || t.token === token) && t.active !== false) { t.active = false; t.unregistered_at = nowISO(); n += 1; }
        }
        set({ ok: true, deactivated: n });
        return store;
    }, { operationId });
}

export function setPreferences({ deviceId, prefs }, { operationId = null } = {}) {
    if (!deviceId) return { ok: false, code: 'DEVICE_REQUIRED', written: false };
    return mutate((store, set) => {
        const active = store.tokens.filter((t) => t.device_id === deviceId && t.active !== false);
        if (!active.length) { set({ ok: false, code: 'NO_ACTIVE_TOKEN' }); return null; }
        const clean = sanitizePrefs(prefs);
        for (const t of active) t.prefs = clean;
        set({ ok: true, prefs: clean });
        return store;
    }, { operationId });
}

export function getPreferences(deviceId) {
    const store = readStoreSafe();
    const active = (store.tokens || []).find((t) => t.device_id === deviceId && t.active !== false);
    return { device_id: deviceId, prefs: active ? active.prefs : DEFAULT_PREFS, has_token: !!active };
}

function sanitizePrefs(p = {}) {
    const sev = ['P0', 'P1', 'P2', 'P3'];
    return {
        enabled: p.enabled !== false,
        min_severity: sev.includes(p.min_severity) ? p.min_severity : DEFAULT_PREFS.min_severity,
        decisions: p.decisions !== false,
        incidents: p.incidents !== false,
        daily_brief: p.daily_brief === true,
    };
}

// ---- routing decision (pure) ----
// Given a notification-like event and a device's prefs, should this device receive a push?
// Severity routing comes from owner-center (routeChannels); prefs are an additional client filter.
export function shouldDeliver(ev, prefs = DEFAULT_PREFS) {
    const channels = routeChannels(buildEvent(ev));
    if (!channels.includes('ANDROID_PUSH')) return { deliver: false, reason: 'NOT_PUSH_ROUTED' };
    if (prefs.enabled === false) return { deliver: false, reason: 'DEVICE_OPTED_OUT' };
    const order = { P0: 0, P1: 1, P2: 2, P3: 3 };
    if ((order[ev.severity] ?? 3) > (order[prefs.min_severity] ?? 1)) return { deliver: false, reason: 'BELOW_MIN_SEVERITY' };
    if (ev.event_type === 'DAILY_BRIEF' && !prefs.daily_brief) return { deliver: false, reason: 'BRIEF_DISABLED' };
    return { deliver: true, reason: 'ROUTED' };
}

// ---- delivery (DISABLED by default; never fakes credentials) ----
// Computes the target set and records intent. Performs a LIVE send ONLY when deliveryState()==='LIVE'.
// In every other state it records a SUPPRESSED entry and returns the reason — no fake send, no crash.
export async function deliver({ event, sender = null }, { operationId = null } = {}) {
    const state = deliveryState();
    const store = readStoreSafe();
    const targets = (store.tokens || []).filter((t) => t.active !== false).filter((t) => shouldDeliver(event, t.prefs).deliver);

    if (state !== 'LIVE') {
        recordDelivery({ state, targets: targets.length, reason: state, event });
        return { ok: true, delivered: false, state, eligible_targets: targets.length, reason: state, live: false };
    }
    // LIVE path: a real sender must be injected (HTTP v1 FCM client built from the credential file).
    // We do NOT embed an HTTP client or a key here. If enabled+credential present but no sender wired,
    // we fail CLOSED (suppressed) rather than pretend success.
    if (typeof sender !== 'function') {
        recordDelivery({ state: 'NO_SENDER', targets: targets.length, reason: 'SENDER_NOT_WIRED', event });
        return { ok: true, delivered: false, state: 'NO_SENDER', eligible_targets: targets.length, reason: 'SENDER_NOT_WIRED', live: false };
    }
    let sent = 0; const failures = [];
    for (const t of targets) {
        try { const r = await sender({ token: t.token, event }); if (r && r.ok) sent += 1; else failures.push(t.token_hash); }
        catch { failures.push(t.token_hash); }
    }
    recordDelivery({ state: 'LIVE', targets: targets.length, sent, reason: 'LIVE', event });
    return { ok: true, delivered: sent > 0, state: 'LIVE', eligible_targets: targets.length, sent, failures: failures.length, live: true };
}

function recordDelivery({ state, targets, sent = 0, reason, event }) {
    mutate((store, set) => {
        store.delivery_log.push({
            at: nowISO(), state, eligible_targets: targets, sent, reason,
            event_type: event?.event_type || null, severity: event?.severity || null,
        });
        if (store.delivery_log.length > 1000) store.delivery_log.splice(0, store.delivery_log.length - 1000);
        set({ ok: true });
        return store;
    });
}

export default {
    FCM_PUSH_VERSION, DEFAULT_PREFS, credentialPresent, pushEnabledFlag, deliveryState, status,
    registerToken, unregisterToken, setPreferences, getPreferences, shouldDeliver, deliver,
};
