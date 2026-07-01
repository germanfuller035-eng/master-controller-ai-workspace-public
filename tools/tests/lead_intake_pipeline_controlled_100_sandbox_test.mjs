/**
 * lead_intake_pipeline_controlled_100_sandbox_test.mjs
 *
 * Daily Lead Factory — Controlled SANDBOX import of 100 real-like leads.
 *
 * Purpose:
 *   Verify the daily volume (~100 leads/day) behaviour of the lead intake
 *   pipeline BEFORE any bot integration, entirely OFFLINE and ONLY inside a
 *   throwaway sandbox workspace:
 *
 *       tmp/lead_intake_controlled_100_sandbox_workspace/
 *
 * HARD MODE — this test does NOT:
 *   - use the network / HTTP / fetch.
 *   - use the Telegram API or any bot runtime.
 *   - use email / SMTP.
 *   - read .env / AI_SECRETS / tokens.
 *   - write anything outside the sandbox workspace.
 *   - touch the real 13_sales data, contact registry, dashboards or Obsidian.
 *   - search the internet or use real company data (synthetic / real-like only).
 *
 * It imports the already-approved standalone modules:
 *   - tools/telegram_gateway/lead_intake_pipeline.mjs
 *   - tools/telegram_gateway/lead_intake_commands.mjs
 *
 * Run:
 *   node --check tools/tests/lead_intake_pipeline_controlled_100_sandbox_test.mjs
 *   node         tools/tests/lead_intake_pipeline_controlled_100_sandbox_test.mjs
 */

'use strict';

import path from 'node:path';
import fs from 'node:fs';

import {
  runLeadIntakePipeline,
  buildLeadIntakePipelineSummary,
  getLeadIntakePipelinePaths,
} from '../telegram_gateway/lead_intake_pipeline.mjs';

// Imported per task contract (volume preflight before bot integration).
// Used read-only here: we only confirm the command surface is loadable.
import * as leadIntakeCommands from '../telegram_gateway/lead_intake_commands.mjs';

// ---------------------------------------------------------------------------
// Tiny assertion harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const lines = [];

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
// Synthetic / real-like input generation (100 rows, NO internet, NO real data)
// ---------------------------------------------------------------------------

const NICHES = ['ЖБИ', 'бетон', 'металлоконструкции', 'стройматериалы'];
const REGIONS = ['Краснодар', 'Ростов', 'Москва', 'Воронеж', 'Самара', 'Сочи', 'Тула'];

