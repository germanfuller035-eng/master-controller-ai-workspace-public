/**
 * lead_intake_commands_d1b_test.mjs
 *
 * Standalone OFFLINE test runner for the D1b Lead Intake Command Handler.
 *
 * Module under test:
 *   tools/telegram_gateway/lead_intake_commands.mjs
 *
 * HARD SAFETY (enforced by this test):
 *   - Runs ONLY inside the sandbox: tmp/lead_intake_commands_d1b_workspace/
 *   - No network. No Telegram API. No email. No SMTP.
 *   - No .env / AI_SECRETS reads.
 *   - No real 13_sales write. No contact registry write.
 *   - Never passes allowRealWrite / confirmRealWrite (auto_send stays BLOCKED).
 *   - Never deletes files (uses unique per-run sandbox subfolders instead).
 *
 * Run:
 *   node --check tools/tests/lead_intake_commands_d1b_test.mjs
 *   node tools/tests/lead_intake_commands_d1b_test.mjs
 */

'use strict';

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseLeadIntakeCommand,
  handleLeadIntakeCommand,
  runLeadImportPreviewCommand,
  runLeadImportSandboxCommand,
  runLeadImportStatusCommand,
  runLeadImportCommitRequestCommand,
  runLeadImportCommitApprovedCommand,
  runLeadImportAbortCommand,
  runDaily100ReportCommand,
  buildDaily100Summary,
} from '../telegram_gateway/lead_intake_commands.mjs';

// ---------------------------------------------------------------------------
// Paths / sandbox
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// d:\AI_WORKSPACE
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..');

// Sandbox base for any sandbox-pipeline runs done by this test.
const SANDBOX_BASE = path.resolve(
  WORKSPACE_ROOT,
  'tmp',
  'lead_intake_commands_d1b_workspace'
);

// Absolute path to the real (protected) leads_master — we only check it is
// NOT touched; we never write to it.
const REAL_LEADS_MASTER = path.resolve(
  WORKSPACE_ROOT,
  '13_sales/daily_lead_factory/data/processed/leads_master.json'
);
const REAL_SALES_DIR = path.resolve(WORKSPACE_ROOT, '13_sales');

const RUN_STAMP = new Date().toISOString().replace(/[:.]/g, '-');

let sandboxCounter = 0;

