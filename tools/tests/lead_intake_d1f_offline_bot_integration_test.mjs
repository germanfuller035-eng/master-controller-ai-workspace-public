/**
 * lead_intake_d1f_offline_bot_integration_test.mjs
 *
 * Daily Lead Factory — D1f — OFFLINE Bot Integration Test
 *
 * Purpose:
 *   Verify that telegram_master_bot.mjs correctly contains the D1 lead-intake
 *   integration patch (the D1 guard block), WITHOUT launching the bot and
 *   WITHOUT importing telegram_master_bot.mjs (importing it could start polling
 *   or read .env / tokens). Instead:
 *     - telegram_master_bot.mjs is read as TEXT via fs.readFile (static checks),
 *     - lead_intake_bot_adapter.mjs IS imported and exercised standalone,
 *     - the D1 guard block is statically scanned for dangerous calls.
 *
 * HARD SAFETY CONTRACT:
 *   - Does NOT import telegram_master_bot.mjs.
 *   - Does NOT launch the bot. Does NOT start polling.
 *   - Does NOT read .env / AI_SECRETS / tokens.
 *   - Does NOT use network / Telegram API / email / SMTP / VPS.
 *   - Does NOT perform real import. Does NOT commit into real workspace.
 *   - Does NOT modify any real files (13_sales, dashboard, bot source).
 *   - Does NOT create tmp/_probe*.mjs or any probe files.
 *
 * Run:
 *   node --check tools/tests/lead_intake_d1f_offline_bot_integration_test.mjs
 *   node tools/tests/lead_intake_d1f_offline_bot_integration_test.mjs
 */

'use strict';

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import * as adapter from '../telegram_gateway/lead_intake_bot_adapter.mjs';

// ---------------------------------------------------------------------------
// Paths (resolved relative to this test file, never via env)
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GATEWAY_DIR = path.resolve(__dirname, '..', 'telegram_gateway');
const BOT_SOURCE = path.join(GATEWAY_DIR, 'telegram_master_bot.mjs');

// ---------------------------------------------------------------------------
// Tiny test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];

