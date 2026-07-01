// tools/commercial_core/tests/rc6_reconciliation.test.mjs
// Deterministic tests for RC6 reservoir counters/prefilter + radar production filtering helpers.
// (Delivery reconciliation, audit, radar status read real stores and are covered by the on-VPS API
// suite; here we test the pure/network-free pieces.)
import { economicScore, hostAllowed, classifyProbe, RESERVOIR_STATES } from '../../mater_controller_api/src/commercial/domain_reservoir.mjs';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('FAIL', n); } };

// reservoir state machine
ok('RC1 dead -> REJECTED', classifyProbe({ dns_ok: false }).state === 'REJECTED');
ok('RC2 alive', classifyProbe({ dns_ok: true, http_status: 200 }).state === 'TECHNICALLY_ALIVE');
ok('RC3 business', classifyProbe({ dns_ok: true, http_status: 301, title: 'ООО' }).state === 'BUSINESS_IDENTIFIED');
ok('RC4 contact', classifyProbe({ dns_ok: true, http_status: 200, title: 'ООО', tel_links: 2 }).state === 'CONTACT_VERIFIED');
ok('RC5 states have terminal', RESERVOIR_STATES.includes('PROMOTED_TO_CANONICAL') && RESERVOIR_STATES.includes('REJECTED'));

// host filter
ok('RC6 .ru ok', hostAllowed('zavod.ru'));
ok('RC7 vk excluded', !hostAllowed('vk.com'));
ok('RC8 .com excluded', !hostAllowed('x.com'));

// economic score bands
ok('RC9 reject band', economicScore({}).band === 'REJECT');
ok('RC10 audit candidate band', economicScore({ business_verified: true, niche_match: true, region_match: true, website_alive: true, visible_conversion_problem: true, verified_contact: true, business_activity_signal: true, product_fit: true }).band === 'AUDIT_CANDIDATE');

console.log(`\n==== rc6_reconciliation: ${pass} passed, ${fail} failed ====`);
if (fail > 0) process.exit(1);
