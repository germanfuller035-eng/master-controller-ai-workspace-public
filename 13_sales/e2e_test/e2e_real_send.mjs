// e2e_real_send.mjs — Master Controller ONE controlled real test email.
// Sends EXACTLY ONE email to EMAIL_TEST_TO (owner-controlled inbox) via the canonical
// self-test seam (sendApprovedSelfTestEmail -> Yandex SMTP/TLS), then records the canonical
// ledger once. Never prints secrets. Refuses if anything is off.
// Run: node 13_sales/e2e_test/e2e_real_send.mjs
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const WS = process.cwd();
const GW = path.join(WS, 'tools', 'telegram_gateway');
const u = (n) => pathToFileURL(path.join(GW, n)).href;
const adapter = await import(u('telegram_approved_email_send_adapter.mjs'));
const ledger = await import(u('outbound_send_ledger.mjs'));

// --- read root .env into an object (values never printed) ---
function readEnv(p) {
  const out = {};
  const raw = fs.readFileSync(p, 'utf8').replace(/^﻿/, '');
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}
const env = readEnv(path.join(WS, '.env'));
const TEST_TO = env.EMAIL_TEST_TO;
const preview = JSON.parse(fs.readFileSync(path.join(WS, '13_sales', 'e2e_test', 'TEST_KGBI23_E2E.email_preview.json'), 'utf8'));

if (preview.to !== TEST_TO) { console.error('ABORT: preview recipient != EMAIL_TEST_TO'); process.exit(2); }
if (!/^\[TEST\]\[Master Controller E2E\]/.test(preview.subject)) { console.error('ABORT: subject missing TEST prefix'); process.exit(2); }

// Idempotency: refuse if this test lead+recipient already has a SENT ledger entry.
if (ledger.hasBeenSent({ lead_id: 'TEST_KGBI23_E2E', recipient: TEST_TO })) {
  console.log('ALREADY_SENT: ledger already has a SENT entry for TEST_KGBI23_E2E -> refusing duplicate.');
  process.exit(0);
}

const ctx = {
  owner_confirmed: true,
  approved_by: 'Dmitry',
  test_only: true,
  real_send_enabled: true,
  live_send_allowed: true,
  live_smtp_send: true,
  autosend: false,
  mass_send: false,
  env,
};

console.log('Sending ONE controlled test email via canonical self-test seam...');
const res = await adapter.sendApprovedSelfTestEmail({ to: TEST_TO, subject: preview.subject, body: preview.body }, ctx);

// Build a redacted proof (never include secrets)
const proof = {
  ok: res.ok === true,
  code: res.code,
  sent_count: res.sent_count,
  smtp_response_code: res.smtp_response_code ?? res.smtp_code ?? null,
  message_id: res.messageId || res.smtp_message_id || res.message_id || null,
  stage: res.stage || null,
};
console.log('SEND_RESULT:', JSON.stringify(proof));

if (res.ok === true) {
  const w = ledger.recordSendOnce({
    lead_id: 'TEST_KGBI23_E2E',
    recipient: TEST_TO,
    result: ledger.RESULT_SENT,
    company: 'КЖБИ (kgbi23.ru) [TEST]',
    website: 'https://kgbi23.ru',
    subject: preview.subject,
    smtp_message_id: proof.message_id || '',
    approved_by: 'Dmitry',
    pipeline_stage: 'sent',
  });
  console.log('LEDGER:', JSON.stringify({ written: w.written, reason: w.reason }));
  process.exit(0);
} else {
  console.error('SEND_FAILED — no ledger SENT entry written.');
  process.exit(1);
}
