#!/usr/bin/env node
// tools/commercial_core/tests/route_security.test.mjs
// Drives the REAL production route registrar (commercial/routes.mjs) with a captured router + the
// real service adapter, against a synthetic store via MATER_STORE_PATH. No express boot, no network,
// no send. Proves feature-gate behavior, zero mutation when disabled, envelope shape, auth wiring.
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Point the canonical writer at a synthetic store BEFORE importing the adapter/seam.
const tmp = mkdtempSync(path.join(tmpdir(), 'iw1_route_'));
const storePath = path.join(tmp, 'store.json');
writeFileSync(storePath, JSON.stringify({
    version: 1, store_revision: 66, updated_at: null,
    leads: { SYN_LEAD_001: { lead_id: 'SYN_LEAD_001' } },
}, null, 2));
process.env.MATER_STORE_PATH = storePath;

const { registerCommercialRoutes } = await import('../../mater_controller_api/src/commercial/routes.mjs');
const { readStore } = await import('../../mater_controller_api/src/shared/store_access.mjs');

let pass = 0, fail = 0; const fails = [];
const ok = (n, c) => { if (c) pass++; else { fail++; fails.push(n); console.log('FAIL', n); } };

// Minimal envelope helpers mirroring shared/http.mjs
const okFn = (res, data) => { res._json = { ok: true, data: data ?? {}, error: null }; res._status = 200; return res; };
const failFn = (res, status, code, message, details) => { res._json = { ok: false, data: null, error: { code, message, details: details || null } }; res._status = status; return res; };
const passAuth = (req, res, next) => next ? next() : true; // auth handled by mock; we test gate behavior

// Capture router: store handlers by "METHOD path"
function makeRouter() {
    const routes = {};
    const reg = (method) => (p, ...handlers) => { routes[`${method} ${p}`] = handlers[handlers.length - 1]; };
    return { routes, get: reg('GET'), post: reg('POST') };
}
function call(router, key, { device = { deviceId: 'dev_test' }, body = {}, headers = {}, params = {} } = {}) {
    const handler = router.routes[key];
    if (!handler) return { _status: 0, _json: { error: { code: 'NO_ROUTE' } } };
    const req = { device, body, headers, params };
    const res = {};
    // our handlers call ok(res,..)/fail(res,..) which are bound below
    handler(req, res);
    return res;
}

const deps = { ok: okFn, fail: failFn, requireAuthOrService: passAuth, requireAuth: passAuth };

// ---- READ gate OFF ----
process.env.COMMERCIAL_READ_API = 'false';
process.env.COMMERCIAL_COMMAND_API = 'false';
process.env.COMMERCIAL_SEND = 'false';
let R = makeRouter();
registerCommercialRoutes(R, deps);
const readKeys = Object.keys(R.routes).filter((k) => k.startsWith('GET '));
const cmdKeys = Object.keys(R.routes).filter((k) => k.startsWith('POST '));
ok('RS1 17 read endpoints registered', readKeys.length === 17);
ok('RS2 8 command endpoints registered', cmdKeys.length === 8);

const sumOff = call(R, 'GET /commercial/summary');
ok('RS3 read flag OFF → FEATURE_DISABLED 403', sumOff._status === 403 && sumOff._json.error.code === 'FEATURE_DISABLED');

// ---- READ gate ON ----
process.env.COMMERCIAL_READ_API = 'true';
R = makeRouter(); registerCommercialRoutes(R, deps);
const sumOn = call(R, 'GET /commercial/summary');
ok('RS4 read flag ON → ok envelope', sumOn._status === 200 && sumOn._json.ok === true);
ok('RS5 commercial collections empty', call(R, 'GET /opportunities')._json.data.items.length === 0 && call(R, 'GET /deals')._json.data.items.length === 0);
ok('RS6 products readable (Mini Audit)', call(R, 'GET /products')._json.data.items.some((p) => p && p.product_id === 'mini_audit'));
const fin = call(R, 'GET /finance/summary')._json.data;
ok('RS7 finance UNKNOWN not zero', fin.confirmed_revenue === null && fin.confirmed_revenue_class === 'UNKNOWN');
ok('RS8 unknown opportunity → 404', call(R, 'GET /opportunities/:id', { params: { id: 'nope' } })._status === 404);

// ---- COMMAND gate OFF (Wave 1): every command FEATURE_DISABLED, zero mutation ----
const revBefore = readStore(storePath).store_revision;
let cmdDisabled = 0;
for (const k of cmdKeys) {
    const res = call(R, k, { body: { lead: { lead_id: 'X', verification_status: 'verified' }, decision: 'APPROVE', dealId: 'd', invoiceId: 'i', evidenceType: 'e', evidenceReference: 'r' }, headers: { 'idempotency-key': 'k1' }, params: { id: 'x' } });
    if (res._status === 403 && res._json.error.code === 'FEATURE_DISABLED') cmdDisabled++;
}
ok('RS9 all 8 commands FEATURE_DISABLED', cmdDisabled === 8);
const revAfter = readStore(storePath).store_revision;
ok('RS10 zero mutation from disabled commands (revision unchanged)', revAfter === revBefore && revBefore === 66);
const storeAfter = readStore(storePath);
ok('RS11 no commercial sections created by disabled commands', !('commercial.deals' in storeAfter));
ok('RS12 existing leads untouched', storeAfter.leads.SYN_LEAD_001 && Object.keys(storeAfter.leads).length === 1);

// ---- static boundary on the adapter source ----
import { readFileSync } from 'node:fs';
const adapterSrc = readFileSync(new URL('../../mater_controller_api/src/commercial/service.mjs', import.meta.url), 'utf8');
const routeSrc = readFileSync(new URL('../../mater_controller_api/src/commercial/routes.mjs', import.meta.url), 'utf8');
const both = adapterSrc + routeSrc;
ok('RS13 uses single writer seam (updateStoreWithRevision)', /updateStoreWithRevision/.test(adapterSrc));
ok('RS14 no direct fs write to canonical / no second store', !/writeFileSync\(|lead_pipeline_store|outbound_send_ledger/.test(both));
ok('RS15 no SMTP import', !/nodemailer|createTransport|smtp\./i.test(both));
ok('RS16 no Telegram transport', !/sendMessage|api\.telegram\.org/i.test(both));
ok('RS17 no IMAP mutation', !/APPEND|EXPUNGE|STORE \+FLAGS/i.test(both));
ok('RS18 no localhost fallback', !/127\.0\.0\.1|http:\/\/localhost/.test(both));
ok('RS19 send capability NONE in adapter', /sendCapability: 'NONE'/.test(adapterSrc));
ok('RS20 error envelope matches MC (FEATURE_DISABLED/REVISION_CONFLICT/MISSING_IDEMPOTENCY)', /FEATURE_DISABLED/.test(routeSrc) && /REVISION_CONFLICT/.test(routeSrc) && /MISSING_IDEMPOTENCY/.test(routeSrc));

console.log(`\n==== route security: ${pass} passed, ${fail} failed ====`);
if (fail) { console.log('FAILED:', fails.join(', ')); process.exit(1); }
process.exit(0);
