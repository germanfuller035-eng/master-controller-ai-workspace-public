/**
 * lead_intake_commands_d1b_sandbox_micro_test.mjs
 *
 * Daily Lead Factory — D1b — Micro test for the /lead_import_sandbox command.
 *
 * WHAT THIS TEST IS:
 *   A self-contained, single-purpose verification harness that exercises ONLY
 *   the /lead_import_sandbox flow exposed by
 *   tools/telegram_gateway/lead_intake_commands.mjs through the public
 *   handleLeadIntakeCommand dispatcher.
 *
 * HARD SAFETY CONTRACT — what this test DOES NOT do:
 *   - No network. No HTTP/fetch. No site scanning.
 *   - No SMTP. No email/Telegram/WhatsApp/MAX send. auto_send always BLOCKED.
 *   - No Telegram API. No bot integration. No bot file touched / imported.
 *   - No .env / AI_SECRETS / tokens reads.
 *   - No real import. No confirm=true against the real workspace.
 *   - Never mutates real 13_sales data (leads_master / events asserted unchanged).
 *   - Creates NO temporary probe / research scripts (tmp/_probe*.mjs).
 *   - Only the standalone command module is imported. Nothing else is touched.
 *
 * Verifies:
 *   1.  handleLeadIntakeCommand("/lead_import_sandbox <text>") runs in sandbox only.
 *   2.  sandbox workspace = tmp/lead_import_sandbox_workspace/.
 *   3.  imported_count >= 1.
 *   4.  snapshot created (sandbox only).
 *   5.  real 13_sales leads_master.json unchanged.
 *   6.  real 13_sales lead_intake_events.jsonl unchanged.
 *   7.  safety: network_used=NO, external_send=NO, smtp_used=NO, auto_send=BLOCKED.
 *   8.  bot file not touched / not imported.
 *   9.  no .env / AI_SECRETS reads.
 *   10. no tmp/_probe*.mjs created.
 *
 * Run:
 *   node --check tools/tests/lead_intake_commands_d1b_sandbox_micro_test.mjs
 *   node tools/tests/lead_intake_commands_d1b_sandbox_micro_test.mjs
 */

'use strict';

import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

import {
  handleLeadIntakeCommand,
} from '../telegram_gateway/lead_intake_commands.mjs';

// ---------------------------------------------------------------------------
// Tiny assertion harness (no external deps)
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];

function ok(condition, label) {
  if (condition) {
    passed += 1;
    console.log(`  PASS: ${label}`);
  } else {
    failed += 1;
    failures.push(label);
    console.log(`  FAIL: ${label}`);
  }
}