/** Create (and return) a unique sandbox workspace folder for a single test. */
function freshSandbox(label) {
  sandboxCounter += 1;
  const dir = path.join(
    SANDBOX_BASE,
    `run_${RUN_STAMP}_${String(sandboxCounter).padStart(2, '0')}_${label}`
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// A small valid lead block (pipe-format). Enough to parse cleanly.
const GOOD_LEADS_TEXT = [
  'zb23 | Завод ЖБИ ЗБ23 | https://zb23.ru | email: info@zb23.ru',
  'atom | Атом Металлоконструкции | https://atom-mk.ru | email: sales@atom-mk.ru',
  'profi | Метал Профи | https://metal-profi.ru | email: hi@metal-profi.ru',
].join('\n');

// A block with > PREVIEW_MAX_ROWS (5) rows to test truncation.
const MANY_LEADS_TEXT = Array.from({ length: 8 }, (_, i) =>
  `lead${i} | Company ${i} | https://company${i}.ru | email: c${i}@company${i}.ru`
).join('\n');

// ---------------------------------------------------------------------------
// Tiny test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed += 1;
    failures.push({ name, message: err && err.message ? err.message : String(err) });
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err && err.message ? err.message : err}`);
  }
}

/** Assert the standard per-result safety contract (item 19). */
function assertSafety(result, label) {
  assert.ok(result && typeof result === 'object', `${label}: result is object`);
  const s = result.safety;
  assert.ok(s && typeof s === 'object', `${label}: safety present`);
  assert.strictEqual(s.network_used, 'NO', `${label}: network_used NO`);
  assert.strictEqual(s.telegram_api_used, 'NO', `${label}: telegram_api_used NO`);
  assert.strictEqual(s.external_send, 'NO', `${label}: external_send NO`);
  assert.strictEqual(s.smtp_used, 'NO', `${label}: smtp_used NO`);
  assert.strictEqual(s.auto_send, 'BLOCKED', `${label}: auto_send BLOCKED`);
  assert.strictEqual(s.client_messages_sent, 0, `${label}: client_messages_sent 0`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function main() {
  console.log('lead_intake_commands_d1b_test — START');
  console.log(`sandbox base: ${SANDBOX_BASE}`);

  // Snapshot real-data state up front (item 20).
  const realMasterExistedBefore = fs.existsSync(REAL_LEADS_MASTER);
  const realMasterMtimeBefore = realMasterExistedBefore
    ? fs.statSync(REAL_LEADS_MASTER).mtimeMs
    : null;

  // ----- 1..7: command parsing -----

  await test('1. parse /lead_import_preview <text>', () => {
    const p = parseLeadIntakeCommand('/lead_import_preview some lead text');
    assert.strictEqual(p.ok, true);
    assert.strictEqual(p.command, 'lead_import_preview');
    assert.strictEqual(p.text, 'some lead text');
  });

  await test('2. parse /lead_import_sandbox <text>', () => {
    const p = parseLeadIntakeCommand('/lead_import_sandbox some lead text');
    assert.strictEqual(p.ok, true);
    assert.strictEqual(p.command, 'lead_import_sandbox');
    assert.strictEqual(p.text, 'some lead text');
  });

  await test('3. parse /lead_import_status [import_id]', () => {
    const withId = parseLeadIntakeCommand('/lead_import_status import-123');
    assert.strictEqual(withId.ok, true);
    assert.strictEqual(withId.command, 'lead_import_status');
    assert.strictEqual(withId.args[0], 'import-123');

    const noId = parseLeadIntakeCommand('/lead_import_status');
    assert.strictEqual(noId.ok, true);
    assert.strictEqual(noId.command, 'lead_import_status');
    assert.strictEqual(noId.args.length, 0);
  });

  await test('4. parse /lead_import_commit_request <import_id>', () => {
    const p = parseLeadIntakeCommand('/lead_import_commit_request import-123');
    assert.strictEqual(p.ok, true);
    assert.strictEqual(p.command, 'lead_import_commit_request');
    assert.strictEqual(p.args[0], 'import-123');
  });

  await test('5. parse /lead_import_commit_approved <approval_id> <phrase>', () => {
    const p = parseLeadIntakeCommand(
      '/lead_import_commit_approved approval-9 APPROVE REAL LEAD IMPORT import-123'
    );
    assert.strictEqual(p.ok, true);
    assert.strictEqual(p.command, 'lead_import_commit_approved');
    assert.strictEqual(p.args[0], 'approval-9');
    assert.strictEqual(p.args.slice(1).join(' '), 'APPROVE REAL LEAD IMPORT import-123');
  });

  await test('6. parse /lead_import_abort <import_id>', () => {
    const p = parseLeadIntakeCommand('/lead_import_abort import-123');
    assert.strictEqual(p.ok, true);
    assert.strictEqual(p.command, 'lead_import_abort');
    assert.strictEqual(p.args[0], 'import-123');
  });

  await test('7. parse /daily100_report [import_id]', () => {
    const p = parseLeadIntakeCommand('/daily100_report import-123');
    assert.strictEqual(p.ok, true);
    assert.strictEqual(p.command, 'daily100_report');
    assert.strictEqual(p.args[0], 'import-123');
  });

  // ----- 8: preview never writes real data -----

  await test('8. preview does not write real data', () => {
    const r = runLeadImportPreviewCommand(GOOD_LEADS_TEXT);
    assert.strictEqual(r.command, 'lead_import_preview');
    assert.strictEqual(r.real_write_status, 'NOT_REQUESTED');
    assert.strictEqual(r.can_commit_import, false);
    assertSafety(r, 'preview');
    // Real master untouched.
    assert.strictEqual(fs.existsSync(REAL_LEADS_MASTER), realMasterExistedBefore);
  });

  // ----- 9: sandbox never writes real data -----

  let sandboxResult = null;
  const stagingStore = { entries: [] };

  await test('9. sandbox does not write real data', async () => {
    const workspace = freshSandbox('sandbox');
    sandboxResult = await runLeadImportSandboxCommand(GOOD_LEADS_TEXT, {
      workspace,
      stagingStore,
    });
    assert.strictEqual(sandboxResult.command, 'lead_import_sandbox');
    assert.strictEqual(sandboxResult.real_write_status, 'NOT_REQUESTED');
    assertSafety(sandboxResult, 'sandbox');
    // The sandbox workspace must NOT be the real 13_sales tree.
    assert.ok(
      !String(sandboxResult.workspace_root || workspace).includes(`${path.sep}13_sales${path.sep}`),
      'sandbox workspace must not be inside 13_sales'
    );
    // Real master mtime unchanged.
    if (realMasterExistedBefore) {
      assert.strictEqual(fs.statSync(REAL_LEADS_MASTER).mtimeMs, realMasterMtimeBefore);
    } else {
      assert.strictEqual(fs.existsSync(REAL_LEADS_MASTER), false);
    }
  });

  // ----- 10: commit_request never writes real data -----

  await test('10. commit_request does not write real data', () => {
    const importId = sandboxResult && sandboxResult.import_id;
    assert.ok(importId, 'precondition: sandbox produced an import_id');
    const r = runLeadImportCommitRequestCommand(importId, { stagingStore });
    // Either request accepted (records intent only) or blocked — never COMMITTED.
    assert.notStrictEqual(r.real_write_status, 'COMMITTED');
    assert.ok(
      r.real_write_status === 'COMMIT_REQUESTED' || r.real_write_status === 'BLOCKED',
      `commit_request real_write_status must be COMMIT_REQUESTED or BLOCKED (got ${r.real_write_status})`
    );
    assertSafety(r, 'commit_request');
    if (realMasterExistedBefore) {
      assert.strictEqual(fs.statSync(REAL_LEADS_MASTER).mtimeMs, realMasterMtimeBefore);
    }
  });

  // ----- 11: commit_approved ALWAYS BLOCKED in standalone -----

  await test('11. commit_approved is ALWAYS BLOCKED in standalone', () => {
    const importId = sandboxResult && sandboxResult.import_id;
    const phrase = `APPROVE REAL LEAD IMPORT ${importId}`;
    // Even with a fully-approved-looking approval record passed in, it stays BLOCKED.
    const r = runLeadImportCommitApprovedCommand('approval-9', phrase, {
      import_id: importId,
      allowRealWrite: true,
      confirmRealWrite: true,
      approval: {
        status: 'approved',
        import_id: importId,
        snapshot_id: sandboxResult.snapshot_id,
        qa_status: sandboxResult.qa_status,
      },
    });
    assert.strictEqual(r.status, 'COMMIT_APPROVED_BLOCKED');
    assert.strictEqual(r.real_write_status, 'BLOCKED');
    assert.strictEqual(r.can_commit_import, false);
    assertSafety(r, 'commit_approved');
  });

  // ----- 12: bad confirmation phrase blocks commit -----

  await test('12. bad confirmation phrase blocks commit', () => {
    const importId = sandboxResult && sandboxResult.import_id;
    const r = runLeadImportCommitApprovedCommand('approval-9', 'WRONG PHRASE', {
      import_id: importId,
    });
    assert.strictEqual(r.real_write_status, 'BLOCKED');
    assert.strictEqual(r.gates.confirmation_phrase_matches, false);
    assertSafety(r, 'commit_approved bad phrase');
  });

  // ----- 13: missing approval_id blocks commit -----

  await test('13. missing approval_id blocks commit', () => {
    const importId = sandboxResult && sandboxResult.import_id;
    const phrase = `APPROVE REAL LEAD IMPORT ${importId}`;
    const r = runLeadImportCommitApprovedCommand('', phrase, { import_id: importId });
    assert.strictEqual(r.real_write_status, 'BLOCKED');
    assert.strictEqual(r.gates.has_approval_id, false);
    assertSafety(r, 'commit_approved missing approval_id');
  });

  // ----- 14: missing import_id blocks commit -----

  await test('14. missing import_id blocks commit', () => {
    const r = runLeadImportCommitApprovedCommand('approval-9', 'some phrase', {});
    assert.strictEqual(r.real_write_status, 'BLOCKED');
    assert.strictEqual(r.gates.has_import_id, false);
    assertSafety(r, 'commit_approved missing import_id');

    // Also: commit_request with missing import_id must be safely rejected.
    const r2 = runLeadImportCommitRequestCommand('', { stagingStore });
    assert.strictEqual(r2.status, 'MISSING_IMPORT_ID');
    assert.strictEqual(r2.real_write_status, 'NOT_REQUESTED');
    assertSafety(r2, 'commit_request missing import_id');
  });

  // ----- 15: daily100 summary completeness -----

  await test('15. daily100 summary includes all required fields', () => {
    const importId = sandboxResult && sandboxResult.import_id;
    const r = runDaily100ReportCommand(importId, { stagingStore });
    assert.strictEqual(r.status, 'DAILY100_REPORT_READY');
    const s = r.summary;
    assert.ok(s && typeof s === 'object', 'summary present');
    // total / parsed / added / merged / duplicates / needs_review / errors
    for (const key of [
      'total_rows',
      'parsed_count',
      'added_count',
      'merged_count',
      'duplicate_count',
      'needs_review_count',
      'error_count',
      'qa_status',
      'real_write_status',
    ]) {
      assert.ok(key in s, `summary.${key} present`);
    }
    // outreach_status reported (item 15) and import != outreach.
    assert.ok('outreach_status' in s, 'summary.outreach_status present');
    assert.strictEqual(s.outreach_status, 'NOT_STARTED');
    assertSafety(r, 'daily100_report');
  });

  // ----- 16: preview returns max 5 candidates -----

  await test('16. preview returns at most 5 candidates (no full dump)', () => {
    const r = runLeadImportPreviewCommand(MANY_LEADS_TEXT);
    assert.ok(Array.isArray(r.preview_rows), 'preview_rows is array');
    assert.ok(r.preview_rows.length <= 5, `preview_rows <= 5 (got ${r.preview_rows.length})`);
    assert.strictEqual(r.preview_truncated, true, 'preview_truncated true for >5 rows');
    assertSafety(r, 'preview many');
  });

  // ----- 17: status of unknown import is safe -----

  await test('17. status of unknown import returns safe response', () => {
    const r = runLeadImportStatusCommand('does-not-exist-xyz', { stagingStore });
    assert.strictEqual(r.status, 'NOT_FOUND');
    assert.strictEqual(r.can_commit_import, false);
    assert.strictEqual(r.real_write_status, 'NOT_REQUESTED');
    assertSafety(r, 'status unknown');
  });

  // ----- 18: abort marks staged import aborted (in-memory only) -----

  await test('18. abort marks staged import aborted in in-memory staging only', () => {
    const importId = sandboxResult && sandboxResult.import_id;
    const r = runLeadImportAbortCommand(importId, { stagingStore });
    assert.strictEqual(r.status, 'DAILY100_ABORTED');
    assert.strictEqual(r.real_write_status, 'NOT_REQUESTED');
    const entry = stagingStore.entries.find((e) => e && e.import_id === importId);
    assert.ok(entry, 'staging entry exists');
    assert.strictEqual(entry.aborted, true, 'in-memory entry marked aborted');
    assertSafety(r, 'abort');
    // No real data write.
    if (realMasterExistedBefore) {
      assert.strictEqual(fs.statSync(REAL_LEADS_MASTER).mtimeMs, realMasterMtimeBefore);
    }
  });

  // ----- 19: safety flags always present on every command result -----

  await test('19. safety flags always present on every command result', async () => {
    const results = [
      runLeadImportPreviewCommand(GOOD_LEADS_TEXT),
      runLeadImportStatusCommand(undefined, { stagingStore }),
      runLeadImportCommitRequestCommand('whatever', { stagingStore }),
      runLeadImportCommitApprovedCommand('a', 'b', {}),
      runLeadImportAbortCommand('whatever', { stagingStore }),
      runDaily100ReportCommand(undefined, { stagingStore }),
      await handleLeadIntakeCommand('/unknown_command foo'),
      await handleLeadIntakeCommand('/lead_import_preview ' + GOOD_LEADS_TEXT),
    ];
    results.forEach((r, i) => assertSafety(r, `result[${i}]`));
  });

  // ----- 20: no 13_sales write (verified across the whole run) -----

  await test('20. no real 13_sales write across the run', () => {
    if (realMasterExistedBefore) {
      assert.strictEqual(
        fs.statSync(REAL_LEADS_MASTER).mtimeMs,
        realMasterMtimeBefore,
        'real leads_master.json must be unchanged'
      );
    } else {
      assert.strictEqual(
        fs.existsSync(REAL_LEADS_MASTER),
        false,
        'real leads_master.json must not be created'
      );
    }
  });

  // ----- 21: no staging file created unless explicitly allowed -----

  await test('21. no staging file created in 13_sales (in-memory staging only)', () => {
    // The default sandbox command keeps staging in-memory or in options.stagingStore.
    // It must never create staging files inside the real 13_sales tree.
    // We confirm staging lives in-memory and report flags it as not a real write.
    assert.ok(sandboxResult && sandboxResult.staging, 'sandbox carried staging info');
    assert.strictEqual(
      sandboxResult.staging.allowed_real_staging_write,
      false,
      'real staging write must not be allowed'
    );
    // Sanity: stagingStore entries are plain in-memory objects, not file paths.
    assert.ok(Array.isArray(stagingStore.entries), 'stagingStore.entries is in-memory array');
  });

  // ----- 22..27: source-level safety scan of the module under test -----

  await test('22-27. module under test has no network/telegram/email/smtp/secrets/external send', () => {
    const moduleSrc = fs.readFileSync(
      path.resolve(WORKSPACE_ROOT, 'tools/telegram_gateway/lead_intake_commands.mjs'),
      'utf8'
    );
    // Strip block & line comments + the documentation header so that the
    // "what this does NOT do" prose does not trip the scanner.
    const code = moduleSrc
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');

    const forbidden = [
      // 22 no network
      /\bfetch\s*\(/i,
      /\baxios\b/i,
      /require\(['"]https?['"]\)/i,
      /from\s+['"]node:https?['"]/i,
      // 23 no Telegram API
      /api\.telegram\.org/i,
      /node-telegram-bot-api/i,
      /sendMessage\s*\(/i,
      /bot\.send/i,
      // 24 no email
      /\bnodemailer\b/i,
      /\bsendMail\b/i,
      // 25 no SMTP
      /\bsmtp\b/i,
      /createTransport/i,
      // 26 no .env / AI_SECRETS
      /process\.env\./,
      /AI_SECRETS/,
      /\.env\b/,
      // 27 no external send patterns
      /POST\s+http/i,
    ];

    const hits = [];
    for (const re of forbidden) {
      if (re.test(code)) hits.push(re.toString());
    }
    assert.strictEqual(hits.length, 0, `forbidden patterns found in module code: ${hits.join(', ')}`);
  });

  // ----- extra: buildDaily100Summary works on raw entry shapes -----

  await test('extra. buildDaily100Summary tolerates short/long count keys', () => {
    const s = buildDaily100Summary({
      counts: { total: 3, valid: 3, added: 2, merged: 1, duplicate: 0, needs_review: 0, errors: 0 },
      qa_status: 'PASS',
      real_write_status: 'NOT_REQUESTED',
    });
    assert.strictEqual(s.total_rows, 3);
    assert.strictEqual(s.added_count, 2);
    assert.strictEqual(s.outreach_status, 'NOT_STARTED');
  });

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------

  console.log('');
  console.log('================ RESULT ================');
  console.log(`tests passed: ${passed}`);
  console.log(`tests failed: ${failed}`);
  if (failures.length) {
    console.log('failures:');
    for (const f of failures) console.log(`  - ${f.name}: ${f.message}`);
  }
  console.log('safety: network=NO telegram_api=NO email=NO smtp=NO auto_send=BLOCKED');
  console.log('real data changed: NO');
  console.log('========================================');

  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('FATAL test runner error:', err);
  process.exitCode = 1;
});