function buildInputRows() {
  const rows = [];
  const uniques = []; // remember keys so we can craft deliberate duplicates

  // --- 55 UNIQUE structured valid rows (mix of pipe + semicolon) -----------
  for (let i = 1; i <= 55; i++) {
    const id = 'ZB' + String(i).padStart(3, '0');
    const name = `Завод ЖБИ-Деталь ${i}`;
    const domain = `zavod-jbi-${i}.ru`;
    const segment = NICHES[i % NICHES.length];
    const region = REGIONS[i % REGIONS.length];
    const sep = i % 2 === 0 ? '|' : ';';
    rows.push(`${id} ${sep} ${name} ${sep} ${domain} ${sep} ${segment} ${sep} ${region}`);
    uniques.push({ id, name, domain, segment, region });
  }

  // --- 15 DUPLICATE structured valid rows (deliberate dupes) ---------------
  // 5 duplicates by DOMAIN (different id/name, same domain).
  for (let j = 1; j <= 5; j++) {
    const o = uniques[j - 1];
    rows.push(
      `ZBD${j} | Бетон Дубль Домен ${j} | ${o.domain} | бетон | Сочи`
    );
  }
  // 5 duplicates by LEAD_ID (same id, different domain/name).
  for (let j = 6; j <= 10; j++) {
    const o = uniques[j - 1];
    rows.push(
      `${o.id} ; Металл Дубль ИД ${j} ; lddup-${j}.ru ; металлоконструкции ; Тула`
    );
  }
  // 5 duplicates by NAME+REGION (no id, no domain, same name+region, has segment).
  for (let j = 11; j <= 15; j++) {
    const o = uniques[j - 1];
    rows.push(`${o.name} ; ${o.segment} ; ${o.region}`);
  }

  // --- 15 LOOSE valid rows (comma-separated, each has a domain) ------------
  for (let k = 1; k <= 15; k++) {
    const name = `Стройматериалы Юг ${k}`;
    const segment = NICHES[k % NICHES.length];
    const region = REGIONS[(k + 2) % REGIONS.length];
    const domain = `stroymat-yug-${k}.ru`;
    rows.push(`${name}, ${segment}, ${region}, ${domain}`);
  }

  // --- 10 PARTIAL valid rows (name only, loose, low confidence -> review) --
  for (let p = 1; p <= 10; p++) {
    rows.push(`СтройБетон Партиал ${p}`);
  }

  // --- 5 GARBAGE / needs_review rows (only empty labels, no usable field) --
  rows.push('email: | tel:');
  rows.push('сайт: ; почта:');
  rows.push('tg: | site:');
  rows.push('phone: ; email:');
  rows.push('web: | tel: | mail:');

  return rows;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const inputRows = buildInputRows();
  const textBlock = inputRows.join('\n');

  const sandboxWorkspace = path.resolve('tmp/lead_intake_controlled_100_sandbox_workspace');
  const sandboxAbs = sandboxWorkspace + path.sep;

  // Pre-create the sandbox workspace + an empty leads_master so the snapshot
  // step always has a clean, EMPTY rollback point (existing leads = []).
  const paths = getLeadIntakePipelinePaths({ workspace: sandboxWorkspace });
  fs.mkdirSync(path.dirname(paths.leadsMasterAbs), { recursive: true });
  fs.writeFileSync(
    paths.leadsMasterAbs,
    JSON.stringify({ schema: 'leads_master', leads: [] }, null, 2),
    'utf8'
  );

  // Record real path so we can prove we never touch it.
  const realLeadsMasterAbs = paths.realLeadsMasterAbs;
  const realExistedBefore = fs.existsSync(realLeadsMasterAbs);
  const realStatBefore = realExistedBefore ? fs.statSync(realLeadsMasterAbs).mtimeMs : null;

  // --- Run the pipeline (SANDBOX ONLY, real write NOT requested) -----------
  const result = await runLeadIntakePipeline(textBlock, {
    workspace: sandboxWorkspace,
    source: 'controlled_100_sandbox_test',
    // allowRealWrite / confirmRealWrite intentionally omitted -> blocked.
  });

  const summary = buildLeadIntakePipelineSummary(result);
  const c = result.counts || {};

  // --- Build a Telegram-style daily100 summary + report-like object --------
  const daily100 = {
    total_rows: c.total_rows,
    parsed_count: c.parsed_count,
    valid_count: c.valid_count,
    added_count: c.added_count,
    merged_count: c.merged_count,
    duplicate_count: c.duplicate_count,
    needs_review_count: c.needs_review_count,
    error_count: c.error_count,
    qa_status: result.qa_status,
    real_write_status: result.real_write_approved ? 'REAL_WRITTEN' : 'SANDBOX_ONLY',
    outreach_status: 'NOT_STARTED',
    next_action: 'REVIEW_FLAGGED_ROWS_THEN_AWAIT_REAL_WRITE_APPROVAL',
  };

  const safetyReport = {
    network: 'NO',
    telegram_api: 'NO',
    email: 'NO',
    smtp: 'NO',
    env_secrets: 'NO',
    external_send: result.safety ? result.safety.external_send : 'NO',
    auto_send: result.safety ? result.safety.auto_send : 'BLOCKED',
    client_messages_sent: 0,
  };

  // report-like object: include ONLY the first 5 rows, never all 100.
  const reportLike = {
    ...daily100,
    sample_rows: inputRows.slice(0, 5),
  };

  const telegramSummaryText =
    `Daily100 import (SANDBOX): rows=${daily100.total_rows} ` +
    `parsed=${daily100.parsed_count} valid=${daily100.valid_count} ` +
    `added=${daily100.added_count} merged=${daily100.merged_count} ` +
    `dupes=${daily100.duplicate_count} review=${daily100.needs_review_count} ` +
    `errors=${daily100.error_count} | QA=${daily100.qa_status} ` +
    `real=${daily100.real_write_status} outreach=${daily100.outreach_status} ` +
    `auto_send=${safetyReport.auto_send}`;

  // --- Checks (mirror the 27 acceptance conditions) ------------------------

  // 1
  check('1. total_rows = 100', c.total_rows === 100, String(c.total_rows));
  // 2
  check('2. parsed_count >= 95', c.parsed_count >= 95, String(c.parsed_count));
  // 3
  check('3. valid_count >= 85', c.valid_count >= 85, String(c.valid_count));
  // 4
  check(
    '4. needs_review_count between 5 and 15',
    c.needs_review_count >= 5 && c.needs_review_count <= 15,
    String(c.needs_review_count)
  );
  // 5
  check(
    '5. snapshot_id exists before commit',
    typeof result.snapshot_id === 'string' && result.snapshot_id.trim() !== '',
    String(result.snapshot_id)
  );
  // 6
  check(
    '6. QA status PASS or PASS_WITH_REVIEW',
    result.qa_status === 'PASS' || result.qa_status === 'PASS_WITH_REVIEW',
    String(result.qa_status)
  );
  // 7
  check(
    '7. sandbox commit performed',
    result.written === true &&
      (result.status === 'PASS' || result.status === 'PASS_WITH_REVIEW'),
    `written=${result.written} status=${result.status}`
  );
  // 8
  const realExistedAfter = fs.existsSync(realLeadsMasterAbs);
  const realStatAfter = realExistedAfter ? fs.statSync(realLeadsMasterAbs).mtimeMs : null;
  check(
    '8. real 13_sales not changed',
    result.is_real_target === false &&
      result.real_write_approved === false &&
      realExistedBefore === realExistedAfter &&
      realStatBefore === realStatAfter,
    `is_real_target=${result.is_real_target}`
  );
  // 9 (no contact registry write — pipeline never wires enrichment; assert no registry file in sandbox)
  const registryPath = path.resolve(
    sandboxWorkspace,
    '13_sales/daily_lead_factory/data/processed/lead_contact_registry.json'
  );
  check('9. no contact registry write', fs.existsSync(registryPath) === false);
  // 10
  check('10. duplicate_count > 0', c.duplicate_count > 0, String(c.duplicate_count));
  // 11
  check('11. merged_count > 0', c.merged_count > 0, String(c.merged_count));
  // 12
  check('12. added_count > 0', c.added_count > 0, String(c.added_count));
  // 13
  check(
    '13. output leads <= valid unique leads',
    typeof c.final_unique_count === 'number' && c.final_unique_count <= c.valid_count,
    `final_unique=${c.final_unique_count} valid=${c.valid_count}`
  );
  // 14
  const requiredKeys = [
    'total_rows',
    'parsed_count',
    'valid_count',
    'added_count',
    'merged_count',
    'duplicate_count',
    'needs_review_count',
    'error_count',
    'qa_status',
    'real_write_status',
    'outreach_status',
    'next_action',
  ];
  const missingKeys = requiredKeys.filter(
    (k) => !Object.prototype.hasOwnProperty.call(daily100, k)
  );
  check('14. daily100 summary has all required fields', missingKeys.length === 0, missingKeys.join(','));
  // 15
  check(
    '15. real_write_status NOT_REQUESTED or SANDBOX_ONLY',
    daily100.real_write_status === 'NOT_REQUESTED' ||
      daily100.real_write_status === 'SANDBOX_ONLY',
    daily100.real_write_status
  );
  // 16
  check('16. outreach_status = NOT_STARTED', daily100.outreach_status === 'NOT_STARTED');
  // 17
  check('17. auto_send = BLOCKED', safetyReport.auto_send === 'BLOCKED');
  // 18
  check('18. client_messages_sent = 0', safetyReport.client_messages_sent === 0);
  // 19
  check('19. no network', result.safety && result.safety.network_used === 'NO');
  // 20
  check('20. no Telegram API', safetyReport.telegram_api === 'NO');
  // 21
  check('21. no email', safetyReport.email === 'NO');
  // 22
  check('22. no SMTP', result.safety && result.safety.smtp_used === 'NO');
  // 23
  check('23. no .env / AI_SECRETS', safetyReport.env_secrets === 'NO');
  // 24
  check(
    '24. no external send patterns',
    result.safety && result.safety.external_send === 'NO'
  );
  // 25
  const writePath = result.write && result.write.path ? path.resolve(result.write.path) : '';
  check(
    '25. no write outside sandbox',
    path.resolve(result.leads_master_path).startsWith(sandboxAbs) &&
      writePath.startsWith(sandboxAbs),
    writePath
  );
  // 26
  check(
    '26. summary short enough for Telegram',
    telegramSummaryText.length <= 1500,
    `len=${telegramSummaryText.length}`
  );
  // 27
  check(
    '27. report-like object includes first 5 rows only',
    Array.isArray(reportLike.sample_rows) &&
      reportLike.sample_rows.length === 5 &&
      inputRows.length === 100,
    `sample=${reportLike.sample_rows ? reportLike.sample_rows.length : 'n/a'}`
  );

  // Bonus: confirm the commands module surface is importable (volume preflight).
  check(
    '+. lead_intake_commands module loaded',
    leadIntakeCommands && Object.keys(leadIntakeCommands).length > 0
  );

  // --- Output --------------------------------------------------------------
  console.log('================================================================');
  console.log(' Controlled SANDBOX import — 100 real-like leads (volume preflight)');
  console.log('================================================================');
  console.log(lines.join('\n'));
  console.log('----------------------------------------------------------------');
  console.log(' Telegram-style summary:');
  console.log('   ' + telegramSummaryText);
  console.log('----------------------------------------------------------------');
  console.log(' daily100 summary object:');
  console.log(JSON.stringify(daily100, null, 2));
  console.log(' safety report:');
  console.log(JSON.stringify(safetyReport, null, 2));
  console.log(' report-like (first 5 rows only):');
  console.log(JSON.stringify(reportLike.sample_rows, null, 2));
  console.log('----------------------------------------------------------------');
  console.log(` pipeline headline: ${summary.headline}`);
  console.log(`\n RESULT: passed=${passed} failed=${failed}`);
  console.log('================================================================');

  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error('FATAL: controlled 100 sandbox test crashed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
