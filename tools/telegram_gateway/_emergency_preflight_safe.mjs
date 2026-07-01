// Safe preflight: env presence + getMe + webhookInfo, NEVER prints token/full chat_id.
// Used only inside emergency live fix flow on 2026-05-27.
import fs from 'node:fs';
import path from 'node:path';

const GATEWAY_DIR = path.resolve('D:/AI_WORKSPACE/tools/telegram_gateway');
const ENV_CANDIDATES = [
  path.join(GATEWAY_DIR, '.env'),
  path.resolve('D:/AI_WORKSPACE/.env'),
];

function parseEnv(file) {
  const out = {};
  const raw = fs.readFileSync(file, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

function last4(s) {
  if (!s) return '<empty>';
  const str = String(s);
  return str.length <= 4 ? '****' : '****' + str.slice(-4);
}

async function main() {
  let envFile = null;
  for (const p of ENV_CANDIDATES) {
    if (fs.existsSync(p)) { envFile = p; break; }
  }
  if (!envFile) {
    console.log('ENV: NOT_FOUND');
    process.exit(2);
  }
  console.log('ENV_FILE:', envFile);

  const env = parseEnv(envFile);
  const TOKEN =
    env.TELEGRAM_BOT_TOKEN || env.BOT_TOKEN || env.TELEGRAM_TOKEN || env.MASTER_BOT_TOKEN || '';
  const CHAT_ID =
    env.TELEGRAM_CHAT_ID || env.TELEGRAM_ADMIN_CHAT_ID || env.MASTER_CHAT_ID ||
    env.OWNER_CHAT_ID || env.CHAT_ID || '';

  console.log('BOT_TOKEN present:', TOKEN ? 'yes' : 'no');
  console.log('CHAT_ID  present:', CHAT_ID ? 'yes' : 'no');
  console.log('CHAT_ID  last4:', last4(CHAT_ID));
  console.log('TOKEN    length:', TOKEN ? TOKEN.length : 0);

  if (!TOKEN || !CHAT_ID) {
    console.log('PREFLIGHT_RESULT: FAIL_MISSING_ENV');
    process.exit(3);
  }

  // getMe
  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/getMe`, {
      signal: AbortSignal.timeout(15000),
    });
    const j = await r.json();
    if (j && j.ok) {
      console.log('GETME: ok username=@' + (j.result.username || '?') + ' id=' + j.result.id);
    } else {
      console.log('GETME: FAIL error_code=' + (j && j.error_code) + ' desc=' + (j && j.description));
      process.exit(4);
    }
  } catch (e) {
    console.log('GETME: EXCEPTION', e.message);
    process.exit(4);
  }

  // getWebhookInfo
  let webhookUrl = '';
  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/getWebhookInfo`, {
      signal: AbortSignal.timeout(15000),
    });
    const j = await r.json();
    if (j && j.ok) {
      webhookUrl = j.result.url || '';
      console.log('WEBHOOK: url=' + (webhookUrl ? '<SET>' : '<empty>') +
        ' pending=' + j.result.pending_update_count +
        ' last_err=' + (j.result.last_error_message || '<none>'));
    } else {
      console.log('WEBHOOK: FAIL', j && j.description);
    }
  } catch (e) {
    console.log('WEBHOOK: EXCEPTION', e.message);
  }

  // If webhook is set -> deleteWebhook so polling can work
  if (webhookUrl) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${TOKEN}/deleteWebhook?drop_pending_updates=false`, {
        signal: AbortSignal.timeout(15000),
      });
      const j = await r.json();
      console.log('DELETE_WEBHOOK: ok=' + (j && j.ok) + ' desc=' + (j && j.description));
    } catch (e) {
      console.log('DELETE_WEBHOOK: EXCEPTION', e.message);
    }
  } else {
    console.log('DELETE_WEBHOOK: skipped (no webhook set)');
  }

  // getUpdates probe with timeout=0 to confirm no 409 conflict
  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/getUpdates?timeout=0&limit=1`, {
      signal: AbortSignal.timeout(15000),
    });
    const j = await r.json();
    if (j && j.ok) {
      console.log('GETUPDATES_PROBE: ok updates=' + (j.result ? j.result.length : 0));
    } else {
      console.log('GETUPDATES_PROBE: FAIL code=' + j.error_code + ' desc=' + j.description);
    }
  } catch (e) {
    console.log('GETUPDATES_PROBE: EXCEPTION', e.message);
  }

  console.log('PREFLIGHT_RESULT: OK');
}

main().catch((e) => {
  console.error('PREFLIGHT_FATAL', e.message);
  process.exit(1);
});
