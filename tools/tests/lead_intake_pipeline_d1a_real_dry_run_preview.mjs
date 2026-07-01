/**
 * lead_intake_pipeline_d1a_real_dry_run_preview.mjs
 *
 * Controlled REAL workspace DRY-RUN preview for the D1a Lead Intake Pipeline.
 *
 * Purpose:
 *   Exercise the real workspace (D:\AI_WORKSPACE) leads_master through the
 *   pipeline in DRY-RUN ONLY mode. This proves that a real, unconfirmed run:
 *     - reads the real leads_master,
 *     - parses a mixed text block (duplicate / new / needs_review),
 *     - runs QA,
 *     - and writes NOTHING (no leads_master overwrite, no events append).
 *
 * HARD SAFETY CONTRACT (enforced + asserted here):
 *   - DRY-RUN ONLY. confirm is NEVER set to true.
 *   - No network. No Telegram API. No email / SMTP. No VPS.
 *   - No .env / AI_SECRETS reads.
 *   - The real leads_master.json is NEVER overwritten.
 *   - lead_intake_events.jsonl is NEVER modified.
 *
 * Run:
 *   node --check tools/tests/lead_intake_pipeline_d1a_real_dry_run_preview.mjs
 *   node tools/tests/lead_intake_pipeline_d1a_real_dry_run_preview.mjs
 */

'use strict';

import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

import {
  loadLeadsMaster,
  runLeadIntakeDryRun,
  getLeadIntakePipelinePaths,
} from '../telegram_gateway/lead_intake_pipeline.mjs';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WORKSPACE = 'D:\\AI_WORKSPACE';

const LEADS_MASTER_REL =
  '13_sales/daily_lead_factory/data/processed/leads_master.json';
const EVENTS_REL = '13_sales/lead_intake_events.jsonl';

const LEADS_MASTER_ABS = path.resolve(WORKSPACE, LEADS_MASTER_REL);
const EVENTS_ABS = path.resolve(WORKSPACE, EVENTS_REL);

// ---------------------------------------------------------------------------
// Tiny assertion helpers
// ---------------------------------------------------------------------------

let failures = 0;
const checks = [];

function record(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail || '' });
  if (!ok) {
    failures += 1;
  }
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
}

