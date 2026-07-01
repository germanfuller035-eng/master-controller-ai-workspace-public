/**
 * lead_markdown_reconciliation_import_4_clean.mjs
 *
 * CONTROLLED REAL IMPORT of exactly 4 clean markdown leads into the canonical
 * leads_master via the EXISTING lead intake pipeline.
 *
 * APPROVAL: Dmitry confirmed a controlled import of 4 clean markdown leads into
 * the canonical leads_master. No email, no Telegram, no auto-send.
 *
 * The ONLY 4 clean domains imported here:
 *   - zavodatom.ru
 *   - krasnodar.zuzmi.ru
 *   - gbiresurs.ru
 *   - buildsteel.ru
 *
 * HARD SAFETY CONTRACT (enforced + asserted here):
 *   - No network. No HTTP/fetch. No Telegram API. No email / SMTP. No VPS.
 *   - No .env / AI_SECRETS / token reads.
 *   - Does NOT modify the pipeline module, the dashboard, or the bot.
 *   - Does NOT import review-cases, ZB23, TEST_LEAD, FIRST OPERATIONAL LEAD,
 *     or metalproffi.ru.
 *   - Allowed real writes ONLY (via the pipeline / backup layer):
 *       1. 13_sales/daily_lead_factory/data/processed/leads_master.json
 *       2. 13_sales/lead_intake_events.jsonl
 *       3. 13_sales/_backups/lead_data/ snapshot (backup layer)
 *
 * Flow:
 *   1. Read canonical leads_master, count before_count.
 *   2. Verify none of the 4 clean domains already present (else STOP, no import).
 *   3. Build textBlock for ONLY the 4 clean leads.
 *   4. runLeadIntakeDryRun(...) and validate the dry-run preconditions.
 *   5. Only on dry-run PASS, runLeadIntakeImport(workspace, textBlock,
 *      { source, confirm: true }).
 *   6. Validate import: snapshot created, QA passed, leads_master saved atomic,
 *      event appended, after_count = before_count + 4, all 4 domains present,
 *      and forbidden domains NOT added.
 *   7. Print SHA-256 before/after for leads_master + final summary.
 *
 * Run:
 *   node --check tools/tests/lead_markdown_reconciliation_import_4_clean.mjs
 *   node tools/tests/lead_markdown_reconciliation_import_4_clean.mjs
 */

'use strict';

import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

import {
  loadLeadsMaster,
  runLeadIntakeDryRun,
  runLeadIntakeImport,
  getLeadIntakePipelinePaths,
} from '../telegram_gateway/lead_intake_pipeline.mjs';

import { normalizeDomain } from '../telegram_gateway/lead_dedupe_engine.mjs';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WORKSPACE = 'D:\\AI_WORKSPACE';

const LEADS_MASTER_REL =
  '13_sales/daily_lead_factory/data/processed/leads_master.json';
const EVENTS_REL = '13_sales/lead_intake_events.jsonl';

const LEADS_MASTER_ABS = path.resolve(WORKSPACE, LEADS_MASTER_REL);
const EVENTS_ABS = path.resolve(WORKSPACE, EVENTS_REL);

const IMPORT_SOURCE = 'markdown_reconciliation_4_clean_2026-05-31';

// The 4 clean leads to import (and ONLY these).
const CLEAN_LEADS = [
  {
    domain: 'zavodatom.ru',
    name: 'Завод АТОМ (zavodatom)',
    website: 'https://zavodatom.ru/',
    email: 'zakaz@zavodatom.ru',
    phone: '8 (861) 290-02-35',
    region: 'Краснодарский край',
  },
  {
    domain: 'krasnodar.zuzmi.ru',
    name: 'ЗУЗМИ-Краснодар',
    website: 'https://krasnodar.zuzmi.ru/',
    email: 'krasnodar@zuzmi.ru',
    phone: '',
    region: 'Краснодарский край',
  },
  {
    domain: 'gbiresurs.ru',
    name: 'Железобетон Ресурс',
    website: 'https://gbiresurs.ru/',
    email: 'info@gbiresurs.ru',
    phone: '',
    region: 'Краснодарский край',
  },
  {
    domain: 'buildsteel.ru',
    name: 'Строй Сталь (buildsteel)',
    website: 'https://buildsteel.ru/',
    email: 'buildsteel@mail.ru',
    phone: '+7 903 803-16-52',
    region: 'Краснодарский край',
  },
];

const CLEAN_DOMAINS = CLEAN_LEADS.map((l) => normalizeDomain(l.domain));

