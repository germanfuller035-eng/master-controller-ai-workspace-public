/**
 * lead_intake_commands_d1b_standalone_test.mjs
 *
 * Daily Lead Factory — D1b — Standalone test for lead_intake_commands.mjs
 *
 * WHAT THIS TEST IS:
 *   A self-contained, read-only verification harness for the standalone lead
 *   intake command layer (tools/telegram_gateway/lead_intake_commands.mjs).
 *
 * HARD SAFETY CONTRACT — what this test DOES NOT do:
 *   - No network. No HTTP/fetch. No site scanning.
 *   - No SMTP. No email/Telegram/WhatsApp send.
 *   - No Telegram API. No bot integration. No bot file touched.
 *   - No .env / AI_SECRETS / tokens reads.
 *   - No real import. No confirm=true against the real workspace.
 *   - No real data writes (no commit). Only read-only status checks + parsing.
 *
 * It exercises 10 scenarios, all of which avoid mutating real 13_sales data:
 *   1.  getLeadIntakeCommandsVersion returns a string.
 *   2.  getLeadIntakeCommandsHelp returns help with 4 commands.
 *   3.  parseLeadIntakeCommand recognizes /lead_import_status.
 *   4.  parseLeadIntakeCommand recognizes /lead_import_preview <text>.
 *   5.  parseLeadIntakeCommand recognizes /lead_import_sandbox <text>.
 *   6.  parseLeadIntakeCommand recognizes /lead_import_commit_approved.
 *   7.  unknown command -> UNKNOWN_COMMAND.
 *   8.  empty preview/sandbox text -> NEEDS_TEXT.
 *   9.  handleLeadImportStatusCommand read-only metrics sanity.
 *   10. handleLeadImportCommitApprovedCommand always BLOCKED_NOT_LIVE.
 *
 * Run:
 *   node --check tools/tests/lead_intake_commands_d1b_standalone_test.mjs
 *   node tools/tests/lead_intake_commands_d1b_standalone_test.mjs
 */

'use strict';

import {
  getLeadIntakeCommandsVersion,
  getLeadIntakeCommandsHelp,
  parseLeadIntakeCommand,
  handleLeadImportStatusCommand,
  handleLeadImportCommitApprovedCommand,
} from '../telegram_gateway/lead_intake_commands.mjs';

// ---------------------------------------------------------------------------
// Tiny assertion harness (no external deps)
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];

function ok(condition, label) {
  if (condition) {
    passed += 1;
    console.log(`  PASS: ${label}`);
  } else {
    failed += 1;
    failures.push(label);
    console.log(`  FAIL: ${label}`);
  }
}

