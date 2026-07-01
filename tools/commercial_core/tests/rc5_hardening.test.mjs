// tools/commercial_core/tests/rc5_hardening.test.mjs
// Tests for the deterministic, network-free parts of the RC5 hardening wave: owner settings limits,
// domain reservoir filters/score, AI usage reconciliation provenance. (Radar/preview live in the
// API layer and are covered by the on-VPS API suite.)
import { economicScore, hostAllowed, classifyProbe, RESERVOIR_STATES } from '../../mater_controller_api/src/commercial/domain_reservoir.mjs';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('FAIL', n); } };

// ---- domain reservoir filters ----
ok('DR1 .ru allowed', hostAllowed('stroy-beton.ru') === true);
ok('DR2 .рф allowed', hostAllowed('завод.рф') === true);
ok('DR3 .com rejected', hostAllowed('example.com') === false);
ok('DR4 vk excluded', hostAllowed('vk.com') === false);
ok('DR5 avito excluded', hostAllowed('shop.avito.ru') === false);
ok('DR6 parked excluded', hostAllowed('parked-domain.ru') === false);
ok('DR7 empty rejected', hostAllowed('') === false);

// ---- economic score ----
ok('ES1 full score audit candidate', economicScore({ business_verified: true, niche_match: true, region_match: true, website_alive: true, visible_conversion_problem: true, verified_contact: true, business_activity_signal: true, product_fit: true }).band === 'AUDIT_CANDIDATE');
ok('ES2 empty rejects', economicScore({}).band === 'REJECT');
ok('ES3 mid band reservoir', (() => { const r = economicScore({ business_verified: true, niche_match: true, website_alive: true }); return r.score === 45 && r.band === 'RESERVOIR'; })());

// ---- probe classifier ----
ok('PR1 dead site rejected', classifyProbe({ dns_ok: false }).state === 'REJECTED');
ok('PR2 alive only', classifyProbe({ dns_ok: true, http_status: 200 }).state === 'TECHNICALLY_ALIVE');
ok('PR3 business identified', classifyProbe({ dns_ok: true, http_status: 200, title: 'ООО Бетон' }).state === 'BUSINESS_IDENTIFIED');
ok('PR4 contact verified', classifyProbe({ dns_ok: true, http_status: 200, title: 'ООО Бетон', email_links: 1 }).state === 'CONTACT_VERIFIED');

// ---- reservoir states present ----
ok('RS1 states include canonical promotion', RESERVOIR_STATES.includes('PROMOTED_TO_CANONICAL'));
ok('RS2 states include reject', RESERVOIR_STATES.includes('REJECTED'));

console.log(`\n==== rc5_hardening: ${pass} passed, ${fail} failed ====`);
if (fail > 0) process.exit(1);
