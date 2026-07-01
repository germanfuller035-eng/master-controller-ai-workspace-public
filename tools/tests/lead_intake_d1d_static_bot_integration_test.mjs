/**
 * lead_intake_d1d_static_bot_integration_test.mjs
 *
 * Daily Lead Factory — D1d — STATIC / OFFLINE Bot Integration Test
 *
 * Source plan:
 *   - 03_sop/lead_intake_d1d_static_integration_test_plan.md
 *   - 03_sop/lead_intake_d1d_bot_integration_patch_plan.md
 *   - 03_sop/lead_intake_d1d_bot_integration_contract.md
 *
 * PURPOSE
 *   A STATIC, OFFLINE test that prepares for a FUTURE, controlled integration
 *   of the D1 Lead Intake adapter into telegram_master_bot.mjs.
 *
 *   This test does NOT require the integration patch to already exist. It must:
 *     1. Inspect the current PRE-PATCH status.
 *     2. Report that D1 integration is currently NOT_PRESENT / EXPECTED_BEFORE_PATCH.
 *     3. NOT fail (turn red) merely because the patch has not been applied yet.
 *     4. Verify the safety invariants of the existing D1 standalone modules.
 *
 * HARD SAFETY (this test):
 *   - Reads files only. Writes nothing. Modifies no source.
 *   - No network / Telegram API / email / SMTP / VPS.
 *   - Does NOT read .env / AI_SECRETS.
 *   - Does NOT touch 13_sales real data.
 *   - Does NOT modify telegram_master_bot.mjs or russian_command_router.mjs.
 *
 * OUTPUT:
 *   - passed count
 *   - failed count
 *   - integration_status: NOT_PRESENT_PRE_PATCH | PRESENT_SAFE | PRESENT_UNSAFE
 *   - clear message about pre-patch expectation
 *
 * Exit code: 0 when there are no hard failures (pre-patch absence is NOT a failure).
 */

'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Paths (resolved relative to this test file — no hardcoded absolute paths)
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// tools/tests -> tools/telegram_gateway
const GATEWAY_DIR = path.resolve(__dirname, '..', 'telegram_gateway');

const FILES = Object.freeze({
  bot: path.join(GATEWAY_DIR, 'telegram_master_bot.mjs'),
  adapter: path.join(GATEWAY_DIR, 'lead_intake_bot_adapter.mjs'),
  router: path.join(GATEWAY_DIR, 'lead_intake_router.mjs'),
  commands: path.join(GATEWAY_DIR, 'lead_intake_commands.mjs'),
  russianRouter: path.join(GATEWAY_DIR, 'russian_command_router.mjs'),
});

// ---------------------------------------------------------------------------
// Tiny test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const results = [];

/**
 * Hard assertion: a real requirement. A false condition increments `failed`.
 */
