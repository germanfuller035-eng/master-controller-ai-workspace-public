/**
 * lead_import_approval_review_bot_glue_d2d_standalone_test.mjs
 *
 * Daily Lead Factory — D2D — Standalone test for the Lead Import Approval
 * Review Bot-Glue Adapter (lead_import_approval_review_bot_glue.mjs).
 *
 * Purpose:
 *   A self-contained, read-only test harness that imports the D2D bot-glue
 *   adapter and verifies routing, parsing, formatting, decision-building and a
 *   block of HARD SAFETY assertions.
 *
 * HARD SAFETY CONTRACT — what this test DOES NOT do:
 *   - It NEVER imports / touches the live bot module (no live bot patch).
 *   - It NEVER calls the Telegram API. No bot token. No network. No HTTP.
 *   - It NEVER sends mail / messages. No SMTP.
 *   - It NEVER reads secret env files.
 *   - It NEVER performs a real import. No confirm path is used.
 *   - It NEVER writes to real 13_sales data.
 *   - It NEVER writes / creates the approval queue file.
 *   - The ONLY file it creates is a tmp sandbox FIXTURE queue under
 *     tools/tests/tmp/, written BY THE TEST (not by the modules), and the test
 *     verifies the modules themselves never mutate it.
 *
 * Run:
 *   node --check tools/tests/lead_import_approval_review_bot_glue_d2d_standalone_test.mjs
 *   node tools/tests/lead_import_approval_review_bot_glue_d2d_standalone_test.mjs
 */

'use strict';

import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  getImportApprovalReviewBotGlueVersion,
  shouldRouteToImportApprovalReview,
  parseImportApprovalCommand,
  handleImportApprovalReviewBotMessage,
  formatImportApprovalReviewForTelegram,
  buildImportApprovalReviewBotSummary,
} from '../telegram_gateway/lead_import_approval_review_bot_glue.mjs';

