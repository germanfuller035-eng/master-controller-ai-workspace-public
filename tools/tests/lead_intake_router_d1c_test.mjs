/**
 * lead_intake_router_d1c_test.mjs
 *
 * Standalone OFFLINE test runner for the D1c Lead Intake Router.
 *
 * Module under test:
 *   tools/telegram_gateway/lead_intake_router.mjs
 *
 * HARD SAFETY (enforced by this test):
 *   - No network. No Telegram API. No email. No SMTP. No fetch/http/https.
 *   - No .env / AI_SECRETS reads.
 *   - No real 13_sales write. No contact enrichment import.
 *   - Never integrates into a live Telegram bot.
 *   - Never passes allowRealWrite / confirmRealWrite (auto_send stays BLOCKED).
 *   - Only imports the router; the router itself imports only the D1b commands.
 *   - A static source scan asserts the router contains no forbidden patterns.
 *
 * Run:
 *   node --check tools/tests/lead_intake_router_d1c_test.mjs
 *   node tools/tests/lead_intake_router_d1c_test.mjs
 */

'use strict';

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseLeadIntakeRouterInput,
  matchLeadIntakeIntent,
  routeLeadIntakeCommand,
  buildLeadIntakeRouterFallback,
  buildLeadIntakeRouterResult,
  getLeadIntakeRouterAliases,
  isLeadIntakeCommandLike,
  isOutreachBlockedPhrase,
} from '../telegram_gateway/lead_intake_router.mjs';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// d:\AI_WORKSPACE
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..');

const ROUTER_SOURCE_PATH = path.resolve(
  WORKSPACE_ROOT,
  'tools/telegram_gateway/lead_intake_router.mjs'
);

// ---------------------------------------------------------------------------
// Tiny test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed += 1;
    failures.push({ name, message: err && err.message ? err.message : String(err) });
    console.log(`  FAIL  ${name}`);
    console.log(`        -> ${err && err.message ? err.message : err}`);
  }
}

// ---------------------------------------------------------------------------
// Shared assertions
// ---------------------------------------------------------------------------

const RESULT_KEYS = [
  'matched',
  'intent',
  'command',
  'handler',
  'confidence',
  'status',
  'safe_to_execute',
  'requires_input',
  'requires_import_id',
  'requires_approval',
  'real_write_allowed',
  'reason',
  'next_action',
  'safety',
];

/** Assert that a router result contains every contract field (Test 28). */
function assertResultShape(result) {
  assert.ok(result && typeof result === 'object', 'result must be an object');
  for (const key of RESULT_KEYS) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(result, key),
      `result missing field: ${key}`
    );
  }
}

/** Assert the immutable safety flags (Test 29). */
function assertSafetyFlags(result) {
  const s = result.safety;
  assert.ok(s && typeof s === 'object', 'safety must be an object');
  assert.strictEqual(s.network_used, 'NO', 'network_used must be NO');
  assert.strictEqual(s.telegram_api_used, 'NO', 'telegram_api_used must be NO');
  assert.strictEqual(s.external_send, 'NO', 'external_send must be NO');
  assert.strictEqual(s.smtp_used, 'NO', 'smtp_used must be NO');
  assert.strictEqual(s.auto_send, 'BLOCKED', 'auto_send must be BLOCKED');
  assert.strictEqual(s.client_messages_sent, 0, 'client_messages_sent must be 0');
}

/** Full safety contract for any routed result. */
function assertFullSafeResult(result) {
  assertResultShape(result);
  assertSafetyFlags(result);
  assert.strictEqual(result.real_write_allowed, false, 'real_write_allowed must be false');
}

// Lead text block usable by preview/sandbox handlers when provided.
const SAMPLE_LEAD_TEXT = [
  'Name: Zavod Test One',
  'Website: https://example-one.test',
  '',
  'Name: Zavod Test Two',
  'Website: https://example-two.test',
].join('\n');

// ===========================================================================
// Tests
// ===========================================================================

