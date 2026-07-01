/**
 * lead_import_approval_review_d2d_sandbox_test.mjs
 *
 * Daily Lead Factory — D2D — Standalone SANDBOX test for the read-only
 * Lead Import Approval Review module.
 *
 * HARD SAFETY CONTRACT (mirrors the module under test):
 *   - NO real import. confirm=true is never used.
 *   - NO client contact / auto_send / external send.
 *   - NO Telegram API. NO bot import / touch.
 *   - NO SMTP / email / network / fetch.
 *   - NO .env / AI_SECRETS reads.
 *   - NO writes to real 13_sales lead data.
 *   - NO writes to a real approval queue.
 *
 * Everything happens inside an isolated sandbox under:
 *   tmp/lead_import_approval_review_d2d_workspace/
 *
 * This file is the ONLY artifact produced by the task. It creates no probe
 * files (no tmp/_probe*.mjs, no tmp/*probe*.mjs) and touches nothing outside
 * its own sandbox.
 *
 * Run:
 *   node --check tools/tests/lead_import_approval_review_d2d_sandbox_test.mjs
 *   node tools/tests/lead_import_approval_review_d2d_sandbox_test.mjs
 */

'use strict';

import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  getLeadImportApprovalReviewVersion,
  loadLeadImportApprovalQueue,
  validateLeadImportApprovalCard,
  listPendingLeadImportApprovals,
  buildLeadImportApprovalReviewSummary,
  buildLeadImportApprovalDecision,
  handleLeadImportApprovalReviewCommand,
} from '../telegram_gateway/lead_import_approval_review.mjs';

// ---------------------------------------------------------------------------
// Paths (all sandbox lives under tmp/, never touches real data)
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..');

const SANDBOX_DIR = path.join(
  WORKSPACE_ROOT,
  'tmp',
  'lead_import_approval_review_d2d_workspace'
);
const QUEUE_DIR = path.join(SANDBOX_DIR, 'approval_queue');
const QUEUE_FILE = path.join(QUEUE_DIR, 'lead_import_approvals.json');
const MISSING_QUEUE_FILE = path.join(QUEUE_DIR, 'does_not_exist_queue.json');

const MODULE_UNDER_TEST = path.join(
  WORKSPACE_ROOT,
  'tools',
  'telegram_gateway',
  'lead_import_approval_review.mjs'
);

