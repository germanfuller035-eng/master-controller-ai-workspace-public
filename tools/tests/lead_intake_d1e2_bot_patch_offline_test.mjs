/**
 * lead_intake_d1e2_bot_patch_offline_test.mjs
 *
 * OFFLINE / STATIC test for the D1e2 bot patch.
 *
 * GOAL:
 *   Verify that telegram_master_bot.mjs correctly wires the D1e0 lead-intake
 *   adapter (handleLeadIntakeBotMessage signature + return shape), that the old
 *   broken D1d pattern is gone from the D1 guard, and that the adapter routing
 *   predicate (shouldRouteToLeadIntake) behaves as expected for direct
 *   commands, Russian aliases and protected/unrelated commands.
 *
 * HARD SAFETY RULES (enforced by construction):
 *   - telegram_master_bot.mjs is NEVER imported (read as TEXT only) so that no
 *     polling loop / Telegram API / .env load is ever triggered.
 *   - Only lead_intake_bot_adapter.mjs is imported, and ONLY its pure predicate
 *     shouldRouteToLeadIntake is called (no real import, no confirm=true).
 *   - NO network, NO SMTP, NO Telegram API, NO .env / AI_SECRETS read.
 *   - NO real write into 13_sales / dashboards / data.
 *   - NO tmp / _probe scripts created.
 *
 * USAGE:
 *   node --check tools/tests/lead_intake_d1e2_bot_patch_offline_test.mjs
 *   node tools/tests/lead_intake_d1e2_bot_patch_offline_test.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// tools/tests -> workspace root
const WORKSPACE = path.resolve(__dirname, '..', '..');
const BOT_PATH = path.join(
  WORKSPACE,
  'tools',
  'telegram_gateway',
  'telegram_master_bot.mjs',
);
const ADAPTER_PATH = path.join(
  WORKSPACE,
  'tools',
  'telegram_gateway',
  'lead_intake_bot_adapter.mjs',
);

// ── tiny test harness ──────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const warnings = [];
const failures = [];

function ok(name, cond, detail) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    failures.push(name + (detail ? ` — ${detail}` : ''));
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function warn(code, detail) {
  warnings.push(code + (detail ? ` — ${detail}` : ''));
  console.log(`  WARN  ${code}${detail ? ` — ${detail}` : ''}`);
}

console.log('────────────────────────────────────────────────────────');
console.log('D1e2 BOT PATCH — OFFLINE/STATIC TEST');
console.log('────────────────────────────────────────────────────────');

// ── Load bot source as TEXT (never import — avoids starting polling) ────────
let botSrc = '';
try {
  botSrc = fs.readFileSync(BOT_PATH, 'utf-8');
} catch (e) {
  ok('telegram_master_bot.mjs readable as text', false, e.message);
}
ok('telegram_master_bot.mjs read as TEXT (not imported)', botSrc.length > 0);

// ── SECTION A: static checks on telegram_master_bot.mjs ─────────────────────
console.log('\n[A] Static checks — telegram_master_bot.mjs');

// 1. imports the adapter
const importsAdapter =
  /from\s+['"]\.\/lead_intake_bot_adapter\.mjs['"]/.test(botSrc);
ok('1. imports lead_intake_bot_adapter.mjs', importsAdapter);

// 2. has a D1/D1e guard block
const hasD1Guard =
  /D1\s+LEAD\s+INTAKE/i.test(botSrc) ||
  /D1e/i.test(botSrc) ||
  /lead_intake_d1e/.test(botSrc);
ok('2. D1/D1e guard-block present', hasD1Guard);

// 3. calls handleLeadIntakeBotMessage(text, options) — string first arg
const callMatch = botSrc.match(/handleLeadIntakeBotMessage\s*\(\s*([^,]+?)\s*,/);
const firstArg = callMatch ? callMatch[1].trim() : '';
const firstArgIsText = firstArg === 'text';
ok(
  '3. handleLeadIntakeBotMessage(text, options) — first arg is string `text`',
  callMatch !== null && firstArgIsText,
  callMatch ? `first arg = "${firstArg}"` : 'call not found',
);

// 4. reads reply from d1Result.text (NOT response_text)
const readsDotText = /d1Result\.text\b/.test(botSrc);
ok('4. guard reads reply from d1Result.text', readsDotText);

// Compute fallback / guard positions first so checks below can be scoped.
const idxGuardCall = botSrc.indexOf('handleLeadIntakeBotMessage');
const idxSales2 = botSrc.indexOf('handleSalesPhase2(');
const idxSales1 = botSrc.indexOf('handleSalesPhase1(');
const idxRu = botSrc.indexOf('parseRussianIntent(');
function firstPositive(...arr) {
  return arr.filter((n) => n >= 0).sort((a, b) => a - b)[0] ?? -1;
}
const idxFallback = firstPositive(idxSales2, idxSales1, idxRu);

// 5. old broken pattern absent — SCOPED to the D1 guard block.
//    NOTE: The D1e patch intentionally keeps EXPLANATORY COMMENTS that mention
//    the old D1d behaviour (e.g. "the earlier block read response_text"). Those
//    comments are documentation, not live code. We therefore strip comments
//    before asserting that the old BROKEN EXECUTABLE patterns are absent:
//      - handleLeadIntakeBotMessage({ raw_text ... })   (object-as-first-arg)
//      - d1Result.response_text / .response_text         (old read field)
const idxGuardStart =
  botSrc.indexOf('D1 LEAD INTAKE') >= 0
    ? botSrc.indexOf('D1 LEAD INTAKE')
    : Math.max(0, idxGuardCall - 800);
const idxGuardEnd = idxFallback >= 0 ? idxFallback : botSrc.length;
const guardBlockRaw = botSrc.slice(idxGuardStart, idxGuardEnd);
const guardBlockCode = guardBlockRaw
  .replace(/\/\*[\s\S]*?\*\//g, '') // strip block comments
  .replace(/\/\/[^\n]*/g, ''); // strip line comments

