/**
 * lead_intake_bot_adapter_d1d_test.mjs
 *
 * Standalone OFFLINE test runner for the D1d Lead Intake Bot Adapter.
 *
 * Module under test:
 *   tools/telegram_gateway/lead_intake_bot_adapter.mjs
 *
 * HARD SAFETY (enforced by this test):
 *   - No network. No Telegram API. No email. No SMTP. No fetch/http/https.
 *   - No .env / AI_SECRETS reads.
 *   - No real 13_sales write. No contact enrichment import.
 *   - Never integrates into a live Telegram bot.
 *   - Never passes allowRealWrite / confirmRealWrite (auto_send stays BLOCKED).
 *   - Only imports the adapter; the adapter itself imports only the D1c router.
 *   - A static source scan asserts the adapter contains no forbidden patterns.
 *
 * Run:
 *   node --check tools/tests/lead_intake_bot_adapter_d1d_test.mjs
 *   node tools/tests/lead_intake_bot_adapter_d1d_test.mjs
 */

'use strict';

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isLeadIntakeBotMessage,
  handleLeadIntakeBotMessage,
  buildLeadIntakeBotAdapterResponse,
  buildOwnerOnlyBlockedResponse,
  buildLeadIntakeNotHandledResponse,
  formatLeadIntakeTelegramResponse,
  getLeadIntakeBotAdapterConfig,
  buildLeadIntakeBotDebugSummary,
} from '../telegram_gateway/lead_intake_bot_adapter.mjs';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// d:\AI_WORKSPACE
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..');

