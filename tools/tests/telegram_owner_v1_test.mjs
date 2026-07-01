/**
 * telegram_owner_v1_test.mjs — Telegram Owner Transport scenario lab.
 *
 * OFFLINE. No network. No client outbound. Verifies credential-gated state (no owner chat id →
 * CREDENTIAL_REQUIRED, no send, no invented destination), allow-list eligibility (P2/P3 noise never
 * sent), message building, and that delivery requires an injected sender (fail-closed otherwise).
 */
import fs from 'node:fs';
import path from 'node:path';

delete process.env.MATER_OWNER_TELEGRAM_CHAT_ID;
delete process.env.MATER_TELEGRAM_OWNER_ENABLED;
process.env.MATER_TELEGRAM_TOKEN_API = 'x'.repeat(20); // token present, but no chat id

const tg = await import('../mater_controller_api/src/owner_center/telegram_owner.mjs');

let passed = 0, failed = 0; const fails = [];
function check(n, c) { if (c) { passed++; console.log('  OK  ' + n); } else { failed++; fails.push(n); console.log('  XX  ' + n); } }

console.log('\n=== Telegram Owner Transport — Scenario Lab (owner chat ABSENT) ===\n');

// 1. credential-gated posture
check('owner chat absent', tg.ownerChatPresent() === false);
check('transport CREDENTIAL_REQUIRED', tg.transportState() === 'CREDENTIAL_REQUIRED');
check('status reports CREDENTIAL_REQUIRED', tg.status().transport_state === 'CREDENTIAL_REQUIRED');
check('status never client outbound', tg.status().sends_client_messages === false);

// 2. eligibility allow-list
check('P0 incident eligible', tg.isOwnerAlertEligible({ severity: 'P0', event_type: 'CANONICAL_WRITER_ANOMALY' }) === true);
check('POSITIVE_REPLY eligible', tg.isOwnerAlertEligible({ severity: 'P1', event_type: 'POSITIVE_REPLY' }) === true);
check('PRICE_REQUEST eligible', tg.isOwnerAlertEligible({ event_type: 'PRICE_REQUEST' }) === true);
check('P2 noise NOT eligible', tg.isOwnerAlertEligible({ severity: 'P2', event_type: 'CONTACT_NOT_FOUND' }) === false);
check('P3 noise NOT eligible', tg.isOwnerAlertEligible({ severity: 'P3', event_type: 'DAILY_BRIEF' }) === false);

// 3. message building (no secrets)
const msg = tg.buildOwnerMessage({ severity: 'P0', title_ru: 'Аномалия', summary_ru: 'деталь' });
check('message includes severity + title', msg.includes('[P0]') && msg.includes('Аномалия'));

// 4. send is suppressed without credentials (no invented destination, no fake send)
let senderCalls = 0;
const sender = async () => { senderCalls += 1; return { ok: true }; };
const r = await tg.sendOwnerAlert({ severity: 'P0', event_type: 'P0_INCIDENT', title_ru: 'x' }, { sender, test_only: true });
check('send suppressed (CREDENTIAL_REQUIRED)', r.sent === false && r.reason === 'CREDENTIAL_REQUIRED');
check('sender never invoked without creds', senderCalls === 0);

// 5. non-eligible event never sent even if creds were present
const r2 = await tg.sendOwnerAlert({ severity: 'P2', event_type: 'CONTACT_NOT_FOUND' }, { sender });
check('non-eligible not sent', r2.sent === false && r2.reason === 'NOT_OWNER_ALERT_CLASS');

// 6. LIVE requires creds + enabled + sender (simulate creds present, but no sender → fail closed)
process.env.MATER_OWNER_TELEGRAM_CHAT_ID = '123456';
process.env.MATER_TELEGRAM_OWNER_ENABLED = 'true';
check('transport LIVE with creds+enabled', tg.transportState() === 'LIVE');
const r3 = await tg.sendOwnerAlert({ severity: 'P0', event_type: 'P0_INCIDENT', title_ru: 'x' }, { sender: null });
check('LIVE but no sender → fail closed (not sent)', r3.sent === false && r3.reason === 'SENDER_NOT_WIRED');
const r4 = await tg.sendOwnerAlert({ severity: 'P0', event_type: 'P0_INCIDENT', title_ru: 'x' }, { sender });
check('LIVE + sender → sent', r4.sent === true && senderCalls === 1);

// 7. no secrets / no client outbound in source
const src = fs.readFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\//, ''), '..', 'mater_controller_api', 'src', 'owner_center', 'telegram_owner.mjs'), 'utf8');
check('no hardcoded bot token', !/\d{6,}:[A-Za-z0-9_-]{30,}/.test(src));
check('no nodemailer/smtp', !/nodemailer|createTransport/i.test(src));

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failed > 0) { console.log('FAILURES:', fails.join(', ')); process.exit(1); }
process.exit(0);