function assertEqual(name, actual, expected) {
  record(name, actual === expected, `got=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
}

function assertTrue(name, cond, detail) {
  record(name, cond === true, detail);
}

// ---------------------------------------------------------------------------
// File fingerprint (read-only) — used to prove real files are untouched.
// ---------------------------------------------------------------------------

async function fingerprint(absPath) {
  try {
    const stat = await fs.stat(absPath);
    const buf = await fs.readFile(absPath);
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    return {
      exists: true,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      hash,
    };
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return { exists: false, size: 0, mtimeMs: 0, hash: null };
    }
    return { exists: false, size: 0, mtimeMs: 0, hash: null, error: String(err) };
  }
}

function sameFingerprint(a, b) {
  // If both absent, that's "unchanged" too.
  if (a.exists !== b.exists) return false;
  if (!a.exists && !b.exists) return true;
  return a.size === b.size && a.hash === b.hash && a.mtimeMs === b.mtimeMs;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('============================================================');
  console.log(' D1a Lead Intake Pipeline — REAL workspace DRY-RUN preview');
  console.log('============================================================');
  console.log(`workspace        : ${WORKSPACE}`);
  console.log(`leads_master     : ${LEADS_MASTER_ABS}`);
  console.log(`events file      : ${EVENTS_ABS}`);
  console.log('');

  // Confirm the pipeline resolves to the REAL target for this workspace.
  const paths = getLeadIntakePipelinePaths({ workspace: WORKSPACE });
  console.log('--- Resolved pipeline paths ---');
  console.log(`  is_real_target  : ${paths.isRealTarget}`);
  console.log(`  leadsMasterAbs  : ${paths.leadsMasterAbs}`);
  console.log('');

  // -------------------------------------------------------------------------
  // STEP 1 — real leads_master must exist.
  // -------------------------------------------------------------------------
  console.log('--- STEP 1: real leads_master existence ---');
  const beforeMaster = await fingerprint(LEADS_MASTER_ABS);
  assertTrue('real leads_master exists', beforeMaster.exists, LEADS_MASTER_ABS);
  if (!beforeMaster.exists) {
    console.log('');
    console.log('Real leads_master not found — aborting preview (no writes attempted).');
    finish();
    return;
  }
  console.log('');

  // Snapshot the events file fingerprint too (may or may not exist).
  const beforeEvents = await fingerprint(EVENTS_ABS);

  // -------------------------------------------------------------------------
  // STEP 2 — loadLeadsMaster + count.
  // -------------------------------------------------------------------------
  console.log('--- STEP 2: loadLeadsMaster ---');
  const loaded = await loadLeadsMaster({ workspace: WORKSPACE });
  const existingBefore = Array.isArray(loaded.leads) ? loaded.leads.length : 0;
  console.log(`  existing leads (load) : ${existingBefore}`);
  console.log(`  load error            : ${loaded.error || 'none'}`);
  assertTrue('loadLeadsMaster returned an array', Array.isArray(loaded.leads));
  console.log('');

  // -------------------------------------------------------------------------
  // STEP 3 — text block: duplicate (ZB23) + new valid + needs_review.
  // -------------------------------------------------------------------------
  console.log('--- STEP 3: prepare mixed text block ---');
  const textBlock = [
    'ZB23 | https://zb23.ru | ЖБИ | Краснодарский край | Email: kvs@zb23.ru',
    'TEST-NEW-DRYRUN | https://example-dryrun.ru | Тест | Краснодарский край | Email: dryrun@example.com',
    'непонятная строка без сайта и контактов',
  ].join('\n');
  console.log(textBlock.split('\n').map((l) => `    ${l}`).join('\n'));
  console.log('');

  // -------------------------------------------------------------------------
  // STEP 4 — DRY-RUN only (NO confirm).
  // -------------------------------------------------------------------------
  console.log('--- STEP 4: runLeadIntakeDryRun (dry_run only) ---');
  const result = await runLeadIntakeDryRun(textBlock, {
    workspace: WORKSPACE,
    source: 'd1a_real_dry_run_preview',
  });
  console.log(`  mode    : ${result.mode}`);
  console.log(`  status  : ${result.status}`);
  console.log('');

  // -------------------------------------------------------------------------
  // STEP 5 — assertions.
  // -------------------------------------------------------------------------
  console.log('--- STEP 5: safety + integrity assertions ---');

  // No real write.
  assertEqual('written === false', result.written, false);

  // confirm must never be true.
  assertTrue('confirm !== true', result.confirmed !== true, `confirmed=${result.confirmed}`);

  // qa_status / can_commit_import present.
  assertTrue(
    'qa_status present',
    typeof result.qa_status === 'string' && result.qa_status.length > 0,
    `qa_status=${result.qa_status}`
  );
  assertTrue(
    'can_commit_import present',
    typeof result.can_commit_import === 'boolean',
    `can_commit_import=${result.can_commit_import}`
  );

  // Safety contract.
  const safety = result.safety || {};
  assertEqual('safety.network_used === NO', safety.network_used, 'NO');
  assertEqual('safety.external_send === NO', safety.external_send, 'NO');
  assertEqual('safety.smtp_used === NO', safety.smtp_used, 'NO');
  assertEqual('safety.auto_send === BLOCKED', safety.auto_send, 'BLOCKED');

  // Existing leads count unchanged (reload after dry-run).
  const reloaded = await loadLeadsMaster({ workspace: WORKSPACE });
  const existingAfter = Array.isArray(reloaded.leads) ? reloaded.leads.length : 0;
  assertEqual('existing leads count unchanged', existingAfter, existingBefore);

  // Real leads_master not overwritten (fingerprint identical).
  const afterMaster = await fingerprint(LEADS_MASTER_ABS);
  assertTrue(
    'real leads_master NOT overwritten',
    sameFingerprint(beforeMaster, afterMaster),
    `before.hash=${(beforeMaster.hash || '').slice(0, 12)} after.hash=${(afterMaster.hash || '').slice(0, 12)}`
  );

  // events file unchanged.
  const afterEvents = await fingerprint(EVENTS_ABS);
  assertTrue(
    'lead_intake_events.jsonl unchanged',
    sameFingerprint(beforeEvents, afterEvents),
    beforeEvents.exists ? `hash ${(beforeEvents.hash || '').slice(0, 12)}` : 'absent (still absent)'
  );

  console.log('');

  // -------------------------------------------------------------------------
  // STEP 6 — compact summary.
  // -------------------------------------------------------------------------
  const counts = result.counts || {};
  console.log('--- STEP 6: compact preview summary ---');
  const summary = {
    existing_leads_before: existingBefore,
    existing_leads_after: existingAfter,
    parsed_count: counts.parsed_count || 0,
    valid_count: counts.valid_count || 0,
    added_count: counts.added_count || 0,
    merged_count: counts.merged_count || 0,
    duplicate_count: counts.duplicate_count || 0,
    needs_review_count: counts.needs_review_count || 0,
    qa_status: result.qa_status,
    can_commit_import: result.can_commit_import,
    written: result.written === true,
    appended: result.event_appended === true,
    real_data_changed: !sameFingerprint(beforeMaster, afterMaster) ||
      !sameFingerprint(beforeEvents, afterEvents),
    safety: result.safety,
  };
  console.log(JSON.stringify(summary, null, 2));
  console.log('');

  finish();
}

function finish() {
  console.log('============================================================');
  const passed = checks.length - failures;
  console.log(` Checks: ${passed}/${checks.length} passed, ${failures} failed.`);
  if (failures === 0) {
    console.log(' RESULT: OK — controlled real dry-run preview is safe.');
  } else {
    console.log(' RESULT: FAILURES DETECTED — review output above.');
  }
  console.log('============================================================');
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error('Unexpected error during preview:', err);
  process.exitCode = 1;
});
