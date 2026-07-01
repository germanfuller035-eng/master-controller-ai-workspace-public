// shared/http.mjs
// Unified response envelope + safe logging (secret redaction).
import crypto from 'node:crypto';

export function newRequestId() {
    return 'req_' + crypto.randomBytes(8).toString('hex');
}

export function ok(res, data, requestId) {
    return res.json({ ok: true, data: data ?? {}, error: null, requestId: requestId || res.locals?.requestId || null });
}

export function fail(res, status, code, message, details, requestId) {
    return res.status(status).json({
        ok: false,
        data: null,
        error: { code, message, details: details || null },
        requestId: requestId || res.locals?.requestId || null,
    });
}

const SECRET_RE = /([A-Z0-9_]*(TOKEN|SECRET|PASSWORD|PASS|KEY|APP_PASSWORD)[A-Z0-9_]*\s*[=:]\s*)[^\s,;"']+/gi;

export function redact(value) {
    let s = typeof value === 'string' ? value : JSON.stringify(value);
    s = s.replace(SECRET_RE, '$1[REDACTED]');
    s = s.replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[REDACTED]');
    return s;
}
