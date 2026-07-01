// audit_run_offline_test.mjs
// ============================================================
// Offline test for the audit_run orchestrator (Block D-v2).
// Injects HTML so NO network is touched. Verifies command parsing,
// report shape, degraded path, and the "analysis not send" wording.
// ============================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
    classifyAuditRun,
    runAudit,
    formatAuditReport,
    handleAuditRun,
} from '../telegram_gateway/audit_run.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, 'fixtures');

let failures = 0;
function check(name, cond) {
    if (cond) console.log(`  ok  - ${name}`);
    else { console.log(`  FAIL- ${name}`); failures++; }
}

console.log('audit_run_offline_test');

// --- 1. Command classification ------------------------------------------
console.log('\n[classify]');
check('classify /audit_run zb23.ru -> site', classifyAuditRun('/audit_run zb23.ru').site === 'zb23.ru');
check('classify /audit_run top1 -> target top1', classifyAuditRun('/audit_run top1').target === 'top1');
check('classify /audit_run (bare) -> top1', classifyAuditRun('/audit_run').target === 'top1');
check('classify junk -> null', classifyAuditRun('/sales_next') === null);
check('classify null -> null', classifyAuditRun(null) === null);

// --- 2. runAudit with injected html (no network) -------------------------
console.log('\n[runAudit injected html]');
const goodHtml = readFileSync(join(FIX, 'audit_sample_jbi.html'), 'utf8');
const rep = await runAudit({ site: 'zb23.ru', html: goodHtml, niche: 'jbi' });
check('fetch_status injected (no network)', rep.fetch_status === 'injected');
check('issues length 3', rep.issues.length === 3);
check('offer 10000', rep.recommended_offer === 10000);
check('normalized_url has https', /^https:\/\//.test(rep.normalized_url));
check('not degraded', rep.degraded === false);

// --- 3. degraded path (empty injected html) ------------------------------
console.log('\n[runAudit degraded]');
const deg = await runAudit({ site: 'x.ru', html: '', niche: 'jbi' });
check('degraded true on empty html', deg.degraded === true);
check('still 3 issues', deg.issues.length === 3);

// --- 4. formatAuditReport wording ----------------------------------------
console.log('\n[format]');
const text = formatAuditReport(rep);
check('mentions site', text.includes('zb23.ru'));
check('shows 3 проблемы', text.includes('3 проблемы'));
check('shows 10000 ₽', text.includes('10000 ₽'));
check('clearly states NOT a send', /НЕ отправк/i.test(text));
check('points to /sales_next for real send', text.includes('/sales_next'));

// --- 5. handleAuditRun end-to-end (injected) -----------------------------
console.log('\n[handleAuditRun]');
const h = await handleAuditRun('/audit_run zb23.ru', { html: goodHtml, niche: 'jbi' });
check('ok true', h.ok === true);
check('report attached', h.report && h.report.issues.length === 3);
const noSite = await handleAuditRun('/audit_run top1', {});
check('top1 without site asks for site', noSite.ok === false);
check('non-audit command -> null', (await handleAuditRun('/ping', {})) === null);

console.log('');
if (failures > 0) { console.log(`RESULT: FAIL (${failures})`); process.exit(1); }
console.log('RESULT: PASS');
process.exit(0);
