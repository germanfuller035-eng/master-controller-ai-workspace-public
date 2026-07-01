/**
 * mail_status_adapter.mjs
 * Read-only mail module status adapter for Telegram Master Controller.
 * 
 * SAFETY RULES (HARD-CODED):
 *  - outbound_send_effective = "BLOCKED" always
 *  - No secrets printed
 *  - No SMTP/Gmail send calls
 *  - No IMAP mass read
 *  - No auto-send
 * 
 * Created: 2026-05-24 by Cline (Mini Audit 10K Readiness)
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const WORKSPACE = path.resolve(__dirname, '..', '..');

// ── Candidate mail module paths ─────────────────────────────────────────────
const MAIL_CANDIDATES = [
  path.join(WORKSPACE, 'tools', 'communication_monitor'),
  path.join(WORKSPACE, 'tools', 'mail'),
  path.join(WORKSPACE, 'tools', 'gmail'),
  path.join(WORKSPACE, 'tools', 'email'),
];

const ENV_CANDIDATES = [
  path.join(WORKSPACE, 'tools', 'communication_monitor', '.env'),
  path.join(WORKSPACE, 'tools', 'mail',  '.env'),
  path.join(WORKSPACE, 'tools', 'gmail', '.env'),
  path.join(WORKSPACE, '.env'),
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function envHasKey(envPath, key) {
  try {
    if (!fs.existsSync(envPath)) return false;
    const c = fs.readFileSync(envPath, 'utf-8');
    return new RegExp(`^${key}=\\S+`, 'm').test(c);
  } catch { return false; }
}

function detectProvider(envPath) {
  try {
    if (!fs.existsSync(envPath)) return 'unknown';
    const c = fs.readFileSync(envPath, 'utf-8');
    if (/GMAIL|GOOGLE/i.test(c)) return 'Gmail';
    if (/YANDEX|IMAP.*yandex/i.test(c)) return 'IMAP/Yandex';
    if (/SMTP_HOST|SMTP_USER/i.test(c)) return 'SMTP';
    if (/IMAP_HOST|IMAP_USER/i.test(c)) return 'IMAP';
    return 'unknown';
  } catch { return 'unknown'; }
}

function readLastMailEvent() {
  const candidates = [
    path.join(WORKSPACE, 'data', 'mail_reply_monitor.json'),
    path.join(WORKSPACE, 'data', 'inbox_messages.json'),
  ];
  for (const f of candidates) {
    try {
      if (!fs.existsSync(f)) continue;
      const raw = fs.readFileSync(f, 'utf-8').trim();
      if (!raw) continue;
      const data = JSON.parse(raw);
      const arr = Array.isArray(data) ? data : (data.messages || data.items || data.events || []);
      if (arr.length > 0) {
        const last = arr[arr.length - 1];
        return last.ts || last.timestamp || last.date || last.received_at || '(timestamp not available)';
      }
    } catch { /* skip */ }
  }
  return '—';
}

function readLastMailError() {
  try {
    const logPath = path.join(WORKSPACE, 'tools', 'communication_monitor', 'yandex_mail_stage2b_retry_report.md');
    if (!fs.existsSync(logPath)) return '—';
    const lines = fs.readFileSync(logPath, 'utf-8').split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const l = lines[i].trim();
      if (l && !l.startsWith('#')) return l.substring(0, 120);
    }
  } catch { /* skip */ }
  return '—';
}

