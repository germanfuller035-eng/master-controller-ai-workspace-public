/**
 * reliability.mjs — Telegram Master Controller Reliability Layer
 *
 * Provides:
 *   - global update logger (telegram_updates.log)
 *   - global error logger  (telegram_errors.log)
 *   - heartbeat writer     (data/bot_heartbeat.json)
 *   - in-memory ring buffer of last commands (for /debug_last)
 *   - safe route detector  (for logging)
 *
 * SAFETY:
 *   - never logs tokens
 *   - truncates very long texts (>500 chars) before writing
 *   - no client messaging
 *   - no network calls
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const LOGS_DIR        = path.join(__dirname, 'logs');
const DATA_DIR        = path.join(__dirname, 'data');
const UPDATES_LOG     = path.join(LOGS_DIR, 'telegram_updates.log');
const ERRORS_LOG      = path.join(LOGS_DIR, 'telegram_errors.log');
const HEARTBEAT_FILE  = path.join(DATA_DIR, 'bot_heartbeat.json');

fs.mkdirSync(LOGS_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

// ============================================================
// IN-MEMORY STATE (for /debug_last and /status)
// ============================================================
const STARTED_AT = new Date().toISOString();
const ring = [];  // last 20 update records
const RING_MAX = 20;

const state = {
    pid:              process.pid,
    started_at:       STARTED_AT,
    last_heartbeat_at: null,
    last_update_at:   null,
    last_command:     null,
    last_route:       null,
    last_error_at:    null,
    last_error_msg:   null,
    polling_ok:       true,
    updates_count:    0,
    errors_count:     0,
};

// ============================================================
// SAFETY: strip sensitive data
// ============================================================
function sanitize(s) {
    if (s == null) return '';
    let str = String(s);
    // remove anything that looks like a bot token (digits:hex)
    str = str.replace(/\b\d{6,12}:[A-Za-z0-9_-]{20,}\b/g, '[TOKEN_REDACTED]');
    // remove DLF_WEBHOOK_SECRET-like values
    str = str.replace(/[A-Za-z0-9_-]{32,}/g, m => m.length > 40 ? '[LONG_TOKEN_REDACTED]' : m);
    if (str.length > 500) str = str.substring(0, 500) + '…[truncated]';
    return str;
}

// ============================================================
// ROUTE DETECTOR (for logging only; does not execute)
// ============================================================
export function detectRoute(text) {
    if (!text || typeof text !== 'string') return 'non_text';
    const t = text.trim();
    if (!t) return 'empty';
    if (t.startsWith('/ping'))          return '/ping';
    if (t.startsWith('/start'))         return '/start';
    if (t.startsWith('/status'))        return '/status';
    if (t.startsWith('/health'))        return '/health';
    if (t.startsWith('/debug_last'))    return '/debug_last';
    if (t.startsWith('/keepalive'))     return '/keepalive';
    if (t.startsWith('/today'))         return '/today';
    if (t.startsWith('/newleads'))      return '/newleads';
    if (t.startsWith('/import_status')) return '/import_status';
    if (t.startsWith('/emergency_stop'))return '/emergency_stop';
    if (t.startsWith('/contact'))       return '/contact';
    if (t.startsWith('/'))              return 'unknown_slash';
    const lower = t.toLowerCase();
    if (/^подтверди\s+email/i.test(lower))     return 'contact.confirm_email';
    if (/^покажи\s+контакт/i.test(lower))      return 'contact.show';
    if (/^статус\s+контакта/i.test(lower))     return 'contact.status';
    if (/^покажи\s+входящ/i.test(lower))       return 'inbox.show';
    if (/^новые\s+лиды/i.test(lower))          return '/newleads';
    if (/^сводка|^отчёт|^отчет/i.test(lower))  return '/today';
    return 'nl_router';
}

// ============================================================
// UPDATE LOGGER
// ============================================================
export function logUpdate(rec) {
    state.updates_count++;
    state.last_update_at = new Date().toISOString();
    if (rec.text)  state.last_command = sanitize(rec.text);
    if (rec.detected_route) state.last_route = rec.detected_route;

    const entry = {
        timestamp:       new Date().toISOString(),
        update_id:       rec.update_id ?? null,
        chat_id:         rec.chat_id ?? null,
        user_id:         rec.user_id ?? null,
        username:        rec.username ? sanitize(rec.username) : null,
        text:            sanitize(rec.text || ''),
        detected_route:  rec.detected_route || 'unknown',
        status:          rec.status || 'received',
        error_message:   rec.error_message ? sanitize(rec.error_message) : null,
    };

    // push to ring buffer
    ring.push(entry);
    while (ring.length > RING_MAX) ring.shift();

    try {
        fs.appendFileSync(UPDATES_LOG, JSON.stringify(entry) + '\n', 'utf-8');
    } catch (_) {}
    return entry;
}

// ============================================================
// ERROR LOGGER
// ============================================================
export function logError(rec) {
    state.errors_count++;
    state.last_error_at  = new Date().toISOString();
    state.last_error_msg = sanitize(rec.error_message || rec.error?.message || 'unknown');

    const err = rec.error || {};
    const entry = {
        timestamp:     new Date().toISOString(),
        route:         rec.route || null,
        text:          sanitize(rec.text || ''),
        chat_id:       rec.chat_id ?? null,
        error_name:    err.name || rec.error_name || 'Error',
        error_message: sanitize(err.message || rec.error_message || ''),
        stack_short:   sanitize((err.stack || rec.stack || '').split('\n').slice(0, 4).join(' | ')),
        scope:         rec.scope || 'handler',
    };
    try {
        fs.appendFileSync(ERRORS_LOG, JSON.stringify(entry) + '\n', 'utf-8');
    } catch (_) {}
    return entry;
}

// ============================================================
// HEARTBEAT
// ============================================================
// Fields from extra that should be persisted in state (not lost on next timer tick)
const PERSISTENT_EXTRA_FIELDS = [
    'last_route', 'last_update_type',
    'last_voice_at', 'last_voice_status', 'last_voice_error',
    'last_ping_at',
];

export function writeHeartbeat(extra = {}) {
    state.last_heartbeat_at = new Date().toISOString();

    // Persist new fields into state so they survive timer heartbeats
    for (const field of PERSISTENT_EXTRA_FIELDS) {
        if (extra[field] !== undefined) state[field] = extra[field];
    }
    // polling field maps to polling_ok in state
    if (extra.polling !== undefined) state.polling_ok = extra.polling;

    const payload = {
        pid:               state.pid,
        started_at:        state.started_at,
        last_heartbeat_at: state.last_heartbeat_at,
        polling:           state.polling_ok,
        last_update_at:    state.last_update_at,
        last_command:      state.last_command,
        last_route:        state.last_route      || null,
        last_update_type:  state.last_update_type || null,
        last_voice_at:     state.last_voice_at    || null,
        last_voice_status: state.last_voice_status || null,
        last_voice_error:  state.last_voice_error  || null,
        last_ping_at:      state.last_ping_at      || null,
        last_error_at:     state.last_error_at,
        last_error_msg:    state.last_error_msg,
        updates_count:     state.updates_count,
        errors_count:      state.errors_count,
        status:            extra.status || 'running',
        ...extra,
    };
    try {
        fs.writeFileSync(HEARTBEAT_FILE, JSON.stringify(payload, null, 2), 'utf-8');
    } catch (_) {}
    return payload;
}

export function startHeartbeatTimer(intervalMs = 30000) {
    writeHeartbeat({ status: 'running' });
    const t = setInterval(() => writeHeartbeat({ status: 'running' }), intervalMs);
    if (t.unref) t.unref();
    return t;
}

export function markPollingError(msg) {
    state.polling_ok = false;
    state.last_error_at = new Date().toISOString();
    state.last_error_msg = sanitize(msg || 'polling error');
}

export function markPollingOk() {
    state.polling_ok = true;
}

// ============================================================
// GETTERS
// ============================================================
export function getState() {
    return { ...state };
}

export function getLastN(n = 5) {
    return ring.slice(-n);
}

export function getPaths() {
    return {
        LOGS_DIR,
        DATA_DIR,
        UPDATES_LOG,
        ERRORS_LOG,
        HEARTBEAT_FILE,
    };
}

export function uptimeSeconds() {
    return Math.floor((Date.now() - new Date(STARTED_AT).getTime()) / 1000);
}
