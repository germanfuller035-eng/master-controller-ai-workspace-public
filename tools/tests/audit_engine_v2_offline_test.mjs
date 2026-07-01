// audit_engine_v2_offline_test.mjs
// ============================================================
// Offline regression test for the PURE audit engine (Block D-v2).
// No network. Runs runSiteAudit() over saved HTML fixtures and asserts
// the v2 contract: exactly 3 template-ready issues, correct risk levels,
// graceful degradation, and fixed 10000 offer.
// ============================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runSiteAudit, RECOMMENDED_OFFER, CHECK_PRIORITY } from '../telegram_gateway/audit_engine_v2.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, 'fixtures');

let failures = 0;
function check(name, cond) {
    if (cond) {
        console.log(`  ok  - ${name}`);
    } else {
        console.log(`  FAIL- ${name}`);
        failures++;
    }
}

function assertIssuesShape(report, label) {
    check(`${label}: issues is array of length 3`, Array.isArray(report.issues) && report.issues.length === 3);
    check(`${label}: all issues are non-empty strings`,
        report.issues.every((s) => typeof s === 'string' && s.trim().length > 3));
    check(`${label}: recommended_offer === ${RECOMMENDED_OFFER}`, report.recommended_offer === RECOMMENDED_OFFER);
    check(`${label}: risk is low|medium|high`, ['low', 'medium', 'high'].includes(report.risk));
    check(`${label}: checks has all 5 keys`,
        CHECK_PRIORITY.every((k) => report.checks && report.checks[k] && typeof report.checks[k].ok === 'boolean'));
}

console.log('audit_engine_v2_offline_test');

// --- 1. Good ЖБИ site: should pass most checks, low risk -----------------
const goodHtml = readFileSync(join(FIX, 'audit_sample_jbi.html'), 'utf8');
const good = runSiteAudit({ html: goodHtml, site: 'zb23.ru', niche: 'jbi' });
console.log('\n[good jbi site]');
assertIssuesShape(good, 'good');
check('good: not degraded', good.degraded === false);
check('good: niche resolved to jbi', good.niche === 'jbi');
check('good: first_screen ok', good.checks.first_screen.ok === true);
check('good: path_to_lead ok', good.checks.path_to_lead.ok === true);
check('good: trust ok', good.checks.trust.ok === true);
check('good: cta ok', good.checks.cta.ok === true);
check('good: mobile_basic ok', good.checks.mobile_basic.ok === true);
check('good: risk is low', good.risk === 'low');

// --- 2. Weak site: most checks fail, high risk ---------------------------
const weakHtml = readFileSync(join(FIX, 'audit_sample_weak.html'), 'utf8');
const weak = runSiteAudit({ html: weakHtml, site: 'weak-example.ru', niche: 'jbi' });
console.log('\n[weak site]');
assertIssuesShape(weak, 'weak');
check('weak: not degraded (html present)', weak.degraded === false);
check('weak: path_to_lead fails', weak.checks.path_to_lead.ok === false);
check('weak: trust fails', weak.checks.trust.ok === false);
check('weak: mobile_basic fails (no viewport)', weak.checks.mobile_basic.ok === false);
const weakFailed = CHECK_PRIORITY.filter((k) => !weak.checks[k].ok).length;
check('weak: risk high when >=3 fail', weakFailed >= 3 ? weak.risk === 'high' : true);
check('weak: issue[0] mentions a real remediation', /[а-я]/i.test(weak.issues[0]));

// --- 3. Degraded path: empty html ----------------------------------------
const degraded = runSiteAudit({ html: '', site: 'unreachable.ru', niche: 'jbi' });
console.log('\n[degraded empty html]');
assertIssuesShape(degraded, 'degraded');
check('degraded: degraded flag true', degraded.degraded === true);
check('degraded: risk medium', degraded.risk === 'medium');

// --- 4. Missing input is safe (no throw) ---------------------------------
console.log('\n[no input]');
let threw = false;
let empty;
try { empty = runSiteAudit(); } catch (e) { threw = true; }
check('no-input: does not throw', threw === false);
check('no-input: still 3 issues', empty && empty.issues.length === 3);
check('no-input: site default placeholder', empty && empty.site === 'ваш сайт');

// --- 5. Slot punctuation matches template style --------------------------
console.log('\n[punctuation]');
check('issues[0] ends with ;', /;$/.test(good.issues[0]) || /\.$/.test(good.issues[0]));
check('issues[2] ends with .', /\.$/.test(good.issues[2]));

console.log('');
if (failures > 0) {
    console.log(`RESULT: FAIL (${failures} failed assertions)`);
    process.exit(1);
} else {
    console.log('RESULT: PASS');
    process.exit(0);
}
