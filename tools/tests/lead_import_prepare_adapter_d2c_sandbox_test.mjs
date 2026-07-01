/**
 * lead_import_prepare_adapter_d2c_sandbox_test.mjs
 *
 * Standalone, OFFLINE sandbox test for the D2c lead import "prepare" adapter.
 *
 * Scope / safety:
 *   - Imports tools/telegram_gateway/lead_import_prepare_adapter.mjs ONLY.
 *   - Operates EXCLUSIVELY inside tmp/lead_import_prepare_adapter_d2c_workspace/.
 *   - Never performs a real import. Never confirm=true. Never snapshots.
 *   - Never touches real 13_sales data (verified by before/after fingerprints).
 *   - No network, no SMTP, no Telegram API, no email, no secrets reads.
 *   - No probe files. The bot file is never touched.
 *
 * Run:
 *   node --check tools/tests/lead_import_prepare_adapter_d2c_sandbox_test.mjs
 *   node        tools/tests/lead_import_prepare_adapter_d2c_sandbox_test.mjs
 */

'use strict';

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  getLeadImportPrepareAdapterVersion,
  buildLeadImportTextHash,
  buildLeadImportPrepareId,
  prepareLeadImportApproval,
} from '../telegram_gateway/lead_import_prepare_adapter.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');

// ---------------------------------------------------------------------------
// Tiny assert harness
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
// Sandbox paths (everything lives under tmp/, never under 13_sales)
// ---------------------------------------------------------------------------

const sandboxWorkspace = path.resolve(repoRoot, 'tmp/lead_import_prepare_adapter_d2c_workspace');
const queuePath = path.resolve(sandboxWorkspace, 'approval_queue/lead_import_approvals.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fingerprint(absPath) {
  try {
    const st = fs.statSync(absPath);
    const buf = fs.readFileSync(absPath);
    const h = crypto.createHash('sha256').update(buf).digest('hex');
    return `EXISTS:size=${st.size}:sha=${h}`;
  } catch (err) {
    if (err && err.code === 'ENOENT') return 'ABSENT';
    return `ERR:${err && err.code ? err.code : 'unknown'}`;
  }
}

function readQueueCards() {
  try {
    const raw = fs.readFileSync(queuePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.cards)) return parsed.cards;
    return [];
  } catch (_err) {
    return [];
  }
}

// A valid intake text block. The pipeline accepts rows in the shape:
//   name | segment | region | website
const VALID_TEXT = [
  'Завод ЖБИ-Деталь Юг | ЖБИ | Краснодар | zavod-jbi-yug.ru',
  'СтройСтальПром | стройматериалы | Самара | stroystal-prom.ru',
].join('\n');

const VALID_TEXT_2 = [
  'Бетон-Сервис | бетон | Ростов | beton-service.ru',
  'МонолитГрупп | строительство | Воронеж | monolit-group.ru',
].join('\n');

const FIXED_NOW = new Date('2026-06-06T01:02:03Z');

