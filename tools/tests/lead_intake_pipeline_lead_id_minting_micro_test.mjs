/**
 * lead_intake_pipeline_lead_id_minting_micro_test.mjs
 *
 * Daily Lead Factory — MICRO test for canonical lead_id minting
 * (DLF-YYYYMMDD-NNNN) inside the lead intake pipeline.
 *
 * Scope (exactly 5 scenarios):
 *   1. dry_run: a new lead without a lead_id is minted a lead_id.
 *   2. lead_id format: DLF-20260603-0001 when options.import_date="2026-06-03".
 *   3. if the existing corpus already contains DLF-20260603-0001, the next
 *      minted lead becomes DLF-20260603-0002.
 *   4. two new leads in one batch receive different sequential ids.
 *   5. dry_run writes NOTHING to the real 13_sales data; safety contract is
 *      network=NO / external_send=NO / smtp=NO / auto_send=BLOCKED.
 *
 * HARD MODE — this test does NOT:
 *   - use the network / HTTP / fetch / Telegram API / email / SMTP / VPS.
 *   - read .env / AI_SECRETS / tokens.
 *   - perform a real import (no confirm=true against the real workspace).
 *   - write anything outside the throwaway sandbox workspace:
 *
 *         tmp/lead_id_minting_micro_workspace/
 *
 *   - touch the real 13_sales data, dashboards, SOPs, bot or Obsidian.
 *
 *   Confirmed imports below run ONLY inside the sandbox workspace (the only
 *   way to observe the actually-minted lead_id values in leads_master.json).
 *   The real-workspace guard is left fully untouched.
 *
 * It imports ONLY the already-approved standalone module:
 *   - tools/telegram_gateway/lead_intake_pipeline.mjs
 *
 * Run:
 *   node --check tools/tests/lead_intake_pipeline_lead_id_minting_micro_test.mjs
 *   node         tools/tests/lead_intake_pipeline_lead_id_minting_micro_test.mjs
 */

'use strict';

import path from 'node:path';
import fs from 'node:fs';

import {
  runLeadIntakeDryRun,
  runLeadIntakeImport,
  getLeadIntakePipelinePaths,
} from '../telegram_gateway/lead_intake_pipeline.mjs';

// ---------------------------------------------------------------------------
// Tiny assertion harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const lines = [];
const leadIdExamples = [];

function check(name, cond, extra) {
  if (cond) {
    passed += 1;
    lines.push(`  PASS  ${name}`);
  } else {
    failed += 1;
    lines.push(`  FAIL  ${name}${extra ? ` -> ${extra}` : ''}`);
  }
}

// ---------------------------------------------------------------------------
// Sandbox helpers (everything stays under tmp/lead_id_minting_micro_workspace)
// ---------------------------------------------------------------------------

const SANDBOX = path.resolve('tmp/lead_id_minting_micro_workspace');
const SANDBOX_ABS = SANDBOX + path.sep;
const paths = getLeadIntakePipelinePaths({ workspace: SANDBOX });

/** Reset the sandbox leads_master to a known seed list. Sandbox-only writes. */
function seedSandboxMaster(leads) {
  fs.mkdirSync(path.dirname(paths.leadsMasterAbs), { recursive: true });
  if (fs.existsSync(paths.leadEventsAbs)) fs.rmSync(paths.leadEventsAbs);
  fs.writeFileSync(
    paths.leadsMasterAbs,
    JSON.stringify(
      { schema: 'leads_master', leads: Array.isArray(leads) ? leads : [] },
      null,
      2
    ),
    'utf8'
  );
}

/** Read the leads array currently persisted in the sandbox leads_master. */
function readSandboxLeads() {
  if (!fs.existsSync(paths.leadsMasterAbs)) return [];
  const parsed = JSON.parse(fs.readFileSync(paths.leadsMasterAbs, 'utf8'));
  return Array.isArray(parsed.leads) ? parsed.leads : [];
}

// A clean, structured (pipe) lead row that carries NO lead_id token, so the
// pipeline must mint one. Distinct websites keep dedupe from merging them.
function leadRow(name, segment, region, website) {
  return `${name} | ${segment} | ${region} | ${website}`;
}

