#!/usr/bin/env node
/**
 * Yandex Mail Stage 1 — IMAP Read-Only Connector (headers only, allowlist)
 * tools/communication_monitor/yandex_mail_imap_read.mjs
 *
 * STRICT SAFETY CONTRACT (enforced in code, do NOT relax):
 *   - IMAP only, NO SMTP. No outbound mail can leave this script.
 *   - Read-only IMAP session: openBox readOnly=true. No FLAGS \Seen change, no delete, no move.
 *   - Fetches ONLY message headers (ENVELOPE + BODY.PEEK[HEADER.FIELDS]). Body is never downloaded.
 *   - Attachments: ignored. No BODYSTRUCTURE parts are fetched/saved.
 *   - Links inside body/headers are NOT extracted, NOT clicked, NOT resolved.
 *   - Only senders present in data/yandex_mail_allowlist.json (active=true) are kept.
 *   - Live network connection happens ONLY if YANDEX_MAIL_STAGE1_LIVE_READ=true.
 *     Otherwise the script runs a dry contract self-test and exits.
 *   - Credentials are never printed; only "PRESENT/MISSING" status is logged.
 *
 * Usage:
 *   node tools/communication_monitor/yandex_mail_imap_read.mjs          # dry self-test
 *   YANDEX_MAIL_STAGE1_LIVE_READ=true node ...                          # live read-only
 *
 * Env vars expected (see tools/telegram_gateway/.env or tools/communication_monitor/.env.example):
 *   YANDEX_MAIL_LOGIN, YANDEX_MAIL_APP_PASSWORD,
 *   YANDEX_MAIL_IMAP_HOST (default imap.yandex.ru),
 *   YANDEX_MAIL_IMAP_PORT (default 993),
 *   YANDEX_MAIL_IMAP_MAILBOX (default INBOX),
 *   YANDEX_MAIL_STAGE1_LIVE_READ (must be exactly "true" to attempt live read),
 *   YANDEX_MAIL_STAGE1_LIMIT (default 25; how many newest messages to inspect).
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
const HEADERS_OUT_PATH = join(BASE, 'data', 'yandex_mail_stage1_headers.json');
const LOG_PATH = join(__dirname, 'yandex_mail_imap_read_log.md');

const NOW = () => new Date().toISOString();

// ---------- Safe .env loader (no secret printing) ----------
// Priority 1: tools/communication_monitor/.env
// Priority 2 (fallback): D:\AI_WORKSPACE\.env
// Does NOT overwrite values already present in process.env.
// Supports: blank lines, `#` comments, split on first `=`, trim, surrounding "..." or '...'.
function parseEnvFile(content) {
  const out = {};
  const lines = String(content).split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}
function loadEnvFiles() {
  const candidates = [
    join(__dirname, '.env'),       // tools/communication_monitor/.env  (primary)
    join(BASE, '.env'),            // D:\AI_WORKSPACE\.env               (fallback)
  ];
  const loaded = [];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      const parsed = parseEnvFile(readFileSync(p, 'utf8'));
      for (const [k, v] of Object.entries(parsed)) {
        if (process.env[k] === undefined || process.env[k] === '') {
          process.env[k] = v;
        }
      }
      loaded.push(p);
    } catch {
      // Never log file content; just skip on parse error.
    }
  }
  return loaded;
}
const ENV_FILES_LOADED = loadEnvFiles();


// ---------- IMMUTABLE SAFETY FLAGS ----------
const SAFETY = Object.freeze({
  send_enabled: false,
  delete_enabled: false,
  archive_enabled: false,
  attachments_enabled: false,
  links_followed: false,
  body_download_enabled: false,
  mark_seen_enabled: false,
  readonly_mailbox: true,
  allowlist_only: true,
});

function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}
function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
}
function appendEvent(event) {
  const log = readJson(EVENTS_LOG_PATH, []) || [];
  log.push(event);
  writeJson(EVENTS_LOG_PATH, log);
}
function appendLog(line) {
  const stamp = NOW();
  const entry = `\n- ${stamp} — ${line}`;
  if (existsSync(LOG_PATH)) {
    writeFileSync(LOG_PATH, readFileSync(LOG_PATH, 'utf8') + entry, 'utf8');
  } else {
    writeFileSync(LOG_PATH,
`# Yandex Mail IMAP Read-Only — Run Log

Stage: stage1_readonly
Contract: headers-only, allowlist-only, no send, no delete, no archive, no attachments, no links.
${entry}
`, 'utf8');
  }
}

function loadAllowlistEmails() {
  const all = readJson(ALLOWLIST_PATH, []) || [];
  const active = all.filter(c => c.active === true && typeof c.email === 'string');
  const set = new Set(active.map(c => c.email.toLowerCase().trim()));
  return { set, list: [...set] };
}

function pickEnv() {
  const v = (k, def = '') => (process.env[k] && process.env[k].length > 0 ? process.env[k] : def);
  return {
    login: v('YANDEX_MAIL_LOGIN'),
    pass:  v('YANDEX_MAIL_APP_PASSWORD'),
    host:  v('YANDEX_MAIL_IMAP_HOST', 'imap.yandex.ru'),
    port:  Number(v('YANDEX_MAIL_IMAP_PORT', '993')),
    mailbox: v('YANDEX_MAIL_IMAP_MAILBOX', 'INBOX'),
    liveRead: v('YANDEX_MAIL_STAGE1_LIVE_READ') === 'true',
    limit: Math.max(1, Math.min(200, Number(v('YANDEX_MAIL_STAGE1_LIMIT', '25')))),
  };
}

function credsStatus(env) {
  return {
    login_present: !!env.login,
    pass_present: !!env.pass,
    host_present: !!env.host,
    port_present: !!env.port,
  };
}

function updateState(patch) {
  const state = readJson(STATE_PATH, {}) || {};
  Object.assign(state, patch, { updated_at: NOW() });
  writeJson(STATE_PATH, state);
}

function summarizeHeaders(messages, allowlistSet) {
  // Defensive: only keep allowlisted senders, only headers, no body.
  const out = [];
  for (const m of messages) {
    const fromAddr = (m.from || '').toLowerCase().trim();
    if (!allowlistSet.has(fromAddr)) continue;
    out.push({
      uid: m.uid,
      date: m.date,
      from: m.from,
      from_name: m.from_name || null,
      to: m.to || null,
      subject: m.subject || '(no subject)',
      message_id: m.message_id || null,
      in_reply_to: m.in_reply_to || null,
      // The following are intentionally absent:
      // body, body_preview, html, text, attachments, links
    });
  }
  return out;
}

async function dryRun(env, allowlist) {
  const creds = credsStatus(env);
  const ready = creds.login_present && creds.pass_present && creds.host_present && creds.port_present;
  const result = {
    mode: 'dry_run',
    timestamp: NOW(),
    safety: SAFETY,
    allowlist_active_count: allowlist.list.length,
    credentials: creds,
    live_read_enabled: false,
    can_go_live: ready && allowlist.list.length > 0,
    message: ready
      ? 'Credentials present. Live read NOT enabled (YANDEX_MAIL_STAGE1_LIVE_READ != "true"). Dry-run only.'
      : 'Missing credentials. Live read NOT attempted. Dry-run only.',
  };
  appendLog(`dry_run: live=${result.live_read_enabled}, allowlist=${result.allowlist_active_count}, creds_ready=${ready}`);
  updateState({
    stage: 'stage1_readonly',
    live_read_enabled: false,
    send_enabled: false, delete_enabled: false, archive_enabled: false, attachments_enabled: false,
    allowlist_only: true,
    last_dry_run: result.timestamp,
    overall: ready ? 'Yellow' : 'Yellow',
    notes: result.message,
  });
  appendEvent({
    event_type: 'yandex_mail_stage1_dry_run',
    timestamp: result.timestamp,
    project: 'AI_WORKSPACE',
    summary: 'IMAP read-only connector dry-run',
    live_read_enabled: false,
    send_enabled: false,
    allowlist_active_count: result.allowlist_active_count,
    notes: 'No network connection attempted. No send, no delete, no archive, no attachments, no links.',
  });
  return result;
}

async function liveRead(env, allowlist) {
  // Hard guard: refuse if any safety flag has been mutated.
  if (SAFETY.send_enabled || SAFETY.delete_enabled || SAFETY.archive_enabled ||
      SAFETY.attachments_enabled || SAFETY.body_download_enabled || SAFETY.mark_seen_enabled) {
    throw new Error('SAFETY contract violation: a forbidden flag is enabled. Refusing to connect.');
  }
  if (!env.login || !env.pass) {
    throw new Error('IMAP credentials missing (YANDEX_MAIL_LOGIN / YANDEX_MAIL_APP_PASSWORD).');
  }
  if (allowlist.list.length === 0) {
    throw new Error('Allowlist is empty. Refusing to fetch.');
  }

  // Lazy import — keeps dry-run dependency-free.
  let ImapFlow;
  try {
    ({ ImapFlow } = await import('imapflow'));
  } catch (e) {
    throw new Error(
      'Package "imapflow" is not installed. Run: npm install imapflow  (only required for live read).'
    );
  }

  const client = new ImapFlow({
    host: env.host,
    port: env.port,
    secure: true,
    auth: { user: env.login, pass: env.pass },
    logger: false, // do not leak credentials/log noise
    disableAutoIdle: true,
  });

  const started = NOW();
  const collected = [];

  await client.connect();
  try {
    // readOnly: true — IMAP EXAMINE, not SELECT. Server-enforced read-only.
    const lock = await client.getMailboxLock(env.mailbox, { readOnly: true });
    try {
      const status = client.mailbox; // info about opened box
      const total = status && status.exists ? status.exists : 0;
      const startSeq = Math.max(1, total - env.limit + 1);
      const range = total > 0 ? `${startSeq}:*` : null;

      if (range) {
        // Fetch ENVELOPE only — headers, never body, never attachments.
        for await (const msg of client.fetch(range, {
          envelope: true,
          uid: true,
          internalDate: true,
          // Explicitly NOT requested: source, bodyParts, bodyStructure, flags-modification
        })) {
          const env_ = msg.envelope || {};
          const fromObj = (env_.from && env_.from[0]) || {};
          const fromAddr = (fromObj.address || '').toLowerCase().trim();
          if (!allowlist.set.has(fromAddr)) continue;

          collected.push({
            uid: msg.uid,
            date: (env_.date && env_.date.toISOString && env_.date.toISOString()) ||
                  (msg.internalDate && msg.internalDate.toISOString && msg.internalDate.toISOString()) ||
                  null,
            from: fromAddr,
            from_name: fromObj.name || null,
            to: ((env_.to || []).map(a => a.address).filter(Boolean))[0] || null,
            subject: env_.subject || '(no subject)',
            message_id: env_.messageId || null,
            in_reply_to: env_.inReplyTo || null,
          });
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }

  const finished = NOW();
  const headers = summarizeHeaders(collected, allowlist.set);

  // Persist headers snapshot
  writeJson(HEADERS_OUT_PATH, {
    fetched_at: finished,
    mailbox: env.mailbox,
    safety: SAFETY,
    count: headers.length,
    headers,
  });

  appendLog(`live_read: mailbox=${env.mailbox}, fetched_headers=${headers.length}, allowlist=${allowlist.list.length}`);

  updateState({
    stage: 'stage1_readonly',
    live_read_enabled: true,
    send_enabled: false, delete_enabled: false, archive_enabled: false, attachments_enabled: false,
    allowlist_only: true,
    last_live_read_started_at: started,
    last_live_read_finished_at: finished,
    last_fetched_headers_count: headers.length,
    overall: 'Green',
    notes: 'Live IMAP read-only completed. Headers only. Allowlist filter applied.',
  });

  appendEvent({
    event_type: 'yandex_mail_stage1_live_read',
    timestamp: finished,
    project: 'AI_WORKSPACE',
    summary: `IMAP read-only fetched ${headers.length} header(s) from allowlist`,
    live_read_enabled: true,
    send_enabled: false,
    mailbox: env.mailbox,
    fetched_headers_count: headers.length,
    allowlist_active_count: allowlist.list.length,
    notes: 'Headers only. No body, no attachments, no links followed. No flags changed.',
  });

  return {
    mode: 'live_read',
    timestamp: finished,
    safety: SAFETY,
    fetched_headers_count: headers.length,
    allowlist_active_count: allowlist.list.length,
    output_file: HEADERS_OUT_PATH,
  };
}

(async () => {
  const env = pickEnv();
  const allowlist = loadAllowlistEmails();

  console.log('\n=== Yandex Mail Stage 1 — IMAP Read-Only ===');
  console.log(`Mode:               ${env.liveRead ? 'LIVE READ (read-only)' : 'DRY RUN'}`);
  console.log(`Safety contract:    headers-only, no send, no delete, no archive, no attachments, no links`);
  console.log(`Allowlist active:   ${allowlist.list.length}`);
  const c = credsStatus(env);
  console.log(`Credentials:        login=${c.login_present?'PRESENT':'MISSING'} pass=${c.pass_present?'PRESENT':'MISSING'} host=${c.host_present?'PRESENT':'MISSING'} port=${c.port_present?'PRESENT':'MISSING'} (values not logged)`);

  try {
    let result;
    if (!env.liveRead) {
      result = await dryRun(env, allowlist);
    } else {
      result = await liveRead(env, allowlist);
    }
    console.log('\nResult:');
    console.log(JSON.stringify(result, null, 2));
    console.log('\n=== END ===\n');
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    appendLog(`ERROR: ${msg}`);
    appendEvent({
      event_type: 'yandex_mail_stage1_error',
      timestamp: NOW(),
      project: 'AI_WORKSPACE',
      summary: 'IMAP read-only run failed',
      live_read_enabled: env.liveRead,
      send_enabled: false,
      notes: msg,
    });
    updateState({ overall: 'Red', notes: `Error: ${msg}` });
    console.error(`\n[ERROR] ${msg}\n`);
    process.exitCode = 1;
  }
})();
