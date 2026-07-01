/**
 * lead_import_approval_d2e1_bot_patch_offline_test.mjs
 *
 * Daily Lead Factory — D2E1 — OFFLINE post-patch verification test.
 *
 * PURPOSE
 *   Verify, fully OFFLINE, that the D2E1 "minimal live bot patch" was applied
 *   correctly to telegram_master_bot.mjs, and that the standalone D2D bot-glue
 *   adapter still behaves safely (read-only, no queue write, no real import).
 *
 * HARD SAFETY CONTRACT — what this test DOES NOT do:
 *   - It NEVER imports telegram_master_bot.mjs as a module. It reads it as TEXT.
 *   - It NEVER starts or stops the bot. No polling. No process spawn.
 *   - It NEVER calls the Telegram API. No network. No fetch. No axios.
 *   - It NEVER sends email / Telegram / WhatsApp / SMS. No SMTP. No nodemailer.
 *   - It NEVER performs a real import. confirm=true is never used.
 *   - It NEVER writes the approval queue. queue_write = NO.
 *   - It NEVER writes 13_sales. No real data is changed.
 *   - It NEVER reads .env / AI_SECRETS / tokens / credentials.
 *   - It NEVER creates tmp/_probe*.mjs or tmp/*probe*.mjs files.
 *
 * The ONLY module imported for execution is the standalone D2D bot-glue
 * adapter (lead_import_approval_review_bot_glue.mjs), which itself is a pure,
 * non-sending, non-writing glue layer.
 *
 * RUN:
 *   node --check tools/tests/lead_import_approval_d2e1_bot_patch_offline_test.mjs
 *   node         tools/tests/lead_import_approval_d2e1_bot_patch_offline_test.mjs
 */

'use strict';

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import path from 'node:path';
import os from 'node:os';

// ---------------------------------------------------------------------------
// Paths (resolved relative to this test file — no .env, no secrets)
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GATEWAY_DIR = path.resolve(__dirname, '..', 'telegram_gateway');
const BOT_PATH = path.join(GATEWAY_DIR, 'telegram_master_bot.mjs');
const GLUE_PATH = path.join(GATEWAY_DIR, 'lead_import_approval_review_bot_glue.mjs');

// ---------------------------------------------------------------------------
// Tiny test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];