function check(name, condition, detail = '') {
  const ok = condition === true;
  if (ok) passed += 1;
  else failed += 1;
  results.push({ name, ok, kind: 'check', detail });
  const tag = ok ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

/**
 * Tolerant / informational check. Passing is recorded; an expected pre-patch
 * "absence" is reported as PASS with an INFO note (it must NOT turn the suite
 * red before the controlled patch is applied).
 */
function expectPrePatch(name, condition, detail = '') {
  const ok = condition === true;
  // Pre-patch checks always count as passed (expected state). They never fail.
  passed += 1;
  results.push({ name, ok, kind: 'pre_patch', detail });
  const tag = ok ? 'PRESENT' : 'EXPECTED_BEFORE_PATCH';
  console.log(`[INFO ] ${name} — ${tag}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

// ---------------------------------------------------------------------------
// Source loading helpers (read-only)
// ---------------------------------------------------------------------------

function exists(p) {
  try {
    return fs.existsSync(p) && fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function readSafe(p) {
  try {
    if (!exists(p)) return '';
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

/**
 * Collect the set of module specifiers imported by a source file
 * (ES `import ... from '...'` and dynamic `import('...')`).
 */
function collectImports(src) {
  const specs = [];
  const reStatic = /import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  const reDynamic = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = reStatic.exec(src)) !== null) specs.push(m[1]);
  while ((m = reDynamic.exec(src)) !== null) specs.push(m[1]);
  return specs;
}

// ---------------------------------------------------------------------------
// Load all sources up-front (read-only snapshot)
// ---------------------------------------------------------------------------

const SRC = {
  bot: readSafe(FILES.bot),
  adapter: readSafe(FILES.adapter),
  router: readSafe(FILES.router),
  commands: readSafe(FILES.commands),
  russianRouter: readSafe(FILES.russianRouter),
};

/**
 * Strip JS comments (block + line) so that "negative" safety scans inspect
 * real executable code, not documentation. Module docstrings legitimately
 * describe what the module does NOT do (e.g. "does NOT import SMTP / .env /
 * VPS"); those sentences must not be mistaken for actual unsafe code.
 * String-literal contents are preserved (conservative for negative scans).
 */
function stripComments(src) {
  if (typeof src !== 'string' || src === '') return '';
  // Remove block comments first, then line comments.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

// Code-only views (comments removed) for negative safety scans.
const CODE = {
  adapter: stripComments(SRC.adapter),
  router: stripComments(SRC.router),
  commands: stripComments(SRC.commands),
};

const adapterImports = collectImports(SRC.adapter);


// Patterns used for safety scans.
const TELEGRAM_API_PATTERNS = [
  /api\.telegram\.org/i,
  /node-telegram-bot-api/i,
  /telegraf/i,
  /grammy/i,
];
const EMAIL_SMTP_PATTERNS = [
  /nodemailer/i,
  /\bsmtp\b/i,
  /createTransport/i,
  /imapflow/i,
];
const ENRICHMENT_PATTERNS = [
  /contact_enrichment/i,
  /contact_enrich/i,
];
const SECRETS_PATTERNS = [
  /AI_SECRETS/i,
  /\.env\b/i,
  /dotenv/i,
];
const VPS_PATTERNS = [
  /\bssh\b/i,
  /\bscp\b/i,
  /\brsync\b/i,
  /\bvps\b/i,
  /\bdeploy\b/i,
  /child_process/i,
  /execSync/i,
];
// "Real write into 13_sales" — a write call whose target path mentions 13_sales.
const SALES_WRITE_PATTERNS = [
  /writeFileSync\s*\([^)]*13_sales/i,
  /writeFile\s*\([^)]*13_sales/i,
  /appendFileSync\s*\([^)]*13_sales/i,
  /createWriteStream\s*\([^)]*13_sales/i,
];

function noneMatch(src, patterns) {
  return !patterns.some((re) => re.test(src));
}

// ---------------------------------------------------------------------------
// SECTION 1 — PRE-PATCH structural checks (1–12)
// ---------------------------------------------------------------------------

console.log('\n=== PRE-PATCH STRUCTURE CHECKS ===');

// 1
check('01 telegram_master_bot.mjs exists', exists(FILES.bot), FILES.bot);
// 2
check('02 lead_intake_bot_adapter.mjs exists', exists(FILES.adapter), FILES.adapter);
// 3
check('03 lead_intake_router.mjs exists', exists(FILES.router), FILES.router);
// 4
check('04 lead_intake_commands.mjs exists', exists(FILES.commands), FILES.commands);
// 5
check(
  '05 /ping route exists in telegram_master_bot.mjs',
  /['"]\/ping['"]|===\s*['"]\/ping['"]|tlClean\s*===\s*['"]\/ping['"]/.test(SRC.bot) || /\/ping/.test(SRC.bot),
);
// 6 — health handler is OPTIONAL ("if present"): tolerant.
expectPrePatch(
  '06 /health route or health handler present (optional)',
  /cmd\s*===\s*['"]\/health['"]|['"]\/health['"]/.test(SRC.bot),
);
// 7
check(
  '07 approval command handler exists',
  /handleApprovalCommand/.test(SRC.bot),
);
// 8
check(
  '08 lead contact handler exists',
  /handleLeadContactCommand/.test(SRC.bot),
);
// 9
check(
  '09 contact enrichment handler exists',
  /handleLeadContactEnrichmentCommand/.test(SRC.bot),
);
// 10
check(
  '10 broad fallback / NL fallback exists',
  /handleTextNL|NL\s*Router\s*fallback|routeCommand\s*\(/i.test(SRC.bot),
);
// 11
check('11 russian_command_router.mjs exists', exists(FILES.russianRouter), FILES.russianRouter);

// 12 — D1 adapter integration may currently be NOT_PRESENT — NOT a fail.
const BOT_HAS_ADAPTER_IMPORT =
  /lead_intake_bot_adapter/.test(SRC.bot) || /handleLeadIntakeBotMessage/.test(SRC.bot);
expectPrePatch(
  '12 D1 adapter integration present in bot (NOT required pre-patch)',
  BOT_HAS_ADAPTER_IMPORT,
  BOT_HAS_ADAPTER_IMPORT ? 'integration detected' : 'NOT_PRESENT — expected before patch',
);

// ---------------------------------------------------------------------------
// SECTION 2 — SAFETY SOURCE SCAN (13–26)
// ---------------------------------------------------------------------------

console.log('\n=== SAFETY SOURCE SCAN ===');

// 13 — adapter imports only lead_intake_router.mjs (its single relative import).
const adapterRelImports = adapterImports.filter((s) => s.startsWith('.'));
check(
  '13 adapter imports only lead_intake_router.mjs',
  adapterRelImports.length === 1 && /lead_intake_router\.mjs$/.test(adapterRelImports[0]),
  `relative imports: ${JSON.stringify(adapterRelImports)}`,
);
// 14 — adapter does NOT import lead_intake_commands.mjs directly.
check(
  '14 adapter does not import lead_intake_commands.mjs directly',
  !adapterImports.some((s) => /lead_intake_commands/.test(s)),
);
// 15 — adapter does not import Telegram API.
check(
  '15 adapter does not import/use Telegram API',
  noneMatch(SRC.adapter, TELEGRAM_API_PATTERNS),
);
// 16 — adapter does not import email/SMTP.
check(
  '16 adapter does not import email/SMTP',
  noneMatch(CODE.adapter, EMAIL_SMTP_PATTERNS),
);

// 17 — adapter does not import contact enrichment.
check(
  '17 adapter does not import contact enrichment',
  !adapterImports.some((s) => ENRICHMENT_PATTERNS.some((re) => re.test(s))),
);
// 18 — adapter does not read .env / AI_SECRETS.
check(
  '18 adapter does not read .env / AI_SECRETS',
  noneMatch(CODE.adapter, SECRETS_PATTERNS),
);

// 19 — adapter does not write 13_sales.
check(
  '19 adapter does not write 13_sales',
  noneMatch(SRC.adapter, SALES_WRITE_PATTERNS),
);
// 20 — adapter contains should_send_to_client=false.
check(
  '20 adapter pins should_send_to_client=false',
  /should_send_to_client\s*:\s*false/.test(SRC.adapter),
);
// 21 — adapter contains real_write_allowed=false.
check(
  '21 adapter pins real_write_allowed=false',
  /real_write_allowed\s*:\s*false/.test(SRC.adapter),
);
// 22 — adapter contains auto_send BLOCKED.
check(
  '22 adapter keeps auto_send BLOCKED',
  /auto_send\s*[:=]\s*['"]?BLOCKED['"]?/.test(SRC.adapter) || /auto_send=BLOCKED/.test(SRC.adapter),
);
// 23 — adapter keeps commit_approved BLOCKED.
check(
  '23 adapter keeps commit_approved BLOCKED',
  /commit_approved\s*:\s*['"]BLOCKED['"]/.test(SRC.adapter) || /COMMIT_BLOCKED/.test(SRC.adapter),
);
// 24 — router does not write 13_sales.
check(
  '24 router does not write 13_sales',
  noneMatch(SRC.router, SALES_WRITE_PATTERNS),
);
// 25 — commands do not send email/SMTP.
check(
  '25 commands do not send email/SMTP',
  noneMatch(CODE.commands, EMAIL_SMTP_PATTERNS),
);
// 26 — no VPS/ssh/deploy patterns in adapter/router/commands.
check(
  '26 no VPS/ssh/deploy patterns in adapter/router/commands',
  noneMatch(CODE.adapter, VPS_PATTERNS)
    && noneMatch(CODE.router, VPS_PATTERNS)
    && noneMatch(CODE.commands, VPS_PATTERNS),
);


// ---------------------------------------------------------------------------
// SECTION 3 — FUTURE PATCH expectations (27–40)
// ---------------------------------------------------------------------------
//
// These are conditional. They only become hard assertions IF the integration
// patch is present. Before the patch they are reported as EXPECTED_BEFORE_PATCH
// and never turn the suite red.
// ---------------------------------------------------------------------------

console.log('\n=== FUTURE PATCH EXPECTATIONS ===');

const INTEGRATION_PRESENT = BOT_HAS_ADAPTER_IMPORT;

// Helper: an index-or-(-1) locator in the bot source.
function idx(re) {
  const m = re.exec(SRC.bot);
  return m ? m.index : -1;
}

if (!INTEGRATION_PRESENT) {
  // Pre-patch: record every future expectation as expected-before-patch.
  expectPrePatch('27 bot imports handleLeadIntakeBotMessage', false, 'NOT_PRESENT');
  expectPrePatch('28 D1 guard after /ping & health', false, 'NOT_PRESENT');
  expectPrePatch('29 D1 guard after approval/contact/enrichment handlers', false, 'NOT_PRESENT');
  expectPrePatch('30 D1 guard before broad NL fallback', false, 'NOT_PRESENT');
  expectPrePatch('31 D1 guard passes options.mode = D1_SAFE_LIVE', false, 'NOT_PRESENT');
  expectPrePatch('32 D1 guard passes enableRussianAliases=false', false, 'NOT_PRESENT');
  expectPrePatch('33 D1 guard passes allowRealWrite=false', false, 'NOT_PRESENT');
  expectPrePatch('34 D1 guard passes confirmRealWrite=false', false, 'NOT_PRESENT');
  expectPrePatch('35 D1 guard stops routing when result.handled===true', false, 'NOT_PRESENT');
  expectPrePatch('36 D1 guard continues routing when result.handled===false', false, 'NOT_PRESENT');
  expectPrePatch('37 D1 guard does not send to client', false, 'NOT_PRESENT');
  expectPrePatch('38 D1 guard does not call Telegram API directly', false, 'NOT_PRESENT');
  expectPrePatch('39 D1 guard does not write real data', false, 'NOT_PRESENT');
  expectPrePatch('40 patch preserves russian_command_router.mjs untouched', true,
    'russian_command_router.mjs present & not modified by this test');
} else {
  // Post-patch: enforce the real integration contract.

  // 27 — import exists.
  check(
    '27 bot imports handleLeadIntakeBotMessage',
    /handleLeadIntakeBotMessage/.test(SRC.bot)
      && /lead_intake_bot_adapter/.test(SRC.bot),
  );

  const idxPing = idx(/['"]\/ping['"]/);
  const idxHealth = idx(/['"]\/health['"]/);
  const idxApproval = idx(/handleApprovalCommand/);
  const idxContact = idx(/handleLeadContactCommand/);
  const idxEnrich = idx(/handleLeadContactEnrichmentCommand/);
  const idxGuard = idx(/handleLeadIntakeBotMessage/);
  const idxFallback = idx(/handleTextNL|routeCommand\s*\(/);

  // 28 — D1 guard after /ping / health.
  check(
    '28 D1 guard after /ping & health',
    idxGuard > -1 && idxGuard > idxPing && (idxHealth === -1 || idxGuard > idxHealth),
  );
  // 29 — D1 guard after approval/contact/enrichment handlers.
  check(
    '29 D1 guard after approval/contact/enrichment handlers',
    idxGuard > -1
      && (idxApproval === -1 || idxGuard > idxApproval)
      && (idxContact === -1 || idxGuard > idxContact)
      && (idxEnrich === -1 || idxGuard > idxEnrich),
  );
  // 30 — D1 guard before broad NL fallback.
  check(
    '30 D1 guard before broad NL fallback',
    idxGuard > -1 && (idxFallback === -1 || idxGuard < idxFallback),
  );
  // 31 — options.mode = D1_SAFE_LIVE.
  check(
    '31 D1 guard passes options.mode = D1_SAFE_LIVE',
    /mode\s*:\s*['"]D1_SAFE_LIVE['"]/.test(SRC.bot),
  );
  // 32 — enableRussianAliases=false.
  check(
    '32 D1 guard passes enableRussianAliases=false',
    /enableRussianAliases\s*:\s*false/.test(SRC.bot),
  );
  // 33 — allowRealWrite=false.
  check(
    '33 D1 guard passes allowRealWrite=false',
    /allowRealWrite\s*:\s*false/.test(SRC.bot),
  );
  // 34 — confirmRealWrite=false.
  check(
    '34 D1 guard passes confirmRealWrite=false',
    /confirmRealWrite\s*:\s*false/.test(SRC.bot),
  );
  // 35 — stop routing when handled===true.
  check(
    '35 D1 guard stops routing when result.handled===true',
    /\.handled\s*===\s*true/.test(SRC.bot) || /if\s*\(\s*\w+\.handled\s*\)/.test(SRC.bot),
  );
  // 36 — continue routing when handled===false.
  check(
    '36 D1 guard continues routing when result.handled===false',
    /\.handled\s*===\s*false/.test(SRC.bot) || /!\s*\w+\.handled/.test(SRC.bot),
  );
  // 37 — must not send to client (no should_send_to_client=true near guard).
  check(
    '37 D1 guard does not send to client',
    !/should_send_to_client\s*:\s*true/.test(SRC.bot),
  );
  // 38 — must not call Telegram API directly inside the adapter (adapter clean).
  check(
    '38 D1 guard does not call Telegram API directly (adapter clean)',
    noneMatch(SRC.adapter, TELEGRAM_API_PATTERNS),
  );
  // 39 — must not write real data (adapter never writes 13_sales).
  check(
    '39 D1 guard does not write real data',
    noneMatch(SRC.adapter, SALES_WRITE_PATTERNS)
      && /real_write_allowed\s*:\s*false/.test(SRC.adapter),
  );
  // 40 — russian_command_router.mjs must remain present (untouched by this patch).
  check(
    '40 patch preserves russian_command_router.mjs (present)',
    exists(FILES.russianRouter),
  );
}

// ---------------------------------------------------------------------------
// INTEGRATION STATUS DETERMINATION
// ---------------------------------------------------------------------------

let integration_status;
if (!INTEGRATION_PRESENT) {
  integration_status = 'NOT_PRESENT_PRE_PATCH';
} else {
  // Present: classify SAFE vs UNSAFE based on the future-patch hard checks.
  const futureChecks = results.filter(
    (r) => r.kind === 'check' && /^(2[789]|3\d|40)\s/.test(r.name),
  );
  const anyUnsafe = futureChecks.some((r) => !r.ok);
  integration_status = anyUnsafe ? 'PRESENT_UNSAFE' : 'PRESENT_SAFE';
}

// ---------------------------------------------------------------------------
// SUMMARY
// ---------------------------------------------------------------------------

const PRE_PATCH_MESSAGE =
  'D1d bot integration patch is not present yet; this is expected before controlled patch.';

console.log('\n=== SUMMARY ===');
console.log(`passed: ${passed}`);
console.log(`failed: ${failed}`);
console.log(`integration_status: ${integration_status}`);
if (integration_status === 'NOT_PRESENT_PRE_PATCH') {
  console.log(`message: ${PRE_PATCH_MESSAGE}`);
} else if (integration_status === 'PRESENT_SAFE') {
  console.log('message: D1d bot integration is present and passes all safety invariants.');
} else {
  console.log('message: D1d bot integration is present but FAILED one or more safety invariants. Review required.');
}

// Machine-readable line for downstream tooling.
console.log(
  `RESULT_JSON: ${JSON.stringify({
    passed,
    failed,
    integration_status,
    pre_patch_expected: integration_status === 'NOT_PRESENT_PRE_PATCH',
    message: PRE_PATCH_MESSAGE,
  })}`,
);

// ---------------------------------------------------------------------------
// EXIT CODE
//   - Pre-patch absence is NOT a failure (suite must not go red before patch).
//   - Only real hard-check failures (e.g. broken safety invariant) fail the run.
// ---------------------------------------------------------------------------

process.exit(failed === 0 ? 0 : 1);
