/**
 * lead_intake_pipeline_d1a_sandbox_test.mjs
 *
 * Daily Lead Factory — D1a — Standalone Lead Intake Pipeline SANDBOX test.
 *
 * Purpose:
 *   Verify the lead intake pipeline behaviour for a small (5-lead) text block,
 *   entirely OFFLINE and ONLY inside a throwaway sandbox workspace:
 *
 *       tmp/lead_intake_pipeline_d1a_workspace/
 *
 * HARD MODE — this test does NOT:
 *   - use the network / HTTP / fetch.
 *   - use the Telegram API or any bot runtime.
 *   - use email / SMTP.
 *   - read .env / AI_SECRETS / tokens.
 *   - write anything outside the sandbox workspace.
 *   - touch the real 13_sales data, dashboards, SOPs or Obsidian.
 *
 * It imports ONLY the already-approved standalone module:
 *   - tools/telegram_gateway/lead_intake_pipeline.mjs
 *
 * Run:
 *   node --check tools/tests/lead_intake_pipeline_d1a_sandbox_test.mjs
 *   node         tools/tests/lead_intake_pipeline_d1a_sandbox_test.mjs
 */

'use strict';

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  runLeadIntakeDryRun,
  runLeadIntakeImport,
  buildLeadIntakePipelineSummary,
  loadLeadsMaster,
  saveLeadsMasterAtomic,
  getLeadIntakePipelinePaths,
} from '../telegram_gateway/lead_intake_pipeline.mjs';

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
// Synthetic / real-like input (5 leads, NO internet, NO real data)
//   - 4 unique valid leads
//   - 1 deliberate duplicate (same domain as lead #1)  -> merge/duplicate
// ---------------------------------------------------------------------------

function buildInputRows() {
  return [
    'ZB001 | Завод ЖБИ-Деталь Юг | zavod-jbi-yug.ru | ЖБИ | Краснодар',
    'ZB002 ; Бетон Мастер ; beton-master.ru ; бетон ; Ростов',
    'Металлоконструкции Дон, металлоконструкции, Воронеж, metall-don.ru',
    'ZB004 | СтройСтальПром | stroystal-prom.ru | стройматериалы | Самара',
    // deliberate duplicate of ZB001 by domain (different id/name).
    'ZBDUP | Дубль Домен | zavod-jbi-yug.ru | ЖБИ | Сочи',
  ];
}

// ---------------------------------------------------------------------------
// Source-level static safety scans (rules 16-20)
// ---------------------------------------------------------------------------

// We scan the *module* source. Comment/doc lines are stripped so the module's
// own safety-contract header text never produces a false positive — we only
// care about *executable* usage.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pipelineSrcPath = path.resolve(__dirname, '../telegram_gateway/lead_intake_pipeline.mjs');
const pipelineSrc = fs.readFileSync(pipelineSrcPath, 'utf8');

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .split(/\r?\n/)
    .filter((ln) => !ln.trim().startsWith('*') && !ln.trim().startsWith('//'))
    .join('\n');
}

const pipelineCode = stripComments(pipelineSrc);