// Domains/tokens that MUST NOT be imported by this run.
const FORBIDDEN_DOMAINS = ['metalproffi.ru', 'zb23.ru', 'example-test.ru'];
const FORBIDDEN_TOKENS = [
  'zb23',
  'test_lead',
  'first operational lead',
  'metalproffi',
];

// ---------------------------------------------------------------------------
// Tiny assertion helpers
// ---------------------------------------------------------------------------

let failures = 0;
const checks = [];

function record(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail || '' });
  if (!ok) failures += 1;
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
}

function assertEqual(name, actual, expected) {
  record(
    name,
    actual === expected,
    `got=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`,
  );
}

function assertTrue(name, cond, detail) {
  record(name, cond === true, detail);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function sha256OfFile(absPath) {
  try {
    const buf = await fs.readFile(absPath);
    return crypto.createHash('sha256').update(buf).digest('hex');
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

/** Collect the set of normalized domains present in a leads array. */
function domainSet(leads) {
  const set = new Set();
  for (const lead of Array.isArray(leads) ? leads : []) {
    const d = normalizeDomain(lead?.website ?? lead?.domain ?? '');
    if (d) set.add(d);
  }
  return set;
}

/** True if any lead blob contains one of the forbidden tokens. */
function findForbidden(leads) {
  const hits = [];
  for (const lead of Array.isArray(leads) ? leads : []) {
    const d = normalizeDomain(lead?.website ?? lead?.domain ?? '');
    if (FORBIDDEN_DOMAINS.includes(d)) {
      hits.push({ reason: `domain:${d}`, lead_id: lead?.lead_id || '' });
      continue;
    }
    const blob = JSON.stringify(lead).toLowerCase();
    for (const tok of FORBIDDEN_TOKENS) {
      if (blob.includes(tok)) {
        hits.push({ reason: `token:${tok}`, lead_id: lead?.lead_id || '' });
        break;
      }
    }
  }
  return hits;
}

/** Build the pipeline textBlock for ONLY the 4 clean leads. */
function buildTextBlock() {
  return CLEAN_LEADS.map((l) => {
    const parts = [
      l.name,
      l.website,
      'Металлоконструкции/ЖБИ',
      l.region,
    ];
    const contactBits = [];
    if (l.email) contactBits.push(`Email: ${l.email}`);
    if (l.phone) contactBits.push(`Тел: ${l.phone}`);
    return [...parts, ...contactBits].join(' | ');
  }).join('\n');
}

function stop(reason) {
  console.log('');
  console.log('############################################################');
  console.log(' STOP — no import performed.');
  console.log(` Reason: ${reason}`);
  console.log('############################################################');
  finish();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('============================================================');
  console.log(' CONTROLLED IMPORT — 4 CLEAN MARKDOWN LEADS -> leads_master');
  console.log('============================================================');
  console.log(`workspace     : ${WORKSPACE}`);
  console.log(`leads_master  : ${LEADS_MASTER_ABS}`);
  console.log(`events file   : ${EVENTS_ABS}`);
  console.log(`import source : ${IMPORT_SOURCE}`);
  console.log(`clean domains : ${CLEAN_DOMAINS.join(', ')}`);
  console.log('');

  // Confirm pipeline resolves to the REAL target for this workspace.
  const paths = getLeadIntakePipelinePaths({ workspace: WORKSPACE });
  console.log('--- Resolved pipeline paths ---');
  console.log(`  is_real_target : ${paths.isRealTarget}`);
  console.log(`  leadsMasterAbs : ${paths.leadsMasterAbs}`);
  console.log('');

  // -------------------------------------------------------------------------
  // STEP 1 — read canonical leads_master + before_count + SHA before.
  // -------------------------------------------------------------------------
  console.log('--- STEP 1: read canonical leads_master (before) ---');
  const beforeLoaded = await loadLeadsMaster({ workspace: WORKSPACE });
  const beforeLeads = Array.isArray(beforeLoaded.leads) ? beforeLoaded.leads : [];
  const before_count = beforeLeads.length;
  const shaBefore = await sha256OfFile(LEADS_MASTER_ABS);
  console.log(`  before_count   : ${before_count}`);
  console.log(`  load error     : ${beforeLoaded.error || 'none'}`);
  console.log(`  sha256 before  : ${shaBefore || '(file absent)'}`);
  assertTrue('loadLeadsMaster returned an array', Array.isArray(beforeLoaded.leads));
  console.log('');

  // -------------------------------------------------------------------------
  // STEP 2 — verify none of the 4 clean domains already exist.
  // -------------------------------------------------------------------------
  console.log('--- STEP 2: pre-import domain collision check ---');
  const beforeDomains = domainSet(beforeLeads);
  const alreadyPresent = CLEAN_DOMAINS.filter((d) => beforeDomains.has(d));
  for (const d of CLEAN_DOMAINS) {
    console.log(`  • ${d} : ${beforeDomains.has(d) ? 'ALREADY PRESENT' : 'absent (ok)'}`);
  }
  console.log('');
  if (alreadyPresent.length > 0) {
    stop(`one or more clean domains already in canonical: ${alreadyPresent.join(', ')}`);
    return;
  }
  assertEqual('no clean domains pre-existing', alreadyPresent.length, 0);

  // -------------------------------------------------------------------------
  // STEP 3 — build textBlock for the 4 clean leads only.
  // -------------------------------------------------------------------------
  console.log('--- STEP 3: build textBlock (4 clean leads only) ---');
  const textBlock = buildTextBlock();
  console.log(textBlock.split('\n').map((l) => `    ${l}`).join('\n'));
  console.log('');

  // -------------------------------------------------------------------------
  // STEP 4 — DRY RUN first (no confirm).
  // -------------------------------------------------------------------------
  console.log('--- STEP 4: runLeadIntakeDryRun (no write) ---');
  const dry = await runLeadIntakeDryRun(textBlock, {
    workspace: WORKSPACE,
    source: IMPORT_SOURCE,
  });
  const dryCounts = dry.counts || {};
  const drySafety = dry.safety || {};
  console.log(`  mode   : ${dry.mode}`);
  console.log(`  status : ${dry.status}`);
  console.log('  counts : ' + JSON.stringify(dryCounts));
  console.log('');

  console.log('--- dry-run preconditions ---');
  const wouldAdd =
    typeof dryCounts.added_count === 'number'
      ? dryCounts.added_count
      : dryCounts.would_add;
  assertTrue('parsed_count >= 4', (dryCounts.parsed_count || 0) >= 4, `parsed_count=${dryCounts.parsed_count}`);
  assertTrue('valid_count >= 4', (dryCounts.valid_count || 0) >= 4, `valid_count=${dryCounts.valid_count}`);
  assertTrue('added_count == 4 (or would_add == 4)', wouldAdd === 4, `added/would_add=${wouldAdd}`);
  assertEqual('needs_review_count == 0', dryCounts.needs_review_count || 0, 0);
  assertTrue('qa_status present', typeof dry.qa_status === 'string' && dry.qa_status.length > 0, `qa_status=${dry.qa_status}`);
  assertEqual('safety.network_used === NO', drySafety.network_used, 'NO');
  assertEqual('safety.external_send === NO', drySafety.external_send, 'NO');
  assertEqual('safety.smtp_used === NO', drySafety.smtp_used, 'NO');
  assertEqual('safety.auto_send === BLOCKED', drySafety.auto_send, 'BLOCKED');
  assertEqual('dry-run written === false', dry.written, false);
  assertEqual('dry-run appended === false', dry.event_appended, false);

  // Confirm dry-run did not change the real file.
  const shaAfterDry = await sha256OfFile(LEADS_MASTER_ABS);
  assertEqual('leads_master unchanged after dry-run', shaAfterDry, shaBefore);
  console.log('');

  // Gate: only proceed if all dry-run preconditions PASS.
  if (failures > 0) {
    stop(`dry-run preconditions FAILED (${failures} check(s)). No import.`);
    return;
  }
  console.log('  >>> dry-run PASS — proceeding to confirmed import.');
  console.log('');

  // -------------------------------------------------------------------------
  // STEP 5 — confirmed real import.
  // -------------------------------------------------------------------------
  console.log('--- STEP 5: runLeadIntakeImport (confirm: true) ---');
  const imp = await runLeadIntakeImport(textBlock, {
    workspace: WORKSPACE,
    source: IMPORT_SOURCE,
    confirm: true,
  });
  const impCounts = imp.counts || {};
  const impSafety = imp.safety || {};
  console.log(`  mode              : ${imp.mode}`);
  console.log(`  status            : ${imp.status}`);
  console.log(`  qa_status         : ${imp.qa_status}`);
  console.log(`  can_commit_import : ${imp.can_commit_import}`);
  console.log(`  snapshot_id       : ${imp.snapshot_id}`);
  console.log(`  written           : ${imp.written}`);
  console.log(`  event_appended    : ${imp.event_appended}`);
  console.log('  counts            : ' + JSON.stringify(impCounts));
  console.log('');

  // QA / commit gate.
  if (imp.qa_status === 'FAIL' || imp.can_commit_import !== true) {
    console.log('--- import blocked by QA / can_commit_import ---');
    const blockers = Array.isArray(imp.blockers) ? imp.blockers : [];
    for (const b of blockers) {
      console.log(`  • [${b.code || 'BLOCKER'}] ${b.message || ''}`);
    }
    stop(`QA FAIL or can_commit_import !== true (qa_status=${imp.qa_status}).`);
    return;
  }

  // -------------------------------------------------------------------------
  // STEP 6 — import assertions.
  // -------------------------------------------------------------------------
  console.log('--- STEP 6: import integrity assertions ---');
  assertEqual('import written === true', imp.written, true);
  assertTrue('snapshot_id present', typeof imp.snapshot_id === 'string' && imp.snapshot_id.length > 0, `snapshot_id=${imp.snapshot_id}`);
  assertEqual('event_appended === true', imp.event_appended, true);
  assertTrue('import added_count === 4', (impCounts.added_count || 0) === 4, `added_count=${impCounts.added_count}`);
  assertEqual('import safety.network_used === NO', impSafety.network_used, 'NO');
  assertEqual('import safety.external_send === NO', impSafety.external_send, 'NO');
  assertEqual('import safety.smtp_used === NO', impSafety.smtp_used, 'NO');
  assertEqual('import safety.auto_send === BLOCKED', impSafety.auto_send, 'BLOCKED');
  console.log('');

  // -------------------------------------------------------------------------
  // STEP 7 — re-read canonical leads_master (after) + verify.
  // -------------------------------------------------------------------------
  console.log('--- STEP 7: re-read canonical leads_master (after) ---');
  const afterLoaded = await loadLeadsMaster({ workspace: WORKSPACE });
  const afterLeads = Array.isArray(afterLoaded.leads) ? afterLoaded.leads : [];
  const after_count = afterLeads.length;
  const shaAfter = await sha256OfFile(LEADS_MASTER_ABS);
  console.log(`  after_count   : ${after_count}`);
  console.log(`  sha256 after  : ${shaAfter || '(file absent)'}`);
  console.log('');

  assertEqual('after_count === before_count + 4', after_count, before_count + 4);

  const afterDomains = domainSet(afterLeads);
  for (const d of CLEAN_DOMAINS) {
    assertTrue(`domain present after import: ${d}`, afterDomains.has(d), d);
  }

  // Forbidden NOT added.
  const forbiddenHits = findForbidden(afterLeads);
  assertEqual('no forbidden leads present (ZB23/TEST/metalproffi/FIRST OP)', forbiddenHits.length, 0);
  if (forbiddenHits.length > 0) {
    console.log('  forbidden hits: ' + JSON.stringify(forbiddenHits));
  }

  assertTrue('leads_master changed (sha differs)', shaAfter !== shaBefore, `before=${(shaBefore || '').slice(0, 12)} after=${(shaAfter || '').slice(0, 12)}`);
  console.log('');

  // -------------------------------------------------------------------------
  // STEP 8 — SHA-256 + final summary.
  // -------------------------------------------------------------------------
  console.log('--- STEP 8: SHA-256 leads_master ---');
  console.log(`  before : ${shaBefore || '(absent)'}`);
  console.log(`  after  : ${shaAfter || '(absent)'}`);
  console.log('');

  const summary = {
    execution_file: 'tools/tests/lead_markdown_reconciliation_import_4_clean.mjs',
    before_count,
    dry_run: dry.status,
    imported: imp.written === true ? 4 : 0,
    after_count,
    domains_added: CLEAN_DOMAINS,
    skipped: ['metalproffi.ru (needs_review)', 'ZB23 (voided)', 'TEST_LEAD (test)', 'FIRST OPERATIONAL LEAD (placeholder)'],
    snapshot: imp.snapshot_id,
    event_appended: imp.event_appended === true,
    qa_status: imp.qa_status,
    written: imp.written === true,
    real_data_changed: shaAfter !== shaBefore,
    sha256_before: shaBefore,
    sha256_after: shaAfter,
    safety: imp.safety,
  };
  console.log('--- FINAL SUMMARY (JSON) ---');
  console.log(JSON.stringify(summary, null, 2));
  console.log('');

  finish();
}

function finish() {
  console.log('============================================================');
  const passed = checks.length - failures;
  console.log(` Checks: ${passed}/${checks.length} passed, ${failures} failed.`);
  if (failures === 0) {
    console.log(' RESULT: OK — controlled 4-clean import completed safely.');
  } else {
    console.log(' RESULT: FAILURES DETECTED — review output above.');
  }
  console.log('============================================================');
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error('Unexpected error during controlled import:', err);
  process.exitCode = 1;
});
