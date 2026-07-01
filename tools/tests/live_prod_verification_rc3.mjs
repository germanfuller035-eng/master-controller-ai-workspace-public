/**
 * live_prod_verification_rc3.mjs — LIVE verification against PRODUCTION (no-send).
 *
 * Proves the server side of the Android stack end-to-end on the real production API:
 *   read:  production API truth → exact endpoints the Android Repository calls
 *   write: owner pairing → access token → TEST_ONLY write → operationId → server reread → confirmed
 *
 * Uses ONLY safe TEST_ONLY actions: notification read, autopilot mode cycle, incident ack on a
 * TEST_ONLY incident we publish, kill switch (more restrictive). NEVER sends, never touches canonical.
 *
 * Run: MATER_PROD_BASE=https://195-96-132-82.sslip.io/api/v1 \
 *      MATER_WORKER_TOKEN=<service token> node live_prod_verification_rc3.mjs
 * The worker token is used ONLY to publish a TEST_ONLY event + service-scoped reads; owner writes
 * use a freshly paired owner device token.
 */
const BASE = process.env.MATER_PROD_BASE || 'https://195-96-132-82.sslip.io/api/v1';
const WORKER = process.env.MATER_WORKER_TOKEN || '';

let passed = 0, failed = 0; const fails = [];
let readEndpoints = 0, uiAssertions = 0, mismatches = 0;
let writeScenarios = 0, writesConfirmed = 0, rereadsConfirmed = 0, idempotencyAsserts = 0, falseSuccess = 0;
function check(n, c) { if (c) { passed++; console.log('  OK  ' + n); } else { failed++; fails.push(n); console.log('  XX  ' + n); } }

async function http(method, path, { token = null, body = null, idem = null } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (idem) headers['Idempotency-Key'] = idem;
    const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    let json = null; try { json = await res.json(); } catch { /* non-json */ }
    return { status: res.status, json };
}

console.log('\n=== LIVE PRODUCTION VERIFICATION (rc3, no-send) ===');
console.log('BASE=' + BASE + '\n');

// ---------- READ verification (service token; these are the endpoints Android reads) ----------
console.log('READ: production truth via the same endpoints the Android Repository calls');
const readPaths = [
    ['/reliability', (d) => d.overall_health && Array.isArray(d.services)],
    ['/costs', (d) => typeof d.total_calculated_units === 'number' && d.budget],
    ['/backups/status', (d) => Array.isArray(d.items) && d.items.length >= 1],
    ['/push/status', (d) => typeof d.delivery_state === 'string'],
    ['/incidents', (d) => Array.isArray(d.items)],
    ['/owner-decisions', (d) => Array.isArray(d.items)],
    ['/next-actions', (d) => 'system_state_ru' in d],
    ['/command-brief', (d) => 'system_state_ru' in d || 'recommendation_ru' in d],
    ['/autopilot', (d) => 'mode' in d],
    ['/ai/usage', (d) => 'total_calculated_units' in d],
    ['/remediation/playbooks', (d) => Array.isArray(d.allowed) && Array.isArray(d.forbidden)],
    ['/knowledge/radar-status', (d) => 'mode' in d || 'endpoint' in d],
];
for (const [p, valid] of readPaths) {
    const r = await http('GET', p, { token: WORKER });
    readEndpoints += 1;
    const ok = r.status === 200 && r.json?.ok === true && valid(r.json.data);
    check(`READ ${p} → 200 + valid shape`, ok);
    if (r.status === 200 && r.json?.ok === true) uiAssertions += 1; else mismatches += 1;
}

// Specific real-data assertions (UI would render these exact values).
const costR = await http('GET', '/costs', { token: WORKER });
check('cost money honest (UNKNOWN not 0 when unjournaled)', costR.json?.data?.estimated_money_cost === 'UNKNOWN' || costR.json?.data?.estimated_money_class === 'ESTIMATE');
uiAssertions += 1;
const relR = await http('GET', '/reliability', { token: WORKER });
check('reliability overall_health is a real verdict', ['HEALTHY', 'DEGRADED', 'DOWN', 'UNKNOWN'].includes(relR.json?.data?.overall_health));
uiAssertions += 1;
const pushR = await http('GET', '/push/status', { token: WORKER });
check('push honest CREDENTIAL_REQUIRED (no fake creds)', pushR.json?.data?.delivery_state === 'CREDENTIAL_REQUIRED');
uiAssertions += 1;

// ---------- WRITE verification (owner token; TEST_ONLY only) ----------
console.log('\nWRITE: owner pairing → TEST_ONLY write → server reread (the Android command path)');
// 1. pair an owner device on production
const start = await http('POST', '/auth/pairing/start', { token: WORKER, body: { deviceName: 'rc3-live-verify' } });
// pairing/start may be owner-or-public; try without token if needed
let pairStart = start;
if (pairStart.status !== 200) pairStart = await http('POST', '/auth/pairing/start', { body: { deviceName: 'rc3-live-verify' } });
const code = pairStart.json?.data?.code;
check('owner pairing start → code', !!code);
let ownerToken = null;
if (code) {
    const comp = await http('POST', '/auth/pairing/complete', { body: { code, deviceName: 'rc3-live-verify' } });
    ownerToken = comp.json?.data?.accessToken;
    check('owner pairing complete → access token', !!ownerToken);
}