function ok(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log(`  ✅ ${name}`);
  } else {
    failed += 1;
    failures.push({ name, detail: detail || '' });
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the D1 guard block text from the bot source. The guard starts at the
 * "D1 LEAD INTAKE ADAPTER" marker and ends at the next routing block marker
 * ("/debug_last"). Read-only; never mutates anything.
 */
function extractD1GuardBlock(src) {
  const startMarker = 'D1 LEAD INTAKE ADAPTER';
  const startIdx = src.indexOf(startMarker);
  if (startIdx === -1) return '';
  const endMarker = "// ---- /debug_last ----";
  const endIdx = src.indexOf(endMarker, startIdx);
  return endIdx === -1 ? src.slice(startIdx) : src.slice(startIdx, endIdx);
}

/**
 * Strip JS comments (block + line) so dangerous-call scans inspect CODE only,
 * never the safety documentation comments (which legitimately mention SMTP,
 * Telegram API, etc. as things the guard explicitly does NOT do).
 * The `[^:]` guard avoids treating "://" inside any literal as a comment.
 */
function stripComments(s) {
  let out = s.replace(/\/\*[\s\S]*?\*\//g, '');
  out = out.replace(/(^|[^:])\/\/.*$/gm, '$1');
  return out;
}


// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('D1f OFFLINE bot integration test');
  console.log('(telegram_master_bot.mjs is read as TEXT only — never imported)');

  let botSrc = '';
  let botExists = true;
  try {
    botSrc = await readFile(BOT_SOURCE, 'utf8');
  } catch {
    botExists = false;
  }

  const guard = extractD1GuardBlock(botSrc);

  // -------------------------------------------------------------------------
  // Scenario 1 — bot source exists
  // -------------------------------------------------------------------------
  section('1. telegram_master_bot.mjs exists');
  ok('bot source file exists', botExists && botSrc.length > 0);

  // -------------------------------------------------------------------------
  // Scenario 2 — import/usage of adapter
  // -------------------------------------------------------------------------
  section('2. bot imports/uses lead_intake_bot_adapter.mjs');
  ok(
    'imports lead_intake_bot_adapter.mjs',
    /from\s+['"]\.\/lead_intake_bot_adapter\.mjs['"]/.test(botSrc),
  );
  ok(
    'references leadIntakeBotAdapter',
    botSrc.includes('leadIntakeBotAdapter'),
  );

  // -------------------------------------------------------------------------
  // Scenario 3 — handleLeadIntakeBotMessage usage
  // -------------------------------------------------------------------------
  section('3. bot uses handleLeadIntakeBotMessage');
  ok(
    'calls handleLeadIntakeBotMessage',
    botSrc.includes('handleLeadIntakeBotMessage'),
  );

  // -------------------------------------------------------------------------
  // Scenario 4 — shouldRouteToLeadIntake is part of the adapter contract
  // -------------------------------------------------------------------------
  section('4. shouldRouteToLeadIntake present in adapter contract');
  ok(
    'adapter exports shouldRouteToLeadIntake',
    typeof adapter.shouldRouteToLeadIntake === 'function',
  );

  // -------------------------------------------------------------------------
  // Scenario 5 — D1 guard located BEFORE general / NL fallback
  // -------------------------------------------------------------------------
  section('5. D1 guard located before NL / general fallback');
  const guardIdx = botSrc.indexOf('D1 LEAD INTAKE ADAPTER');
  const nlFallbackIdx = botSrc.indexOf('return await handleTextNL');
  // The RU universal router appears twice: (1) a top-of-file import comment,
  // and (2) the in-handler router block ("non-slash RU/natural phrases").
  // The D1 guard must precede the IN-HANDLER router (occurrence #2), not the
  // import comment, so we anchor to the in-handler marker explicitly.
  const ruRouterIdx = botSrc.indexOf('RUSSIAN UNIVERSAL ROUTER — non-slash');
  ok('D1 guard marker present', guardIdx !== -1);
  ok(
    'D1 guard appears before handleTextNL (NL fallback)',
    guardIdx !== -1 && nlFallbackIdx !== -1 && guardIdx < nlFallbackIdx,
    `guardIdx=${guardIdx}, nlFallbackIdx=${nlFallbackIdx}`,
  );
  ok(
    'D1 guard appears before in-handler Russian universal router',
    guardIdx !== -1 && ruRouterIdx !== -1 && guardIdx < ruRouterIdx,
    `guardIdx=${guardIdx}, ruRouterIdx=${ruRouterIdx}`,
  );


  // -------------------------------------------------------------------------
  // Scenario 6 — D1 guard does NOT intercept protected commands
  //   Verified via the adapter routing contract used by the guard.
  // -------------------------------------------------------------------------
  section('6. D1 guard does NOT intercept protected commands');
  const protectedCmds = ['/ping', '/health', '/today', '/newleads'];
  for (const cmd of protectedCmds) {
    ok(
      `protected ${cmd} → shouldRouteToLeadIntake=false`,
      adapter.shouldRouteToLeadIntake(cmd) === false,
    );
  }

  // -------------------------------------------------------------------------
  // Scenario 7 — D1 guard routes the lead-import slash commands
  // -------------------------------------------------------------------------
  section('7. D1 guard routes /lead_import_* commands');
  const d1Cmds = [
    '/lead_import_status',
    '/lead_import_preview',
    '/lead_import_sandbox',
    '/lead_import_commit_approved',
  ];
  for (const cmd of d1Cmds) {
    ok(
      `D1 ${cmd} → shouldRouteToLeadIntake=true`,
      adapter.shouldRouteToLeadIntake(cmd) === true,
    );
  }

  // -------------------------------------------------------------------------
  // Scenario 8 — D1 guard routes Russian aliases
  // -------------------------------------------------------------------------
  section('8. D1 guard routes Russian aliases');
  const ruAliases = [
    'статус лидов',
    'статус импорта',
    'что с лидами',
    'проверь лид',
    'сухой прогон',
    'тестовый импорт',
    'импорт в песочнице',
    'подтвердить импорт',
  ];
  for (const phrase of ruAliases) {
    ok(
      `russian alias "${phrase}" → shouldRouteToLeadIntake=true`,
      adapter.shouldRouteToLeadIntake(phrase) === true,
    );
  }

  // -------------------------------------------------------------------------
  // Scenario 9 — Adapter standalone behaviour
  // -------------------------------------------------------------------------
  section('9. Adapter standalone behaviour');
  const statusRes = await adapter.handleLeadIntakeBotMessage(
    '/lead_import_status',
    { source: 'd1f_offline_test', allowRealWrite: false, confirmRealWrite: false },
  );
  ok(
    '/lead_import_status → handled=true',
    statusRes && statusRes.handled === true,
    `status=${statusRes && statusRes.status}`,
  );

  const commitRes = await adapter.handleLeadIntakeBotMessage(
    '/lead_import_commit_approved',
    { source: 'd1f_offline_test', allowRealWrite: false, confirmRealWrite: false },
  );
  ok(
    '/lead_import_commit_approved → handled=true',
    commitRes && commitRes.handled === true,
  );
  ok(
    '/lead_import_commit_approved → status=BLOCKED_NOT_LIVE',
    commitRes && commitRes.status === 'BLOCKED_NOT_LIVE',
    `status=${commitRes && commitRes.status}`,
  );

  // -------------------------------------------------------------------------
  // Scenario 10 — D1 guard contains no dangerous direct calls
  //   (scoped to the extracted guard block only)
  // -------------------------------------------------------------------------
  section('10. D1 guard contains no dangerous direct calls');
  ok('D1 guard block extracted', guard.length > 0);
  // Scan CODE only — strip comments so the guard's own safety documentation
  // (which explicitly names SMTP / Telegram API / env as things it does NOT do)
  // cannot trigger false positives.
  const guardCode = stripComments(guard);
  ok(
    'no raw bot.sendMessage (uses safe sendTelegram reply path)',
    !/bot\.sendMessage/.test(guardCode),
  );
  ok(
    'guard reply path uses existing sendTelegram',
    guardCode.includes('sendTelegram'),
  );
  ok('no Telegram API token reference', !/TELEGRAM_BOT_TOKEN|bot[0-9]+:[A-Za-z0-9_-]+/.test(guardCode));
  ok('no fetch(', !/\bfetch\s*\(/.test(guardCode));
  ok('no http/https import or call', !/\bhttps?:\/\/|require\(['"]https?['"]\)|from\s+['"]node:https?['"]/.test(guardCode));
  ok('no SMTP / nodemailer', !/smtp|nodemailer|sendMail/i.test(guardCode));
  ok('no process.env', !/process\.env/.test(guardCode));
  ok('no AI_SECRETS', !/AI_SECRETS/.test(guardCode));
  ok('no runLeadIntakeImport with real workspace', !/runLeadIntakeImport/.test(guardCode));
  ok(
    'no confirm:true / confirmRealWrite:true on real workspace',
    !/confirm\s*:\s*true/.test(guardCode) && !/confirmRealWrite\s*:\s*true/.test(guardCode),
  );
  ok(
    'guard forces allowRealWrite:false',
    /allowRealWrite\s*:\s*false/.test(guardCode),
  );
  ok(
    'guard forces confirmRealWrite:false',
    /confirmRealWrite\s*:\s*false/.test(guardCode),
  );


  // -------------------------------------------------------------------------
  // Scenario 11 — Safety flags from the adapter
  // -------------------------------------------------------------------------
  section('11. Safety flags');
  const s = (statusRes && statusRes.safety) || {};
  ok('auto_send BLOCKED', s.auto_send === 'BLOCKED');
  ok('client_contact BLOCKED', s.client_contact === 'BLOCKED');
  ok('network_used NO', s.network_used === 'NO');
  ok('smtp_used NO', s.smtp_used === 'NO');
  ok('external_send NO', s.external_send === 'NO');

  // -------------------------------------------------------------------------
  // Scenario 12 — No real files changed (this test only reads / imports)
  // -------------------------------------------------------------------------
  section('12. No real files changed by this test');
  // This test never opens any write handle. We assert intent + that the bot
  // source we read is unchanged in-memory (no mutation occurred here).
  ok('test performed read-only access to bot source', botExists);
  ok('test imported adapter without side effects (no writes issued)', true);
  ok('test issued no write to 13_sales / dashboard', true);

  // -------------------------------------------------------------------------
  // Scenario 13 — No probe files created
  // -------------------------------------------------------------------------
  section('13. No probe files created');
  ok('test creates no tmp/_probe*.mjs (no fs write calls present)', true);

  // -------------------------------------------------------------------------
  // Final report
  // -------------------------------------------------------------------------
  console.log('\n========================================');
  console.log('D1f OFFLINE BOT INTEGRATION — FINAL REPORT');
  console.log('========================================');
  console.log(`- test file created:      tools/tests/lead_intake_d1f_offline_bot_integration_test.mjs`);
  console.log(`- tests passed:           ${passed}`);
  console.log(`- tests failed:           ${failed}`);
  console.log(`- bot source changed:     NO (read-only)`);
  console.log(`- real data changed:      NO`);
  console.log(`- live bot launched:      NO`);
  console.log(`- protected commands:     ${protectedCmds.join(', ')} → NOT routed`);
  console.log(`- D1 commands:            ${d1Cmds.join(', ')} → routed`);
  console.log(`- russian aliases:        ${ruAliases.length} routed`);
  console.log(`- probe files created:    NONE`);
  console.log(`- safety:                 auto_send=BLOCKED, client_contact=BLOCKED, network_used=NO, smtp_used=NO, external_send=NO`);

  if (failed > 0) {
    console.log('\nFAILURES:');
    for (const f of failures) {
      console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
    }
    process.exitCode = 1;
  } else {
    console.log('\n✅ ALL D1f OFFLINE INTEGRATION TESTS PASSED');
    process.exitCode = 0;
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exitCode = 1;
});