// Patterns target real executable usage, NOT safety field names such as
// `smtp_used` / `external_send` / `network_used` that the module reports.
const NETWORK_PATTERNS = [
  /\bfetch\s*\(/,
  /\brequire\(\s*['"]https?['"]\s*\)/,
  /from\s+['"]node:https?['"]/,
  /\bnew\s+XMLHttpRequest\b/,
  /\baxios\b/,
  /\bWebSocket\b/,
];
const SMTP_PATTERNS = [/\bnodemailer\b/, /createTransport/, /smtp\./i, /:(?:465|587)\b/];
const ENV_SECRET_PATTERNS = [/AI_SECRETS/, /process\.env\.[A-Za-z]/, /id_rsa/, /id_ed25519/];
const EXTERNAL_SEND_PATTERNS = [/sendMessage\s*\(/, /sendMail\s*\(/, /sendEmail\s*\(/, /bulk[_-]?send/i];
const TELEGRAM_API_PATTERNS = [/api\.telegram\.org/, /\bbot\d+:[A-Za-z0-9_-]+/, /\bTelegramBot\b/, /node-telegram-bot-api/];

function noneMatch(patterns, code) {
  return patterns.every((re) => !re.test(code));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const inputRows = buildInputRows();
  const textBlock = inputRows.join('\n');

  const sandboxWorkspace = path.resolve('tmp/lead_intake_pipeline_d1a_workspace');
  const sandboxAbs = sandboxWorkspace + path.sep;

  // Clean + pre-create the sandbox workspace with an EMPTY leads_master so
  // dedupe/snapshot always start from a known, empty rollback point.
  const paths = getLeadIntakePipelinePaths({ workspace: sandboxWorkspace });
  fs.mkdirSync(path.dirname(paths.leadsMasterAbs), { recursive: true });
  // Remove any stale events log from a previous run inside the sandbox only.
  if (fs.existsSync(paths.leadEventsAbs)) fs.rmSync(paths.leadEventsAbs);
  fs.writeFileSync(
    paths.leadsMasterAbs,
    JSON.stringify({ schema: 'leads_master', leads: [] }, null, 2),
    'utf8'
  );

  // Record real path so we can prove we never touch it.
  const realLeadsMasterAbs = paths.realLeadsMasterAbs;
  const realExistedBefore = fs.existsSync(realLeadsMasterAbs);
  const realStatBefore = realExistedBefore ? fs.statSync(realLeadsMasterAbs).mtimeMs : null;

  // --- DRY RUN -------------------------------------------------------------
  const dry = await runLeadIntakeDryRun(textBlock, {
    workspace: sandboxWorkspace,
    source: 'd1a_sandbox_test',
  });
  const dc = dry.counts || {};

  // After dry run: leads_master in sandbox must remain EMPTY (no write).
  const afterDryMaster = JSON.parse(fs.readFileSync(paths.leadsMasterAbs, 'utf8'));
  const dryLeftEmpty = Array.isArray(afterDryMaster.leads) && afterDryMaster.leads.length === 0;
  const dryEventsExists = fs.existsSync(paths.leadEventsAbs);

  // 1. dry run accepts a text block with 5 leads.
  check('1. dry_run accepts 5-lead text block', dc.total_rows === 5, String(dc.total_rows));
  // 2. dry_run wrote nothing to (sandbox) leads_master.
  check('2. dry_run writes nothing to leads_master', dry.written === false && dryLeftEmpty && !dryEventsExists,
    `written=${dry.written} empty=${dryLeftEmpty} events=${dryEventsExists}`);
  // 3. parsed_count > 0
  check('3. parsed_count > 0', dc.parsed_count > 0, String(dc.parsed_count));
  // 4. valid_count > 0
  check('4. valid_count > 0', dc.valid_count > 0, String(dc.valid_count));
  // 5. duplicate rows merged/detected
  check('5. duplicate detected/merged', (dc.duplicate_count + dc.merged_count) > 0,
    `dup=${dc.duplicate_count} merged=${dc.merged_count}`);
  // 6. needs_review rows are kept with a reason (only assert reason if any exist).
  const reviewRows = Array.isArray(dry.needs_review_rows) ? dry.needs_review_rows : [];
  const everyReviewHasReason = reviewRows.every(
    (r) => r && (r.reason || (Array.isArray(r.reasons) && r.reasons.length > 0))
  );
  check('6. needs_review rows carry a reason', everyReviewHasReason, `review=${reviewRows.length}`);
  // 7. safety always hard-blocked.
  const ds = dry.safety || {};
  check('7. safety: network/external/smtp/auto_send hard-blocked',
    ds.network_used === 'NO' && ds.external_send === 'NO' && ds.smtp_used === 'NO' && ds.auto_send === 'BLOCKED',
    JSON.stringify(ds));
  // 8. dry_run does not require a real commit.
  check('8. dry_run needs no real commit', dry.written === false && dry.is_real_target === false,
    `written=${dry.written} real=${dry.is_real_target}`);

  // --- IMPORT WITHOUT confirm (should behave like dry run, no write) -------
  const importNoConfirm = await runLeadIntakeImport(textBlock, {
    workspace: sandboxWorkspace,
    source: 'd1a_sandbox_test',
  });
  const afterNoConfirmMaster = JSON.parse(fs.readFileSync(paths.leadsMasterAbs, 'utf8'));
  const noConfirmLeftEmpty = Array.isArray(afterNoConfirmMaster.leads) && afterNoConfirmMaster.leads.length === 0;
  // 9. import without confirm=true does NOT write.
  check('9. import without confirm=true does not write',
    importNoConfirm.written === false && noConfirmLeftEmpty,
    `written=${importNoConfirm.written} empty=${noConfirmLeftEmpty}`);

  // --- IMPORT WITH confirm=true (sandbox commit) ---------------------------
  const imp = await runLeadIntakeImport(textBlock, {
    workspace: sandboxWorkspace,
    source: 'd1a_sandbox_test',
    confirm: true,
    reason: 'd1a_sandbox_test_confirmed_import',
  });
  const ic = imp.counts || {};

  // 10. confirmed import in sandbox: snapshot + QA gate + write + event append.
  const writePath = imp.write && imp.write.path ? path.resolve(imp.write.path) : '';
  const eventsAfter = fs.existsSync(paths.leadEventsAbs);
  let eventLineCount = 0;
  if (eventsAfter) {
    eventLineCount = fs.readFileSync(paths.leadEventsAbs, 'utf8').split(/\r?\n/).filter((l) => l.trim()).length;
  }
  const masterAfterImport = JSON.parse(fs.readFileSync(paths.leadsMasterAbs, 'utf8'));
  const masterHasLeads = Array.isArray(masterAfterImport.leads) && masterAfterImport.leads.length > 0;
  check('10a. confirmed import created snapshot',
    typeof imp.snapshot_id === 'string' && imp.snapshot_id.trim() !== '', String(imp.snapshot_id));
  check('10b. confirmed import passed QA gate',
    imp.qa_status === 'PASS' || imp.qa_status === 'PASS_WITH_REVIEW', String(imp.qa_status));
  check('10c. confirmed import wrote leads_master in sandbox',
    imp.written === true && masterHasLeads && writePath.startsWith(sandboxAbs),
    `written=${imp.written} hasLeads=${masterHasLeads} path=${writePath}`);
  check('10d. confirmed import appended event to sandbox jsonl',
    imp.event_appended === true && eventsAfter && eventLineCount >= 1,
    `appended=${imp.event_appended} lines=${eventLineCount}`);

  // 11. QA FAIL blocks the write. Craft an input that fails the QA gate.
  const garbageBlock = ['email: | tel:', 'сайт: ; почта:', 'tg: | site:'].join('\n');
  const qaFail = await runLeadIntakeImport(garbageBlock, {
    workspace: sandboxWorkspace,
    source: 'd1a_sandbox_test_qa_fail',
    confirm: true,
    reason: 'd1a_sandbox_test_qa_fail',
  });
  check('11. QA FAIL blocks the write',
    qaFail.written === false && (qaFail.status === 'FAIL' || qaFail.qa_status === 'FAIL'),
    `written=${qaFail.written} status=${qaFail.status} qa=${qaFail.qa_status}`);

  // 12. Snapshot is mandatory before any commit (a written import must have one).
  check('12. snapshot mandatory before commit',
    imp.written !== true || (typeof imp.snapshot_id === 'string' && imp.snapshot_id.trim() !== ''),
    `written=${imp.written} snapshot=${imp.snapshot_id}`);
  // dry run must NOT have produced a snapshot (no commit path).
  check('12b. dry_run produced no snapshot', !dry.snapshot_id, String(dry.snapshot_id));

  // 13. buildLeadIntakePipelineSummary returns the required surface.
  const summary = buildLeadIntakePipelineSummary(imp);
  const summaryOk =
    summary &&
    typeof summary.import_id !== 'undefined' &&
    typeof summary.status !== 'undefined' &&
    summary.counts && typeof summary.counts === 'object' &&
    typeof summary.qa_status !== 'undefined' &&
    typeof summary.snapshot_id !== 'undefined' &&
    summary.safety && typeof summary.safety === 'object';
  check('13. summary returns import_id/status/counts/qa/snapshot/safety', summaryOk,
    JSON.stringify(Object.keys(summary || {})));

  // 14. loadLeadsMaster returns [] when the file does not exist.
  const emptyWorkspace = path.resolve('tmp/lead_intake_pipeline_d1a_workspace_empty');
  const emptyPaths = getLeadIntakePipelinePaths({ workspace: emptyWorkspace });
  if (fs.existsSync(emptyPaths.leadsMasterAbs)) fs.rmSync(emptyPaths.leadsMasterAbs);
  const loadedEmpty = await loadLeadsMaster({ workspace: emptyWorkspace });
  check('14. loadLeadsMaster returns [] when file missing',
    loadedEmpty && Array.isArray(loadedEmpty.leads) && loadedEmpty.leads.length === 0,
    JSON.stringify(loadedEmpty && loadedEmpty.leads));

  // 15. saveLeadsMasterAtomic must NOT write the REAL target without confirm.
  //     getLeadIntakePipelinePaths({}) resolves to a DEFAULT SANDBOX (not the
  //     real root), so writing there without confirm is legitimately allowed.
  //     To exercise the real-target guard we derive the real workspace root
  //     from paths.realLeadsMasterAbs and target it WITHOUT confirm. The module
  //     guard (paths.isRealTarget && !confirm) must THROW before writing,
  //     leaving the real file untouched.
  const leadsRel = path.relative(sandboxWorkspace, paths.leadsMasterAbs);
  const relDepth = leadsRel.split(/[\\/]/).filter(Boolean).length;
  let realRoot = paths.realLeadsMasterAbs;
  for (let i = 0; i < relDepth; i += 1) realRoot = path.dirname(realRoot);
  const realTargetPaths = getLeadIntakePipelinePaths({ workspace: realRoot });
  const realTargetIsReal = realTargetPaths.isRealTarget === true;
  const realStatBeforeSave = fs.existsSync(realTargetPaths.leadsMasterAbs)
    ? fs.statSync(realTargetPaths.leadsMasterAbs).mtimeMs : null;
  let saveBlocked = false;
  try {
    const saveRes = await saveLeadsMasterAtomic([{ lead_id: 'X', name: 'should-not-write' }], {
      workspace: realRoot, // real target, but WITHOUT confirm -> must be blocked.
    });
    saveBlocked = !saveRes || saveRes.written === false || saveRes.ok === false || saveRes.blocked === true;
  } catch (e) {
    // Throwing is the expected "blocked" outcome (defense-in-depth).
    saveBlocked = true;
  }
  const realStatAfterSave = fs.existsSync(realTargetPaths.leadsMasterAbs)
    ? fs.statSync(realTargetPaths.leadsMasterAbs).mtimeMs : null;
  check('15. saveLeadsMasterAtomic blocks real target without confirm',
    realTargetIsReal && saveBlocked && realStatBeforeSave === realStatAfterSave,
    `isReal=${realTargetIsReal} blocked=${saveBlocked} mtimeSame=${realStatBeforeSave === realStatAfterSave}`);

  // --- Real-data untouched proof ------------------------------------------
  const realExistedAfter = fs.existsSync(realLeadsMasterAbs);
  const realStatAfter = realExistedAfter ? fs.statSync(realLeadsMasterAbs).mtimeMs : null;
  const realUntouched =
    realExistedBefore === realExistedAfter && realStatBefore === realStatAfter;
  check('+. real 13_sales leads_master untouched', realUntouched,
    `existed ${realExistedBefore}->${realExistedAfter}`);

  // --- Static safety scans (rules 16-20) -----------------------------------
  check('16. no network usage', noneMatch(NETWORK_PATTERNS, pipelineCode));
  check('17. no SMTP usage', noneMatch(SMTP_PATTERNS, pipelineCode));
  check('18. no .env / AI_SECRETS access', noneMatch(ENV_SECRET_PATTERNS, pipelineCode));
  check('19. no external send patterns', noneMatch(EXTERNAL_SEND_PATTERNS, pipelineCode));
  check('20. no Telegram API patterns', noneMatch(TELEGRAM_API_PATTERNS, pipelineCode));

  // --- Output --------------------------------------------------------------
  console.log('================================================================');
  console.log(' lead_intake_pipeline D1a — SANDBOX test (5 leads, offline only)');
  console.log('================================================================');
  console.log(lines.join('\n'));
  console.log('----------------------------------------------------------------');
  console.log(' dry_run counts:    ' + JSON.stringify(dc));
  console.log(' import counts:     ' + JSON.stringify(ic));
  console.log(' import snapshot_id:' + imp.snapshot_id);
  console.log(' import qa_status:  ' + imp.qa_status + '  status=' + imp.status);
  console.log(' sandbox workspace: ' + sandboxWorkspace);
  console.log(' write path:        ' + writePath);
  console.log(' events path:       ' + paths.leadEventsAbs);
  console.log(' headline:          ' + summary.headline);
  console.log('----------------------------------------------------------------');
  console.log(` RESULT: passed=${passed} failed=${failed}`);
  console.log('================================================================');

  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error('FATAL: d1a sandbox test crashed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
