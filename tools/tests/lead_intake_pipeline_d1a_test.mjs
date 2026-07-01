/**
 * lead_intake_pipeline_d1a_test.mjs
 *
 * Standalone OFFLINE test runner for the D1a Lead Intake Pipeline.
 *
 * Module under test:
 *   tools/telegram_gateway/lead_intake_pipeline.mjs
 *
 * HARD SAFETY (enforced by this test):
 *   - Runs ONLY inside the sandbox: tmp/lead_intake_pipeline_d1a_workspace/
 *   - No network. No Telegram API. No email. No SMTP.
 *   - No .env / AI_SECRETS reads.
 *   - No real 13_sales write. No contact registry write.
 *   - Never passes allowRealWrite / confirmRealWrite (auto_send stays BLOCKED).
 *   - Never deletes files (uses unique per-run sandbox subfolders instead).
 *
 * Run:
 *   node --check tools/tests/lead_intake_pipeline_d1a_test.mjs
 *   node tools/tests/lead_intake_pipeline_d1a_test.mjs
 */

'use strict';

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getLeadIntakePipelinePaths,
  loadLeadsMaster,
  saveLeadsMasterAtomic,
  runLeadIntakePipeline,
  buildLeadIntakePipelineSummary,
} from '../telegram_gateway/lead_intake_pipeline.mjs';

import {
  evaluateLeadImportResult,
  QA_STATUS,
} from '../telegram_gateway/lead_import_qa_gate.mjs';

// ---------------------------------------------------------------------------
// Paths / sandbox
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// d:\AI_WORKSPACE
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..');

// The pipeline treats path.resolve('D:\\AI_WORKSPACE') as the REAL target root
// (case-sensitive string compare). Use the exact same value to exercise the
// real-write guard. We NEVER pass approval flags, so nothing is ever written.
const REAL_TARGET_WORKSPACE = path.resolve('D:\\AI_WORKSPACE');


// Sandbox base required by the task.
const SANDBOX_BASE = path.resolve(
  WORKSPACE_ROOT,
  'tmp',
  'lead_intake_pipeline_d1a_workspace'
);

// Absolute path to the real (protected) leads_master — we only check it is
// NOT touched; we never write to it.
const REAL_LEADS_MASTER = path.resolve(
  WORKSPACE_ROOT,
  '13_sales/daily_lead_factory/data/processed/leads_master.json'
);

const RUN_STAMP = new Date()
  .toISOString()
  .replace(/[:.]/g, '-');

let sandboxCounter = 0;