async function main() {
  console.log('lead_intake_router_d1c_test');
  console.log('---------------------------------------------------------------');

  // --- 1..7: parse / route exact slash commands -------------------------

  await test('1. /lead_import_preview routes to preview handler', async () => {
    const r = await routeLeadIntakeCommand(`/lead_import_preview\n${SAMPLE_LEAD_TEXT}`);
    assertFullSafeResult(r);
    assert.strictEqual(r.matched, true);
    assert.strictEqual(r.intent, 'lead_import_preview');
    assert.strictEqual(r.command, '/lead_import_preview');
    assert.strictEqual(r.handler, 'runLeadImportPreviewCommand');
    assert.strictEqual(r.status, 'OK');
    assert.strictEqual(r.safe_to_execute, true);
  });

  await test('2. /lead_import_sandbox routes to sandbox handler', async () => {
    const r = await routeLeadIntakeCommand(`/lead_import_sandbox\n${SAMPLE_LEAD_TEXT}`);
    assertFullSafeResult(r);
    assert.strictEqual(r.matched, true);
    assert.strictEqual(r.intent, 'lead_import_sandbox');
    assert.strictEqual(r.command, '/lead_import_sandbox');
    assert.strictEqual(r.handler, 'runLeadImportSandboxCommand');
    assert.strictEqual(r.status, 'OK');
  });

  await test('3. /lead_import_status routes to status handler', async () => {
    const r = await routeLeadIntakeCommand('/lead_import_status import-123');
    assertFullSafeResult(r);
    assert.strictEqual(r.matched, true);
    assert.strictEqual(r.intent, 'lead_import_status');
    assert.strictEqual(r.handler, 'runLeadImportStatusCommand');
    assert.strictEqual(r.status, 'OK');
  });

  await test('4. /lead_import_commit_request routes to commit_request handler', async () => {
    const r = await routeLeadIntakeCommand('/lead_import_commit_request import-123');
    assertFullSafeResult(r);
    assert.strictEqual(r.matched, true);
    assert.strictEqual(r.intent, 'lead_import_commit_request');
    assert.strictEqual(r.handler, 'runLeadImportCommitRequestCommand');
  });

  await test('5. /lead_import_commit_approved is COMMIT_BLOCKED (no real write)', async () => {
    const r = await routeLeadIntakeCommand('/lead_import_commit_approved approval-1 APPROVE REAL LEAD IMPORT import-123', { import_id: 'import-123' });
    assertFullSafeResult(r);
    assert.strictEqual(r.intent, 'lead_import_commit_approved');
    assert.strictEqual(r.status, 'COMMIT_BLOCKED');
    assert.strictEqual(r.safe_to_execute, false);
    assert.strictEqual(r.real_write_allowed, false);
  });

  await test('6. /lead_import_abort routes to abort handler', async () => {
    const r = await routeLeadIntakeCommand('/lead_import_abort import-123');
    assertFullSafeResult(r);
    assert.strictEqual(r.matched, true);
    assert.strictEqual(r.intent, 'lead_import_abort');
    assert.strictEqual(r.handler, 'runLeadImportAbortCommand');
  });

  await test('7. /daily100_report routes to daily100 handler', async () => {
    const r = await routeLeadIntakeCommand('/daily100_report');
    assertFullSafeResult(r);
    assert.strictEqual(r.matched, true);
    assert.strictEqual(r.intent, 'daily100_report');
    assert.strictEqual(r.handler, 'runDaily100ReportCommand');
    assert.strictEqual(r.status, 'OK');
  });

  // --- 8: Russian alias preview -----------------------------------------

  await test('8. Russian alias preview', async () => {
    const phrases = ['проверь лиды', 'предпросмотр лидов', 'распарси лиды'];
    for (const p of phrases) {
      const m = matchLeadIntakeIntent(p);
      assert.strictEqual(m.matched, true, `not matched: ${p}`);
      assert.strictEqual(m.intent, 'lead_import_preview', `wrong intent: ${p}`);
      assert.strictEqual(m.confidence, 0.9, `alias confidence not 0.9: ${p}`);
    }
  });

  // --- 9: Russian alias sandbox -----------------------------------------

  await test('9. Russian alias sandbox', async () => {
    const phrases = [
      'прогони лиды в песочнице',
      'тестовый импорт лидов',
      'проверь 100 лидов в песочнице',
    ];
    for (const p of phrases) {
      const m = matchLeadIntakeIntent(p);
      assert.strictEqual(m.matched, true, `not matched: ${p}`);
      assert.strictEqual(m.intent, 'lead_import_sandbox', `wrong intent: ${p}`);
    }
  });

  // --- 10: Russian alias status -----------------------------------------

  await test('10. Russian alias status', async () => {
    const phrases = ['статус импорта', 'что с импортом', 'покажи последний импорт'];
    for (const p of phrases) {
      const m = matchLeadIntakeIntent(p);
      assert.strictEqual(m.matched, true, `not matched: ${p}`);
      assert.strictEqual(m.intent, 'lead_import_status', `wrong intent: ${p}`);
    }
  });

  // --- 11: Russian alias commit_request ---------------------------------

  await test('11. Russian alias commit_request', async () => {
    const phrases = [
      'запроси подтверждение записи',
      'создай запрос на запись лидов',
      'подготовь approval на импорт',
    ];
    for (const p of phrases) {
      const m = matchLeadIntakeIntent(p);
      assert.strictEqual(m.matched, true, `not matched: ${p}`);
      assert.strictEqual(m.intent, 'lead_import_commit_request', `wrong intent: ${p}`);
    }
  });

  // --- 12: Russian alias commit_approved --------------------------------

  await test('12. Russian alias commit_approved', async () => {
    const phrases = [
      'подтвердить реальную запись',
      'разрешаю запись лидов',
      'approve real lead import',
    ];
    for (const p of phrases) {
      const m = matchLeadIntakeIntent(p);
      assert.strictEqual(m.matched, true, `not matched: ${p}`);
      assert.strictEqual(m.intent, 'lead_import_commit_approved', `wrong intent: ${p}`);
    }
  });

  // --- 13: Russian alias abort ------------------------------------------

  await test('13. Russian alias abort', async () => {
    const phrases = ['отмени импорт', 'сбрось staged import', 'не записывать эти лиды'];
    for (const p of phrases) {
      const m = matchLeadIntakeIntent(p);
      assert.strictEqual(m.matched, true, `not matched: ${p}`);
      assert.strictEqual(m.intent, 'lead_import_abort', `wrong intent: ${p}`);
    }
  });

  // --- 14: Russian alias daily100 ---------------------------------------

  await test('14. Russian alias daily100', async () => {
    const phrases = [
      'отчёт по 100 лидам',
      'daily100 report',
      'сколько лидов добавлено сегодня',
    ];
    for (const p of phrases) {
      const m = matchLeadIntakeIntent(p);
      assert.strictEqual(m.matched, true, `not matched: ${p}`);
      assert.strictEqual(m.intent, 'daily100_report', `wrong intent: ${p}`);
    }
  });

  // --- 15: Unknown phrase -> safe fallback ------------------------------

  await test('15. Unknown phrase returns safe fallback', async () => {
    const r = await routeLeadIntakeCommand('какая сегодня погода в москве');
    assertFullSafeResult(r);
    assert.strictEqual(r.matched, false);
    assert.strictEqual(r.status, 'FALLBACK');
    assert.strictEqual(r.safe_to_execute, false);
  });

  // --- 16: Missing input text for preview -------------------------------

  await test('16. Missing input text for preview returns requires_input=true', async () => {
    const r = await routeLeadIntakeCommand('/lead_import_preview');
    assertFullSafeResult(r);
    assert.strictEqual(r.intent, 'lead_import_preview');
    assert.strictEqual(r.requires_input, true);
    assert.strictEqual(r.status, 'NEEDS_INPUT');
    assert.strictEqual(r.safe_to_execute, false);
  });

  // --- 17: Missing input text for sandbox -------------------------------

  await test('17. Missing input text for sandbox returns requires_input=true', async () => {
    const r = await routeLeadIntakeCommand('/lead_import_sandbox');
    assertFullSafeResult(r);
    assert.strictEqual(r.intent, 'lead_import_sandbox');
    assert.strictEqual(r.requires_input, true);
    assert.strictEqual(r.status, 'NEEDS_INPUT');
  });

  // --- 18: Missing import_id for status ---------------------------------

  await test('18. Missing import_id for status is handled safely (defaults to latest, never writes)', async () => {
    // Router contract: status may run on the latest entry without an explicit
    // import_id (only commit/abort/commit_approved make import_id mandatory).
    // With no stagingStore entry, the underlying handler reports NOT_FOUND and
    // the router stays safe (no real write). This documents real module behavior.
    const r = await routeLeadIntakeCommand('статус импорта');
    assertFullSafeResult(r);
    assert.strictEqual(r.intent, 'lead_import_status');
    // import_id is NOT mandatory for status, so it is not blocked on it.
    assert.strictEqual(r.requires_import_id, false);
    assert.strictEqual(r.real_write_allowed, false);
    assert.ok(
      r.command_result && r.command_result.status === 'NOT_FOUND',
      `expected NOT_FOUND command_result, got: ${r.command_result && r.command_result.status}`
    );
  });

  // --- 19: Missing import_id for commit_request -------------------------

  await test('19. Missing import_id for commit_request returns requires_import_id=true', async () => {
    const r = await routeLeadIntakeCommand('запроси подтверждение записи');
    assertFullSafeResult(r);
    assert.strictEqual(r.intent, 'lead_import_commit_request');
    assert.strictEqual(r.requires_import_id, true);
    assert.strictEqual(r.status, 'NEEDS_IMPORT_ID');
  });

  // --- 20: Missing import_id/approval for abort/commit -> safe block ----

  await test('20. Missing import_id for abort/commit returns safe block', async () => {
    const abort = await routeLeadIntakeCommand('отмени импорт');
    assertFullSafeResult(abort);
    assert.strictEqual(abort.intent, 'lead_import_abort');
    assert.strictEqual(abort.requires_import_id, true);
    assert.strictEqual(abort.status, 'NEEDS_IMPORT_ID');
    assert.strictEqual(abort.safe_to_execute, false);

    const commit = await routeLeadIntakeCommand('подтвердить реальную запись');
    assertFullSafeResult(commit);
    assert.strictEqual(commit.intent, 'lead_import_commit_approved');
    assert.strictEqual(commit.requires_import_id, true);
    assert.strictEqual(commit.real_write_allowed, false);
    assert.strictEqual(commit.safe_to_execute, false);
  });

  // --- 21: "запиши лиды" without approval -> COMMIT_BLOCKED --------------

  await test('21. "запиши лиды" without approval returns COMMIT_BLOCKED', async () => {
    const r = await routeLeadIntakeCommand('запиши лиды');
    assertFullSafeResult(r);
    assert.strictEqual(r.status, 'COMMIT_BLOCKED');
    assert.strictEqual(r.real_write_allowed, false);
    assert.strictEqual(r.safe_to_execute, false);
  });

  // --- 22..24: outreach phrases -> OUTREACH_BLOCKED ---------------------

  await test('22. "отправь клиентам" returns OUTREACH_BLOCKED', async () => {
    const r = await routeLeadIntakeCommand('отправь клиентам');
    assertFullSafeResult(r);
    assert.strictEqual(r.status, 'OUTREACH_BLOCKED');
    assert.strictEqual(r.safe_to_execute, false);
  });

  await test('23. "разошли клиентам" returns OUTREACH_BLOCKED', async () => {
    const r = await routeLeadIntakeCommand('разошли клиентам');
    assertFullSafeResult(r);
    assert.strictEqual(r.status, 'OUTREACH_BLOCKED');
  });

  await test('24. "напиши клиентам" returns OUTREACH_BLOCKED', async () => {
    const r = await routeLeadIntakeCommand('напиши клиентам');
    assertFullSafeResult(r);
    assert.strictEqual(r.status, 'OUTREACH_BLOCKED');
  });

  // --- 25: exact slash command confidence = 1.0 ------------------------

  await test('25. exact slash command confidence = 1.0', async () => {
    const m = matchLeadIntakeIntent('/lead_import_preview');
    assert.strictEqual(m.matched, true);
    assert.strictEqual(m.confidence, 1.0);
    assert.strictEqual(m.match_type, 'slash');
  });

  // --- 26: exact Russian alias confidence = 0.9 ------------------------

  await test('26. exact Russian alias confidence = 0.9', async () => {
    const m = matchLeadIntakeIntent('предпросмотр лидов');
    assert.strictEqual(m.matched, true);
    assert.strictEqual(m.confidence, 0.9);
    assert.strictEqual(m.match_type, 'alias');
  });

  // --- 27: fallback confidence below 0.65 ------------------------------

  await test('27. fallback confidence below 0.65', async () => {
    const m = matchLeadIntakeIntent('абсолютно неизвестная фраза без смысла');
    assert.strictEqual(m.matched, false);
    assert.ok(m.confidence < 0.65, `confidence not below 0.65: ${m.confidence}`);
  });

  // --- 28: every router result contains all fields ---------------------

  await test('28. Every router result contains the full contract fields', async () => {
    const samples = [
      await routeLeadIntakeCommand(`/lead_import_preview\n${SAMPLE_LEAD_TEXT}`),
      await routeLeadIntakeCommand('/lead_import_status import-1'),
      await routeLeadIntakeCommand('запроси подтверждение записи'),
      await routeLeadIntakeCommand('отправь клиентам'),
      await routeLeadIntakeCommand('запиши лиды'),
      await routeLeadIntakeCommand('какая-то ерунда'),
      buildLeadIntakeRouterFallback(),
      buildLeadIntakeRouterResult({}),
    ];
    for (const r of samples) {
      assertResultShape(r);
    }
  });

  // --- 29: safety flags always fixed -----------------------------------

  await test('29. Safety flags are always the fixed safe values', async () => {
    const samples = [
      await routeLeadIntakeCommand(`/lead_import_sandbox\n${SAMPLE_LEAD_TEXT}`),
      await routeLeadIntakeCommand('/daily100_report'),
      await routeLeadIntakeCommand('подтвердить реальную запись'),
      await routeLeadIntakeCommand('разошли клиентам'),
      await routeLeadIntakeCommand('запиши лиды'),
      await routeLeadIntakeCommand('непонятный текст'),
      buildLeadIntakeRouterFallback(),
    ];
    for (const r of samples) {
      assertSafetyFlags(r);
    }
  });

  // --- 30: router source scan ------------------------------------------

  await test('30. Router source scan: no forbidden patterns', async () => {
    const src = fs.readFileSync(ROUTER_SOURCE_PATH, 'utf8');

    // Strip line + block comments so doc-mentions of forbidden words (e.g. in
    // the header that DOCUMENTS the safety contract) don't trip the scan.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

    const forbidden = [
      // Telegram API usage
      { label: 'Telegram API (node-telegram / telegraf / api.telegram.org)', re: /node-telegram-bot-api|telegraf|api\.telegram\.org|bot\d+:[A-Za-z0-9_-]/i },
      // email / SMTP
      // NOTE: \bsmtp\b deliberately does NOT match the safety flag "smtp_used"
      // (underscore is a word char, so there is no boundary after "smtp").
      { label: 'email/SMTP', re: /nodemailer|\bsmtp\b|sendmail|createTransport/i },
      // network fetch/http/https
      { label: 'network fetch/http/https', re: /\bfetch\s*\(|\baxios\b|require\(['"]https?['"]\)|from\s+['"]node:https?['"]|from\s+['"]https?['"]/i },
      // .env / AI_SECRETS
      { label: '.env / AI_SECRETS', re: /AI_SECRETS|process\.env|dotenv|\.env\b/i },
      // VPS / ssh
      { label: 'VPS/ssh', re: /\bssh\b|sshpass|scp\s|vless|xray|3xui/i },
      // direct 13_sales writes
      { label: 'direct 13_sales write', re: /13_sales/i },
      // contact enrichment import
      { label: 'contact enrichment import', re: /contact[_-]?enrich|enrichment|contact_registry/i },
    ];

    for (const { label, re } of forbidden) {
      assert.ok(!re.test(code), `router source contains forbidden pattern: ${label}`);
    }

    // Positive sanity: the router must import ONLY the D1b commands module.
    assert.ok(
      /from\s+['"]\.\/lead_intake_commands\.mjs['"]/.test(src),
      'router must import ./lead_intake_commands.mjs'
    );
  });

  // --- bonus: helper exports behave -------------------------------------

  await test('bonus: helper predicates and parse behave', async () => {
    assert.strictEqual(isLeadIntakeCommandLike('/lead_import_preview x'), true);
    assert.strictEqual(isLeadIntakeCommandLike('просто текст'), false);
    assert.strictEqual(isOutreachBlockedPhrase('напиши клиентам'), true);
    assert.strictEqual(isOutreachBlockedPhrase('проверь лиды'), false);

    const parsedSlash = parseLeadIntakeRouterInput('/lead_import_status import-9');
    assert.strictEqual(parsedSlash.kind, 'slash');
    assert.strictEqual(parsedSlash.command, 'lead_import_status');
    assert.deepStrictEqual(parsedSlash.args, ['import-9']);

    const aliases = getLeadIntakeRouterAliases();
    assert.ok(Array.isArray(aliases.lead_import_preview));
    assert.ok(aliases.lead_import_preview.length > 0);
  });

  // -----------------------------------------------------------------------
  console.log('---------------------------------------------------------------');
  console.log(`Tests passed: ${passed}`);
  console.log(`Tests failed: ${failed}`);
  if (failed > 0) {
    console.log('Failures:');
    for (const f of failures) {
      console.log(`  - ${f.name}: ${f.message}`);
    }
    process.exitCode = 1;
  } else {
    console.log('ALL TESTS PASSED');
  }
}

main().catch((err) => {
  console.error('FATAL test runner error:', err);
  process.exitCode = 1;
});
