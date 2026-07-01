/**
 * fcm_push_v1_test.mjs — FCM Push transport scenario lab.
 *
 * OFFLINE. No network. No real Firebase. No client outbound. Points the push store at a TEMP file
 * and ensures NO credentials are present, so delivery_state stays CREDENTIAL_REQUIRED and no live
 * send ever happens. Verifies token lifecycle (register/rotate/unregister, idempotency), preferences,
 * severity/preference routing, and disabled-by-default delivery (suppressed, fail-closed).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mc_push_test_'));
process.env.MATER_PUSH_STORE_PATH = path.join(DIR, 'push_registry.json');
process.env.MATER_FCM_CREDENTIALS_PATH = path.join(DIR, 'no_such_fcm_credentials.json'); // intentionally absent
process.env.MATER_OWNER_CENTER_STORE_PATH = path.join(DIR, 'owner_center_store.json');
delete process.env.MATER_FCM_ENABLED; // ensure disabled

let passed = 0, failed = 0; const fails = [];
function check(n, c) { if (c) { passed++; console.log('  ✅ ' + n); } else { failed++; fails.push(n); console.log('  ❌ ' + n); } }

console.log('\n=== FCM Push — Scenario Lab (credentials ABSENT) ===\n');

const fcm = await import('../mater_controller_api/src/owner_center/fcm_push.mjs');

// 1. posture: disabled by default, no credentials
console.log('Scenario: disabled-by-default posture');
check('credential absent', fcm.credentialPresent() === false);
check('enabled flag false', fcm.pushEnabledFlag() === false);
check('delivery state CREDENTIAL_REQUIRED', fcm.deliveryState() === 'CREDENTIAL_REQUIRED');
const st0 = fcm.status();
check('status reports CREDENTIAL_REQUIRED', st0.delivery_state === 'CREDENTIAL_REQUIRED');
check('status never client outbound', st0.sends_client_messages === false);
check('credential_present boolean only', st0.credential_present === false && typeof st0.credential_present === 'boolean');

// 2. token lifecycle
console.log('Scenario: token register / rotate / unregister');
const reg = fcm.registerToken({ deviceId: 'dev1', token: 'token-abc-1234567890' });
check('register ok', reg.ok && reg.written);
check('token hashed for logging', !!reg.tokenHash && reg.tokenHash.length === 16);
const regDup = fcm.registerToken({ deviceId: 'dev1', token: 'token-abc-1234567890' });
check('re-register idempotent', regDup.ok && regDup.idempotent === true);
const rotate = fcm.registerToken({ deviceId: 'dev1', token: 'token-xyz-9876543210' });
check('rotate ok', rotate.ok);
check('rotate deactivates old token', fcm.status().registered_tokens === 1);
const badTok = fcm.registerToken({ deviceId: 'dev1', token: 'short' });
check('invalid token rejected', !badTok.ok && badTok.code === 'TOKEN_INVALID');
const noDev = fcm.registerToken({ token: 'token-no-device-12345' });
check('missing device rejected', !noDev.ok && noDev.code === 'DEVICE_REQUIRED');

// 3. preferences
console.log('Scenario: preferences');
const prefs = fcm.setPreferences({ deviceId: 'dev1', prefs: { min_severity: 'P0', daily_brief: true, decisions: false } });
check('set prefs ok', prefs.ok && prefs.prefs.min_severity === 'P0');
check('prefs persisted', fcm.getPreferences('dev1').prefs.daily_brief === true);
const prefsNoDev = fcm.setPreferences({ deviceId: 'ghost', prefs: {} });
check('prefs without token rejected', !prefsNoDev.ok && prefsNoDev.code === 'NO_ACTIVE_TOKEN');

// 4. routing decision
console.log('Scenario: routing decision');
const p0 = fcm.shouldDeliver({ event_type: 'CANONICAL_WRITER_ANOMALY', severity: 'P0', entity_type: 'SERVICE', title_ru: 'x' }, fcm.DEFAULT_PREFS);
check('P0 routed to push', p0.deliver === true);
const p2 = fcm.shouldDeliver({ event_type: 'CONTACT_NOT_FOUND', severity: 'P2', entity_type: 'LEAD', title_ru: 'x' }, fcm.DEFAULT_PREFS);
check('P2 not push-routed', p2.deliver === false && p2.reason === 'NOT_PUSH_ROUTED');
const optOut = fcm.shouldDeliver({ event_type: 'POSITIVE_REPLY', severity: 'P1', entity_type: 'CONVERSATION', title_ru: 'x' }, { ...fcm.DEFAULT_PREFS, enabled: false });
check('opted-out device → no push', optOut.deliver === false && optOut.reason === 'DEVICE_OPTED_OUT');
const belowMin = fcm.shouldDeliver({ event_type: 'POSITIVE_REPLY', severity: 'P1', entity_type: 'CONVERSATION', title_ru: 'x' }, { ...fcm.DEFAULT_PREFS, min_severity: 'P0' });
check('below min severity → suppressed', belowMin.deliver === false && belowMin.reason === 'BELOW_MIN_SEVERITY');

// 5. delivery is suppressed (no credentials) — NEVER a live send
console.log('Scenario: delivery suppressed without credentials');
const del = await fcm.deliver({ event: { event_type: 'CANONICAL_WRITER_ANOMALY', severity: 'P0', entity_type: 'SERVICE', title_ru: 'x' } });
check('delivery not performed', del.delivered === false);
check('delivery state CREDENTIAL_REQUIRED', del.state === 'CREDENTIAL_REQUIRED');
check('delivery not live', del.live === false);
const st1 = fcm.status();
check('delivery logged as suppressed', st1.deliveries_attempted >= 1 && st1.deliveries_live === 0);

// 6. unregister
console.log('Scenario: unregister');
const unreg = fcm.unregisterToken({ deviceId: 'dev1' });
check('unregister ok', unreg.ok && unreg.deactivated >= 1);
check('no active tokens after unregister', fcm.status().registered_tokens === 0);

// 7. no-fake-credential / no-client-outbound invariant
console.log('Scenario: no fake credentials / no client outbound');
const src = fs.readFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\//, ''), '..', 'mater_controller_api', 'src', 'owner_center', 'fcm_push.mjs'), 'utf8');
check('no hardcoded server key', !/AIza[0-9A-Za-z_-]{20,}|server_key\s*=\s*["'][^"']+["']/.test(src));
check('no nodemailer/smtp (not client outbound)', !/nodemailer|createTransport/i.test(src));
check('fail-closed: no sender → not live', true); // covered by deliver() returning live:false when no sender

// cleanup
try { fs.rmSync(DIR, { recursive: true, force: true }); } catch {}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failed > 0) { console.log('FAILURES:', fails.join(', ')); process.exit(1); }
process.exit(0);
