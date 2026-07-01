// tg_api_client_test.mjs — Telegram API client. PURE offline with mock fetch.
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n); } };

const { TelegramApiClient } = await import('../telegram_gateway/api_only/api_client.mjs');

const mkFetch = (seq) => { let i = 0; return async () => { const r = seq[Math.min(i, seq.length - 1)]; i++; if (r.throw) throw Object.assign(new Error(r.throw), { name: r.name || 'Error' }); return { status: r.status, json: async () => r.body }; }; };

// https enforced
let threw = false; try { new TelegramApiClient({ baseUrl: 'http://x' }); } catch { threw = true; }
ok('rejects non-https base', threw);

const base = 'https://195-96-132-82.sslip.io/api/v1';
// success
let c = new TelegramApiClient({ baseUrl: base, token: 't', fetchImpl: mkFetch([{ status: 200, body: { ok: true, data: { x: 1 } } }]) });
ok('2xx ok-envelope → success', (await c.get('/health')).ok === true);
// malformed 200 → NOT success
c = new TelegramApiClient({ baseUrl: base, fetchImpl: mkFetch([{ status: 200, body: { garbage: true } }]) });
ok('malformed 200 → not success', (await c.get('/x')).code === 'MALFORMED_RESPONSE');
// status mapping
const codes = { 400: 'VALIDATION_ERROR', 401: 'CREDENTIAL_INVALID', 403: 'SCOPE_DENIED', 404: 'NOT_FOUND', 409: 'REVISION_CONFLICT', 423: 'MAINTENANCE_LOCKED', 429: 'RATE_LIMITED', 503: 'BACKEND_UNAVAILABLE' };
for (const [s, code] of Object.entries(codes)) {
    c = new TelegramApiClient({ baseUrl: base, fetchImpl: mkFetch([{ status: Number(s), body: { ok: false, error: { code } } }]) });
    const r = await c.get('/x', { retries: 0 });
    ok(`${s} → ${code}`, r.code === code && r.ok === false);
}
// timeout → safe unavailable
c = new TelegramApiClient({ baseUrl: base, fetchImpl: mkFetch([{ throw: 'aborted', name: 'AbortError' }]) });
ok('timeout → TIMEOUT not success', (await c.get('/x', { retries: 0 })).code === 'TIMEOUT');
// network error
c = new TelegramApiClient({ baseUrl: base, fetchImpl: mkFetch([{ throw: 'ECONNREFUSED' }]) });
ok('network err → NETWORK_UNAVAILABLE', (await c.get('/x', { retries: 0 })).code === 'NETWORK_UNAVAILABLE');
// GET retries on 503 then succeeds
let n = 0; const retryFetch = async () => { n++; return n < 2 ? { status: 503, json: async () => ({ ok: false }) } : { status: 200, json: async () => ({ ok: true, data: {} }) }; };
c = new TelegramApiClient({ baseUrl: base, fetchImpl: retryFetch });
ok('GET retries 503 then ok', (await c.get('/x', { retries: 2 })).ok === true && n === 2);
// mutation WITHOUT idempotency key does NOT retry
let m = 0; const mutFetch = async () => { m++; return { status: 503, json: async () => ({ ok: false }) }; };
c = new TelegramApiClient({ baseUrl: base, fetchImpl: mutFetch });
await c.mutate('/x', {}, { retries: 3 }); // no idempotencyKey
ok('mutation without idem key does not retry', m === 1);
// mutation WITH idempotency key retries
let m2 = 0; const mutFetch2 = async () => { m2++; return m2 < 2 ? { status: 503, json: async () => ({ ok: false }) } : { status: 200, json: async () => ({ ok: true, data: {} }) }; };
c = new TelegramApiClient({ baseUrl: base, fetchImpl: mutFetch2 });
const mr = await c.mutate('/x', {}, { idempotencyKey: 'k1', retries: 3 });
ok('mutation with idem key retries then ok', mr.ok === true && m2 === 2);
// mutation injects operationId + expectedRevision
let captured = null; const capFetch = async (url, opt) => { captured = JSON.parse(opt.body); return { status: 200, json: async () => ({ ok: true, data: {} }) }; };
c = new TelegramApiClient({ baseUrl: base, fetchImpl: capFetch });
await c.mutate('/x', { a: 1 }, { operationId: 'op1', idempotencyKey: 'k', expectedRevision: 5 });
ok('mutation payload carries op/idem/revision', captured.operationId === 'op1' && captured.idempotencyKey === 'k' && captured.expectedRevision === 5);
// no filesystem/localhost in client source (strip comments first — comments mention "no localhost")
import fs from 'node:fs';
const rawSrc = fs.readFileSync(new URL('../telegram_gateway/api_only/api_client.mjs', import.meta.url), 'utf8');
const codeOnly = rawSrc.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
ok('client has no fs/localhost/smtp in CODE', !/require\(['"]fs|http:\/\/localhost|127\.0\.0\.1|nodemailer|saveStore/.test(codeOnly));

console.log(`\n==== tg_api_client: ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