const ADAPTER_SOURCE_PATH = path.resolve(
  WORKSPACE_ROOT,
  'tools/telegram_gateway/lead_intake_bot_adapter.mjs'
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
// Sample data (offline, synthetic — never real client data)
// ---------------------------------------------------------------------------

// A small synthetic block of "lead-like" lines. Used only to exercise
// preview / sandbox routing. It is NOT real client data and is never written
// to 13_sales.
const SAMPLE_LEAD_TEXT = [
  'ООО Завод-Тест-Альфа | https://example-alpha.test | info@example-alpha.test',
  'ООО Завод-Тест-Бета | https://example-beta.test | info@example-beta.test',
  'ООО Завод-Тест-Гамма | https://example-gamma.test | info@example-gamma.test',
].join('\n');

// Options that pin the run to a throwaway sandbox workspace inside tmp/ and
// NEVER allow a real write. Never points at 13_sales.
const SAFE_OPTIONS = Object.freeze({
  sandboxWorkspaceRel: 'tmp/lead_intake_bot_adapter_d1d_test_workspace/',
});

// ---------------------------------------------------------------------------
// Shared assertions
// ---------------------------------------------------------------------------

/**
 * Assert the immutable safety contract on an adapter response.
 * @param {object} res
 */
function assertSafetyContract(res) {
  assert.ok(res && typeof res === 'object', 'response must be an object');
  const s = res.safety;
  assert.ok(s && typeof s === 'object', 'safety must be present');
  assert.strictEqual(s.network_used, 'NO', 'network_used must be NO');
  assert.strictEqual(s.telegram_api_used, 'NO', 'telegram_api_used must be NO');
  assert.strictEqual(s.external_send, 'NO', 'external_send must be NO');
  assert.strictEqual(s.smtp_used, 'NO', 'smtp_used must be NO');
  assert.strictEqual(s.auto_send, 'BLOCKED', 'auto_send must be BLOCKED');
  assert.strictEqual(s.client_messages_sent, 0, 'client_messages_sent must be 0');
  // Hard gates outside the safety bag.
  assert.strictEqual(res.should_send_to_client, false, 'should_send_to_client must be false');
  assert.strictEqual(res.real_write_allowed, false, 'real_write_allowed must be false');
}

/**
 * Assert a handled D1 response carries an auto_send=BLOCKED marker and a
 * next_action in its response_text.
 * @param {object} res
 */
function assertHandledResponseText(res) {
  assert.strictEqual(typeof res.response_text, 'string', 'response_text must be a string');
  assert.ok(
    res.response_text.includes('auto_send=BLOCKED'),
    'response_text must include auto_send=BLOCKED'
  );
  assert.ok(
    res.response_text.includes('next_action:'),
    'response_text must include next_action'
  );
}

function makeOwnerMessage(rawText, extra = {}) {
  return {
    raw_text: rawText,
    from_user_id: 1001,
    chat_id: 1001,
    message_id: 5,
    is_from_owner: true,
    options: SAFE_OPTIONS,
    ...extra,
  };
}

function makeNonOwnerMessage(rawText, extra = {}) {
  return {
    raw_text: rawText,
    from_user_id: 9999,
    chat_id: 9999,
    message_id: 7,
    is_from_owner: false,
    options: SAFE_OPTIONS,
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function run() {
  console.log('lead_intake_bot_adapter_d1d_test');
  console.log('--------------------------------');

  // 1. non-D1 message -> handled=false, NOT_HANDLED, empty response_text.
  await test('1) non-D1 message -> NOT_HANDLED, empty text', async () => {
    const res = await handleLeadIntakeBotMessage(
      makeOwnerMessage('привет как дела, какая сегодня погода?')
    );
    assert.strictEqual(res.handled, false, 'handled must be false');
    assert.strictEqual(res.status, 'NOT_HANDLED', 'status must be NOT_HANDLED');
    assert.strictEqual(res.response_text, '', 'response_text must be empty');
    assertSafetyContract(res);
  });

  // 2. owner /lead_import_status -> handled=true, safe response.
  await test('2) owner /lead_import_status -> handled=true', async () => {
    const res = await handleLeadIntakeBotMessage(
      makeOwnerMessage('/lead_import_status')
    );
    assert.strictEqual(res.handled, true, 'handled must be true');
    assertHandledResponseText(res);
    assertSafetyContract(res);
  });

  // 3. non-owner /lead_import_status -> OWNER_ONLY_BLOCKED, no detail leak.
  await test('3) non-owner /lead_import_status -> OWNER_ONLY_BLOCKED', async () => {
    const res = await handleLeadIntakeBotMessage(
      makeNonOwnerMessage('/lead_import_status')
    );
    assert.strictEqual(res.handled, true, 'handled must be true');
    assert.strictEqual(res.status, 'OWNER_ONLY_BLOCKED', 'status must be OWNER_ONLY_BLOCKED');
    assert.strictEqual(res.router_result, null, 'router_result must be null (no routing)');
    // No detail leak: no metrics / preview / import_id surfaced.
    assert.ok(!/import_id/i.test(res.response_text), 'must not leak import_id');
    assert.ok(!/preview/i.test(res.response_text), 'must not leak preview detail');
    assertSafetyContract(res);
  });

  // 4. owner /daily100_report -> handled=true.
  await test('4) owner /daily100_report -> handled=true', async () => {
    const res = await handleLeadIntakeBotMessage(
      makeOwnerMessage('/daily100_report')
    );
    assert.strictEqual(res.handled, true, 'handled must be true');
    assertHandledResponseText(res);
    assertSafetyContract(res);
  });

  // 5. owner /lead_import_preview with sample text -> handled=true, limited.
  await test('5) owner /lead_import_preview -> handled, preview limited', async () => {
    const res = await handleLeadIntakeBotMessage(
      makeOwnerMessage(`/lead_import_preview\n${SAMPLE_LEAD_TEXT}`)
    );
    assert.strictEqual(res.handled, true, 'handled must be true');
    assertHandledResponseText(res);
    assertSafetyContract(res);
    // Preview must be limited: at most 5 preview bullet lines.
    const bulletCount = (res.response_text.match(/^\s*-\s/gm) || []).length;
    assert.ok(bulletCount <= 5, `preview bullets must be <= 5, got ${bulletCount}`);
  });

  // 6. owner /lead_import_sandbox with sample text -> handled=true, no real write.
  await test('6) owner /lead_import_sandbox -> handled, no real write', async () => {
    const res = await handleLeadIntakeBotMessage(
      makeOwnerMessage(`/lead_import_sandbox\n${SAMPLE_LEAD_TEXT}`)
    );
    assert.strictEqual(res.handled, true, 'handled must be true');
    assertHandledResponseText(res);
    assertSafetyContract(res);
    assert.strictEqual(res.real_write_allowed, false, 'real_write_allowed must be false');
  });

  // 7. owner /lead_import_commit_request -> handled=true, no real write.
  await test('7) owner /lead_import_commit_request -> handled, no real write', async () => {
    const res = await handleLeadIntakeBotMessage(
      makeOwnerMessage('/lead_import_commit_request import-test-001')
    );
    assert.strictEqual(res.handled, true, 'handled must be true');
    assertHandledResponseText(res);
    assertSafetyContract(res);
    assert.strictEqual(res.real_write_allowed, false, 'real_write_allowed must be false');
  });

  // 8. owner /lead_import_commit_approved -> BLOCKED in adapter/live-safe mode.
  await test('8) owner /lead_import_commit_approved -> COMMIT_BLOCKED', async () => {
    const res = await handleLeadIntakeBotMessage(
      makeOwnerMessage('/lead_import_commit_approved import-test-001 APPROVE REAL LEAD IMPORT import-test-001')
    );
    assert.strictEqual(res.handled, true, 'handled must be true');
    assert.strictEqual(res.status, 'COMMIT_BLOCKED', 'status must be COMMIT_BLOCKED');
    assert.strictEqual(res.real_write_allowed, false, 'real_write_allowed must be false');
    assertHandledResponseText(res);
    assertSafetyContract(res);
  });

  // 9. "отправь клиентам" -> OUTREACH_BLOCKED.
  await test('9) "отправь клиентам" -> OUTREACH_BLOCKED', async () => {
    // Make it D1-like (mentions лиды) so the adapter routes it; the router
    // then blocks outreach unconditionally.
    const res = await handleLeadIntakeBotMessage(
      makeOwnerMessage('отправь клиентам этих лидов', { options: { ...SAFE_OPTIONS, enableRussianAliases: true } })
    );
    assert.strictEqual(res.status, 'OUTREACH_BLOCKED', 'status must be OUTREACH_BLOCKED');
    assert.strictEqual(res.should_send_to_client, false, 'should_send_to_client must be false');
    assertSafetyContract(res);
  });

  // 10. Russian alias disabled by default -> RUSSIAN_ALIAS_DISABLED / no write.
  await test('10) russian alias disabled by default -> RUSSIAN_ALIAS_DISABLED', async () => {
    const res = await handleLeadIntakeBotMessage(
      makeOwnerMessage('статус импорта лидов') // no enableRussianAliases
    );
    assert.strictEqual(res.handled, false, 'handled must be false when aliases disabled');
    assert.strictEqual(res.status, 'RUSSIAN_ALIAS_DISABLED', 'status must be RUSSIAN_ALIAS_DISABLED');
    assert.strictEqual(res.router_result, null, 'router must not be invoked');
    assert.strictEqual(res.real_write_allowed, false, 'real_write_allowed must be false');
    assertSafetyContract(res);
  });

  // 11. Russian alias works only with options.enableRussianAliases=true.
  await test('11) russian alias works with enableRussianAliases=true', async () => {
    const res = await handleLeadIntakeBotMessage(
      makeOwnerMessage('статус импорта лидов', {
        options: { ...SAFE_OPTIONS, enableRussianAliases: true },
      })
    );
    assert.strictEqual(res.handled, true, 'handled must be true with aliases enabled');
    assert.notStrictEqual(res.status, 'RUSSIAN_ALIAS_DISABLED', 'must not be RUSSIAN_ALIAS_DISABLED');
    assert.ok(res.router_result, 'router_result must be present');
    assertHandledResponseText(res);
    assertSafetyContract(res);
  });

  // ----- Static source scan -----
  const adapterSource = fs.readFileSync(ADAPTER_SOURCE_PATH, 'utf8');

  // Strip comments so the safety scan inspects EXECUTABLE code only. The
  // adapter's header/docstrings intentionally mention ".env", "AI_SECRETS"
  // and "13_sales" to DOCUMENT what it never does; those mentions must not
  // be mistaken for actual reads/writes.
  function stripComments(src) {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // line comments (keep non-// like http://)
  }
  const adapterCode = stripComments(adapterSource);


  // 12. adapter imports only lead_intake_router.mjs.
  await test('12) adapter imports only lead_intake_router.mjs', () => {
    const importLines = adapterSource
      .split('\n')
      .filter((l) => /^\s*import\s/.test(l) || /from\s+['"]/.test(l));
    const moduleSpecs = [];
    const re = /from\s+['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(adapterSource)) !== null) {
      moduleSpecs.push(m[1]);
    }
    // The only relative module import must be the D1c router.
    const relative = moduleSpecs.filter((s) => s.startsWith('.'));
    assert.deepStrictEqual(
      relative,
      ['./lead_intake_router.mjs'],
      `adapter must import only the router, got: ${JSON.stringify(relative)}`
    );
    assert.ok(importLines.length > 0, 'sanity: adapter has import lines');
  });

  // 13. adapter does not import lead_intake_commands.mjs directly.
  await test('13) adapter does not import lead_intake_commands.mjs', () => {
    assert.ok(
      !/from\s+['"][^'"]*lead_intake_commands\.mjs['"]/.test(adapterSource),
      'adapter must not import lead_intake_commands.mjs'
    );
  });

  // 14. adapter does not import Telegram API.
  await test('14) adapter does not import Telegram API', () => {
    assert.ok(
      !/from\s+['"][^'"]*(node-telegram-bot-api|telegraf|grammy|telegram)[^'"]*['"]/i.test(adapterSource),
      'adapter must not import a Telegram API library'
    );
  });

  // 15. adapter does not import email/SMTP.
  await test('15) adapter does not import email/SMTP', () => {
    assert.ok(
      !/from\s+['"][^'"]*(nodemailer|smtp|imap|mailgun|sendgrid|@sendgrid)[^'"]*['"]/i.test(adapterSource),
      'adapter must not import an email/SMTP library'
    );
  });

  // 16. adapter does not import contact enrichment.
  await test('16) adapter does not import contact enrichment', () => {
    assert.ok(
      !/from\s+['"][^'"]*(enrich|contact_enrichment|enrichment)[^'"]*['"]/i.test(adapterSource),
      'adapter must not import contact enrichment'
    );
  });

  // 17. adapter does not read .env / AI_SECRETS.
  await test('17) adapter does not read .env / AI_SECRETS', () => {
    assert.ok(!/process\.env/.test(adapterCode), 'adapter must not read process.env');
    assert.ok(!/dotenv/i.test(adapterCode), 'adapter must not use dotenv');
    assert.ok(!/AI_SECRETS/.test(adapterCode), 'adapter must not reference AI_SECRETS');
    assert.ok(!/['"][^'"]*\.env\b/.test(adapterCode), 'adapter must not reference .env');
  });

  // 18. adapter does not write 13_sales.
  await test('18) adapter does not write 13_sales', () => {
    assert.ok(!/13_sales/.test(adapterCode), 'adapter must not reference 13_sales');
    assert.ok(
      !/\bwriteFile\b|\bwriteFileSync\b|\bappendFile\b|\bmkdir\b/.test(adapterCode),
      'adapter must not contain filesystem write calls'
    );
  });


  // 19. should_send_to_client always false.
  await test('19) should_send_to_client always false', async () => {
    const samples = [
      buildLeadIntakeBotAdapterResponse({ handled: true }),
      buildLeadIntakeBotAdapterResponse({ should_send_to_client: true }), // attempt override
      buildOwnerOnlyBlockedResponse(),
      buildLeadIntakeNotHandledResponse(),
      await handleLeadIntakeBotMessage(makeOwnerMessage('/lead_import_status')),
    ];
    for (const res of samples) {
      assert.strictEqual(res.should_send_to_client, false, 'should_send_to_client must be false');
    }
  });

  // 20. real_write_allowed false by default.
  await test('20) real_write_allowed false by default', async () => {
    const samples = [
      buildLeadIntakeBotAdapterResponse({ handled: true }),
      buildLeadIntakeBotAdapterResponse({ real_write_allowed: true }), // attempt override
      buildOwnerOnlyBlockedResponse(),
      await handleLeadIntakeBotMessage(makeOwnerMessage('/daily100_report')),
    ];
    for (const res of samples) {
      assert.strictEqual(res.real_write_allowed, false, 'real_write_allowed must be false');
    }
  });

  // 21. safety flags always pinned.
  await test('21) safety flags always pinned', async () => {
    const samples = [
      buildLeadIntakeBotAdapterResponse({
        // Attempt to override every safety flag; the builder must pin them.
        safety: {
          network_used: 'YES',
          telegram_api_used: 'YES',
          external_send: 'YES',
          smtp_used: 'YES',
          auto_send: 'ALLOWED',
          client_messages_sent: 42,
        },
      }),
      await handleLeadIntakeBotMessage(makeOwnerMessage('/lead_import_status')),
      await handleLeadIntakeBotMessage(makeNonOwnerMessage('/lead_import_status')),
    ];
    for (const res of samples) {
      assertSafetyContract(res);
    }
  });

  // 22. response_text always includes auto_send=BLOCKED for handled D1 responses.
  await test('22) handled D1 response_text includes auto_send=BLOCKED', async () => {
    const handledMsgs = [
      '/lead_import_status',
      '/daily100_report',
      `/lead_import_preview\n${SAMPLE_LEAD_TEXT}`,
      '/lead_import_commit_request import-test-001',
    ];
    for (const raw of handledMsgs) {
      const res = await handleLeadIntakeBotMessage(makeOwnerMessage(raw));
      assert.strictEqual(res.handled, true, `handled must be true for: ${raw}`);
      assert.ok(
        res.response_text.includes('auto_send=BLOCKED'),
        `response_text must include auto_send=BLOCKED for: ${raw}`
      );
    }
  });

  // 23. preview output does not dump all rows.
  await test('23) preview output does not dump all rows', async () => {
    // Build a large synthetic block (well over the 5-line preview cap).
    const bigBlock = Array.from({ length: 100 }, (_, i) =>
      `ООО Тест-${i} | https://example-${i}.test | info@example-${i}.test`
    ).join('\n');
    const res = await handleLeadIntakeBotMessage(
      makeOwnerMessage(`/lead_import_preview\n${bigBlock}`)
    );
    assert.strictEqual(res.handled, true, 'handled must be true');
    const bulletCount = (res.response_text.match(/^\s*-\s/gm) || []).length;
    assert.ok(bulletCount <= 5, `preview must show <= 5 rows, got ${bulletCount}`);
    // The full set of 100 lines must NOT be present in the response text.
    const lineCount = res.response_text.split('\n').length;
    assert.ok(lineCount < 100, `response must not dump 100 rows, got ${lineCount} lines`);
  });

  // 24. output contains next_action.
  await test('24) output contains next_action', async () => {
    const res = await handleLeadIntakeBotMessage(
      makeOwnerMessage('/lead_import_status')
    );
    assert.ok(res.response_text.includes('next_action:'), 'response_text must include next_action');
  });

  // ----- Bonus sanity: config exposes live-safe defaults -----
  await test('config exposes live-safe defaults', () => {
    const cfg = getLeadIntakeBotAdapterConfig();
    assert.strictEqual(cfg.owner_only, true, 'owner_only must be true');
    assert.strictEqual(cfg.russian_aliases_enabled_by_default, false, 'aliases off by default');
    assert.strictEqual(cfg.hard_gates.auto_send, 'BLOCKED', 'auto_send BLOCKED');
    assert.strictEqual(cfg.hard_gates.commit_approved, 'BLOCKED', 'commit_approved BLOCKED');
    assert.strictEqual(cfg.hard_gates.should_send_to_client, false, 'no client send');
    assert.strictEqual(cfg.hard_gates.real_write_allowed_by_default, false, 'no real write');
  });

  await test('isLeadIntakeBotMessage classifies shapes', () => {
    assert.strictEqual(isLeadIntakeBotMessage('/lead_import_status'), true, 'slash D1 is D1-like');
    assert.strictEqual(isLeadIntakeBotMessage('/some_other_cmd'), false, 'non-D1 slash not D1-like');
    assert.strictEqual(isLeadIntakeBotMessage('просто текст'), false, 'plain text not D1-like');
    assert.strictEqual(isLeadIntakeBotMessage('статус импорта лидов'), true, 'russian alias is D1-like');
  });

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('--------------------------------');
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  if (failed > 0) {
    console.log('Failures:');
    for (const f of failures) {
      console.log(`  - ${f.name}: ${f.message}`);
    }
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error('FATAL test runner error:', err);
  process.exitCode = 1;
});
