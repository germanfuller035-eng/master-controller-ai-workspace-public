/**
 * lead_import_approval_queue_init_real_d2i_test.mjs
 *
 * Daily Lead Factory — D2I — temp-only test for the empty real-queue INIT helper.
 *
 * SAFETY: every case runs in a throwaway directory under
 *   tools/tests/_d2i_tmp/<unique>/...
 * whose path segments contain NO segment exactly equal to `tmp` (the segment is
 * `_d2i_tmp`), so isSandboxQueuePath() treats it as a REAL path — exactly the
 * mode D2I is meant for. The production file
 *   13_sales/approval_queue/lead_import_approvals.json
 * is NEVER created or touched by this test. The temp dir is removed at the end.
 *
 * No network, no Telegram, no SMTP, no .env, no real import, no client contact.
 *
 * Run: node tools/tests/lead_import_approval_queue_init_real_d2i_test.mjs
 */

'use strict';

import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  getInitRealQueueVersion,
  planInitRealApprovalQueue,
  initRealApprovalQueue,
  handleLeadImportApprovalQueueInitRealCommand,
} from '../telegram_gateway/lead_import_approval_queue_init_real.mjs';

import { loadApprovalQueue } from '../telegram_gateway/lead_intake_approval_queue.mjs';
import { getApprovalQueueVersion } from '../telegram_gateway/lead_intake_approval_queue.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Real-style scratch root: segment `_d2i_tmp` is NOT exactly `tmp`.
const SCRATCH_ROOT = path.join(__dirname, '_d2i_tmp', `run-${Date.now()}`);

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond) {
  if (cond) {
    passed += 1;
    console.log(`  PASS: ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL: ${name}`);
  }
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log('D2I init-real empty-queue — temp-only test');
  console.log(`scratch root: ${SCRATCH_ROOT}`);
  await fs.mkdir(SCRATCH_ROOT, { recursive: true });

  const d2bVersion = getApprovalQueueVersion();

  // -----------------------------------------------------------------------
  // Case 1: dry-run (no confirmRealQueueInit) -> no file created.
  // -----------------------------------------------------------------------
  console.log('\nCase 1: dry-run (no confirm) -> no file');
  {
    const target = path.join(SCRATCH_ROOT, 'c1', 'lead_import_approvals.json');
    const res = await initRealApprovalQueue({ queuePath: target });
    check('1.status DRY_RUN', res.status === 'DRY_RUN');
    check('1.dry_run true', res.dry_run === true);
    check('1.queue_written false', res.queue_written === false);
    check('1.queue_init false', res.queue_init === false);
    check('1.planned cards []', Array.isArray(res.planned_content.cards) && res.planned_content.cards.length === 0);
    check('1.file NOT created', (await fileExists(target)) === false);
  }

  // -----------------------------------------------------------------------
  // Case 2: confirmed init -> file created with exact empty shape.
  // -----------------------------------------------------------------------
  console.log('\nCase 2: confirmed init -> file created, exact shape');
  let case2Target;
  {
    const target = path.join(SCRATCH_ROOT, 'c2', 'lead_import_approvals.json');
    case2Target = target;
    const res = await initRealApprovalQueue({ queuePath: target, confirmRealQueueInit: true });
    check('2.status OK_INITIALIZED', res.status === 'OK_INITIALIZED');
    check('2.queue_written true', res.queue_written === true);
    check('2.queue_init true', res.queue_init === true);
    check('2.cards_count 0', res.cards_count === 0);
    check('2.file created', (await fileExists(target)) === true);

    const raw = await fs.readFile(target, 'utf8');
    const parsed = JSON.parse(raw);
    const keys = Object.keys(parsed).sort();
    check('2.exact keys {version,updated_at,cards}',
      JSON.stringify(keys) === JSON.stringify(['cards', 'updated_at', 'version']));
    check('2.version === D2B version', parsed.version === d2bVersion);
    check('2.cards is empty array', Array.isArray(parsed.cards) && parsed.cards.length === 0);
    check('2.updated_at is ISO string', typeof parsed.updated_at === 'string' && !Number.isNaN(Date.parse(parsed.updated_at)));
  }

  // -----------------------------------------------------------------------
  // Case 3: re-init existing file -> FAIL_QUEUE_ALREADY_EXISTS, unchanged.
  // -----------------------------------------------------------------------
  console.log('\nCase 3: re-init existing -> refuse, file unchanged');
  {
    const before = await fs.readFile(case2Target, 'utf8');
    const res = await initRealApprovalQueue({ queuePath: case2Target, confirmRealQueueInit: true });
    check('3.status FAIL_QUEUE_ALREADY_EXISTS', res.status === 'FAIL_QUEUE_ALREADY_EXISTS');
    check('3.ok false', res.ok === false);
    check('3.queue_written false', res.queue_written === false);
    const after = await fs.readFile(case2Target, 'utf8');
    check('3.file byte-for-byte unchanged', before === after);
  }

  // -----------------------------------------------------------------------
  // Case 4: missing queuePath -> FAIL_QUEUE_PATH_REQUIRED.
  // -----------------------------------------------------------------------
  console.log('\nCase 4: missing queuePath -> refuse');
  {
    const res = await initRealApprovalQueue({ confirmRealQueueInit: true });
    check('4.status FAIL_QUEUE_PATH_REQUIRED', res.status === 'FAIL_QUEUE_PATH_REQUIRED');
    check('4.queue_written false', res.queue_written === false);
  }

  // -----------------------------------------------------------------------
  // Case 5: sandbox/tmp path -> FAIL_NOT_REAL_PATH (even with confirm).
  // -----------------------------------------------------------------------
  console.log('\nCase 5: sandbox/tmp path -> refuse');
  {
    // A path with a segment exactly `tmp` is a sandbox path.
    const sandboxTarget = path.join(SCRATCH_ROOT, 'tmp', 'lead_import_approvals.json');
    const res = await initRealApprovalQueue({ queuePath: sandboxTarget, confirmRealQueueInit: true });
    check('5.status FAIL_NOT_REAL_PATH', res.status === 'FAIL_NOT_REAL_PATH');
    check('5.is_sandbox true', res.is_sandbox === true);
    check('5.queue_written false', res.queue_written === false);
    check('5.file NOT created', (await fileExists(sandboxTarget)) === false);
  }

  // -----------------------------------------------------------------------
  // Case 6: created file loads via D2B loadApprovalQueue, cards.length === 0.
  // -----------------------------------------------------------------------
  console.log('\nCase 6: D2B loadApprovalQueue reads created file cleanly');
  {
    const q = await loadApprovalQueue(case2Target);
    check('6.no error', !q.error);
    check('6.exists true', q.exists === true);
    check('6.version === D2B version', q.version === d2bVersion);
    check('6.cards.length === 0', Array.isArray(q.cards) && q.cards.length === 0);
  }

  // -----------------------------------------------------------------------
  // Case 6b: command handler routes init + help correctly.
  // -----------------------------------------------------------------------
  console.log('\nCase 6b: command handler routing');
  {
    const target = path.join(SCRATCH_ROOT, 'c6b', 'lead_import_approvals.json');
    const dry = await handleLeadImportApprovalQueueInitRealCommand('init', { queuePath: target });
    check('6b.init dry-run', dry.action === 'init' && dry.status === 'DRY_RUN');
    const help = await handleLeadImportApprovalQueueInitRealCommand('whatever', {});
    check('6b.help fallback', help.status === 'HELP');
    check('6b.version exposed', getInitRealQueueVersion() === 'lead-import-approval-queue-init-real-d2i-v1');
  }

  // -----------------------------------------------------------------------
  // Case 7: source scan — no network/Telegram/SMTP/.env/13_sales lead writes.
  // -----------------------------------------------------------------------
  console.log('\nCase 7: source scan of the helper is clean');
  {
    const helperPath = path.join(__dirname, '..', 'telegram_gateway', 'lead_import_approval_queue_init_real.mjs');
    const src = await fs.readFile(helperPath, 'utf8');
    // Strip comments so the safety-contract prose (which intentionally lists the
    // forbidden things) does not produce false positives.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\s)\/\/.*$/gm, '$1');

    // Patterns target actual dangerous USAGE, not the SAFETY-flag names
    // (e.g. `smtp_used: 'NO'`) which are intentionally present as code.
    const forbidden = [
      /fetch\s*\(/,
      /https?:\/\//i,
      /nodemailer/i,
      /createTransport\s*\(/i,
      /\.sendMail\s*\(/i,
      /new\s+TelegramBot/i,
      /api\.telegram\.org/i,
      /process\.env\b/,
      /AI_SECRETS/,
      /leads_master/i,
    ];

    let clean = true;
    for (const re of forbidden) {
      if (re.test(code)) {
        clean = false;
        console.log(`    forbidden pattern present: ${re}`);
      }
    }
    check('7.source scan clean', clean);
    // planInitRealApprovalQueue dry-run also never writes.
    const target = path.join(SCRATCH_ROOT, 'c7', 'lead_import_approvals.json');
    const plan = await planInitRealApprovalQueue({ queuePath: target });
    check('7.plan dry-run no write', plan.status === 'DRY_RUN' && (await fileExists(target)) === false);
  }

  // -----------------------------------------------------------------------
  // Cleanup — remove ONLY our scratch tree under tools/tests/_d2i_tmp/.
  // -----------------------------------------------------------------------
  console.log('\nCleanup: removing scratch dir');
  await fs.rm(path.join(__dirname, '_d2i_tmp'), { recursive: true, force: true });

  console.log(`\n==== D2I init-real test: ${passed} passed, ${failed} failed ====`);
  if (failed > 0) {
    console.log('FAILURES:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('UNEXPECTED ERROR:', err);
  process.exit(1);
});