const hasOldObjArg = /handleLeadIntakeBotMessage\s*\(\s*\{\s*raw_text/.test(
  guardBlockCode,
);
const hasResponseTextCode = /\.response_text\b/.test(guardBlockCode);
ok(
  '5a. old broken pattern absent (code) — handleLeadIntakeBotMessage({ raw_text ...',
  !hasOldObjArg,
);
ok(
  '5b. old broken pattern absent (code) — .response_text read',
  !hasResponseTextCode,
  hasResponseTextCode
    ? 'found .response_text in executable code'
    : 'absent in code (comments allowed)',
);

// 6. guard located BEFORE Sales/RU/NL fallback
ok(
  '6. D1 guard located before Sales/RU/NL fallback',
  idxGuardCall >= 0 && idxFallback >= 0 && idxGuardCall < idxFallback,
  `guard@${idxGuardCall} fallback@${idxFallback}`,
);

// 11. WARNING if enableRussianAliases=false near the D1 guard
const idxRuAliasFalse = botSrc.search(/enableRussianAliases\s*:\s*false/);
if (idxRuAliasFalse >= 0 && idxGuardCall >= 0) {
  // "near" = within ~600 chars of the adapter call
  if (Math.abs(idxRuAliasFalse - idxGuardCall) < 600) {
    warn(
      'RUSSIAN_ALIASES_MAY_BE_DISABLED_IN_LIVE_GUARD',
      'enableRussianAliases=false set adjacent to D1 live guard — RU aliases may not route in live bot',
    );
  }
}

// ── SECTION B: adapter predicate checks (import adapter ONLY) ────────────────
console.log('\n[B] Adapter routing predicate — lead_intake_bot_adapter.mjs');

let adapter = null;
try {
  adapter = await import('file://' + ADAPTER_PATH.replace(/\\/g, '/'));
} catch (e) {
  ok('lead_intake_bot_adapter.mjs imports', false, e.message);
}

const shouldRoute =
  adapter && typeof adapter.shouldRouteToLeadIntake === 'function'
    ? adapter.shouldRouteToLeadIntake
    : null;
ok('shouldRouteToLeadIntake exported as function', shouldRoute !== null);

function route(text) {
  if (!shouldRoute) return undefined;
  try {
    const r = shouldRoute(text);
    // normalize: predicate may return boolean or { route }
    if (typeof r === 'boolean') return r;
    if (r && typeof r === 'object') return !!(r.route ?? r.shouldRoute ?? r.matched);
    return !!r;
  } catch (_) {
    return undefined;
  }
}

// 8. protected commands NOT intercepted → false
console.log('\n  [8] Protected commands must NOT route (false):');
const protectedCmds = ['/ping', '/health', '/today', '/newleads'];
for (const cmd of protectedCmds) {
  ok(`8. not intercepted: ${cmd}`, route(cmd) === false, `got ${route(cmd)}`);
}

// 9. direct D1 commands → true
console.log('\n  [9] Direct D1 commands must route (true):');
const directCmds = [
  '/lead_import_status',
  '/lead_import_preview Завод | https://test.ru | Email: test@test.ru',
  '/lead_import_sandbox Завод | https://sandbox.ru | Email: sandbox@test.ru',
  '/lead_import_commit_approved',
];
for (const cmd of directCmds) {
  ok(`9. routes: ${cmd.split(' ')[0]}`, route(cmd) === true, `got ${route(cmd)}`);
}

// 10. Russian aliases → true
console.log('\n  [10] Russian aliases must route (true):');
const ruCmds = [
  'статус лидов',
  'проверь лид Завод | https://test.ru | Email: test@test.ru',
  'тестовый импорт Завод | https://sandbox.ru | Email: sandbox@test.ru',
  'подтвердить импорт',
];
for (const cmd of ruCmds) {
  ok(`10. routes (RU): ${cmd}`, route(cmd) === true, `got ${route(cmd)}`);
}

// 7. /lead_import_commit_approved stays BLOCKED_NOT_LIVE (no real commit).
//    Verified via STATIC source (no live call, no confirm=true): the adapter
//    routes the command (true) AND the bot guard runs under hard gates
//    (allowRealWrite=false, no confirmRealWrite=true) so commit cannot reach a
//    live import.
console.log('\n  [7] commit_approved stays BLOCKED_NOT_LIVE (static gates):');
const commitRoutes = route('/lead_import_commit_approved') === true;
const gateNoRealWrite = /allowRealWrite\s*:\s*false/.test(botSrc);
const gateNoConfirm = !/confirmRealWrite\s*:\s*true/.test(botSrc);
ok('7a. commit_approved is routed by adapter', commitRoutes);
ok('7b. bot guard uses allowRealWrite=false', gateNoRealWrite);
ok('7c. bot guard does NOT set confirmRealWrite=true', gateNoConfirm);

// ── SECTION C: safety self-assertions (static) ───────────────────────────────
console.log('\n[C] Safety self-assertions (this test file)');
const selfSrc = fs.readFileSync(__filename, 'utf-8');
// This test must never import the bot module (static OR dynamic import).
const staticImportsBot =
  /import\s+[^\n;]*from\s+['"][^'"]*telegram_master_bot\.mjs['"]/.test(selfSrc);
const dynamicImportsBot =
  /import\(\s*['"][^'"]*telegram_master_bot\.mjs/.test(selfSrc);
ok(
  'C1. test never imports telegram_master_bot.mjs',
  staticImportsBot === false && dynamicImportsBot === false,
);

// ── SUMMARY ──────────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────────────────────');
console.log(`RESULT: passed=${passed} failed=${failed} warnings=${warnings.length}`);
if (failures.length) {
  console.log('\nFailures:');
  for (const f of failures) console.log('  - ' + f);
}
if (warnings.length) {
  console.log('\nWarnings:');
  for (const w of warnings) console.log('  - ' + w);
}

const status =
  failed === 0
    ? warnings.length > 0
      ? 'PASS_WITH_WARNING'
      : 'PASS'
    : 'FAIL';
console.log(`\nSTATUS: ${status}`);
console.log('SAFETY: no-network | no-smtp | no-telegram-api | no-env | no-real-write | no-tmp-probe');
console.log('────────────────────────────────────────────────────────');

process.exit(failed === 0 ? 0 : 1);