function eq(actual, expected, label) {
  ok(actual === expected, `${label} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

async function run() {
  console.log('lead_intake_commands D1b standalone test');
  console.log('========================================');

  // --- Scenario 1: version is a string -----------------------------------
  console.log('\n[1] getLeadIntakeCommandsVersion returns a string');
  const version = getLeadIntakeCommandsVersion();
  ok(typeof version === 'string' && version.length > 0, `version is non-empty string: ${JSON.stringify(version)}`);

  // --- Scenario 2: help with 4 commands -----------------------------------
  console.log('\n[2] getLeadIntakeCommandsHelp returns help with 4 commands');
  const help = getLeadIntakeCommandsHelp();
  ok(help && typeof help === 'object', 'help is an object');
  ok(Array.isArray(help.commands), 'help.commands is an array');
  eq(help.commands.length, 4, 'help has exactly 4 commands');
  const helpNames = (help.commands || []).map((c) => c && c.command);
  ok(helpNames.includes('/lead_import_status'), 'help includes /lead_import_status');
  ok(helpNames.includes('/lead_import_preview'), 'help includes /lead_import_preview');
  ok(helpNames.includes('/lead_import_sandbox'), 'help includes /lead_import_sandbox');
  ok(helpNames.includes('/lead_import_commit_approved'), 'help includes /lead_import_commit_approved');

  // --- Scenario 3: parse /lead_import_status -------------------------------
  console.log('\n[3] parseLeadIntakeCommand recognizes /lead_import_status');
  const p3 = parseLeadIntakeCommand('/lead_import_status');
  ok(p3.ok === true, 'status parse ok');
  eq(p3.command, '/lead_import_status', 'status command name');

  // --- Scenario 4: parse /lead_import_preview <text> -----------------------
  console.log('\n[4] parseLeadIntakeCommand recognizes /lead_import_preview <text>');
  const p4 = parseLeadIntakeCommand('/lead_import_preview Acme Corp | acme.ru');
  ok(p4.ok === true, 'preview parse ok');
  eq(p4.command, '/lead_import_preview', 'preview command name');
  eq(p4.text, 'Acme Corp | acme.ru', 'preview text payload captured');

  // --- Scenario 5: parse /lead_import_sandbox <text> -----------------------
  console.log('\n[5] parseLeadIntakeCommand recognizes /lead_import_sandbox <text>');
  const p5 = parseLeadIntakeCommand('/lead_import_sandbox Beta LLC | beta.ru');
  ok(p5.ok === true, 'sandbox parse ok');
  eq(p5.command, '/lead_import_sandbox', 'sandbox command name');
  eq(p5.text, 'Beta LLC | beta.ru', 'sandbox text payload captured');

  // --- Scenario 6: parse /lead_import_commit_approved ----------------------
  console.log('\n[6] parseLeadIntakeCommand recognizes /lead_import_commit_approved');
  const p6 = parseLeadIntakeCommand('/lead_import_commit_approved');
  ok(p6.ok === true, 'commit_approved parse ok');
  eq(p6.command, '/lead_import_commit_approved', 'commit_approved command name');

  // --- Scenario 7: unknown command -> UNKNOWN_COMMAND ----------------------
  console.log('\n[7] unknown command -> UNKNOWN_COMMAND');
  const p7 = parseLeadIntakeCommand('/totally_unknown_command foo');
  ok(p7.ok === false, 'unknown parse not ok');
  eq(p7.status, 'UNKNOWN_COMMAND', 'unknown -> UNKNOWN_COMMAND');

  // --- Scenario 8: empty preview/sandbox text -> NEEDS_TEXT ----------------
  console.log('\n[8] empty preview/sandbox text -> NEEDS_TEXT');
  const p8a = parseLeadIntakeCommand('/lead_import_preview');
  eq(p8a.status, 'NEEDS_TEXT', 'empty preview -> NEEDS_TEXT');
  ok(p8a.ok === false, 'empty preview not ok');
  const p8b = parseLeadIntakeCommand('/lead_import_sandbox   ');
  eq(p8b.status, 'NEEDS_TEXT', 'empty sandbox -> NEEDS_TEXT');
  ok(p8b.ok === false, 'empty sandbox not ok');

  // --- Scenario 9: read-only status snapshot sanity ------------------------
  console.log('\n[9] handleLeadImportStatusCommand read-only metrics sanity');
  const status = await handleLeadImportStatusCommand();
  ok(status && typeof status === 'object', 'status result is an object');
  eq(status.read_only, true, 'status is read_only=true');
  const m = status.metrics || {};
  ok(typeof m.leads_total === 'number' && m.leads_total >= 5, `leads_total >= 5 (got ${m.leads_total})`);
  eq(m.empty_lead_id, 0, 'empty_lead_id = 0');
  eq(m.duplicate_lead_id, 0, 'duplicate_lead_id = 0');
  ok(typeof m.contacts_total === 'number' && m.contacts_total >= 7, `contacts_total >= 7 (got ${m.contacts_total})`);
  eq(status.auto_send, 'BLOCKED', 'auto_send BLOCKED');

  // --- Scenario 10: commit always BLOCKED_NOT_LIVE, no real write ----------
  console.log('\n[10] handleLeadImportCommitApprovedCommand always BLOCKED_NOT_LIVE');
  const commit = handleLeadImportCommitApprovedCommand();
  ok(commit && typeof commit === 'object', 'commit result is an object');
  eq(commit.status, 'BLOCKED_NOT_LIVE', 'commit -> BLOCKED_NOT_LIVE');
  eq(commit.ok, false, 'commit not ok');
  eq(commit.real_data_changed, false, 'commit real_data_changed=false (no real write)');

  // --- Safety contract re-assertion (defensive) ----------------------------
  console.log('\n[safety] command safety contract is BLOCKED for external send');
  const safety = (help && help.safety) || {};
  eq(safety.network_used, 'NO', 'safety.network_used = NO');
  eq(safety.smtp_used, 'NO', 'safety.smtp_used = NO');
  eq(safety.telegram_send, 'BLOCKED', 'safety.telegram_send = BLOCKED');
  eq(safety.email_send, 'BLOCKED', 'safety.email_send = BLOCKED');
  eq(safety.env_secrets, 'NO', 'safety.env_secrets = NO');
  eq(safety.bot_integration, 'NO', 'safety.bot_integration = NO');

  // ---------------------------------------------------------------------------
  // Final report
  // ---------------------------------------------------------------------------
  console.log('\n========================================');
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('FAILED CHECKS:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  console.log('safety: no network | no SMTP | no Telegram API | no .env/AI_SECRETS | no real write | bot file not touched');

  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('FATAL test harness error:', err && err.stack ? err.stack : err);
  process.exit(1);
});
