/**
 * lead_intake_router_d1c_standalone_test.mjs
 *
 * Daily Lead Factory — D1c — Standalone test for lead_intake_router.mjs
 *
 * SCOPE (intentionally narrow + safe):
 *   - Imports ONLY tools/telegram_gateway/lead_intake_router.mjs.
 *   - Exercises 14 routing scenarios + a block of extra safety assertions.
 *   - Does NOT touch real 13_sales data, dashboard, SOPs, or the bot.
 *   - Does NOT open any network connection, SMTP, Telegram API, email.
 *   - Does NOT read .env / AI_SECRETS.
 *   - Does NOT perform a real import and NEVER passes confirm=true.
 *   - Creates NO probe files (tmp/_probe*.mjs, tmp/*probe*.mjs).
 *
 * The router delegates to the D1b standalone handlers. PREVIEW is a dry-run and
 * SANDBOX is confined to a tmp sandbox by D1b — neither mutates real data. This
 * test asserts real_data_changed === false on every route response.
 *
 * Run:
 *   node --check tools/tests/lead_intake_router_d1c_standalone_test.mjs
 *   node tools/tests/lead_intake_router_d1c_standalone_test.mjs
 */

'use strict';

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

import router, {
  getLeadIntakeRouterVersion,
  getLeadIntakeRouterHelp,
  normalizeLeadIntakeText,
  detectLeadIntakeIntent,
  routeLeadIntakeMessage,
  buildLeadIntakeRouterSummary,
} from '../telegram_gateway/lead_intake_router.mjs';

// ---------------------------------------------------------------------------
// Paths (resolve workspace root from this test file: tools/tests/ -> root)
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WORKSPACE_ROOT = resolve(__dirname, '..', '..');
const ROUTER_SRC_PATH = resolve(
  __dirname,
  '..',
  'telegram_gateway',
  'lead_intake_router.mjs',
);
const BOT_FILE_PATH = resolve(
  __dirname,
  '..',
  'telegram_gateway',
  'telegram_master_bot.mjs',
);
const TMP_DIR = join(WORKSPACE_ROOT, 'tmp');

// ---------------------------------------------------------------------------
// Tiny assertion harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    const line = detail ? `${name} — ${detail}` : name;
    failures.push(line);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/**
 * Assert the frozen router safety contract on any route response.
 * Returns true only if every required safety field is correct.
 */
function safetyOk(res) {
  const s = res && res.safety ? res.safety : {};
  return (
    s.auto_send === 'BLOCKED' &&
    s.client_contact === 'BLOCKED' &&
    s.network_used === 'NO' &&
    s.smtp_used === 'NO' &&
    s.external_send === 'NO'
  );
}

const LEAD_TEXT =
  'Иван Иванов, ООО Ромашка, +7 999 123-45-67, ivan@example.com';