// ---------------------------------------------------------------------------
// Tiny assertion harness (no external deps)
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    failures.push(label + (detail ? ` — ${detail}` : ''));
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function isReadableShortText(text, maxLen = 800) {
  return typeof text === 'string' && text.trim() !== '' && text.length <= maxLen;
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TMP_DIR = path.join(__dirname, 'tmp');
const FIXTURE_QUEUE = path.join(TMP_DIR, 'd2d_bot_glue_fixture_queue.json');
const MISSING_QUEUE = path.join(TMP_DIR, 'd2d_bot_glue_missing_queue.json');

function makeCard(overrides = {}) {
  return {
    import_id: 'imp-2026-06-06-001',
    created_at: '2026-06-06T00:00:00Z',
    source: 'telegram-sandbox',
    text_hash: 'abc123hashvalue',
    parsed_count: 3,
    valid_count: 2,
    added_count: 2,
    needs_review_count: 1,
    qa_status: 'OK',
    safety: { real_import: 'BLOCKED' },
    status: 'PENDING',
    ...overrides,
  };
}

async function sha256OfFile(absPath) {
  const { createHash } = await import('node:crypto');
  try {
    const buf = await fs.readFile(absPath);
    return createHash('sha256').update(buf).digest('hex');
  } catch (err) {
    if (err && err.code === 'ENOENT') return 'ENOENT';
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Lead Import Approval Review Bot-Glue — D2D standalone test ===\n');

  // Prepare a tmp sandbox fixture queue (written by THE TEST, not the modules).
  await fs.mkdir(TMP_DIR, { recursive: true });
  await fs.writeFile(
    FIXTURE_QUEUE,
    JSON.stringify({ cards: [makeCard()] }, null, 2),
    'utf8',
  );
  // Ensure the "missing" queue truly does not exist.
  await fs.rm(MISSING_QUEUE, { force: true });

  const fixtureHashBefore = await sha256OfFile(FIXTURE_QUEUE);

  // --- Scenario 1: version -----------------------------------------------
  const version = getImportApprovalReviewBotGlueVersion();
  check(
    '01 getImportApprovalReviewBotGlueVersion returns a string',
    typeof version === 'string' && version.includes('bot-glue-d2d'),
    `got: ${JSON.stringify(version)}`,
  );

  // --- Scenario 2: routing slash commands --------------------------------
  check(
    '02 route /lead_import_review = true',
    shouldRouteToImportApprovalReview('/lead_import_review') === true,
  );
  check(
    '03 route /lead_import_approve imp-1 = true',
    shouldRouteToImportApprovalReview('/lead_import_approve imp-1') === true,
  );
  check(
    '04 route /lead_import_reject imp-1 = true',
    shouldRouteToImportApprovalReview('/lead_import_reject imp-1') === true,
  );

  // --- Scenario 3: routing RU phrases ------------------------------------
  check(
    '05 route "очередь импорта" = true',
    shouldRouteToImportApprovalReview('очередь импорта') === true,
  );
  check(
    '06 route "одобрить импорт imp-1" = true',
    shouldRouteToImportApprovalReview('одобрить импорт imp-1') === true,
  );
  check(
    '07 route "отклонить импорт imp-1" = true',
    shouldRouteToImportApprovalReview('отклонить импорт imp-1') === true,
  );

  // --- Scenario 4: NON-domain text is NOT routed -------------------------
  check(
    '08 route "/ping" = false',
    shouldRouteToImportApprovalReview('/ping') === false,
  );
  check(
    '09 route "/lead_import_status" (D1) = false',
    shouldRouteToImportApprovalReview('/lead_import_status') === false,
  );
  check(
    '10 route "статус лидов" (D1 alias) = false',
    shouldRouteToImportApprovalReview('статус лидов') === false,
  );
  check(
    '11 route "" / non-string = false',
    shouldRouteToImportApprovalReview('') === false &&
      shouldRouteToImportApprovalReview(null) === false,
  );

  // --- Scenario 5: parsing ------------------------------------------------
  const pReview = parseImportApprovalCommand('/lead_import_review');
  check(
    '12 parse /lead_import_review -> review, no id',
    pReview.inDomain === true &&
      pReview.action === 'review' &&
      pReview.importId === null,
  );

  const pApprove = parseImportApprovalCommand('/lead_import_approve imp-XYZ-9');
  check(
    '13 parse /lead_import_approve imp-XYZ-9 -> approve + id (case preserved)',
    pApprove.action === 'approve' && pApprove.importId === 'imp-XYZ-9',
    `got id: ${pApprove.importId}`,
  );

  const pRejectRu = parseImportApprovalCommand('отклонить импорт imp-77');
  check(
    '14 parse "отклонить импорт imp-77" -> reject + id',
    pRejectRu.action === 'reject' && pRejectRu.importId === 'imp-77',
    `got id: ${pRejectRu.importId}`,
  );

  // Alias-collision determinism: "одобрить импорт" must win over review phrase.
  const pApproveRu = parseImportApprovalCommand('одобрить импорт imp-5');
  check(
    '15 parse "одобрить импорт imp-5" -> approve (not review)',
    pApproveRu.action === 'approve' && pApproveRu.importId === 'imp-5',
  );

  // --- Scenario 6: review with fixture queue -----------------------------
  const reviewRes = await handleImportApprovalReviewBotMessage(
    '/lead_import_review',
    { queuePath: FIXTURE_QUEUE },
  );
  check(
    '16 review (fixture) handled=true, status=LOADED',
    reviewRes.handled === true && reviewRes.status === 'LOADED',
    `status: ${reviewRes.status}`,
  );
  check(
    '17 review reply lists 1 pending card',
    isReadableShortText(reviewRes.text) &&
      reviewRes.raw &&
      reviewRes.raw.pending_count === 1,
    `pending_count: ${reviewRes.raw && reviewRes.raw.pending_count}`,
  );

  // --- Scenario 7: review missing queuePath ------------------------------
  const noPath = await handleImportApprovalReviewBotMessage('/lead_import_review', {});
  check(
    '18 review without queuePath -> FAIL_QUEUE_PATH_REQUIRED',
    noPath.handled === true && noPath.status === 'FAIL_QUEUE_PATH_REQUIRED',
    `status: ${noPath.status}`,
  );

  // --- Scenario 8: review missing file (not created) ---------------------
  const missing = await handleImportApprovalReviewBotMessage('/lead_import_review', {
    queuePath: MISSING_QUEUE,
  });
  check(
    '19 review missing file -> EMPTY_NO_FILE',
    missing.handled === true && missing.status === 'EMPTY_NO_FILE',
    `status: ${missing.status}`,
  );
  const missingExistsAfter = await sha256OfFile(MISSING_QUEUE);
  check(
    '20 missing queue file was NOT created by the module',
    missingExistsAfter === 'ENOENT',
    `hash: ${missingExistsAfter}`,
  );

  // --- Scenario 9: approve decision object -------------------------------
  const approveRes = await handleImportApprovalReviewBotMessage(
    '/lead_import_approve imp-2026-06-06-001',
    {},
  );
  check(
    '21 approve -> DECISION_BUILT',
    approveRes.handled === true && approveRes.status === 'DECISION_BUILT',
    `status: ${approveRes.status}`,
  );
  check(
    '22 approve decision can_execute_real_import=false',
    approveRes.raw &&
      approveRes.raw.can_execute_real_import === false &&
      approveRes.raw.decision === 'APPROVE',
  );
  check(
    '23 approve decision queue_write=false, real_data_changed=false',
    approveRes.raw &&
      approveRes.raw.queue_write === false &&
      approveRes.raw.real_data_changed === false,
  );

  // --- Scenario 10: reject decision + missing id -------------------------
  const rejectRes = await handleImportApprovalReviewBotMessage(
    '/lead_import_reject imp-2026-06-06-001',
    {},
  );
  check(
    '24 reject -> DECISION_BUILT, decision=REJECT',
    rejectRes.status === 'DECISION_BUILT' && rejectRes.raw.decision === 'REJECT',
  );

  const approveNoId = await handleImportApprovalReviewBotMessage(
    '/lead_import_approve',
    {},
  );
  check(
    '25 approve without id -> FAIL_IMPORT_ID_REQUIRED',
    approveNoId.status === 'FAIL_IMPORT_ID_REQUIRED',
    `status: ${approveNoId.status}`,
  );

  // --- Scenario 11: non-domain message not handled -----------------------
  const nonDomain = await handleImportApprovalReviewBotMessage('/ping', {});
  check(
    '26 non-domain "/ping" -> handled=false, NOT_IN_DOMAIN',
    nonDomain.handled === false && nonDomain.status === 'NOT_IN_DOMAIN',
    `status: ${nonDomain.status}`,
  );

  // --- Scenario 12: formatting + summary ---------------------------------
  const fmt = formatImportApprovalReviewForTelegram(reviewRes.raw);
  check('27 format produces readable short text', isReadableShortText(fmt));

  const summary = buildImportApprovalReviewBotSummary(approveRes);
  check(
    '28 summary reports decision-only safety flags',
    summary.can_execute_real_import === false &&
      summary.queue_write === false &&
      summary.real_data_changed === false &&
      summary.telegram_api_called === false &&
      summary.bot_integration === 'NOT_CONNECTED',
  );

  // ---------------------------------------------------------------------
  // HARD SAFETY ASSERTIONS
  // ---------------------------------------------------------------------
  console.log('\n--- Hard safety assertions ---');

  const allResults = [reviewRes, noPath, missing, approveRes, rejectRes, nonDomain];
  let safetyOk = true;
  for (const res of allResults) {
    const s = res.safety || {};
    if (
      s.real_import !== 'BLOCKED' ||
      s.client_contact !== 'BLOCKED' ||
      s.auto_send !== 'BLOCKED' ||
      s.queue_write !== 'NO' ||
      s.network_used !== 'NO' ||
      s.smtp_used !== 'NO' ||
      s.telegram_api_called !== 'NO' ||
      s.env_secrets !== 'NO' ||
      s.confirm_allowed !== 'NO'
    ) {
      safetyOk = false;
    }
  }
  check('29 every result carries the frozen hard-safety contract', safetyOk);

  // Fixture queue must be byte-identical after all operations (read-only).
  const fixtureHashAfter = await sha256OfFile(FIXTURE_QUEUE);
  check(
    '30 fixture queue file is byte-identical after all ops (read-only)',
    fixtureHashBefore === fixtureHashAfter && fixtureHashBefore !== 'ENOENT',
    `before: ${fixtureHashBefore.slice(0, 12)} after: ${fixtureHashAfter.slice(0, 12)}`,
  );

  // No accidental confirm honoured: passing confirm flag changes nothing.
  const confirmAttempt = await handleImportApprovalReviewBotMessage(
    '/lead_import_approve imp-2026-06-06-001',
    { confirm: true, queuePath: FIXTURE_QUEUE },
  );
  check(
    '31 confirm flag is ignored; still decision-only',
    confirmAttempt.raw &&
      confirmAttempt.raw.can_execute_real_import === false &&
      confirmAttempt.raw.queue_write === false,
  );

  // Cleanup the test-owned fixture.
  await fs.rm(FIXTURE_QUEUE, { force: true });

  // ---------------------------------------------------------------------
  // Report
  // ---------------------------------------------------------------------
  console.log('\n=== Result ===');
  console.log(`PASS: ${passed}`);
  console.log(`FAIL: ${failed}`);
  if (failed > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log('\nALL GREEN — D2D bot-glue adapter is standalone-safe.');
  }
}

main().catch((err) => {
  console.error('FATAL test error:', err);
  process.exitCode = 1;
});