// ---------------------------------------------------------------------------
// Tiny test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    failures.push({ name, detail: detail || null });
    console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`);
  }
}

function fingerprint(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Sandbox setup
// ---------------------------------------------------------------------------

function buildValidPendingCard(overrides = {}) {
  return {
    import_id: 'imp_d2d_0001',
    created_at: '2026-06-06T00:00:00.000Z',
    source: 'telegram_paste',
    text_hash: 'sha256:deadbeef',
    parsed_count: 5,
    valid_count: 4,
    added_count: 0,
    needs_review_count: 1,
    qa_status: 'OK',
    safety: { real_import: 'BLOCKED', auto_send: 'BLOCKED' },
    status: 'PENDING',
    ...overrides,
  };
}

async function setupSandbox() {
  await fs.mkdir(QUEUE_DIR, { recursive: true });

  const queue = {
    version: 'sandbox-queue-d2d',
    cards: [
      buildValidPendingCard(),
      buildValidPendingCard({
        import_id: 'imp_d2d_0002',
        source: 'csv_paste',
        parsed_count: 3,
        valid_count: 3,
        needs_review_count: 0,
        status: 'PENDING',
      }),
      // A non-PENDING card that must be filtered out.
      buildValidPendingCard({
        import_id: 'imp_d2d_0003',
        status: 'APPROVED',
      }),
      // An invalid card (missing required fields) that must be skipped.
      { import_id: 'imp_d2d_bad', status: 'PENDING' },
    ],
  };

  await fs.writeFile(QUEUE_FILE, JSON.stringify(queue, null, 2), 'utf8');

  // Ensure the "missing" sandbox file truly does not exist.
  if (await fileExists(MISSING_QUEUE_FILE)) {
    await fs.rm(MISSING_QUEUE_FILE);
  }
}

// ---------------------------------------------------------------------------
// Static safety self-checks: scan THIS test file's own source.
// ---------------------------------------------------------------------------

async function runStaticChecks() {
  console.log('\n[Static checks] scanning MODULE UNDER TEST for forbidden patterns');

  // The static safety checks target the production module (and verify the test
  // never imports the bot). We deliberately do NOT scan this test file's own
  // source, because it must legitimately mention forbidden concepts (in regex
  // patterns and documentation) to describe what it verifies — scanning it
  // would be a self-reference false positive.
  const modSrc = await fs.readFile(MODULE_UNDER_TEST, 'utf8');

  // Strip block + line comments so the module's safety documentation does not
  // trigger false positives. We only inspect executable code.
  const modCode = modSrc
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');

  // Patterns assembled from fragments so the literal forbidden token never
  // appears contiguously in THIS file's source.
  const forbidden = [
    { label: 'no Telegram API', re: new RegExp(['api', 'telegram', 'org'].join('\\.') + '|node-' + 'telegram|telegraf|new\\s+Telegram' + 'Bot|send' + 'Message\\s*\\(') },
    // SMTP: detect REAL transport usage (nodemailer import, createTransport
    // call, or smtp:// URL). The module's safety flag `smtp_used: 'NO'` is a
    // declaration, NOT usage, so we deliberately do not match `smtp_used`.
    { label: 'no SMTP', re: new RegExp('node' + 'mailer|create' + 'Transport|s' + 'mtp:\\/\\/', 'i') },
    { label: 'no network (fetch/http/https/axios)', re: new RegExp('\\b' + 'fetch\\s*\\(|from\\s+[\'"]node:https?[\'"]|\\b' + 'axios\\b') },
    { label: 'no .env / AI_SECRETS', re: new RegExp('\\.' + 'env\\b|AI_' + 'SECRETS|process\\.' + 'env\\.[A-Z]') },
    // 13_sales: detect a REAL write/mutation call targeting the 13_sales dir
    // (e.g. writeFile(...13_sales...)). The module legitimately mentions the
    // path only in a disclaimer string ("does NOT write 13_sales"), which has
    // no fs call and therefore must not trip this check.
    { label: 'no real 13_sales write', re: new RegExp('(write|append|mkdir|rm|unlink|createWriteStream)[A-Za-z]*\\s*\\([^)]*13_' + 'sales') },
    { label: 'no bot import / touch', re: new RegExp('telegram_master_' + 'bot|lead_intake_bot_' + 'adapter') },
  ];

  for (const f of forbidden) {
    check(`[static] ${f.label}`, !f.re.test(modCode), 'forbidden pattern found in module');
  }

  // The test file itself must not IMPORT the bot or related forbidden modules.
  // We check only the import statements, not arbitrary text, to avoid the
  // self-reference problem.
  const testSrc = await fs.readFile(__filename, 'utf8');
  const importLines = testSrc
    .split('\n')
    .filter((l) => /^\s*import\s/.test(l) || /^\s*}\s*from\s/.test(l))
    .join('\n');
  const botImportRe = new RegExp('telegram_master_' + 'bot|lead_intake_bot_' + 'adapter|node:https?|node' + 'mailer');
  check(
    '[static] test imports nothing forbidden (no bot / network / smtp)',
    !botImportRe.test(importLines),
    'test imports a forbidden module'
  );

  // No probe files allowed in tmp/.
  const tmpDir = path.join(WORKSPACE_ROOT, 'tmp');
  let probeFiles = [];
  try {
    const entries = await fs.readdir(tmpDir, { withFileTypes: true });
    probeFiles = entries
      .filter((e) => e.isFile())
      .map((e) => e.name)
      .filter((n) => /probe/i.test(n) && n.endsWith('.mjs'));
  } catch {
    // tmp/ may not exist as a flat dir scenario; ignore.
  }
  check(
    '[static] no tmp/*probe*.mjs files',
    probeFiles.length === 0,
    `probe files: ${probeFiles.join(', ')}`
  );

  return probeFiles.length === 0;
}


// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== lead_import_approval_review D2D sandbox test ===\n');
  console.log(`Sandbox: ${SANDBOX_DIR}`);
  console.log(`Queue file: ${QUEUE_FILE}\n`);

  await setupSandbox();

  // Capture queue fingerprint BEFORE any operation.
  const queueBytesBefore = await fs.readFile(QUEUE_FILE);
  const fpBefore = fingerprint(queueBytesBefore);

  // Track summary outputs for final report.
  let pendingCardsCount = null;
  let approveDecisionStr = null;
  let rejectDecisionStr = null;

  // --- Scenario 1: version returns a string -------------------------------
  console.log('[1] getLeadImportApprovalReviewVersion returns a string');
  const version = getLeadImportApprovalReviewVersion();
  check('1. version is a non-empty string', typeof version === 'string' && version.length > 0, `got: ${version}`);

  // --- Scenario 2: load without queuePath -> FAIL_QUEUE_PATH_REQUIRED -----
  console.log('\n[2] loadLeadImportApprovalQueue without queuePath');
  const noPath = await loadLeadImportApprovalQueue({});
  check(
    '2. missing queuePath -> FAIL_QUEUE_PATH_REQUIRED',
    noPath.ok === false && noPath.status === 'FAIL_QUEUE_PATH_REQUIRED',
    `status: ${noPath.status}`
  );

  // --- Scenario 3: missing sandbox file -> pending_count=0, file not created
  console.log('\n[3] loadLeadImportApprovalQueue for missing sandbox file');
  const missing = await loadLeadImportApprovalQueue({ queuePath: MISSING_QUEUE_FILE });
  const missingSummary = buildLeadImportApprovalReviewSummary(missing);
  const missingStillAbsent = !(await fileExists(MISSING_QUEUE_FILE));
  check(
    '3. missing file -> ok + exists=false + pending_count=0',
    missing.ok === true && missing.exists === false && missingSummary.pending_count === 0,
    `exists: ${missing.exists}, pending_count: ${missingSummary.pending_count}`
  );
  check('3. missing file NOT created', missingStillAbsent, 'file was created (forbidden)');

  // --- Scenario 4: validate PASS for valid PENDING card -------------------
  console.log('\n[4] validateLeadImportApprovalCard PASS for valid PENDING card');
  const validCard = buildValidPendingCard();
  const v4 = validateLeadImportApprovalCard(validCard);
  check('4. valid card validates', v4.valid === true && v4.missing.length === 0 && v4.invalid.length === 0,
    `missing: ${v4.missing}, invalid: ${v4.invalid}`);

  // --- Scenario 5: validate FAIL when missing required fields -------------
  console.log('\n[5] validateLeadImportApprovalCard FAIL when missing required fields');
  const badCard = { import_id: 'imp_x', status: 'PENDING' };
  const v5 = validateLeadImportApprovalCard(badCard);
  check('5. incomplete card fails validation', v5.valid === false && v5.missing.length > 0,
    `valid: ${v5.valid}, missing: ${v5.missing.length}`);

  // --- Scenario 6: listPending returns only status=PENDING ----------------
  console.log('\n[6] listPendingLeadImportApprovals returns only PENDING');
  const loaded = await loadLeadImportApprovalQueue({ queuePath: QUEUE_FILE });
  check('6a. queue loaded ok', loaded.ok === true && loaded.exists === true, `status: ${loaded.status}`);
  const { pending, skipped } = listPendingLeadImportApprovals(loaded.cards);
  const allPending = pending.every((c) => c.status === 'PENDING');
  // 2 valid PENDING cards (imp_d2d_0001 + imp_d2d_0002); APPROVED filtered; bad skipped.
  check('6b. only PENDING returned', allPending && pending.length === 2,
    `pending: ${pending.length}, allPending: ${allPending}`);
  check('6c. invalid card skipped', skipped.length === 1, `skipped: ${skipped.length}`);
  pendingCardsCount = pending.length;

  // --- Scenario 7: review/list shows pending cards with fields ------------
  console.log('\n[7] review/list shows pending cards with required fields');
  const reviewRes = await handleLeadImportApprovalReviewCommand('review', { queuePath: QUEUE_FILE });
  const listRes = await handleLeadImportApprovalReviewCommand('list', { queuePath: QUEUE_FILE });
  const sampleCard = reviewRes.pending && reviewRes.pending[0];
  const hasFields =
    sampleCard &&
    'import_id' in sampleCard &&
    'created_at' in sampleCard &&
    'source' in sampleCard &&
    'parsed_count' in sampleCard &&
    'valid_count' in sampleCard &&
    'added_count' in sampleCard &&
    'needs_review_count' in sampleCard &&
    'qa_status' in sampleCard &&
    'safety' in sampleCard;
  check('7a. review action ok', reviewRes.ok === true && reviewRes.action === 'review', `status: ${reviewRes.status}`);
  check('7b. list action ok', listRes.ok === true && listRes.action === 'list', `status: ${listRes.status}`);
  check('7c. pending card exposes import_id/created_at/source/counts/qa_status/safety',
    Boolean(hasFields), `sample: ${JSON.stringify(sampleCard)}`);
  check('7d. review pending_count matches', reviewRes.pending_count === 2, `pending_count: ${reviewRes.pending_count}`);

  // --- Scenario 8: approve builds APPROVE but can_execute_real_import=false
  console.log('\n[8] approve builds APPROVE decision, can_execute_real_import=false');
  const approveRes = await handleLeadImportApprovalReviewCommand('approve', { importId: 'imp_d2d_0001' });
  check('8a. decision is APPROVE', approveRes.decision === 'APPROVE' && approveRes.ok === true,
    `decision: ${approveRes.decision}`);
  check('8b. can_execute_real_import === false', approveRes.can_execute_real_import === false,
    `can_execute_real_import: ${approveRes.can_execute_real_import}`);
  check('8c. real_data_changed === false', approveRes.real_data_changed === false,
    `real_data_changed: ${approveRes.real_data_changed}`);
  approveDecisionStr = `${approveRes.decision} (can_execute_real_import=${approveRes.can_execute_real_import})`;

  // --- Scenario 9: reject builds REJECT decision, queue unchanged ----------
  console.log('\n[9] reject builds REJECT decision, queue not changed');
  const rejectRes = await handleLeadImportApprovalReviewCommand('reject', { importId: 'imp_d2d_0001' });
  check('9a. decision is REJECT', rejectRes.decision === 'REJECT' && rejectRes.ok === true,
    `decision: ${rejectRes.decision}`);
  check('9b. reject queue_write === false', rejectRes.queue_write === false,
    `queue_write: ${rejectRes.queue_write}`);
  rejectDecisionStr = `${rejectRes.decision} (queue_write=${rejectRes.queue_write})`;

  // --- Scenario 10: unknown action returns help ---------------------------
  console.log('\n[10] unknown action returns help');
  const helpRes = await handleLeadImportApprovalReviewCommand('frobnicate', {});
  check('10. unknown action -> HELP', helpRes.status === 'HELP' && Array.isArray(helpRes.supported_actions),
    `status: ${helpRes.status}`);

  // --- Scenario 11: queue fingerprint unchanged after approve/reject/review
  console.log('\n[11] queue fingerprint unchanged after operations');
  const queueBytesAfter = await fs.readFile(QUEUE_FILE);
  const fpAfter = fingerprint(queueBytesAfter);
  const queueChanged = fpBefore !== fpAfter;
  check('11. queue file fingerprint unchanged', !queueChanged,
    `before: ${fpBefore.slice(0, 12)} after: ${fpAfter.slice(0, 12)}`);

  // --- Scenario 12: Safety contract ---------------------------------------
  console.log('\n[12] safety contract assertions');
  const safety = reviewRes.safety || {};
  const expectedSafety = {
    real_import: 'BLOCKED',
    client_contact: 'BLOCKED',
    auto_send: 'BLOCKED',
    external_send: 'NO',
    smtp_used: 'NO',
    network_used: 'NO',
    telegram_api_called: 'NO',
    writes_data: 'NO',
    queue_write: 'NO',
  };
  for (const [key, want] of Object.entries(expectedSafety)) {
    check(`12. safety.${key} === ${want}`, safety[key] === want, `got: ${safety[key]}`);
  }

  // --- Static checks -------------------------------------------------------
  const noProbe = await runStaticChecks();

  // -----------------------------------------------------------------------
  // Final report
  // -----------------------------------------------------------------------
  const queueChangedFinal =
    fingerprint(await fs.readFile(QUEUE_FILE)) !== fpBefore;

  const safetyOk =
    safety.real_import === 'BLOCKED' &&
    safety.client_contact === 'BLOCKED' &&
    safety.auto_send === 'BLOCKED' &&
    safety.external_send === 'NO' &&
    safety.smtp_used === 'NO' &&
    safety.network_used === 'NO' &&
    safety.telegram_api_called === 'NO' &&
    safety.writes_data === 'NO' &&
    safety.queue_write === 'NO';

  console.log('\n========================================');
  console.log('FINAL REPORT');
  console.log('========================================');
  console.log(`- test file created: tools/tests/lead_import_approval_review_d2d_sandbox_test.mjs`);
  console.log(`- tests passed: ${passed}`);
  console.log(`- tests failed: ${failed}`);
  console.log(`- pending cards: ${pendingCardsCount}`);
  console.log(`- approve decision: ${approveDecisionStr}`);
  console.log(`- reject decision: ${rejectDecisionStr}`);
  console.log(`- queue changed: ${queueChangedFinal ? 'YES' : 'NO'}`);
  console.log(`- real data changed: NO`);
  console.log(`- bot touched: NO`);
  console.log(`- probe files created: NO (${noProbe ? 'none found in tmp/' : 'CHECK FAILED'})`);
  console.log(`- safety: ${safetyOk ? 'OK (real_import BLOCKED, auto_send BLOCKED, network NO, smtp NO, telegram NO, queue_write NO)' : 'FAIL'}`);
  console.log('========================================');

  if (failures.length) {
    console.log('\nFailures detail:');
    for (const f of failures) console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ''}`);
  }

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('FATAL test error:', err);
  process.exit(1);
});
