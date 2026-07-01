#!/usr/bin/env node
/**
 * Yandex Mail Stage 1 — Read-Only Healthcheck
 * tools/communication_monitor/yandex_mail_readonly_healthcheck.mjs
 *
 * SAFETY: No SMTP/IMAP connections unless YANDEX_MAIL_STAGE1_LIVE_READ=true
 *         Never prints credentials. No email sent. No delete/archive.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BASE = join(__dirname, '..', '..');

const ALLOWLIST_PATH = join(BASE, 'data', 'yandex_mail_allowlist.json');
const STATE_PATH = join(BASE, 'data', 'yandex_mail_stage1_state.json');
const EVENTS_LOG_PATH = join(BASE, 'data', 'events_log.json');

const NOW = new Date().toISOString();

const REQUIRED_ENV_VARS = [
  'YANDEX_MAIL_LOGIN',
  'YANDEX_MAIL_APP_PASSWORD',
  'YANDEX_MAIL_IMAP_HOST',
  'YANDEX_MAIL_IMAP_PORT',
];

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
}

function appendEvent(event) {
  const log = readJson(EVENTS_LOG_PATH) || [];
  log.push(event);
  writeJson(EVENTS_LOG_PATH, log);
}

function runHealthcheck() {
  const results = {
    timestamp: NOW,
    checks: [],
    overall: 'Yellow',
    live_read_enabled: false,
    send_enabled: false,
    delete_enabled: false,
    archive_enabled: false,
    attachments_enabled: false,
    allowlist_only: true,
    allowlist_active_count: 0,
    confirmed_contacts_count: 0,
    credentials_present: false,
    message: '',
  };

  // Check 1: allowlist file exists
  const allowlist = readJson(ALLOWLIST_PATH);
  if (!allowlist) {
    results.checks.push({ check: 'allowlist_exists', status: 'FAIL', notes: 'data/yandex_mail_allowlist.json not found' });
    results.overall = 'Red';
  } else {
    results.checks.push({ check: 'allowlist_exists', status: 'PASS', notes: `Found ${allowlist.length} entries` });

    // Check 2: active contacts
    const active = Array.isArray(allowlist) ? allowlist.filter(c => c.active === true) : [];
    results.allowlist_active_count = active.length;
    results.checks.push({
      check: 'allowlist_active_contacts',
      status: active.length > 0 ? 'PASS' : 'WARN',
      notes: `${active.length} active contact(s)`,
    });

    // Check 3: confirmed contacts (allowlist uses status field, not boolean confirmed)
    const confirmed = Array.isArray(allowlist) ? allowlist.filter(c => c.status === 'confirmed') : [];
    results.confirmed_contacts_count = confirmed.length;
    results.checks.push({
      check: 'confirmed_contacts',
      status: confirmed.length > 0 ? 'PASS' : 'WARN',
      notes: `${confirmed.length} confirmed contact(s)`,
    });
  }

  // Check 4: env vars present (existence only, never print values)
  const presentVars = REQUIRED_ENV_VARS.filter(v => process.env[v] && process.env[v].length > 0);
  const missingVars = REQUIRED_ENV_VARS.filter(v => !process.env[v] || process.env[v].length === 0);
  results.credentials_present = missingVars.length === 0;

  if (results.credentials_present) {
    results.checks.push({
      check: 'env_credentials',
      status: 'PASS',
      notes: `All ${REQUIRED_ENV_VARS.length} env vars present (values NOT logged)`,
    });
  } else {
    results.checks.push({
      check: 'env_credentials',
      status: 'WARN',
      notes: `Missing: ${missingVars.join(', ')} — values NOT logged`,
    });
  }

  // Check 5: safety flags
  results.checks.push({ check: 'send_mode', status: 'PASS', notes: 'send_enabled = false (ENFORCED)' });
  results.checks.push({ check: 'delete_mode', status: 'PASS', notes: 'delete_enabled = false (ENFORCED)' });
  results.checks.push({ check: 'archive_mode', status: 'PASS', notes: 'archive_enabled = false (ENFORCED)' });
  results.checks.push({ check: 'attachments_mode', status: 'PASS', notes: 'attachments_enabled = false (ENFORCED)' });
  results.checks.push({ check: 'links_auto_click', status: 'PASS', notes: 'links_auto_click = false (ENFORCED)' });

  // Check 6: live_read mode
  const liveReadEnv = process.env.YANDEX_MAIL_STAGE1_LIVE_READ;
  const liveReadEnabled = liveReadEnv === 'true';
  results.live_read_enabled = liveReadEnabled;

  if (liveReadEnabled) {
    results.checks.push({
      check: 'live_read_mode',
      status: 'WARN',
      notes: 'YANDEX_MAIL_STAGE1_LIVE_READ=true — IMAP read-only allowed (no send/delete/archive)',
    });
    results.message = 'Live read mode ENABLED. IMAP read-only only. Allowlist filtering active.';
  } else {
    results.checks.push({
      check: 'live_read_mode',
      status: 'PASS',
      notes: 'YANDEX_MAIL_STAGE1_LIVE_READ not set — dry-run mode only',
    });
    results.message = results.credentials_present
      ? 'Credentials present. Live read NOT enabled. Dry-run mode.'
      : 'Ready for credentials. No live connection attempted.';
  }

  // Determine overall
  const hasFail = results.checks.some(c => c.status === 'FAIL');
  const hasWarn = results.checks.some(c => c.status === 'WARN');

  if (hasFail) {
    results.overall = 'Red';
  } else if (hasWarn || !results.credentials_present) {
    results.overall = 'Yellow';
  } else {
    results.overall = 'Green';
  }

  // Update state file
  const state = readJson(STATE_PATH) || {};
  state.stage = 'stage1_readonly';
  state.live_read_enabled = liveReadEnabled;
  state.send_enabled = false;
  state.delete_enabled = false;
  state.archive_enabled = false;
  state.attachments_enabled = false;
  state.allowlist_only = true;
  state.last_healthcheck = NOW;
  state.overall = results.overall;
  state.notes = results.message;
  state.allowlist_active_count = results.allowlist_active_count;
  state.confirmed_contacts_count = results.confirmed_contacts_count;
  state.updated_at = NOW;
  writeJson(STATE_PATH, state);

  // Log event
  appendEvent({
    event_type: 'yandex_mail_stage1_healthcheck',
    timestamp: NOW,
    project: 'AI_WORKSPACE',
    summary: `Yandex Mail Stage 1 healthcheck: overall=${results.overall}`,
    overall: results.overall,
    live_read_enabled: liveReadEnabled,
    send_enabled: false,
    allowlist_active_count: results.allowlist_active_count,
    notes: 'No client messages sent. Auto-send remains blocked.',
  });

  return results;
}

// Output
const results = runHealthcheck();

console.log('\n=== Yandex Mail Stage 1 — Read-Only Healthcheck ===\n');
console.log(`Timestamp:          ${results.timestamp}`);
console.log(`Overall:            ${results.overall}`);
console.log(`Live read enabled:  ${results.live_read_enabled}`);
console.log(`Send enabled:       ${results.send_enabled} (BLOCKED)`);
console.log(`Delete enabled:     ${results.delete_enabled} (BLOCKED)`);
console.log(`Archive enabled:    ${results.archive_enabled} (BLOCKED)`);
console.log(`Attachments:        ${results.attachments_enabled} (BLOCKED)`);
console.log(`Allowlist only:     ${results.allowlist_only}`);
console.log(`Active contacts:    ${results.allowlist_active_count}`);
console.log(`Confirmed contacts: ${results.confirmed_contacts_count}`);
console.log(`Credentials:        ${results.credentials_present ? 'PRESENT (not logged)' : 'MISSING'}`);
console.log(`\nMessage: ${results.message}\n`);

console.log('--- Checks ---');
for (const c of results.checks) {
  const icon = c.status === 'PASS' ? '✅' : c.status === 'WARN' ? '⚠️' : '❌';
  console.log(`${icon} [${c.status}] ${c.check}: ${c.notes}`);
}

console.log(`\nState saved to: data/yandex_mail_stage1_state.json`);
console.log(`Event logged to: data/events_log.json`);
console.log('\n=== END HEALTHCHECK ===\n');
