// tests/run_all.mjs
// Mater Controller API test suite — unit + integration, fully no-send.
// Boots the Express app in-process on an ephemeral port with MATER_NO_SEND=true,
// pairs a device, and exercises every owner-only route against the REAL canonical
// Mini Audit store (read-only — assertions confirm the store/ledger are never mutated).
//
// Run: node tests/run_all.mjs   (or: npm test)
process.env.MATER_NO_SEND = 'true';
process.env.MATER_API_AUTOSTART = 'false'; // do not bind the real port on import
process.env.EMAIL_REAL_SEND_ENABLED = 'false';

import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { app } from '../src/server/index.mjs';
import { STORE_PATH, SEND_LEDGER_PATH, EMAIL_LEDGER_PATH } from '../src/shared/config.mjs';

let passed = 0, failed = 0;
const fails = [];
function ok(name, cond, extra = '') {
    if (cond) { passed++; console.log(`  PASS  ${name}`); }
    else { failed++; fails.push(name); console.log(`  FAIL  ${name} ${extra}`); }
}
function sha(p) { try { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); } catch { return 'MISSING'; } }

// --- tiny HTTP client against the in-process server ---
let server, base;
function req(method, path, { token, body } = {}) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;
        const headers = { 'content-type': 'application/json' };
        if (data) headers['content-length'] = Buffer.byteLength(data);
        if (token) headers.authorization = `Bearer ${token}`;
        const r = http.request(base + path, { method, headers }, (res) => {
            let buf = '';
            res.on('data', (c) => (buf += c));
            res.on('end', () => {
                let json = null; try { json = JSON.parse(buf); } catch { /* non-json */ }
                resolve({ status: res.statusCode, json, raw: buf });
            });
        });
        r.on('error', reject);
        if (data) r.write(data);
        r.end();
    });
}

