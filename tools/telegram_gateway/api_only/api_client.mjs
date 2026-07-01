// api_client.mjs — shared Telegram → Master Controller API client. NO business logic, NO
// filesystem, NO localhost fallback, NO SMTP. HTTPS only, service credential, idempotency,
// structured errors. A non-2xx or malformed response is NEVER reported as success.
// fetch is injectable for offline tests.
const DEFAULT_TIMEOUT_MS = 12000;

export class TelegramApiClient {
    constructor({ baseUrl, token, fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
        if (!baseUrl || !/^https:\/\//.test(baseUrl)) throw new Error('API_BASE_MUST_BE_HTTPS');
        this.baseUrl = baseUrl.replace(/\/+$/, '');
        this.token = token || null;
        this._fetch = fetchImpl || globalThis.fetch;
        this.timeoutMs = timeoutMs;
    }

    // Map HTTP status → structured outcome. success ONLY on 2xx with ok-envelope.
    _classify(status, body) {
        if (status >= 200 && status < 300) {
            if (body && body.ok === true) return { ok: true, status, data: body.data };
            return { ok: false, status, code: 'MALFORMED_RESPONSE', retriable: false };
        }
        const m = {
            400: 'VALIDATION_ERROR', 401: 'CREDENTIAL_INVALID', 403: 'SCOPE_DENIED',
            404: 'NOT_FOUND', 409: 'REVISION_CONFLICT', 423: 'MAINTENANCE_LOCKED',
            429: 'RATE_LIMITED', 503: 'BACKEND_UNAVAILABLE',
        };
        const code = m[status] || (status >= 500 ? 'BACKEND_ERROR' : 'HTTP_ERROR');
        const retriable = status === 429 || status === 503 || status >= 500;
        return { ok: false, status, code, retriable, error: body?.error || null };
    }

    async _raw(method, path, { body, headers = {} } = {}) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
        try {
            const res = await this._fetch(this.baseUrl + path, {
                method,
                headers: { ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}), 'Content-Type': 'application/json', ...headers },
                body: body ? JSON.stringify(body) : undefined,
                signal: ctrl.signal,
            });
            let json = null; try { json = await res.json(); } catch { /* malformed */ }
            return this._classify(res.status, json);
        } catch (e) {
            const aborted = /abort/i.test(String(e.name || e.message));
            return { ok: false, status: 0, code: aborted ? 'TIMEOUT' : 'NETWORK_UNAVAILABLE', retriable: true };
        } finally { clearTimeout(t); }
    }

    // Safe GET with bounded exponential backoff on retriable failures.
    async get(path, { retries = 2 } = {}) {
        let attempt = 0, last;
        for (;;) {
            last = await this._raw('GET', path);
            if (last.ok || !last.retriable || attempt >= retries) return last;
            await this._sleep(200 * Math.pow(2, attempt)); attempt++;
        }
    }

    // Mutations: retried ONLY when an idempotency_key is present (safe to repeat).
    async mutate(path, body = {}, { idempotencyKey, operationId, expectedRevision, retries = 0 } = {}) {
        const payload = { ...body };
        if (operationId) payload.operationId = operationId;
        if (idempotencyKey) payload.idempotencyKey = idempotencyKey;
        if (expectedRevision != null) payload.expectedRevision = expectedRevision;
        const headers = idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {};
        let attempt = 0, last;
        for (;;) {
            last = await this._raw('POST', path, { body: payload, headers });
            const canRetry = idempotencyKey && last.retriable && attempt < retries;
            if (last.ok || !canRetry) return last;
            await this._sleep(200 * Math.pow(2, attempt)); attempt++;
        }
    }

    _sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
}
