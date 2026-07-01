// tools/commercial_core/lib/ai_provider.mjs
// Thin universal AI provider abstraction for the Master Controller Agent Control Plane.
//
// SAFETY CONTRACT (must hold for every provider):
//   - The provider NEVER writes the canonical store, NEVER sends a message, NEVER touches flags,
//     NEVER performs a payment. It only turns a prompt into text/structured JSON + usage metadata.
//   - All callers treat lead-derived text as DATA. Provider output is validated against a schema by
//     the caller before any artifact is produced; raw output is never trusted as an instruction.
//   - Secrets (API keys) are read from environment only and never logged or returned.
//
// The abstraction is deliberately small. Concrete adapters (e.g. Tokenator, OpenAI-compatible)
// implement health/listModels/capabilities/generateStructured/generateText/usage. When no provider
// is configured, callers fall back to the deterministic shadow analyzer (agent_shadow.mjs), which
// remains authoritative.

// ---- redaction: never let a key reach a log/report ----
const KEY_RE = /(sk-[A-Za-z0-9_\-]{8,}|Bearer\s+[A-Za-z0-9._\-]{8,}|tok[_-][A-Za-z0-9]{8,})/gi;
export function redactSecret(s) {
    return String(s == null ? '' : s).replace(KEY_RE, '«REDACTED»');
}

// Mask an Authorization header value for safe diagnostics (length class only, never the value).
export function maskKeyPresence(key) {
    if (!key) return 'ABSENT';
    const n = String(key).length;
    return `PRESENT(len_class=${n >= 20 ? 'ok' : 'short'})`;
}

// ---- provider error categories (stable enum for circuit breaker + health) ----
export const PROVIDER_ERROR = {
    AUTH: 'AUTH_FAILED',
    RATE_LIMIT: 'RATE_LIMIT',
    TIMEOUT: 'TIMEOUT',
    UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
    MODEL_UNAVAILABLE: 'MODEL_UNAVAILABLE',
    MALFORMED: 'MALFORMED_RESPONSE',
    SCHEMA: 'SCHEMA_INVALID',
    BUDGET: 'BUDGET_BLOCKED',
    UNKNOWN: 'UNKNOWN_ERROR',
};

// Classify an HTTP status / error into a stable category.
export function classifyError(status, err) {
    if (err && /timeout|aborted|ETIMEDOUT|abort/i.test(String(err.message || err))) return PROVIDER_ERROR.TIMEOUT;
    if (status === 401 || status === 403) return PROVIDER_ERROR.AUTH;
    if (status === 429) return PROVIDER_ERROR.RATE_LIMIT;
    if (status === 404) return PROVIDER_ERROR.MODEL_UNAVAILABLE;
    if (status >= 500) return PROVIDER_ERROR.UNAVAILABLE;
    if (status >= 400) return PROVIDER_ERROR.MALFORMED;
    return PROVIDER_ERROR.UNKNOWN;
}

// ---- usage / billing units ----
// Calculated units = (raw_input + raw_output) * billing_multiplier, rounded up. When a provider does
// not return usage, the caller supplies a conservative local estimate and marks USAGE_ESTIMATED.
export function calcUnits(rawInput, rawOutput, multiplier) {
    const m = Number(multiplier) || 1;
    return Math.ceil((Number(rawInput || 0) + Number(rawOutput || 0)) * m);
}

// ---- budget ledger (in-memory; the persistent ledger is owned by the caller/runtime) ----
export class BudgetLedger {
    constructor(limitUnits) {
        this.limit = Number(limitUnits) || 0;
        this.cumulative = 0;
        this.entries = [];
    }
    // Pre-flight: would a worst-case call exceed the limit? projectedMaxUnits is a conservative ceiling.
    wouldExceed(projectedMaxUnits) {
        if (!this.limit) return false;
        return this.cumulative + Math.max(0, Number(projectedMaxUnits || 0)) > this.limit;
    }
    record(entry) {
        const units = Number(entry.calculated_units || 0);
        this.cumulative += units;
        this.entries.push({ ...entry, cumulative_units: this.cumulative });
        return this.cumulative;
    }
    remaining() { return this.limit ? Math.max(0, this.limit - this.cumulative) : Infinity; }
}

// ---- circuit breaker ----
export class CircuitBreaker {
    constructor({ failureThreshold = 3, cooldownMs = 30000 } = {}) {
        this.failureThreshold = failureThreshold;
        this.cooldownMs = cooldownMs;
        this.failures = 0;
        this.state = 'CLOSED'; // CLOSED | OPEN | HALF_OPEN
        this.openedAt = null;
    }
    canRequest(nowMs) {
        if (this.state === 'CLOSED') return true;
        if (this.state === 'OPEN') {
            if (this.openedAt != null && nowMs - this.openedAt >= this.cooldownMs) { this.state = 'HALF_OPEN'; return true; }
            return false;
        }
        return true; // HALF_OPEN allows a single probe
    }
    onSuccess() { this.failures = 0; this.state = 'CLOSED'; this.openedAt = null; }
    onFailure(nowMs) {
        this.failures += 1;
        if (this.failures >= this.failureThreshold) { this.state = 'OPEN'; this.openedAt = nowMs; }
    }
}

// ---- structured-output validation (no external schema lib; minimal, strict) ----
// schema = { required:[...], enums:{field:[...]}, maxLen:{field:n}, forbid:[...] }
export function validateStructured(obj, schema = {}) {
    const errors = [];
    if (obj == null || typeof obj !== 'object') return { ok: false, errors: ['not_an_object'] };
    for (const f of schema.required || []) if (obj[f] === undefined || obj[f] === null) errors.push(`missing:${f}`);
    for (const [f, allowed] of Object.entries(schema.enums || {})) {
        if (obj[f] !== undefined && !allowed.includes(obj[f])) errors.push(`enum:${f}`);
    }
    for (const [f, n] of Object.entries(schema.maxLen || {})) {
        if (typeof obj[f] === 'string' && obj[f].length > n) errors.push(`maxlen:${f}`);
    }
    for (const f of schema.forbid || []) if (obj[f] !== undefined) errors.push(`forbidden:${f}`);
    return { ok: errors.length === 0, errors };
}

// Extract a JSON object from a possibly-noisy model text response (one bounded repair attempt).
export function extractJson(text) {
    if (typeof text !== 'string') return null;
    try { return JSON.parse(text); } catch { /* try to find a JSON block */ }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
        try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
    }
    return null;
}