// ── Main export ──────────────────────────────────────────────────────────────
export function getMailStatus() {
  // 1. Find mail module
  let modulePath = null;
  for (const p of MAIL_CANDIDATES) {
    if (fs.existsSync(p)) { modulePath = p; break; }
  }

  // 2. Find .env with mail credentials
  let envPath = null;
  let provider = 'unknown';
  for (const e of ENV_CANDIDATES) {
    if (!fs.existsSync(e)) continue;
    const hasMailKey =
      envHasKey(e, 'GMAIL_USER') ||
      envHasKey(e, 'IMAP_USER') ||
      envHasKey(e, 'IMAP_HOST') ||
      envHasKey(e, 'SMTP_HOST') ||
      envHasKey(e, 'SMTP_USER') ||
      envHasKey(e, 'YANDEX_EMAIL') ||
      envHasKey(e, 'EMAIL_USER') ||
      envHasKey(e, 'MAIL_USER') ||
      envHasKey(e, 'YANDEX_MAIL_LOGIN') ||       // ← Yandex IMAP actual key
      envHasKey(e, 'YANDEX_MAIL_IMAP_HOST');     // ← Yandex IMAP actual key
    if (hasMailKey) {
      envPath = e;
      provider = detectProvider(e);
      break;
    }
  }

  // 3. Capabilities (conservative defaults)
  const configFound = envPath !== null;
  const inbound_read_enabled  = configFound &&
    (envHasKey(envPath, 'IMAP_HOST') || envHasKey(envPath, 'IMAP_USER') ||
     envHasKey(envPath, 'GMAIL_USER') || envHasKey(envPath, 'YANDEX_EMAIL') ||
     envHasKey(envPath, 'YANDEX_MAIL_IMAP_HOST') ||  // ← Yandex actual key
     envHasKey(envPath, 'YANDEX_MAIL_LOGIN'));        // ← Yandex actual key
  const draft_create_enabled  = configFound;
  const outbound_send_technical = configFound &&
    (envHasKey(envPath, 'SMTP_HOST') || envHasKey(envPath, 'SMTP_USER') ||
     envHasKey(envPath, 'GMAIL_USER') || envHasKey(envPath, 'YANDEX_EMAIL'));
  // Note: Yandex config has YANDEX_MAIL_SEND_ENABLED=false → outbound technically NOT_AVAILABLE via SMTP

  // 4. Connection status
  let status;
  if (!modulePath && !configFound) {
    status = 'not_available';
  } else if (configFound) {
    // Config exists but we can't safely do a live check here
    status = 'partial';
  } else {
    status = 'not_available';
  }

  // 5. Events / errors
  const last_mail_event = readLastMailEvent();
  const last_mail_error = readLastMailError();

  return {
    // ── module discovery ────────────────────────────────────────────
    module_path:               modulePath   || 'not_found',
    env_path:                  envPath      ? '(hidden)' : 'not_found',
    provider,

    // ── capability flags ────────────────────────────────────────────
    inbound_read_enabled:      inbound_read_enabled  ? 'enabled'  : 'disabled',
    draft_create_enabled:      draft_create_enabled  ? 'enabled'  : 'disabled',
    outbound_send_technical:   outbound_send_technical ? 'TECHNICALLY_AVAILABLE' : 'NOT_AVAILABLE',

    // ── HARD SAFETY GATE ────────────────────────────────────────────
    outbound_send_effective:   'BLOCKED',   // ← ALWAYS BLOCKED
    auto_send:                 'BLOCKED',   // ← ALWAYS BLOCKED
    approval_required:         'YES',

    // ── connection ──────────────────────────────────────────────────
    status,                         // connected | partial | not_available

    // ── last events ─────────────────────────────────────────────────
    last_mail_event,
    last_mail_error,

    // ── safety confirmation ─────────────────────────────────────────
    secrets_printed:           'NO',
  };
}

/**
 * Format mail status as Telegram-ready text.
 * Safe for direct Telegram message — no secrets, no send triggers.
 */
export function formatMailStatusMessage(s) {
  const icon = s.status === 'connected' ? '🟢' :
               s.status === 'partial'   ? '🟡' : '🔴';
  return [
    '📮 *Mail module status*',
    '',
    `Connection: ${icon} ${s.status}`,
    `Provider: ${s.provider}`,
    `Inbound read: ${s.inbound_read_enabled}`,
    `Draft create: ${s.draft_create_enabled}`,
    `Outbound send (technical): ${s.outbound_send_technical}`,
    `Effective send permission: 🔴 ${s.outbound_send_effective}`,
    `Auto-send: 🔴 ${s.auto_send}`,
    `Last mail event: ${s.last_mail_event}`,
    `Last mail error: ${s.last_mail_error}`,
    ``,
    `Approval required: ${s.approval_required}`,
    `Secrets: ${s.secrets_printed}`,
  ].join('\n');
}

// CLI self-test
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const s = getMailStatus();
  console.log('=== Mail Status Adapter ===');
  console.log(JSON.stringify({ ...s, env_path: '(hidden)' }, null, 2));
  console.log('');
  console.log('=== Formatted Message ===');
  console.log(formatMailStatusMessage(s));
}
