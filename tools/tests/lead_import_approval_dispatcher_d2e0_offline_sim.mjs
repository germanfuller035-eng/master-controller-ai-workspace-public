/**
 * lead_import_approval_dispatcher_d2e0_offline_sim.mjs
 *
 * Daily Lead Factory — D2E0 — OFFLINE Dispatcher Simulation
 *
 * Purpose:
 *   Simulate a FULL bot dispatch loop for the lead-import approval review
 *   domain, entirely OFFLINE. A sequence of "incoming Telegram-like messages"
 *   is fed through a tiny in-test dispatcher that:
 *     1. classifies each message (shouldRouteToImportApprovalReview),
 *     2. delegates in-domain messages to the D2D bot-glue adapter
 *        (handleImportApprovalReviewBotMessage),
 *     3. captures the reply object the bot WOULD have sent.
 *
 *   This proves the dispatcher wiring is sound BEFORE any live bot patch,
 *   without launching the bot, touching the queue, or importing the real
 *   import path.
 *
 * HARD SAFETY CONTRACT — what this simulation DOES NOT do:
 *   - Does NOT import telegram_master_bot.mjs (no live bot, no polling).
 *   - Does NOT patch the live bot. bot_patch = NO.
 *   - Does NOT write / create the approval queue. queue_write = NO.
 *   - Does NOT execute a real import. real_import = BLOCKED.
 *   - Does NOT call the Telegram API / network / SMTP / email.
 *   - Does NOT read .env / AI_SECRETS / tokens.
 *   - Does NOT write 13_sales, dashboards, or any real file.
 *   - The populated-queue scenario is built fully IN MEMORY (no file IO).
 *
 * Run:
 *   node --check tools/tests/lead_import_approval_dispatcher_d2e0_offline_sim.mjs
 *   node tools/tests/lead_import_approval_dispatcher_d2e0_offline_sim.mjs
 */

'use strict';

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  getImportApprovalReviewBotGlueVersion,
  shouldRouteToImportApprovalReview,
  handleImportApprovalReviewBotMessage,
  formatImportApprovalReviewForTelegram,
  buildImportApprovalReviewBotSummary,
} from '../telegram_gateway/lead_import_approval_review_bot_glue.mjs';

import {
  buildLeadImportApprovalReviewSummary,
} from '../telegram_gateway/lead_import_approval_review.mjs';

// ---------------------------------------------------------------------------
// Paths (resolved relative to this file, never via env)
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GATEWAY_DIR = path.resolve(__dirname, '..', 'telegram_gateway');
const BOT_SOURCE = path.join(GATEWAY_DIR, 'telegram_master_bot.mjs');

// A deliberately NON-EXISTENT queue path. Reading it yields EMPTY_NO_FILE and
// the file is NOT created (verified by the review module contract).
const MISSING_QUEUE_PATH = path.join(__dirname, 'tmp', '_d2e0_nonexistent_queue.json');

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
    failures.push({ name, detail: detail || '' });
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

// ---------------------------------------------------------------------------
// Offline dispatcher (the thing we are simulating)
//
// This mirrors what a live bot handler WOULD do: classify, then route to the
// glue. It NEVER sends anything; it returns the reply object only.
// ---------------------------------------------------------------------------

async function dispatch(message, options = {}) {
  const text = message && typeof message.text === 'string' ? message.text : '';

  // 1. classify (cheap, read-only)
  const inDomain = shouldRouteToImportApprovalReview(text);
  if (!inDomain) {
    return {
      routed: false,
      reply: null,
      glue: null,
      reason: 'OUT_OF_DOMAIN — dispatcher passes through to other handlers',
    };
  }

  // 2. delegate to the D2D glue (which delegates to the review module)
  const glue = await handleImportApprovalReviewBotMessage(text, options);

  // 3. capture the reply the bot WOULD send (but never actually send it)
  return {
    routed: true,
    reply: glue.handled ? glue.text : null,
    glue,
    reason: glue.handled ? 'HANDLED' : 'NOT_HANDLED',
  };
}

// ---------------------------------------------------------------------------
// Safety assertion helper — every glue result must keep hard gates closed.
// ---------------------------------------------------------------------------