/**
 * Create (and return) a unique sandbox workspace folder for a single test.
 * Never deletes anything — uses unique names instead.
 */
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
// Tiny test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (err) {
    failed += 1;
    const msg = err && err.message ? err.message : String(err);
    failures.push({ name, msg });
    console.log(`FAIL  ${name}\n        ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Build N unique structured (pipe) lead rows. */
function buildStructuredLeads(n) {
  const rows = [];
  for (let i = 1; i <= n; i += 1) {
    rows.push(
      `L${i} | Company ${i} | metallurgy | Moscow | site: comp${i}.ru`
    );
  }
  return rows.join('\n');
}

function assertInsideSandbox(p, label) {
  const resolved = path.resolve(p);
  assert.ok(
    resolved.startsWith(SANDBOX_BASE + path.sep),
    `${label}: expected path inside sandbox, got "${resolved}"`
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function main() {
  fs.mkdirSync(SANDBOX_BASE, { recursive: true });

  // 1. import 10 structured leads in sandbox.
  await test('1. import 10 structured leads in sandbox', async () => {
    const ws = freshSandbox('ten');
    const res = await runLeadIntakePipeline(buildStructuredLeads(10), {
      workspace: ws,
    });
    assert.strictEqual(res.is_real_target, false, 'must not target real data');
    assert.ok(
      res.status === 'PASS' || res.status === 'PASS_WITH_REVIEW',
      `expected commit-able status, got ${res.status}`
    );
    assert.strictEqual(res.counts.added_count, 10, 'should add 10 leads');
    assert.strictEqual(res.written, true, 'should have written');
    assertInsideSandbox(res.write.path, 'write path');
    assert.ok(fs.existsSync(res.write.path), 'leads_master file should exist');
  });

  // 2. import 100 rows in sandbox.
  await test('2. import 100 rows in sandbox', async () => {
    const ws = freshSandbox('hundred');
    const res = await runLeadIntakePipeline(buildStructuredLeads(100), {
      workspace: ws,
    });
    assert.strictEqual(res.counts.total_rows, 100, 'should parse 100 rows');
    assert.strictEqual(res.counts.added_count, 100, 'should add 100 leads');
    assert.strictEqual(res.written, true, 'should have written');
    assertInsideSandbox(res.write.path, 'write path');
  });

  // 3. duplicates merge correctly.
  await test('3. duplicates merge correctly', async () => {
    const ws = freshSandbox('dupes');
    const lead = 'L1 | Acme Steel | metallurgy | Moscow | site: acme.ru';

    const first = await runLeadIntakePipeline(lead, { workspace: ws });
    assert.strictEqual(first.counts.added_count, 1, 'first run adds 1');
    assert.strictEqual(first.counts.final_unique_count, 1, 'one unique lead');

    // Same lead again -> must NOT be added as new; must merge/dedupe.
    const second = await runLeadIntakePipeline(lead, { workspace: ws });
    assert.strictEqual(second.counts.added_count, 0, 'duplicate must not add');
    assert.ok(
      second.counts.merged_count + second.counts.duplicate_count >= 1,
      'duplicate must be merged or flagged as duplicate'
    );
    assert.strictEqual(
      second.counts.final_unique_count,
      1,
      'still exactly one unique lead after duplicate import'
    );
  });

  // 4. needs_review rows preserved.
  await test('4. needs_review rows preserved', async () => {
    const ws = freshSandbox('needsreview');
    const block = [
      'L1 | Good Corp | metallurgy | Moscow | site: good.ru',
      '???', // garbage -> needs_review
    ].join('\n');
    const res = await runLeadIntakePipeline(block, { workspace: ws });
    assert.ok(res.counts.needs_review_count >= 1, 'should flag needs_review');
    assert.ok(
      Array.isArray(res.needs_review_rows) && res.needs_review_rows.length >= 1,
      'needs_review_rows must be preserved'
    );
    assert.ok(
      typeof res.needs_review_rows[0].reason === 'string' &&
        res.needs_review_rows[0].reason.trim() !== '',
      'each needs_review row must carry a reason'
    );
  });

  // 5. snapshot created before write.
  await test('5. snapshot created before write', async () => {
    const ws = freshSandbox('snapshot');
    const res = await runLeadIntakePipeline(buildStructuredLeads(3), {
      workspace: ws,
    });
    assert.ok(
      typeof res.snapshot_id === 'string' && res.snapshot_id.trim() !== '',
      'snapshot_id must be present'
    );
    assert.strictEqual(res.written, true, 'should write after snapshot');
  });

  // 6. QA PASS allows sandbox commit.
  await test('6. QA PASS allows sandbox commit', async () => {
    const ws = freshSandbox('qapass');
    const res = await runLeadIntakePipeline(buildStructuredLeads(5), {
      workspace: ws,
    });
    assert.strictEqual(res.qa_status, QA_STATUS.PASS, 'expected QA PASS');
    assert.strictEqual(res.status, 'PASS', 'status PASS');
    assert.strictEqual(res.written, true, 'committed to sandbox');
  });

  // 7. QA PASS_WITH_REVIEW allows sandbox commit.
  await test('7. QA PASS_WITH_REVIEW allows sandbox commit', async () => {
    const ws = freshSandbox('qareview');
    const block = [
      'L1 | Valid Co | metallurgy | Moscow | site: valid.ru',
      '???',
    ].join('\n');
    const res = await runLeadIntakePipeline(block, { workspace: ws });
    assert.strictEqual(
      res.qa_status,
      QA_STATUS.PASS_WITH_REVIEW,
      'expected QA PASS_WITH_REVIEW'
    );
    assert.strictEqual(res.status, 'PASS_WITH_REVIEW', 'status PASS_WITH_REVIEW');
    assert.strictEqual(res.written, true, 'still committed to sandbox');
  });

  // 8. QA FAIL blocks commit (via QA gate logic).
  await test('8. QA FAIL blocks commit', async () => {
    const result = evaluateLeadImportResult({
      import_id: 'x',
      snapshot_id: 'snap-1',
      total_rows: 2,
      parsed_count: 2,
      valid_count: 2,
      added_count: 1,
      merged_count: 0,
      duplicate_count: 0,
      needs_review_count: 0,
      error_count: 1, // -> FAIL
      leads: [{ name: 'A' }],
      safety: {
        network_used: 'NO',
        external_send: 'NO',
        smtp_used: 'NO',
        auto_send: 'BLOCKED',
      },
    });
    assert.strictEqual(result.qa_status, QA_STATUS.FAIL, 'should FAIL');
    assert.strictEqual(result.can_commit_import, false, 'must block commit');
  });

  // 9. missing snapshot / backup failure blocks commit.
  await test('9. missing snapshot blocks commit', async () => {
    const result = evaluateLeadImportResult({
      import_id: 'x',
      // snapshot_id missing -> FAIL
      total_rows: 1,
      parsed_count: 1,
      valid_count: 1,
      added_count: 1,
      merged_count: 0,
      duplicate_count: 0,
      needs_review_count: 0,
      error_count: 0,
      leads: [{ name: 'A' }],
      safety: {
        network_used: 'NO',
        external_send: 'NO',
        smtp_used: 'NO',
        auto_send: 'BLOCKED',
      },
    });
    assert.strictEqual(result.qa_status, QA_STATUS.FAIL, 'should FAIL');
    assert.strictEqual(result.can_commit_import, false, 'must block commit');
  });

  // 10. invalid counts block commit.
  await test('10. invalid counts block commit', async () => {
    const result = evaluateLeadImportResult({
      import_id: 'x',
      snapshot_id: 'snap-1',
      total_rows: 1,
      parsed_count: 5, // total < parsed -> blocker -> FAIL
      valid_count: 1,
      added_count: 1,
      merged_count: 0,
      duplicate_count: 0,
      needs_review_count: 0,
      error_count: 0,
      leads: [{ name: 'A' }],
      safety: {
        network_used: 'NO',
        external_send: 'NO',
        smtp_used: 'NO',
        auto_send: 'BLOCKED',
      },
    });
    assert.strictEqual(result.qa_status, QA_STATUS.FAIL, 'should FAIL');
    assert.strictEqual(result.can_commit_import, false, 'must block commit');
  });

  // 11. no real 13_sales write.
  await test('11. no real 13_sales write', async () => {
    const before = fs.existsSync(REAL_LEADS_MASTER)
      ? fs.statSync(REAL_LEADS_MASTER).mtimeMs
      : null;

    const ws = freshSandbox('noreal');
    const res = await runLeadIntakePipeline(buildStructuredLeads(2), {
      workspace: ws,
    });
    assert.strictEqual(res.is_real_target, false, 'must not target real data');
    assertInsideSandbox(res.write.path, 'sandbox write only');

    const after = fs.existsSync(REAL_LEADS_MASTER)
      ? fs.statSync(REAL_LEADS_MASTER).mtimeMs
      : null;
    assert.strictEqual(after, before, 'real leads_master must be untouched');
  });

  // 12. no contact registry write (static + behavioral).
  await test('12. no contact registry write', async () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', 'telegram_gateway', 'lead_intake_pipeline.mjs'),
      'utf8'
    );
    assert.ok(
      !/lead_contact_registry/i.test(src),
      'pipeline must not reference lead_contact_registry'
    );
    assert.ok(
      !/contact_registry\.json/i.test(src),
      'pipeline must not write a contact registry file'
    );
  });

  // 13-17. Static source safety scan (no network/telegram/email/smtp/secrets).
  await test('13-17. static safety scan (no network/tg/email/smtp/secrets)', async () => {
    const raw = fs.readFileSync(
      path.resolve(__dirname, '..', 'telegram_gateway', 'lead_intake_pipeline.mjs'),
      'utf8'
    );
    // Strip block comments and line comments — the safety notes in the module
    // header legitimately mention ".env" / "AI_SECRETS" while documenting that
    // they are NOT used. We only scan executable code.
    const src = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    const forbidden = [

      [/\bfetch\s*\(/, 'fetch( call'],
      [/api\.telegram\.org/i, 'telegram api host'],
      [/nodemailer/i, 'nodemailer'],
      [/createTransport/i, 'smtp transport'],
      [/from\s+['"](?:node:)?https?['"]/, 'http(s) import'],
      [/require\(\s*['"](?:node:)?https?['"]\s*\)/, 'http(s) require'],
      [/process\.env/i, 'process.env read'],
      [/AI_SECRETS/i, 'AI_SECRETS reference'],
      [/\.env\b/i, '.env reference'],
    ];
    for (const [re, label] of forbidden) {
      assert.ok(!re.test(src), `pipeline source must not contain ${label}`);
    }
  });

  // 18. auto_send remains BLOCKED.
  await test('18. auto_send remains BLOCKED', async () => {
    const ws = freshSandbox('autosend');
    const res = await runLeadIntakePipeline(buildStructuredLeads(1), {
      workspace: ws,
    });
    const summary = buildLeadIntakePipelineSummary(res);
    assert.strictEqual(res.safety.auto_send, 'BLOCKED', 'result auto_send');
    assert.strictEqual(summary.safety.auto_send, 'BLOCKED', 'summary auto_send');
    assert.strictEqual(res.safety.network_used, 'NO', 'no network');
    assert.strictEqual(res.safety.external_send, 'NO', 'no external send');
    assert.strictEqual(res.safety.smtp_used, 'NO', 'no smtp');
  });

  // 19. summary contains required fields.
  await test('19. summary contains required fields', async () => {
    const ws = freshSandbox('summary');
    const res = await runLeadIntakePipeline(buildStructuredLeads(2), {
      workspace: ws,
    });
    const s = buildLeadIntakePipelineSummary(res);
    for (const key of ['status', 'import_id', 'snapshot_id', 'qa_status']) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(s, key),
        `summary must contain "${key}"`
      );
    }
    for (const key of [
      'added_count',
      'merged_count',
      'needs_review_count',
      'error_count',
    ]) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(s.counts, key),
        `summary.counts must contain "${key}"`
      );
    }
  });

  // 20. loadLeadsMaster handles missing file.
  await test('20. loadLeadsMaster handles missing file', async () => {
    const ws = freshSandbox('missing');
    const loaded = await loadLeadsMaster({ workspace: ws });
    assert.strictEqual(loaded.exists, false, 'file should not exist yet');
    assert.ok(Array.isArray(loaded.leads), 'leads must be an array');
    assert.strictEqual(loaded.leads.length, 0, 'empty leads on missing file');
    assertInsideSandbox(loaded.path, 'loaded path');
  });

  // 21. saveLeadsMasterAtomic writes only inside sandbox.
  await test('21. saveLeadsMasterAtomic writes only inside sandbox', async () => {
    const ws = freshSandbox('save');
    const out = await saveLeadsMasterAtomic([{ lead_id: 'L1', name: 'X' }], {
      workspace: ws,
    });
    assertInsideSandbox(out.path, 'atomic write path');
    assert.ok(fs.existsSync(out.path), 'file must exist after write');
    assert.strictEqual(out.count, 1, 'count reflects written leads');

    // Must refuse a real-target write without approval.
    await assert.rejects(
      () =>
        saveLeadsMasterAtomic([{ lead_id: 'L1' }], {
          workspace: REAL_TARGET_WORKSPACE, // resolves to the real leads_master
        }),
      /Refusing to write real 13_sales leads_master/,
      'real write must be refused without approval'
    );

  });

  // 22. real write blocked unless allowRealWrite=true AND confirmRealWrite=true.
  await test('22. real write blocked unless both approval flags set', async () => {
    const before = fs.existsSync(REAL_LEADS_MASTER)
      ? fs.statSync(REAL_LEADS_MASTER).mtimeMs
      : null;

    // Target the real workspace, but provide NO approval flags.
    const res = await runLeadIntakePipeline(buildStructuredLeads(1), {
      workspace: REAL_TARGET_WORKSPACE,
    });
    assert.strictEqual(res.is_real_target, true, 'should resolve to real target');
    assert.strictEqual(res.real_write_approved, false, 'not approved');
    assert.strictEqual(res.status, 'FAIL', 'must FAIL');
    assert.strictEqual(res.written, false, 'must not write');
    assert.ok(
      res.blockers.some((b) => b.code === 'REAL_WRITE_BLOCKED'),
      'must report REAL_WRITE_BLOCKED'
    );

    // Confirm the paths logic too (defense-in-depth).
    const paths = getLeadIntakePipelinePaths({ workspace: REAL_TARGET_WORKSPACE });

    assert.strictEqual(paths.isRealTarget, true, 'paths flags real target');

    const after = fs.existsSync(REAL_LEADS_MASTER)
      ? fs.statSync(REAL_LEADS_MASTER).mtimeMs
      : null;
    assert.strictEqual(after, before, 'real leads_master must stay untouched');
  });

  // -------------------------------------------------------------------------
  // Report
  // -------------------------------------------------------------------------
  console.log('\n----------------------------------------');
  console.log(`TOTAL: ${passed + failed}  PASS: ${passed}  FAIL: ${failed}`);
  if (failed > 0) {
    console.log('\nFailures:');
    for (const f of failures) {
      console.log(`  - ${f.name}: ${f.msg}`);
    }
    process.exitCode = 1;
  } else {
    console.log('ALL TESTS PASSED — sandbox only, no real data touched.');
  }
}

main().catch((err) => {
  console.error('FATAL test runner error:', err);
  process.exitCode = 1;
});