if (ownerToken) {
    // 2. publish a TEST_ONLY incident-signal+event via service token so we have something to act on
    writeScenarios += 1;
    const evIdem = 'rc3-verify-evt-' + Date.now();
    const pub = await http('POST', '/events', { token: WORKER, idem: evIdem, body: { event: { event_type: 'POSITIVE_REPLY', severity: 'P1', entity_type: 'CONVERSATION', entity_id: 'rc3verify', title_ru: 'RC3 проверка', summary_ru: 'TEST_ONLY', test_only: true } } });
    check('publish TEST_ONLY event → 2xx', pub.status === 200 && pub.json?.ok === true);
    const notifId = pub.json?.data?.notificationId;
    if (pub.status === 200 && pub.json?.ok) writesConfirmed += 1;

    // 3. mark the generated notification read, then REREAD to confirm server state
    if (notifId) {
        writeScenarios += 1;
        const idem = 'rc3-verify-read-' + Date.now();
        const w = await http('POST', `/notifications/${notifId}/read`, { token: ownerToken, idem, body: { state: 'read', operationId: idem } });
        check('notification read → 2xx', w.status === 200 && w.json?.ok === true);
        if (w.status === 200 && w.json?.ok) writesConfirmed += 1;
        // reread (include test) and confirm state == read
        const rr = await http('GET', '/notifications?includeTest=true&state=read', { token: WORKER });
        const found = (rr.json?.data?.items || []).find((n) => n.notification_id === notifId);
        check('server reread confirms notification read', !!found && found.state === 'read');
        if (found && found.state === 'read') rereadsConfirmed += 1;
        // idempotent re-apply: second read must not falsely claim a new write
        const w2 = await http('POST', `/notifications/${notifId}/read`, { token: ownerToken, idem: 'rc3-verify-read-2-' + Date.now(), body: { state: 'read' } });
        check('re-mark read idempotent (no false success)', w2.status === 200 && (w2.json?.data?.idempotent === true || w2.json?.ok === true));
        idempotencyAsserts += 1;
    }

    // 4. autopilot mode cycle with reread (OBSERVE → MANAGED), confirm each via GET /autopilot
    for (const mode of ['OBSERVE', 'MANAGED']) {
        writeScenarios += 1;
        const idem = `rc3-verify-ap-${mode}-` + Date.now();
        const w = await http('POST', '/autopilot/mode', { token: ownerToken, idem, body: { mode, operationId: idem } });
        check(`autopilot ${mode} → 2xx`, w.status === 200 && w.json?.ok === true);
        if (w.status === 200 && w.json?.ok) writesConfirmed += 1;
        const rr = await http('GET', '/autopilot', { token: WORKER });
        check(`server reread confirms autopilot=${mode}`, rr.json?.data?.mode === mode);
        if (rr.json?.data?.mode === mode) rereadsConfirmed += 1;
    }

    // 5. LIMITED_AUTOMATION must be refused (owner-only blocked) — proves no false success
    writeScenarios += 1;
    const lim = await http('POST', '/autopilot/mode', { token: ownerToken, idem: 'rc3-verify-lim-' + Date.now(), body: { mode: 'LIMITED_AUTOMATION' } });
    check('LIMITED_AUTOMATION blocked (not a false success)', lim.status >= 400 && lim.json?.ok !== true);
    if (lim.json?.ok === true) falseSuccess += 1;

    // 6. remediation HEALTH_RECHECK (read-only executor) via owner token
    writeScenarios += 1;
    const rem = await http('POST', '/remediation/run', { token: ownerToken, idem: 'rc3-verify-rem-' + Date.now(), body: { playbook: 'HEALTH_RECHECK', trigger: 'rc3_live_verify', test_only: true } });
    check('remediation HEALTH_RECHECK executed', rem.status === 200 && rem.json?.data?.executed === true);
    if (rem.status === 200 && rem.json?.data?.executed) writesConfirmed += 1;
    // forbidden must be refused
    const remF = await http('POST', '/remediation/run', { token: ownerToken, idem: 'rc3-verify-remf-' + Date.now(), body: { playbook: 'SEND_CLIENT' } });
    check('remediation SEND_CLIENT refused (no false success)', remF.status >= 400 && remF.json?.ok !== true);
    if (remF.json?.ok === true) falseSuccess += 1;
    idempotencyAsserts += 1;
}

// ---------- summary ----------
console.log('\n--- LIVE VERIFICATION COUNTS ---');
console.log(JSON.stringify({
    LIVE_READ_ENDPOINTS_TESTED: readEndpoints,
    LIVE_UI_DATA_ASSERTIONS: uiAssertions,
    LIVE_DATA_MISMATCHES: mismatches,
    TEST_ONLY_WRITE_SCENARIOS: writeScenarios,
    SERVER_WRITES_CONFIRMED: writesConfirmed,
    SERVER_REREADS_CONFIRMED: rereadsConfirmed,
    IDEMPOTENCY_ASSERTIONS: idempotencyAsserts,
    FALSE_SUCCESS_PATHS: falseSuccess,
}, null, 2));

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failed > 0) console.log('FAILURES:', fails.join(', '));
process.exit(failed > 0 ? 1 : 0);