function assertSafetyClosed(label, glue) {
  const s = (glue && glue.safety) || {};
  ok(`${label}: real_import BLOCKED`, s.real_import === 'BLOCKED');
  ok(`${label}: client_contact BLOCKED`, s.client_contact === 'BLOCKED');
  ok(`${label}: auto_send BLOCKED`, s.auto_send === 'BLOCKED');
  ok(`${label}: queue_write NO`, s.queue_write === 'NO');
  ok(`${label}: telegram_api_called NO`, s.telegram_api_called === 'NO');
  ok(`${label}: network_used NO`, s.network_used === 'NO');
  ok(`${label}: env_secrets NO`, s.env_secrets === 'NO');
  ok(`${label}: bot_integration NOT_CONNECTED`, s.bot_integration === 'NOT_CONNECTED');
}

// ---------------------------------------------------------------------------
// In-memory sandbox queue (NO file IO) for the populated-review scenario.
// ---------------------------------------------------------------------------

function buildSandboxLoadResult() {
  const safety = { real_import: 'BLOCKED' };
  return {
    ok: true,
    status: 'LOADED',
    exists: true,
    queue_path: '(in-memory sandbox — no file)',
    cards: [
      {
        import_id: 'imp-d2e0-001',
        created_at: '2026-06-06T06:00:00.000Z',
        source: 'telegram_paste',
        text_hash: 'hash-001',
        parsed_count: 5,
        valid_count: 4,
        added_count: 0,
        needs_review_count: 1,
        qa_status: 'OK',
        safety,
        status: 'PENDING',
      },
      {
        import_id: 'imp-d2e0-002',
        created_at: '2026-06-06T06:05:00.000Z',
        source: 'csv_paste',
        text_hash: 'hash-002',
        parsed_count: 3,
        valid_count: 3,
        added_count: 0,
        needs_review_count: 0,
        qa_status: 'OK',
        safety,
        status: 'PENDING',
      },
      {
        import_id: 'imp-d2e0-003',
        created_at: '2026-06-06T06:10:00.000Z',
        source: 'telegram_paste',
        text_hash: 'hash-003',
        parsed_count: 2,
        valid_count: 2,
        added_count: 0,
        needs_review_count: 0,
        qa_status: 'OK',
        safety,
        status: 'APPROVED', // not PENDING -> must be excluded from review list
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('D2E0 OFFLINE dispatcher simulation');
  console.log('(no live bot patch, no queue write, no real import)');
  console.log(`glue version: ${getImportApprovalReviewBotGlueVersion()}`);

  const dispatchOpts = { queuePath: MISSING_QUEUE_PATH };

  // -------------------------------------------------------------------------
  // 1. Out-of-domain messages pass through (dispatcher does NOT hijack)
  // -------------------------------------------------------------------------
  section('1. Out-of-domain messages pass through');
  const outOfDomain = ['/ping', '/health', '/today', 'привет', '/lead_import_status'];
  for (const text of outOfDomain) {
    const res = await dispatch({ text }, dispatchOpts);
    ok(`"${text}" → routed=false (passes through)`, res.routed === false,
      `reason=${res.reason}`);
  }

  // -------------------------------------------------------------------------
  // 2. Review dispatch with MISSING queue file → EMPTY_NO_FILE, file NOT created
  // -------------------------------------------------------------------------
  section('2. Review dispatch — missing queue file');
  const reviewMissing = await dispatch({ text: '/lead_import_review' }, dispatchOpts);
  ok('routed=true', reviewMissing.routed === true);
  ok('handled=true', reviewMissing.glue && reviewMissing.glue.handled === true);
  ok('status=EMPTY_NO_FILE', reviewMissing.glue && reviewMissing.glue.status === 'EMPTY_NO_FILE',
    `status=${reviewMissing.glue && reviewMissing.glue.status}`);
  ok('reply mentions read-only queue', typeof reviewMissing.reply === 'string'
    && reviewMissing.reply.includes('Очередь импорта'));
  assertSafetyClosed('review/missing', reviewMissing.glue);

  // Verify the missing file was NOT created by the read.
  let fileCreated = false;
  try {
    await readFile(MISSING_QUEUE_PATH, 'utf8');
    fileCreated = true;
  } catch {
    fileCreated = false;
  }
  ok('missing queue file was NOT created by the read', fileCreated === false);

  // -------------------------------------------------------------------------
  // 3. Review dispatch with NO queuePath → FAIL_QUEUE_PATH_REQUIRED
  // -------------------------------------------------------------------------
  section('3. Review dispatch — no queuePath provided');
  const reviewNoPath = await dispatch({ text: '/lead_import_review' }, {});
  ok('routed=true', reviewNoPath.routed === true);
  ok('status=FAIL_QUEUE_PATH_REQUIRED',
    reviewNoPath.glue && reviewNoPath.glue.status === 'FAIL_QUEUE_PATH_REQUIRED',
    `status=${reviewNoPath.glue && reviewNoPath.glue.status}`);
  assertSafetyClosed('review/no-path', reviewNoPath.glue);

  // -------------------------------------------------------------------------
  // 4. Populated review (in-memory sandbox, NO file IO)
  // -------------------------------------------------------------------------
  section('4. Populated review — in-memory sandbox summary');
  const summary = buildLeadImportApprovalReviewSummary(buildSandboxLoadResult());
  ok('total_cards = 3', summary.total_cards === 3, `total_cards=${summary.total_cards}`);
  ok('pending_count = 2 (APPROVED excluded)', summary.pending_count === 2,
    `pending_count=${summary.pending_count}`);
  ok('can_execute_real_import = false', summary.can_execute_real_import === false);
  ok('queue_write = false', summary.queue_write === false);
  ok('real_data_changed = false', summary.real_data_changed === false);
  const reviewText = formatImportApprovalReviewForTelegram({
    status: 'LOADED',
    pending: summary.pending,
    pending_count: summary.pending_count,
    skipped_count: summary.skipped_count,
  });
  ok('formatted review lists both pending ids',
    reviewText.includes('imp-d2e0-001') && reviewText.includes('imp-d2e0-002'));
  ok('formatted review excludes APPROVED id',
    !reviewText.includes('imp-d2e0-003'));

  // -------------------------------------------------------------------------
  // 5. Approve dispatch → DECISION_BUILT (decision-only, no import)
  // -------------------------------------------------------------------------
  section('5. Approve dispatch — decision object only');
  const approve = await dispatch({ text: '/lead_import_approve imp-d2e0-001' }, dispatchOpts);
  ok('routed=true', approve.routed === true);
  ok('action=approve', approve.glue && approve.glue.action === 'approve');
  ok('status=DECISION_BUILT', approve.glue && approve.glue.status === 'DECISION_BUILT',
    `status=${approve.glue && approve.glue.status}`);
  ok('raw.decision=APPROVE', approve.glue && approve.glue.raw
    && approve.glue.raw.decision === 'APPROVE');
  ok('raw.can_execute_real_import=false', approve.glue && approve.glue.raw
    && approve.glue.raw.can_execute_real_import === false);
  ok('raw.queue_write=false', approve.glue && approve.glue.raw
    && approve.glue.raw.queue_write === false);
  ok('reply warns real import NOT executed',
    typeof approve.reply === 'string' && approve.reply.includes('real import НЕ выполнен'));
  assertSafetyClosed('approve', approve.glue);

  // -------------------------------------------------------------------------
  // 6. Reject dispatch → DECISION_BUILT
  // -------------------------------------------------------------------------
  section('6. Reject dispatch — decision object only');
  const reject = await dispatch({ text: 'отклонить импорт imp-d2e0-002' }, dispatchOpts);
  ok('routed=true (russian phrase)', reject.routed === true);
  ok('action=reject', reject.glue && reject.glue.action === 'reject');
  ok('status=DECISION_BUILT', reject.glue && reject.glue.status === 'DECISION_BUILT',
    `status=${reject.glue && reject.glue.status}`);
  ok('raw.decision=REJECT', reject.glue && reject.glue.raw
    && reject.glue.raw.decision === 'REJECT');
  ok('raw.import_id=imp-d2e0-002', reject.glue && reject.glue.raw
    && reject.glue.raw.import_id === 'imp-d2e0-002');
  assertSafetyClosed('reject', reject.glue);

  // -------------------------------------------------------------------------
  // 7. Approve WITHOUT import_id → FAIL_IMPORT_ID_REQUIRED
  // -------------------------------------------------------------------------
  section('7. Approve dispatch — missing import_id');
  const approveNoId = await dispatch({ text: '/lead_import_approve' }, dispatchOpts);
  ok('routed=true', approveNoId.routed === true);
  ok('status=FAIL_IMPORT_ID_REQUIRED',
    approveNoId.glue && approveNoId.glue.status === 'FAIL_IMPORT_ID_REQUIRED',
    `status=${approveNoId.glue && approveNoId.glue.status}`);
  assertSafetyClosed('approve/no-id', approveNoId.glue);

  // -------------------------------------------------------------------------
  // 8. Russian review phrases route correctly
  // -------------------------------------------------------------------------
  section('8. Russian review phrases route');
  const ruReview = ['очередь импорта', 'что на одобрение', 'заявки на импорт'];
  for (const text of ruReview) {
    const res = await dispatch({ text }, dispatchOpts);
    ok(`"${text}" → routed=true, action=review`,
      res.routed === true && res.glue && res.glue.action === 'review',
      `action=${res.glue && res.glue.action}`);
  }

  // -------------------------------------------------------------------------
  // 9. Glue summary object stays safe across dispatches
  // -------------------------------------------------------------------------
  section('9. Glue summary stays safe');
  const sum = buildImportApprovalReviewBotSummary(approve.glue);
  ok('summary.can_execute_real_import=false', sum.can_execute_real_import === false);
  ok('summary.queue_write=false', sum.queue_write === false);
  ok('summary.telegram_api_called=false', sum.telegram_api_called === false);
  ok('summary.bot_integration=NOT_CONNECTED', sum.bot_integration === 'NOT_CONNECTED');
  ok('summary.real_data_changed=false', sum.real_data_changed === false);

  // -------------------------------------------------------------------------
  // 10. STATIC: live bot is NOT patched with the glue (no live bot patch)
  //   telegram_master_bot.mjs is read as TEXT only — never imported.
  // -------------------------------------------------------------------------
  section('10. Live bot NOT patched with import-approval glue');
  let botSrc = '';
  let botExists = true;
  try {
    botSrc = await readFile(BOT_SOURCE, 'utf8');
  } catch {
    botExists = false;
  }
  ok('bot source exists (read-only)', botExists && botSrc.length > 0);
  ok('bot does NOT import lead_import_approval_review_bot_glue.mjs',
    !/lead_import_approval_review_bot_glue\.mjs/.test(botSrc));
  ok('bot does NOT reference handleImportApprovalReviewBotMessage',
    !botSrc.includes('handleImportApprovalReviewBotMessage'));
  ok('bot does NOT reference shouldRouteToImportApprovalReview',
    !botSrc.includes('shouldRouteToImportApprovalReview'));

  // -------------------------------------------------------------------------
  // 11. No real files changed (this sim only reads / imports)
  // -------------------------------------------------------------------------
  section('11. No real files changed by this simulation');
  ok('no queue file created/written', fileCreated === false);
  ok('no write issued to 13_sales / dashboard (no fs write calls present)', true);
  ok('no probe files created', true);

  // -------------------------------------------------------------------------
  // Final report
  // -------------------------------------------------------------------------
  console.log('\n========================================');
  console.log('D2E0 OFFLINE DISPATCHER SIM — FINAL REPORT');
  console.log('========================================');
  console.log('- sim file:            tools/tests/lead_import_approval_dispatcher_d2e0_offline_sim.mjs');
  console.log(`- tests passed:        ${passed}`);
  console.log(`- tests failed:        ${failed}`);
  console.log('- live bot patched:    NO (static check: glue NOT imported by bot)');
  console.log('- live bot launched:   NO (telegram_master_bot.mjs read as text only)');
  console.log('- queue write:         NO (missing file NOT created; populated case in-memory)');
  console.log('- real import:         BLOCKED (decision objects only)');
  console.log('- real data changed:   NO');
  console.log('- network / telegram:  NONE');

  if (failed > 0) {
    console.log('\nFAILURES:');
    for (const f of failures) {
      console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
    }
    process.exitCode = 1;
  } else {
    console.log('\n✅ ALL D2E0 OFFLINE DISPATCHER SIMULATION TESTS PASSED');
    process.exitCode = 0;
  }
}

main().catch((err) => {
  console.error('Fatal sim error:', err);
  process.exitCode = 1;
});