const IMPORT_DATE = '2026-06-03';
const DLF_RE = /^DLF-20260603-(\d{4})$/;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Record real-data state BEFORE anything runs (scenario 5 proof).
  const realLeadsMasterAbs = paths.realLeadsMasterAbs;
  const realExistedBefore = fs.existsSync(realLeadsMasterAbs);
  const realStatBefore = realExistedBefore
    ? fs.statSync(realLeadsMasterAbs).mtimeMs
    : null;

  // -------------------------------------------------------------------------
  // Scenario 1 — dry_run: a new lead without lead_id is minted a lead_id.
  //   dry_run never writes, so we prove minting succeeded by asserting the
  //   batch is committable (1 valid, 1 added) with NO empty-lead_id blocker.
  // -------------------------------------------------------------------------
  seedSandboxMaster([]);
  const dry = await runLeadIntakeDryRun(
    leadRow('Завод Бетон Юг', 'бетон', 'Краснодар', 'beton-yug.ru'),
    { workspace: SANDBOX, source: 'lead_id_minting_micro', import_date: IMPORT_DATE }
  );
  const dc = dry.counts || {};
  const dryBlockerCodes = (dry.blockers || []).map((b) => b && b.code);
  const noLeadIdBlocker =
    !dryBlockerCodes.includes('LEAD_ID_EMPTY_AFTER_MINT') &&
    !dryBlockerCodes.includes('LEAD_ID_DUPLICATE');
  const dryLeftEmpty = readSandboxLeads().length === 0;
  check(
    '1. dry_run mints a lead_id for a new lead without one',
    dry.mode === 'dry_run' &&
      dry.written === false &&
      dryLeftEmpty &&
      dc.valid_count === 1 &&
      dc.added_count === 1 &&
      noLeadIdBlocker,
    `mode=${dry.mode} written=${dry.written} empty=${dryLeftEmpty} valid=${dc.valid_count} added=${dc.added_count} blockers=${dryBlockerCodes.join(',')}`
  );

  // -------------------------------------------------------------------------
  // Scenario 2 — format: DLF-20260603-0001 with import_date="2026-06-03".
  //   Sandbox-only confirmed import lets us read the actually-minted id.
  // -------------------------------------------------------------------------
  seedSandboxMaster([]);
  const imp2 = await runLeadIntakeImport(
    leadRow('Завод Бетон Юг', 'бетон', 'Краснодар', 'beton-yug.ru'),
    {
      workspace: SANDBOX,
      source: 'lead_id_minting_micro',
      import_date: IMPORT_DATE,
      confirm: true,
      reason: 'lead_id_minting_micro_s2',
    }
  );
  const leads2 = readSandboxLeads();
  const id2 = leads2.length === 1 ? leads2[0].lead_id : '';
  if (id2) leadIdExamples.push(`s2: ${id2}`);
  check(
    '2. minted id format is DLF-20260603-0001',
    imp2.written === true && leads2.length === 1 && id2 === 'DLF-20260603-0001',
    `written=${imp2.written} count=${leads2.length} id=${id2}`
  );

  // -------------------------------------------------------------------------
  // Scenario 3 — existing corpus already has DLF-20260603-0001 -> next 0002.
  // -------------------------------------------------------------------------
  seedSandboxMaster([
    {
      lead_id: 'DLF-20260603-0001',
      name: 'Существующий Лид',
      website: 'existing-corp.ru',
      segment: 'бетон',
      region: 'Краснодар',
      source: 'seed',
      status: 'new',
    },
  ]);
  const imp3 = await runLeadIntakeImport(
    leadRow('Новый Завод', 'металл', 'Ростов', 'novyi-zavod.ru'),
    {
      workspace: SANDBOX,
      source: 'lead_id_minting_micro',
      import_date: IMPORT_DATE,
      confirm: true,
      reason: 'lead_id_minting_micro_s3',
    }
  );
  const leads3 = readSandboxLeads();
  const newLead3 = leads3.find((l) => l.website === 'novyi-zavod.ru');
  const id3 = newLead3 ? newLead3.lead_id : '';
  if (id3) leadIdExamples.push(`s3: ${id3}`);
  check(
    '3. next sequential id after DLF-20260603-0001 is DLF-20260603-0002',
    imp3.written === true && id3 === 'DLF-20260603-0002',
    `written=${imp3.written} id=${id3} all=${leads3.map((l) => l.lead_id).join(',')}`
  );

  // -------------------------------------------------------------------------
  // Scenario 4 — two new leads in one batch get different sequential ids.
  // -------------------------------------------------------------------------
  seedSandboxMaster([]);
  const batchText = [
    leadRow('Альфа Бетон', 'бетон', 'Краснодар', 'alfa-beton.ru'),
    leadRow('Бета Металл', 'металл', 'Ростов', 'beta-metall.ru'),
  ].join('\n');
  const imp4 = await runLeadIntakeImport(batchText, {
    workspace: SANDBOX,
    source: 'lead_id_minting_micro',
    import_date: IMPORT_DATE,
    confirm: true,
    reason: 'lead_id_minting_micro_s4',
  });
  const leads4 = readSandboxLeads();
  const ids4 = leads4.map((l) => l.lead_id);
  const allCanonical4 = ids4.length === 2 && ids4.every((id) => DLF_RE.test(id));
  const uniqueIds4 = new Set(ids4).size === ids4.length;
  const sequential4 =
    allCanonical4 &&
    ids4.includes('DLF-20260603-0001') &&
    ids4.includes('DLF-20260603-0002');
  ids4.forEach((id) => leadIdExamples.push(`s4: ${id}`));
  check(
    '4. two new leads in one batch get different sequential ids',
    imp4.written === true && allCanonical4 && uniqueIds4 && sequential4,
    `written=${imp4.written} ids=${ids4.join(',')} unique=${uniqueIds4} seq=${sequential4}`
  );

  // -------------------------------------------------------------------------
  // Scenario 5 — dry_run writes NOTHING to real 13_sales; safety contract.
  // -------------------------------------------------------------------------
  seedSandboxMaster([]);
  const dry5 = await runLeadIntakeDryRun(
    leadRow('Гамма Строй', 'стройматериалы', 'Самара', 'gamma-stroy.ru'),
    { workspace: SANDBOX, source: 'lead_id_minting_micro', import_date: IMPORT_DATE }
  );
  const s = dry5.safety || {};
  const realExistedAfter = fs.existsSync(realLeadsMasterAbs);
  const realStatAfter = realExistedAfter
    ? fs.statSync(realLeadsMasterAbs).mtimeMs
    : null;
  const realUntouched =
    realExistedBefore === realExistedAfter && realStatBefore === realStatAfter;
  const safetyOk =
    s.network_used === 'NO' &&
    s.external_send === 'NO' &&
    s.smtp_used === 'NO' &&
    s.auto_send === 'BLOCKED';
  // Make sure NOTHING was ever targeted at the real workspace.
  const neverRealTarget =
    dry.is_real_target === false &&
    imp2.is_real_target === false &&
    imp3.is_real_target === false &&
    imp4.is_real_target === false &&
    dry5.is_real_target === false;
  check(
    '5. dry_run writes nothing to real 13_sales; safety NO/NO/NO/BLOCKED',
    dry5.mode === 'dry_run' &&
      dry5.written === false &&
      realUntouched &&
      safetyOk &&
      neverRealTarget,
    `written=${dry5.written} realUntouched=${realUntouched} safety=${JSON.stringify(s)} neverReal=${neverRealTarget}`
  );

  // -------------------------------------------------------------------------
  // Output
  // -------------------------------------------------------------------------
  console.log('================================================================');
  console.log(' lead_intake_pipeline — lead_id minting MICRO test (offline)');
  console.log('================================================================');
  console.log(lines.join('\n'));
  console.log('----------------------------------------------------------------');
  console.log(' sandbox workspace: ' + SANDBOX);
  console.log(' real target tested: NO (never)');
  console.log(' lead_id examples:  ' + (leadIdExamples.join('  |  ') || '(none)'));
  console.log(' safety:            ' + JSON.stringify(dry5.safety || {}));
  console.log('----------------------------------------------------------------');
  console.log(` RESULT: passed=${passed} failed=${failed}`);
  console.log('================================================================');

  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(
    'FATAL: lead_id minting micro test crashed:',
    err && err.stack ? err.stack : err
  );
  process.exitCode = 1;
});