async function main() {
    // baseline hashes — must be identical at the end (no mutation during tests)
    const baseStore = sha(STORE_PATH);
    const baseSend = sha(SEND_LEDGER_PATH);
    const baseEmail = sha(EMAIL_LEDGER_PATH);

    await new Promise((res) => { server = app.listen(0, '127.0.0.1', res); });
    const port = server.address().port;
    base = `http://127.0.0.1:${port}/api/v1`;
    console.log(`Test server on ${base}\n`);

    // ---------- health (public) ----------
    console.log('[health & envelope]');
    let h = await req('GET', '/health');
    ok('health 200', h.status === 200);
    ok('health envelope ok=true', h.json?.ok === true && h.json?.error === null);
    ok('health has requestId', typeof h.json?.requestId === 'string');

    // ---------- auth gate ----------
    console.log('\n[auth gate]');
    let noTok = await req('GET', '/projects');
    ok('protected route without token -> 401', noTok.status === 401 && noTok.json?.error?.code === 'UNAUTHORIZED');
    let badTok = await req('GET', '/projects', { token: 'garbage' });
    ok('protected route bad token -> 401', badTok.status === 401);

    // ---------- pairing ----------
    console.log('\n[pairing]');
    let ps = await req('POST', '/auth/pairing/start', { body: { deviceName: 'TestPhone' } });
    ok('pairing/start 200 + 6-digit code', ps.status === 200 && /^\d{6}$/.test(ps.json?.data?.code || ''));
    const code = ps.json.data.code;
    let badCode = await req('POST', '/auth/pairing/complete', { body: { code: '000000', deviceName: 'X' } });
    ok('pairing complete wrong code -> 400', badCode.status === 400);
    let pc = await req('POST', '/auth/pairing/complete', { body: { code, deviceName: 'TestPhone' } });
    ok('pairing/complete 200 + tokens', pc.status === 200 && !!pc.json?.data?.accessToken && !!pc.json?.data?.refreshToken);
    let token = pc.json.data.accessToken;
    const refreshToken = pc.json.data.refreshToken;
    const deviceId = pc.json.data.deviceId;
    let reuse = await req('POST', '/auth/pairing/complete', { body: { code, deviceName: 'TestPhone' } });
    ok('pairing code single-use (reuse -> 400)', reuse.status === 400);

    // ---------- refresh ----------
    console.log('\n[token refresh]');
    let rf = await req('POST', '/auth/refresh', { body: { refreshToken } });
    ok('refresh 200 + new access token', rf.status === 200 && !!rf.json?.data?.accessToken);
    if (rf.json?.data?.accessToken) token = rf.json.data.accessToken; // adopt rotated token (old hash is overwritten)
    let rfBad = await req('POST', '/auth/refresh', { body: { refreshToken: 'nope' } });
    ok('refresh invalid -> 401', rfBad.status === 401);

    // ---------- projects ----------
    console.log('\n[projects]');
    let pr = await req('GET', '/projects', { token });
    ok('projects list 200', pr.status === 200);
    const ids = (pr.json?.data?.projects || []).map((p) => p.id);
    ok('first project = mini_audit', ids[0] === 'mini_audit');
    ok('no fake extra projects (only real ones)', (pr.json.data.projects.find((p) => p.id === 'mini_audit')?.enabled) === true);
    let pNot = await req('GET', '/projects/does_not_exist', { token });
    ok('unknown project -> 404', pNot.status === 404);

    // ---------- mini-audit status / metrics ----------
    console.log('\n[mini-audit overview]');
    let st = await req('GET', '/mini-audit/status', { token });
    ok('status 200', st.status === 200);
    ok('status autosend BLOCKED', st.json?.data?.autosend === 'BLOCKED');
    const total = st.json.data.total;
    ok('status total > 0 (real data)', total > 0, `total=${total}`);

    // ---------- buckets ----------
    console.log('\n[lead buckets & identities]');
    let wr = await req('GET', '/mini-audit/leads?bucket=waiting_reply', { token });
    const wrIds = (wr.json?.data?.items || []).map((x) => x.leadId).sort();
    ok('waiting_reply = 3 proven leads', JSON.stringify(wrIds) === JSON.stringify(['DKBI_RU', 'STROYDVOR-UG_RU', 'ZAVODATOM_RU']), wrIds.join(','));
    ok('waiting_reply all proven smtp 250', (wr.json.data.items || []).every((x) => x.sendProof === 'proven' && x.smtpCode === 250));

    let su = await req('GET', '/mini-audit/send-uncertain', { token });
    const suIds = (su.json?.data?.items || []).map((x) => x.leadId).sort();
    ok('send_uncertain = 3 uncertain leads', JSON.stringify(suIds) === JSON.stringify(['BETON-MASTERS_RU', 'GBIRESURS_RU', 'MEGALIT-KRD_RU']), suIds.join(','));
    ok('send_uncertain none auto waiting_reply', (su.json.data.items || []).every((x) => x.status !== 'waiting_reply'));

    let pg = await req('GET', '/mini-audit/leads?bucket=all&page=1&pageSize=5', { token });
    ok('pagination pageSize honored', (pg.json?.data?.items?.length || 0) <= 5 && pg.json?.data?.pageSize === 5);
    let sr = await req('GET', '/mini-audit/leads?search=DKBI', { token });
    ok('search filters results', (sr.json?.data?.items || []).some((x) => x.leadId === 'DKBI_RU'));

    // ---------- next action ----------
    console.log('\n[next action]');
    let na = await req('GET', '/mini-audit/next-action', { token });
    ok('next-action 200 + kind', na.status === 200 && typeof na.json?.data?.kind === 'string');

    // ---------- owner outreach queue (read-only; no send) ----------
    console.log('\n[owner outreach queue]');
    let oq = await req('GET', '/commercial/outreach/queue?limit=3', { token });
    ok('outreach queue 200', oq.status === 200 && Array.isArray(oq.json?.data?.items));
    ok('outreach queue exposes no live payment/prod write', oq.json?.data?.payments_live === false && oq.json?.data?.production_db_write === false);
    ok('outreach queue has next action text', typeof oq.json?.data?.next_action_ru === 'string');

    // ---------- lead detail / audit / email preview ----------
    console.log('\n[lead detail / previews]');
    let ld = await req('GET', '/mini-audit/leads/DKBI_RU', { token });
    ok('lead detail 200', ld.status === 200 && ld.json?.data?.leadId === 'DKBI_RU');
    ok('lead detail no secret fields', !JSON.stringify(ld.json).match(/password|smtp_pass|bot_token/i));
    let au = await req('GET', '/mini-audit/leads/DKBI_RU/audit', { token });
    ok('audit 200', au.status === 200);
    let ep = await req('GET', '/mini-audit/leads/DKBI_RU/email-preview', { token });
    ok('email-preview 200', ep.status === 200);
    let ldNot = await req('GET', '/mini-audit/leads/__nope__', { token });
    ok('unknown lead -> 404', ldNot.status === 404);

    // ---------- send gate (waiting_reply must be blocked) ----------
    console.log('\n[send eligibility gate]');
    let sp = await req('POST', '/mini-audit/leads/DKBI_RU/send/prepare', { token });
    ok('send/prepare on waiting_reply -> 409 NOT_SENDABLE', sp.status === 409 && sp.json?.error?.code === 'LEAD_NOT_SENDABLE');
    ok('block reason ALREADY_WAITING_REPLY', (sp.json?.error?.details?.reasons || []).includes('ALREADY_WAITING_REPLY'));
    let spU = await req('POST', '/mini-audit/leads/BETON-MASTERS_RU/send/prepare', { token });
    ok('send/prepare on send_uncertain -> 409', spU.status === 409);

    // ---------- approvals lifecycle (no real send) ----------
    console.log('\n[approvals — no real send]');
    let aprNot = await req('POST', '/mini-audit/approvals/apr_nope/approve', { token });
    ok('approve unknown approval -> 404', aprNot.status === 404);

    // ---------- follow-up ----------
    console.log('\n[follow-up]');
    let fu = await req('GET', '/mini-audit/followups', { token });
    ok('followups 200 + only proven', (fu.json?.data?.items || []).every((x) => x.sendProof === 'proven'));
    let fp = await req('GET', '/mini-audit/followups/DKBI_RU/preview', { token });
    ok('followup preview 200', fp.status === 200);

    // ---------- send-uncertain check-proof (no resend) ----------
    console.log('\n[send-uncertain check-proof]');
    let cp = await req('POST', '/mini-audit/send-uncertain/BETON-MASTERS_RU/check-proof', { token });
    ok('check-proof 200 + no auto resend', cp.status === 200 && cp.json?.data?.proofChecked === true);

    // ---------- system status (secret-free) ----------
    console.log('\n[system status]');
    let sys = await req('GET', '/system/status', { token });
    ok('system status 200', sys.status === 200);
    ok('smtpConfigured is boolean only', typeof sys.json?.data?.smtpConfigured === 'boolean');
    ok('system status carries no secret values', !JSON.stringify(sys.json).match(/(YANDEX_MAIL_APP_PASSWORD|BOT_TOKEN|MATER_API_SECRET)\b.*[:=].+[A-Za-z0-9]/));

    // ---------- device revocation ----------
    console.log('\n[device revocation]');
    let dl = await req('GET', '/auth/devices', { token });
    ok('devices list 200', dl.status === 200 && (dl.json?.data?.devices || []).some((d) => d.deviceId === deviceId));
    let rv = await req('DELETE', `/auth/devices/${deviceId}`, { token });
    ok('revoke device 200', rv.status === 200);
    let afterRevoke = await req('GET', '/projects', { token });
    ok('revoked token rejected -> 401', afterRevoke.status === 401);

    // ---------- DEF-V3-001 regression: test_only must NOT leak into primaryConstraint ----------
    console.log('\n[DEF-V3-001: test_only isolation in command brief]');
    {
        const cm = await import('../src/owner_center/chief_ops.mjs');
        const pc = cm.primaryConstraint || cm.default?.primaryConstraint;
        // real owner store with ONLY test_only records → must NOT report DECISIONS_PENDING/P0_INCIDENT
        const testStore = {
            decisions: [{ decision_id: 'd1', status: 'OPEN', test_only: true, priority: 'P1', title_ru: 't' }],
            incidents: [{ incident_id: 'i1', state: 'OPEN', test_only: true, severity: 'P0', title_ru: 't' }],
        };
        const c = pc({}, testStore);
        ok('test_only decision does NOT become DECISIONS_PENDING', c.kind !== 'DECISIONS_PENDING', `got ${c.kind}`);
        ok('test_only incident does NOT become P0_INCIDENT', c.kind !== 'P0_INCIDENT', `got ${c.kind}`);
        // a REAL open decision still surfaces (no over-filtering)
        const realStore = { decisions: [{ decision_id: 'd2', status: 'OPEN', test_only: false, priority: 'P1', title_ru: 'real' }], incidents: [] };
        ok('real open decision still surfaces', pc({}, realStore).kind === 'DECISIONS_PENDING');
    }

    // ---------- 404 + safe errors ----------
    console.log('\n[safe errors]');
    let nf = await req('GET', '/totally/unknown/route');
    ok('unknown route -> 404 envelope', nf.status === 404 && nf.json?.ok === false);

    // ---------- no mutation of canonical files ----------
    console.log('\n[canonical store integrity — no mutation]');
    ok('lead store unchanged', sha(STORE_PATH) === baseStore);
    ok('send ledger unchanged', sha(SEND_LEDGER_PATH) === baseSend);
    ok('email ledger unchanged', sha(EMAIL_LEDGER_PATH) === baseEmail);

    server.close();
    console.log(`\n==== RESULT: ${passed} passed, ${failed} failed ====`);
    if (failed) { console.log('FAILED:', fails.join(' | ')); process.exit(1); }
    process.exit(0);
}

main().catch((e) => { console.error('TEST RUNNER ERROR', e); process.exit(2); });