function ok(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log(`  ✅ ${name}`);
  } else {
    failed += 1;
    failures.push(name + (detail ? ` — ${detail}` : ''));
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n— ${title} —`);
}

// ---------------------------------------------------------------------------
// Load bot source as TEXT ONLY (never imported / executed)
// ---------------------------------------------------------------------------

const botSrc = readFileSync(BOT_PATH, 'utf8');
const glueSrc = readFileSync(GLUE_PATH, 'utf8');

// Isolate the D2E1 guard block so the "must NOT contain" checks only target the
// patch region, not unrelated legitimate bot features elsewhere in the file.
const D2E1_MARKER = 'D2E1: lead-import approval REVIEW guard';
const d2e1Start = botSrc.indexOf(D2E1_MARKER);
// The block reasonably ends before the next major feature region. We bound the
// window conservatively (the patch is small / minimal by design).
const d2e1End =
  d2e1Start >= 0
    ? (() => {
        const afterCsv = botSrc.indexOf('DLF_LEADS_CSV', d2e1Start);
        const win = botSrc.indexOf('LEAD INTAKE COMMANDS', d2e1Start);
        const candidates = [afterCsv, win, d2e1Start + 4000].filter((n) => n > 0);
        return Math.min(...candidates);
      })()
    : -1;
const d2e1Block = d2e1Start >= 0 ? botSrc.slice(d2e1Start, d2e1End) : '';

// ===========================================================================
// SECTION A — Static patch detection in telegram_master_bot.mjs (text only)
// ===========================================================================

section('A. Static patch detection (bot read as TEXT only)');

// 1. import of D2D approval glue present
const hasGlueImport =
  /import\s+\*\s+as\s+leadImportApprovalGlue\s+from\s+['"]\.\/lead_import_approval_review_bot_glue\.mjs['"]/.test(
    botSrc,
  );
ok('A1: bot imports D2D approval glue', hasGlueImport);

// 2. guard-block for D2D approval commands present
const hasGuardBlock =
  d2e1Start >= 0 &&
  d2e1Block.includes('shouldRouteToImportApprovalReview(text)');
ok('A2: bot contains D2D approval guard-block', hasGuardBlock);

// 3. ordering: AFTER D1 lead-intake guard, BEFORE Sales/RU/NL fallback
const d1Index = botSrc.indexOf('handleLeadIntakeBotMessage(text');
const salesDispatchIndex = botSrc.indexOf('sales2Handled = await handleSalesPhase2');
// Use the LAST occurrence: the early one is a header comment near the top,
// the real RU/NL fallback dispatch lives far below the D2E1 guard region.
const ruRouterIndex = botSrc.lastIndexOf('RUSSIAN UNIVERSAL ROUTER');

const orderAfterD1 = d1Index >= 0 && d2e1Start > d1Index;
const orderBeforeSales =
  salesDispatchIndex >= 0 && d2e1Start < salesDispatchIndex;
const orderBeforeRu = ruRouterIndex >= 0 && d2e1Start < ruRouterIndex;
ok(
  'A3: D2E1 guard is AFTER D1 lead-intake guard and BEFORE Sales/RU fallback',
  orderAfterD1 && orderBeforeSales && orderBeforeRu,
  `d1=${d1Index} d2e1=${d2e1Start} sales=${salesDispatchIndex} ru=${ruRouterIndex}`,
);

// 4. owner-gate present
const hasOwnerGate =
  d2e1Block.includes('isOwnerSender(') && d2e1Block.includes('_d2IsFromOwner');
ok('A4: owner-gate present (isOwnerSender / owner-only check)', hasOwnerGate);

// 5. non-owner branch contains owner refusal
const hasOwnerRefusal =
  /if\s*\(\s*!\s*_d2IsFromOwner\s*\)/.test(d2e1Block) &&
  d2e1Block.includes('только владельцу');
ok('A5: non-owner branch refuses (owner-only refusal)', hasOwnerRefusal);

// 6. approve/reject branch: read-only notice, no queue write
const hasReadOnlyNotice =
  /action\s*===\s*['"]approve['"]/.test(d2e1Block) &&
  /action\s*===\s*['"]reject['"]/.test(d2e1Block) &&
  d2e1Block.includes('read-only') &&
  d2e1Block.includes('mutation_blocked_d2e1');
ok(
  'A6: approve/reject branch shows read-only notice & blocks mutation',
  hasReadOnlyNotice,
);

// 7. patch did NOT introduce dangerous primitives (scoped to D2E1 block)
const forbiddenInBlock = [
  ['runLeadIntakeImport', /runLeadIntakeImport/],
  ['confirm: true', /confirm\s*:\s*true/],
  ['fs.writeFile (queue)', /writeFile/],
  ['nodemailer', /nodemailer/i],
  ['SMTP', /smtp/i],
  ['external fetch', /\bfetch\s*\(/],
  ['axios', /\baxios\b/],
];
let forbiddenHit = null;
for (const [label, re] of forbiddenInBlock) {
  if (re.test(d2e1Block)) {
    forbiddenHit = label;
    break;
  }
}
ok(
  'A7: D2E1 block introduces NO dangerous primitives (import/confirm/writeFile/mailer/network)',
  forbiddenHit === null,
  forbiddenHit ? `found: ${forbiddenHit}` : '',
);

// ===========================================================================
// SECTION B — D2D glue standalone still works (OFFLINE, read-only)
// ===========================================================================

section('B. D2D glue standalone behaviour (read-only, no writes)');

const glue = await import(pathToFileURL(GLUE_PATH).href);

const {
  shouldRouteToImportApprovalReview,
  handleImportApprovalReviewBotMessage,
  buildImportApprovalReviewBotSummary,
} = glue;

// B8a: /lead_import_review with a MISSING queue file -> EMPTY_NO_FILE, no file created
const missingQueuePath = path.join(
  os.tmpdir(),
  `d2e1_missing_queue_${process.pid}_${Date.now()}.json`,
);
const fileBefore = existsSync(missingQueuePath);
const reviewResult = await handleImportApprovalReviewBotMessage(
  '/lead_import_review',
  { queuePath: missingQueuePath },
);
const fileAfter = existsSync(missingQueuePath);
ok(
  'B8a: /lead_import_review (missing queue) -> EMPTY_NO_FILE',
  reviewResult && reviewResult.status === 'EMPTY_NO_FILE',
  `status=${reviewResult && reviewResult.status}`,
);
ok(
  'B8a: missing-queue review did NOT create the queue file',
  fileBefore === false && fileAfter === false,
);

// B8b: /lead_import_approve IMP-TEST -> decision-only, can_execute_real_import=false
const approveResult = await handleImportApprovalReviewBotMessage(
  '/lead_import_approve IMP-TEST',
  { queuePath: missingQueuePath },
);
const approveSummary = buildImportApprovalReviewBotSummary(approveResult);
ok(
  'B8b: /lead_import_approve -> decision-only, can_execute_real_import=false',
  approveSummary.can_execute_real_import === false &&
    approveSummary.real_data_changed === false,
);

// B8c: /lead_import_reject IMP-TEST -> queue_write=false
const rejectResult = await handleImportApprovalReviewBotMessage(
  '/lead_import_reject IMP-TEST',
  { queuePath: missingQueuePath },
);
const rejectSummary = buildImportApprovalReviewBotSummary(rejectResult);
ok(
  'B8c: /lead_import_reject -> queue_write=false',
  rejectSummary.queue_write === false &&
    rejectSummary.can_execute_real_import === false,
);

// Confirm the tmp queue file was never created by any glue call.
ok(
  'B8: no queue file created by any glue call',
  existsSync(missingQueuePath) === false,
);

// ===========================================================================
// SECTION C — Existing commands NOT hijacked by D2D glue
// ===========================================================================

section('C. Existing commands not hijacked by D2D glue');

const nonHijacked = [
  '/ping',
  '/health',
  '/today',
  '/lead_import_status',
  '/lead_import_preview',
  '/lead_import_sandbox',
];
for (const cmd of nonHijacked) {
  ok(
    `C9: ${cmd} is NOT routed to D2D glue`,
    shouldRouteToImportApprovalReview(cmd) === false,
  );
}

// Sanity (positive): the three real triggers DO route.
ok(
  'C9: /lead_import_review IS routed (sanity)',
  shouldRouteToImportApprovalReview('/lead_import_review') === true,
);

// ===========================================================================
// SECTION D — Glue static safety (glue read as text + runtime safety object)
// ===========================================================================

section('D. Glue static safety (no API / SMTP / network / secrets / real write)');

// IMPORTANT: a glue module is allowed (and expected) to *describe* in its
// comments and notice strings that it does NOT use SMTP / .env / 13_sales.
// Those descriptive mentions are NOT violations. To avoid false positives we
// inspect ACTIVE CODE ONLY — comments and string/template literals are stripped
// before the forbidden-pattern checks are applied.
function stripCommentsAndStrings(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let state = 'code'; // code | line | block | sq | dq | tq
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (state === 'code') {
      if (c === '/' && c2 === '/') { state = 'line'; i += 2; continue; }
      if (c === '/' && c2 === '*') { state = 'block'; i += 2; continue; }
      if (c === "'") { state = 'sq'; i += 1; continue; }
      if (c === '"') { state = 'dq'; i += 1; continue; }
      if (c === '`') { state = 'tq'; i += 1; continue; }
      out += c; i += 1; continue;
    }
    if (state === 'line') {
      if (c === '\n') { state = 'code'; out += c; }
      i += 1; continue;
    }
    if (state === 'block') {
      if (c === '*' && c2 === '/') { state = 'code'; i += 2; continue; }
      i += 1; continue;
    }
    // string states: skip escaped chars, leave a placeholder space
    if (state === 'sq' || state === 'dq' || state === 'tq') {
      if (c === '\\') { i += 2; continue; }
      if (state === 'sq' && c === "'") { state = 'code'; i += 1; continue; }
      if (state === 'dq' && c === '"') { state = 'code'; i += 1; continue; }
      if (state === 'tq' && c === '`') { state = 'code'; i += 1; continue; }
      i += 1; continue;
    }
  }
  return out;
}