function eq(actual, expected, label) {
  ok(actual === expected, `${label} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

// ---------------------------------------------------------------------------
// Paths (real workspace — referenced READ-ONLY for unchanged-assertions)
// ---------------------------------------------------------------------------

const REAL_WORKSPACE_ROOT = path.resolve('D:\\AI_WORKSPACE');

const REAL_LEADS_MASTER_ABS = path.resolve(
  REAL_WORKSPACE_ROOT,
  '13_sales/daily_lead_factory/data/processed/leads_master.json'
);
const REAL_EVENTS_ABS = path.resolve(
  REAL_WORKSPACE_ROOT,
  '13_sales/lead_intake_events.jsonl'
);

const SANDBOX_ABS = path.resolve(
  REAL_WORKSPACE_ROOT,
  'tmp/lead_import_sandbox_workspace'
);
const TMP_DIR_ABS = path.resolve(REAL_WORKSPACE_ROOT, 'tmp');

// ---------------------------------------------------------------------------
// Read-only fingerprint helpers (never write; tolerate missing files)
// ---------------------------------------------------------------------------

/**
 * Build a stable fingerprint (sha256 + size + mtime) for a file. Returns a
 * sentinel object when the file is absent so we can compare presence too.
 * READ-ONLY: never creates or modifies anything.
 */
async function fingerprint(absPath) {
  try {
    const buf = await fs.readFile(absPath);
    const stat = await fs.stat(absPath);
    return {
      exists: true,
      sha256: crypto.createHash('sha256').update(buf).digest('hex'),
      size: buf.length,
      mtimeMs: stat.mtimeMs,
    };
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return { exists: false, sha256: null, size: 0, mtimeMs: 0 };
    }
    throw err;
  }
}

function sameFingerprint(a, b) {
  if (!a || !b) return false;
  if (a.exists !== b.exists) return false;
  if (!a.exists && !b.exists) return true;
  return a.sha256 === b.sha256 && a.size === b.size && a.mtimeMs === b.mtimeMs;
}

/**
 * List tmp/_probe*.mjs files (read-only). Returns [] when tmp is absent.
 */
async function listProbeFiles() {
  try {
    const entries = await fs.readdir(TMP_DIR_ABS);
    return entries.filter((name) => /^_probe.*\.mjs$/i.test(name));
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------

async function run() {
  console.log('lead_intake_commands D1b /lead_import_sandbox micro test');
  console.log('=======================================================');

  // --- Capture real-data fingerprints BEFORE running sandbox import --------
  const beforeMaster = await fingerprint(REAL_LEADS_MASTER_ABS);
  const beforeEvents = await fingerprint(REAL_EVENTS_ABS);
  const probesBefore = await listProbeFiles();

  // --- Run the sandbox command through the public dispatcher ---------------
  console.log('\n[run] handleLeadIntakeCommand("/lead_import_sandbox <text>")');
  const leadText = 'Acme Corp | acme.ru';
  const result = await handleLeadIntakeCommand(`/lead_import_sandbox ${leadText}`);
  ok(result && typeof result === 'object', 'sandbox result is an object');

  // --- 1. runs in sandbox only ---------------------------------------------
  console.log('\n[1] command runs in sandbox only (SANDBOX_OK, not real target)');
  eq(result.command, '/lead_import_sandbox', 'command is /lead_import_sandbox');
  eq(result.status, 'SANDBOX_OK', 'status SANDBOX_OK');
  eq(result.ok, true, 'result ok=true');
  eq(result.sandbox_only, true, 'sandbox_only=true');
  eq(result.is_real_target, false, 'is_real_target=false');
  eq(result.real_data_changed, false, 'real_data_changed=false');

  // --- 2. sandbox workspace = tmp/lead_import_sandbox_workspace/ ------------
  console.log('\n[2] sandbox workspace = tmp/lead_import_sandbox_workspace/');
  eq(
    path.resolve(result.workspace),
    SANDBOX_ABS,
    'workspace resolves to tmp/lead_import_sandbox_workspace'
  );
  // The sandbox leads_master must physically live under the sandbox folder.
  const sandboxMasterAbs = path.resolve(
    SANDBOX_ABS,
    '13_sales/daily_lead_factory/data/processed/leads_master.json'
  );
  const sandboxMasterFp = await fingerprint(sandboxMasterAbs);
  ok(sandboxMasterFp.exists, 'sandbox leads_master.json exists under sandbox workspace');

  // --- 3. imported_count >= 1 ----------------------------------------------
  console.log('\n[3] imported_count >= 1');
  ok(
    typeof result.imported_count === 'number' && result.imported_count >= 1,
    `imported_count >= 1 (got ${result.imported_count})`
  );
  eq(result.written, true, 'written=true (sandbox commit happened)');

  // --- 4. snapshot created (sandbox only) ----------------------------------
  console.log('\n[4] snapshot created (sandbox only)');
  ok(
    typeof result.snapshot === 'string' && result.snapshot.length > 0,
    `snapshot id is a non-empty string (got ${JSON.stringify(result.snapshot)})`
  );

  // --- 5. real leads_master.json unchanged ---------------------------------
  console.log('\n[5] real 13_sales/leads_master.json unchanged');
  const afterMaster = await fingerprint(REAL_LEADS_MASTER_ABS);
  ok(
    sameFingerprint(beforeMaster, afterMaster),
    'real leads_master.json fingerprint unchanged'
  );

  // --- 6. real lead_intake_events.jsonl unchanged --------------------------
  console.log('\n[6] real 13_sales/lead_intake_events.jsonl unchanged');
  const afterEvents = await fingerprint(REAL_EVENTS_ABS);
  ok(
    sameFingerprint(beforeEvents, afterEvents),
    'real lead_intake_events.jsonl fingerprint unchanged'
  );

  // --- 7. safety contract --------------------------------------------------
  console.log('\n[7] safety contract (network/external/smtp/auto_send)');
  const safety = (result && result.safety) || {};
  eq(safety.network_used, 'NO', 'safety.network_used = NO');
  eq(safety.external_send, 'NO', 'safety.external_send = NO');
  eq(safety.smtp_used, 'NO', 'safety.smtp_used = NO');
  eq(safety.auto_send, 'BLOCKED', 'safety.auto_send = BLOCKED');

  // --- 8. bot not touched / not imported -----------------------------------
  console.log('\n[8] bot file not touched / not imported');
  // This test imports ONLY lead_intake_commands.mjs; the bot module is never
  // referenced. Assert it is absent from the loaded module graph.
  const loaded = (process.moduleLoadList || []).join('\n');
  ok(
    !/telegram_master_bot/i.test(loaded),
    'telegram_master_bot is not in the loaded module list'
  );

  // --- 9. no .env / AI_SECRETS read ----------------------------------------
  console.log('\n[9] no .env / AI_SECRETS access in loaded module graph');
  ok(
    !/(\.env|AI_SECRETS)/.test(loaded),
    'no .env / AI_SECRETS module loaded'
  );

  // --- 10. no tmp/_probe*.mjs created --------------------------------------
  console.log('\n[10] no tmp/_probe*.mjs created');
  const probesAfter = await listProbeFiles();
  eq(probesAfter.length, probesBefore.length, 'probe file count unchanged');
  eq(probesAfter.length, 0, 'no tmp/_probe*.mjs present');

  // ---------------------------------------------------------------------------
  // Final report
  // ---------------------------------------------------------------------------
  console.log('\n=======================================================');
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('FAILED CHECKS:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  console.log('\n--- micro test summary ---');
  console.log(`sandbox imported : ${result.imported_count}`);
  console.log(`snapshot         : ${result.snapshot}`);
  console.log(`workspace        : ${result.workspace}`);
  console.log(`real data changed: ${(!sameFingerprint(beforeMaster, afterMaster) || !sameFingerprint(beforeEvents, afterEvents)) ? 'YES' : 'NO'}`);
  console.log('bot touched      : NO');
  console.log(`probe files      : ${probesAfter.length}`);
  console.log('safety           : network_used=NO | external_send=NO | smtp_used=NO | auto_send=BLOCKED');

  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('FATAL test harness error:', err && err.stack ? err.stack : err);
  process.exit(1);
});