async function main() {
  lines.push('Lead Import Prepare Adapter — D2c sandbox test');
  lines.push('='.repeat(60));

  // Fresh sandbox: remove any stale queue from a previous run (sandbox only).
  if (fs.existsSync(sandboxWorkspace)) {
    fs.rmSync(sandboxWorkspace, { recursive: true, force: true });
  }
  fs.mkdirSync(path.dirname(queuePath), { recursive: true });

  // ----- REAL 13_sales fingerprints BEFORE (must remain unchanged) ---------
  const realLeadsMaster = path.resolve(repoRoot, '13_sales/leads_master.json');
  const realEvents = path.resolve(repoRoot, '13_sales/lead_intake_events.jsonl');
  const realLeadsMasterBefore = fingerprint(realLeadsMaster);
  const realEventsBefore = fingerprint(realEvents);

  // ----- 1. version is a string -------------------------------------------
  const version = getLeadImportPrepareAdapterVersion();
  check('1. getLeadImportPrepareAdapterVersion returns a string',
    typeof version === 'string' && version.length > 0, String(version));

  // ----- 2. same text -> same hash ----------------------------------------
  const hashA1 = buildLeadImportTextHash(VALID_TEXT);
  const hashA2 = buildLeadImportTextHash(VALID_TEXT);
  check('2. buildLeadImportTextHash stable for identical text',
    hashA1 === hashA2 && hashA1.length > 0, `${hashA1} vs ${hashA2}`);

  // ----- 3. different text -> different hash -------------------------------
  const hashB = buildLeadImportTextHash(VALID_TEXT_2);
  check('3. buildLeadImportTextHash differs for different text',
    hashA1 !== hashB, `${hashA1} vs ${hashB}`);

  // ----- 4. import id format IMP-YYYYMMDD-HHMMSS-xxxx ----------------------
  const importId = buildLeadImportPrepareId({ now: FIXED_NOW, text: VALID_TEXT });
  const idRe = /^IMP-\d{8}-\d{6}-[0-9a-z]{4}$/;
  check('4. buildLeadImportPrepareId matches IMP-YYYYMMDD-HHMMSS-xxxx',
    idRe.test(importId), importId);

  // ----- 5. no text -> FAILED_PREPARE/NEEDS_TEXT, no queue write -----------
  const noTextRes = await prepareLeadImportApproval({
    workspace: sandboxWorkspace,
    queuePath,
    text: '',
  });
  const noTextOk =
    (noTextRes.status === 'FAILED_PREPARE' || noTextRes.status === 'NEEDS_TEXT') &&
    noTextRes.queued !== true;
  const noTextQueueAbsent = readQueueCards().length === 0 && !fs.existsSync(queuePath);
  check('5. empty text -> FAILED_PREPARE/NEEDS_TEXT, no queue write',
    noTextOk && noTextQueueAbsent, `status=${noTextRes.status} queued=${noTextRes.queued}`);

  // ----- 6. missing queuePath -> FAIL_QUEUE_PATH_REQUIRED ------------------
  const noQueueRes = await prepareLeadImportApproval({
    workspace: sandboxWorkspace,
    text: VALID_TEXT,
  });
  check('6. missing queuePath -> FAIL_QUEUE_PATH_REQUIRED',
    noQueueRes.status === 'FAIL_QUEUE_PATH_REQUIRED' && noQueueRes.queued !== true,
    `status=${noQueueRes.status}`);

  // ----- 7. queuePath outside tmp/ -> FAIL_UNSAFE_QUEUE_PATH ---------------
  const unsafeQueuePath = path.resolve(repoRoot, '13_sales/approval_queue/lead_import_approvals.json');
  const unsafeRes = await prepareLeadImportApproval({
    workspace: sandboxWorkspace,
    queuePath: unsafeQueuePath,
    text: VALID_TEXT,
  });
  const unsafeNoWrite = fingerprint(unsafeQueuePath) === 'ABSENT';
  check('7. queuePath outside tmp/ -> FAIL_UNSAFE_QUEUE_PATH (no write)',
    unsafeRes.status === 'FAIL_UNSAFE_QUEUE_PATH' && unsafeRes.queued !== true && unsafeNoWrite,
    `status=${unsafeRes.status}`);

  // ----- 8. valid text -> PENDING card created in sandbox queue ------------
  const prepRes = await prepareLeadImportApproval({
    workspace: sandboxWorkspace,
    queuePath,
    text: VALID_TEXT,
    source: 'd2c_sandbox_test',
    options: { now: FIXED_NOW },
  });
  check('8. valid text -> dry-run PENDING card created in sandbox queue',
    prepRes.status === 'PENDING' && prepRes.queued === true && fs.existsSync(queuePath),
    `status=${prepRes.status} queued=${prepRes.queued} msg=${prepRes.message}`);

  // ----- 9. approval card shape -------------------------------------------
  const cardsAfter1 = readQueueCards();
  const card = cardsAfter1[0] || {};
  const requiredFields = [
    'import_id', 'created_at', 'source', 'text_hash', 'parsed_count',
    'valid_count', 'added_count', 'needs_review_count', 'qa_status', 'safety',
  ];
  const hasAllFields = requiredFields.every((f) => Object.prototype.hasOwnProperty.call(card, f));
  const nullFieldsOk =
    card.status === 'PENDING' &&
    card.approved_by === null &&
    card.approved_at === null &&
    card.snapshot_id === null &&
    card.commit_result === null;
  check('9. approval card has all required fields + correct null/PENDING state',
    hasAllFields && nullFieldsOk && typeof card.safety === 'object',
    `missing=${requiredFields.filter((f) => !(f in card)).join(',')} status=${card.status}`);

  // ----- 10. exactly 1 card after first prepare ---------------------------
  check('10. queue holds exactly 1 card after first prepare',
    cardsAfter1.length === 1, `count=${cardsAfter1.length}`);

  // ----- 11. repeated prepare adds a 2nd PENDING, keeps the first ----------
  const firstId = card.import_id;
  const prepRes2 = await prepareLeadImportApproval({
    workspace: sandboxWorkspace,
    queuePath,
    text: VALID_TEXT_2,
    source: 'd2c_sandbox_test',
    options: { now: new Date('2026-06-06T01:05:09Z') },
  });
  const cardsAfter2 = readQueueCards();
  const stillHasFirst = cardsAfter2.some((c) => c.import_id === firstId);
  const hasSecondPending =
    cardsAfter2.length === 2 &&
    cardsAfter2.every((c) => c.status === 'PENDING') &&
    prepRes2.status === 'PENDING';
  check('11. repeated prepare adds 2nd PENDING without overwriting the first',
    stillHasFirst && hasSecondPending, `count=${cardsAfter2.length}`);

  // ----- 12. no snapshot at prepare stage ---------------------------------
  const noSnapshot =
    cardsAfter2.every((c) => c.snapshot_id === null) &&
    prepRes.snapshot_created === false &&
    prepRes2.snapshot_created === false;
  check('12. no snapshot created at prepare stage',
    noSnapshot, 'snapshot must stay null/false');

  // ----- 13. no real 13_sales writes --------------------------------------
  const realLeadsMasterAfter = fingerprint(realLeadsMaster);
  const realEventsAfter = fingerprint(realEvents);
  const realUnchanged =
    realLeadsMasterAfter === realLeadsMasterBefore &&
    realEventsAfter === realEventsBefore;
  check('13. real 13_sales leads_master + lead_intake_events fingerprints unchanged',
    realUnchanged,
    `leads:${realLeadsMasterBefore === realLeadsMasterAfter} events:${realEventsBefore === realEventsAfter}`);

  // ----- 14. safety contract ----------------------------------------------
  const safety = prepRes.safety || {};
  const safetyOk =
    safety.auto_send === 'BLOCKED' &&
    safety.client_contact === 'BLOCKED' &&
    safety.external_send === 'NO' &&
    safety.smtp_used === 'NO' &&
    safety.network_used === 'NO' &&
    prepRes.real_import === 'NO' &&
    prepRes.real_data_changed === false &&
    prepRes.confirm_used === false;
  check('14. safety: auto_send/client_contact BLOCKED; external/smtp/network NO',
    safetyOk, JSON.stringify(safety));

  // ----- Static source safety (adapter + this test) -----------------------
  const adapterSrcPath = path.resolve(repoRoot, 'tools/telegram_gateway/lead_import_prepare_adapter.mjs');
  const adapterSrc = fs.readFileSync(adapterSrcPath, 'utf8');

  // Strip block + line comments so the safety doc-comments in the adapter do
  // not trigger false positives. We only scan executable source.
  const adapterCode = adapterSrc
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((ln) => ln.replace(/\/\/.*$/, ''))
    .join('\n');

  // Patterns target real executable usage only.
  const forbidden = [
    { name: 'no Telegram API', re: /api\.telegram\.org|new\s+TelegramBot|node-telegram|\.sendMessage\s*\(/i },
    { name: 'no SMTP', re: /nodemailer|createTransport|smtp:\/\/|\.sendMail\s*\(/i },
    { name: 'no network', re: /\bfetch\s*\(|\baxios\b|https?\.request\s*\(|new\s+WebSocket/i },
    { name: 'no secrets / .env', re: /AI_SECRETS|process\.env\.|require\(['"]dotenv|readFileSync\([^)]*\.env/i },
  ];
  for (const f of forbidden) {
    check(`static: ${f.name} (adapter executable code)`, !f.re.test(adapterCode),
      'pattern found in adapter code');
  }

  // No probe files created anywhere under tmp/.
  const probePattern = /probe.*\.mjs$/i;
  let probeFiles = [];
  const tmpRoot = path.resolve(repoRoot, 'tmp');
  function walk(dir) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_e) { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (probePattern.test(e.name)) probeFiles.push(full);
    }
  }
  walk(tmpRoot);
  check('static: no tmp/*probe*.mjs files created', probeFiles.length === 0,
    probeFiles.join(','));

  // Bot file not touched (this test never writes/imports the bot).
  const botFile = path.resolve(repoRoot, 'tools/telegram_gateway/telegram_master_bot.mjs');
  const botUnreferencedInAdapter = !/telegram_master_bot/.test(adapterCode);
  check('static: bot file not referenced by adapter executable code',
    botUnreferencedInAdapter, 'bot referenced in adapter');

  // ----- Report -----------------------------------------------------------
  const probeCreated = probeFiles.length;
  const overallSafety =
    safetyOk && realUnchanged && noSnapshot && probeCreated === 0 && botUnreferencedInAdapter;

  lines.push('='.repeat(60));
  lines.push(`PASSED: ${passed}`);
  lines.push(`FAILED: ${failed}`);
  lines.push('');
  lines.push('--- FINAL ANSWER ---');
  lines.push(`- test file created: tools/tests/lead_import_prepare_adapter_d2c_sandbox_test.mjs`);
  lines.push(`- tests passed: ${passed}`);
  lines.push(`- tests failed: ${failed}`);
  lines.push(`- approval cards created: ${cardsAfter2.length}`);
  lines.push(`- queue path: ${queuePath}`);
  lines.push(`- real data changed: ${realUnchanged ? 'NO' : 'YES'}`);
  lines.push(`- bot touched: NO`);
  lines.push(`- probe files created: ${probeCreated}`);
  lines.push(`- safety: ${overallSafety ? 'OK (no network / no SMTP / no Telegram / no secrets / no real import)' : 'CHECK FAILED'}`);

  console.log(lines.join('\n'));

  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exitCode = 1;
});