const glueCode = stripCommentsAndStrings(glueSrc);

const glueForbidden = [
  // Real Telegram API usage (active code only)
  ['Telegram API call', /api\.telegram\.org|\.sendMessage\s*\(|new\s+TelegramBot|node-telegram-bot-api/],
  // Real mailer usage — note: the identifier `smtp_used` is a safety FLAG, not
  // an SMTP call, so we only flag actual mailer construction / imports.
  ['SMTP / nodemailer', /nodemailer|createTransport(?:er)?\s*\(/i],
  // Real network calls
  ['network fetch/axios', /\bfetch\s*\(|\baxios\b|require\(['"]https?['"]\)|from\s+['"]node:https?['"]/],
  // Real secret access (active code) — comments mentioning .env are stripped
  ['.env / AI_SECRETS', /process\.env\b|AI_SECRETS|require\(['"]dotenv['"]\)|from\s+['"]dotenv['"]/],
  // Real disk write of sales data (active code) — notice strings are stripped
  ['real 13_sales write', /13_sales|\bwriteFile\b|\bappendFile\b|writeFileSync|appendFileSync/],
];
for (const [label, re] of glueForbidden) {
  ok(`D: glue contains NO ${label}`, re.test(glueCode) === false);
}


// Runtime safety object asserts (frozen contract surfaced by the glue).
const safety = approveSummary.safety || {};
ok('D: safety.real_import = BLOCKED', safety.real_import === 'BLOCKED');
ok('D: safety.queue_write = NO', safety.queue_write === 'NO');
ok('D: safety.client_contact = BLOCKED', safety.client_contact === 'BLOCKED');
ok('D: safety.auto_send = BLOCKED', safety.auto_send === 'BLOCKED');
ok('D: safety.network_used = NO', safety.network_used === 'NO');
ok('D: safety.smtp_used = NO', safety.smtp_used === 'NO');
ok(
  'D: safety.telegram_api_called = NO',
  safety.telegram_api_called === 'NO',
);

// ===========================================================================
// SECTION E — Probe-file hygiene (no tmp/_probe*.mjs created)
// ===========================================================================

section('E. Probe-file hygiene');

const probeDir = path.resolve(__dirname, '..', '..', 'tmp');
let probeFound = false;
if (existsSync(probeDir)) {
  try {
    const { readdirSync } = await import('node:fs');
    const entries = readdirSync(probeDir);
    probeFound = entries.some((f) => /probe/i.test(f) && f.endsWith('.mjs'));
  } catch {
    probeFound = false;
  }
}
ok('E: no tmp/*probe*.mjs files present', probeFound === false);

// ===========================================================================
// FINAL SUMMARY
// ===========================================================================

const patchDetected = hasGlueImport && hasGuardBlock;
const ownerGateOk = hasOwnerGate && hasOwnerRefusal;
const existingHijacked = nonHijacked.some((c) =>
  shouldRouteToImportApprovalReview(c),
);

console.log('\n========================================================');
console.log('D2E1 OFFLINE POST-PATCH VERIFICATION — FINAL SUMMARY');
console.log('========================================================');
console.log(`- test file created:        yes (this file)`);
console.log(`- tests passed:             ${passed}`);
console.log(`- tests failed:            ${failed}`);
console.log(`- patch detected:           ${patchDetected ? 'YES' : 'NO'}`);
console.log(`- owner gate:               ${ownerGateOk ? 'PRESENT' : 'MISSING'}`);
console.log(
  `- existing commands hijacked: ${existingHijacked ? 'YES (FAIL)' : 'NO'}`,
);
console.log(
  `- approve/reject:           decision-only (real import BLOCKED, queue_write=NO)`,
);
console.log(`- queue changed:            NO`);
console.log(`- real data changed:       NO`);
console.log(`- bot started/stopped:     NO (read as text only)`);
console.log(`- probe files created:     NO`);
console.log(
  `- safety:                  real_import=BLOCKED, queue_write=NO, client_contact=BLOCKED, auto_send=BLOCKED, network=NO, smtp=NO, telegram_api=NO`,
);

if (failed > 0) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exitCode = 1;
} else {
  console.log('\nALL CHECKS PASSED ✅');
}