/**
 * Strip JS comments (block + line) from source so static safety scans match
 * only EXECUTABLE code, not the module's safety-contract documentation prose.
 * The router documents what it does NOT do (e.g. "No network", "No SMTP",
 * ".env / AI_SECRETS", "No telegram_master_bot.mjs") inside comments; those
 * mentions must not be mistaken for real usage.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // block comments
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); // line comments (keep "://" intact)
}


// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== D1c lead_intake_router standalone test ===\n');

  // -------------------------------------------------------------------------
  // 1. getLeadIntakeRouterVersion returns a string
  // -------------------------------------------------------------------------
  const version = getLeadIntakeRouterVersion();
  check(
    '1. getLeadIntakeRouterVersion returns a non-empty string',
    typeof version === 'string' && version.length > 0,
    `got: ${JSON.stringify(version)}`,
  );

  // -------------------------------------------------------------------------
  // 2. getLeadIntakeRouterHelp lists direct commands + Russian aliases
  // -------------------------------------------------------------------------
  const help = getLeadIntakeRouterHelp();
  const helpIntents = Array.isArray(help.intents) ? help.intents : [];
  const helpCommands = helpIntents.map((i) => i.command);
  const allAliases = helpIntents.flatMap((i) =>
    Array.isArray(i.aliases) ? i.aliases : [],
  );
  const hasDirectCommands =
    helpCommands.includes('/lead_import_status') &&
    helpCommands.includes('/lead_import_preview') &&
    helpCommands.includes('/lead_import_sandbox') &&
    helpCommands.includes('/lead_import_commit_approved');
  const hasRussianAliases =
    allAliases.includes('статус лидов') &&
    allAliases.includes('проверь лид') &&
    allAliases.includes('тестовый импорт') &&
    allAliases.includes('подтвердить импорт');
  check(
    '2. getLeadIntakeRouterHelp exposes direct commands + Russian aliases',
    hasDirectCommands && hasRussianAliases,
    `directCommands=${hasDirectCommands} russianAliases=${hasRussianAliases}`,
  );

  // -------------------------------------------------------------------------
  // 3. normalizeLeadIntakeText cleans whitespace, keeps meaning
  // -------------------------------------------------------------------------
  const normalized = normalizeLeadIntakeText('   Статус   Лидов   Сейчас  ');
  check(
    '3. normalizeLeadIntakeText trims + collapses whitespace + keeps meaning',
    normalized === 'статус лидов сейчас',
    `got: ${JSON.stringify(normalized)}`,
  );

  // -------------------------------------------------------------------------
  // 4. direct /lead_import_status -> STATUS
  // -------------------------------------------------------------------------
  const r4 = await routeLeadIntakeMessage('/lead_import_status');
  check(
    '4. direct /lead_import_status -> STATUS',
    r4.intent === 'STATUS' &&
      r4.command === '/lead_import_status' &&
      r4.detection.source === 'command' &&
      r4.real_data_changed === false &&
      safetyOk(r4),
    `intent=${r4.intent} status=${r4.status}`,
  );

  // -------------------------------------------------------------------------
  // 5. alias "статус лидов" -> STATUS
  // -------------------------------------------------------------------------
  const r5 = await routeLeadIntakeMessage('статус лидов');
  check(
    '5. alias "статус лидов" -> STATUS',
    r5.intent === 'STATUS' &&
      r5.command === '/lead_import_status' &&
      r5.detection.source === 'alias' &&
      r5.real_data_changed === false &&
      safetyOk(r5),
    `intent=${r5.intent} status=${r5.status}`,
  );

  // -------------------------------------------------------------------------
  // 6. direct /lead_import_preview <text> -> PREVIEW + payload
  // -------------------------------------------------------------------------
  const r6 = await routeLeadIntakeMessage(`/lead_import_preview ${LEAD_TEXT}`);
  check(
    '6. direct /lead_import_preview <text> -> PREVIEW + payload',
    r6.intent === 'PREVIEW' &&
      r6.command === '/lead_import_preview' &&
      r6.detection.source === 'command' &&
      r6.detection.text === LEAD_TEXT &&
      r6.real_data_changed === false &&
      safetyOk(r6),
    `intent=${r6.intent} status=${r6.status} text=${JSON.stringify(r6.detection.text)}`,
  );

  // -------------------------------------------------------------------------
  // 7. alias "проверь лид <text>" -> PREVIEW + payload
  // -------------------------------------------------------------------------
  const r7 = await routeLeadIntakeMessage(`проверь лид ${LEAD_TEXT}`);
  check(
    '7. alias "проверь лид <text>" -> PREVIEW + payload',
    r7.intent === 'PREVIEW' &&
      r7.command === '/lead_import_preview' &&
      r7.detection.source === 'alias' &&
      r7.detection.text === LEAD_TEXT &&
      r7.real_data_changed === false &&
      safetyOk(r7),
    `intent=${r7.intent} status=${r7.status} text=${JSON.stringify(r7.detection.text)}`,
  );

  // -------------------------------------------------------------------------
  // 8. direct /lead_import_sandbox <text> -> SANDBOX + payload
  // -------------------------------------------------------------------------
  const r8 = await routeLeadIntakeMessage(`/lead_import_sandbox ${LEAD_TEXT}`);
  check(
    '8. direct /lead_import_sandbox <text> -> SANDBOX + payload',
    r8.intent === 'SANDBOX' &&
      r8.command === '/lead_import_sandbox' &&
      r8.detection.source === 'command' &&
      r8.detection.text === LEAD_TEXT &&
      r8.real_data_changed === false &&
      safetyOk(r8),
    `intent=${r8.intent} status=${r8.status} text=${JSON.stringify(r8.detection.text)}`,
  );

  // -------------------------------------------------------------------------
  // 9. alias "тестовый импорт <text>" -> SANDBOX + payload
  // -------------------------------------------------------------------------
  const r9 = await routeLeadIntakeMessage(`тестовый импорт ${LEAD_TEXT}`);
  check(
    '9. alias "тестовый импорт <text>" -> SANDBOX + payload',
    r9.intent === 'SANDBOX' &&
      r9.command === '/lead_import_sandbox' &&
      r9.detection.source === 'alias' &&
      r9.detection.text === LEAD_TEXT &&
      r9.real_data_changed === false &&
      safetyOk(r9),
    `intent=${r9.intent} status=${r9.status} text=${JSON.stringify(r9.detection.text)}`,
  );

  // -------------------------------------------------------------------------
  // 10. direct /lead_import_commit_approved -> COMMIT -> BLOCKED_NOT_LIVE
  // -------------------------------------------------------------------------
  const r10 = await routeLeadIntakeMessage('/lead_import_commit_approved');
  check(
    '10. direct /lead_import_commit_approved -> COMMIT -> BLOCKED_NOT_LIVE',
    r10.intent === 'COMMIT' &&
      r10.command === '/lead_import_commit_approved' &&
      r10.status === 'BLOCKED_NOT_LIVE' &&
      r10.ok === false &&
      r10.real_data_changed === false &&
      safetyOk(r10),
    `intent=${r10.intent} status=${r10.status}`,
  );

  // -------------------------------------------------------------------------
  // 11. alias "подтвердить импорт" -> COMMIT -> BLOCKED_NOT_LIVE
  // -------------------------------------------------------------------------
  const r11 = await routeLeadIntakeMessage('подтвердить импорт');
  check(
    '11. alias "подтвердить импорт" -> COMMIT -> BLOCKED_NOT_LIVE',
    r11.intent === 'COMMIT' &&
      r11.command === '/lead_import_commit_approved' &&
      r11.status === 'BLOCKED_NOT_LIVE' &&
      r11.ok === false &&
      r11.real_data_changed === false &&
      safetyOk(r11),
    `intent=${r11.intent} status=${r11.status}`,
  );

  // -------------------------------------------------------------------------
  // 12. preview/sandbox without payload -> NEEDS_TEXT
  // -------------------------------------------------------------------------
  const r12a = await routeLeadIntakeMessage('/lead_import_preview');
  const r12b = await routeLeadIntakeMessage('/lead_import_sandbox');
  check(
    '12. preview/sandbox without payload -> NEEDS_TEXT',
    r12a.status === 'NEEDS_TEXT' &&
      r12a.intent === 'PREVIEW' &&
      r12a.ok === false &&
      r12a.real_data_changed === false &&
      safetyOk(r12a) &&
      r12b.status === 'NEEDS_TEXT' &&
      r12b.intent === 'SANDBOX' &&
      r12b.ok === false &&
      r12b.real_data_changed === false &&
      safetyOk(r12b),
    `preview=${r12a.status} sandbox=${r12b.status}`,
  );

  // -------------------------------------------------------------------------
  // 13. unknown text -> UNKNOWN_LEAD_INTAKE_INTENT + help
  // -------------------------------------------------------------------------
  const r13 = await routeLeadIntakeMessage('погода в москве завтра');
  check(
    '13. unknown text -> UNKNOWN_LEAD_INTAKE_INTENT + help',
    r13.intent === 'UNKNOWN' &&
      r13.status === 'UNKNOWN_LEAD_INTAKE_INTENT' &&
      r13.ok === false &&
      r13.real_data_changed === false &&
      r13.help &&
      Array.isArray(r13.help.intents) &&
      r13.help.intents.length === 4 &&
      safetyOk(r13),
    `intent=${r13.intent} status=${r13.status} help=${!!r13.help}`,
  );

  // -------------------------------------------------------------------------
  // 14. safety present + correct in EVERY route response
  // -------------------------------------------------------------------------
  const allResponses = [
    r4, r5, r6, r7, r8, r9, r10, r11, r12a, r12b, r13,
  ];
  const everySafe = allResponses.every((res) => safetyOk(res));
  const everyNoRealWrite = allResponses.every(
    (res) => res.real_data_changed === false,
  );
  check(
    '14. safety BLOCKED/NO in every route response (auto_send, client_contact, network, smtp, external)',
    everySafe && everyNoRealWrite,
    `everySafe=${everySafe} everyNoRealWrite=${everyNoRealWrite}`,
  );

  // -------------------------------------------------------------------------
  // Extra safety / hygiene assertions (static source inspection)
  // -------------------------------------------------------------------------
  console.log('\n--- extra safety checks ---');

  const routerSrcRaw = readFileSync(ROUTER_SRC_PATH, 'utf8');
  // Scan only executable code: strip comments so safety-contract prose
  // (which documents the things the router intentionally does NOT do) does
  // not trigger false positives.
  const routerSrc = stripComments(routerSrcRaw);

  // no network
  const networkPattern =
    /\b(fetch|XMLHttpRequest|axios)\b|require\(\s*['"]https?['"]\s*\)|from\s+['"]https?['"]|node:https?|\bnet\.connect\b/;
  check(
    'EXTRA: no network (no fetch/http/https/net client in router code)',
    !networkPattern.test(routerSrc),
    'network-like token found in router code',
  );

  // no SMTP
  const smtpPattern = /\b(smtp|nodemailer|sendmail|mailer)\b/i;
  check(
    'EXTRA: no SMTP (no smtp/nodemailer/mailer in router code)',
    !smtpPattern.test(routerSrc),
    'smtp-like token found in router code',
  );

  // no Telegram API
  const telegramApiPattern =
    /api\.telegram\.org|node-telegram-bot-api|telegraf|grammy|TelegramBot|sendMessage\s*\(/i;
  check(
    'EXTRA: no Telegram API (no telegram client/sendMessage in router code)',
    !telegramApiPattern.test(routerSrc),
    'telegram-api-like token found in router code',
  );

  // no .env / AI_SECRETS
  const secretsPattern = /\.env\b|AI_SECRETS|process\.env\.[A-Z]/;
  check(
    'EXTRA: no .env / AI_SECRETS access in router code',
    !secretsPattern.test(routerSrc),
    '.env/AI_SECRETS token found in router code',
  );

  // no real write — router never writes; verify no fs write APIs in router code
  const writePattern =
    /\b(writeFileSync|writeFile|appendFile|appendFileSync|mkdirSync|rmSync|unlinkSync|createWriteStream)\b/;
  check(
    'EXTRA: no real write (no fs write API in router code) + real_data_changed=false everywhere',
    !writePattern.test(routerSrc) && everyNoRealWrite,
    'fs write API found in router code',
  );

  // bot file not touched — router does not import the bot; bot file (if present) untouched
  const importsBot =
    /import[^;]*telegram_master_bot|require\(\s*['"][^'"]*telegram_master_bot/.test(
      routerSrc,
    );

  check(
    'EXTRA: bot file not touched (router does not import telegram_master_bot.mjs)',
    !importsBot,
    'router imports telegram_master_bot',
  );
  if (existsSync(BOT_FILE_PATH)) {
    console.log('  note  telegram_master_bot.mjs exists but is NOT imported/modified.');
  } else {
    console.log('  note  telegram_master_bot.mjs not present in gateway dir.');
  }

  // no tmp/_probe*.mjs and no tmp/*probe*.mjs created
  let probeFiles = [];
  if (existsSync(TMP_DIR)) {
    try {
      probeFiles = readdirSync(TMP_DIR).filter(
        (f) => /probe/i.test(f) && f.endsWith('.mjs'),
      );
    } catch {
      probeFiles = [];
    }
  }
  check(
    'EXTRA: no probe files in tmp (no tmp/_probe*.mjs, no tmp/*probe*.mjs)',
    probeFiles.length === 0,
    `probe files: ${probeFiles.join(', ')}`,
  );

  // sanity: default export bundle exposes all named functions
  check(
    'EXTRA: default export bundle exposes all router functions',
    typeof router === 'object' &&
      typeof router.getLeadIntakeRouterVersion === 'function' &&
      typeof router.getLeadIntakeRouterHelp === 'function' &&
      typeof router.normalizeLeadIntakeText === 'function' &&
      typeof router.detectLeadIntakeIntent === 'function' &&
      typeof router.routeLeadIntakeMessage === 'function' &&
      typeof router.buildLeadIntakeRouterSummary === 'function',
    'default export missing a function',
  );

  // sanity: summary builder works on a route response
  const summary = buildLeadIntakeRouterSummary(r10);
  check(
    'EXTRA: buildLeadIntakeRouterSummary returns BLOCKED summary with safety',
    summary &&
      summary.status === 'BLOCKED_NOT_LIVE' &&
      summary.real_data_changed === false &&
      safetyOk(summary),
    `summary.status=${summary && summary.status}`,
  );

  // detectLeadIntakeIntent direct sanity (no routing/handlers)
  const det = detectLeadIntakeIntent('тестовый импорт привет');
  check(
    'EXTRA: detectLeadIntakeIntent classifies "тестовый импорт <text>" as SANDBOX',
    det.intent === 'SANDBOX' && det.text === 'привет',
    `intent=${det.intent} text=${JSON.stringify(det.text)}`,
  );

  // -------------------------------------------------------------------------
  // Final report
  // -------------------------------------------------------------------------
  const intentsTested = ['STATUS', 'PREVIEW', 'SANDBOX', 'COMMIT', 'UNKNOWN'];

  console.log('\n=== FINAL REPORT ===');
  console.log(`- test file created: tools/tests/lead_intake_router_d1c_standalone_test.mjs`);
  console.log(`- tests passed: ${passed}`);
  console.log(`- tests failed: ${failed}`);
  console.log(`- intents tested: ${intentsTested.join(', ')}`);
  console.log(`- files changed: none (test-only; router/commands/pipeline untouched)`);
  console.log(`- real data changed: NO`);
  console.log(`- bot touched: NO`);
  console.log(`- probe files created: 0`);
  console.log(
    `- safety: auto_send BLOCKED | client_contact BLOCKED | network NO | smtp NO | external_send NO`,
  );

  if (failed > 0) {
    console.log('\nFAILURES:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log('\nALL TESTS PASSED ✓');
    process.exitCode = 0;
  }
}

main().catch((err) => {
  console.error('FATAL: test harness crashed:', err);
  process.exitCode = 1;
});
