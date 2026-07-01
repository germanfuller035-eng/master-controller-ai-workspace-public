// Emergency env + Telegram API safety check.
// Does NOT print BOT_TOKEN or full CHAT_ID. Only last4 of chat id.
// Reads .env from tools/telegram_gateway/.env (primary) and D:\AI_WORKSPACE\.env (fallback).
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'D:\\AI_WORKSPACE';
const ENV_PATHS = [
  path.join(ROOT, 'tools', 'telegram_gateway', '.env'),
  path.join(ROOT, '.env'),
];

function loadEnvSilent() {
  const env = { ...process.env };
  for (const ep of ENV_PATHS) {
    if (!fs.existsSync(ep)) continue;
    const txt = fs.readFileSync(ep, 'utf8');
    for (const raw of txt.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 1) continue;
      const k = line.slice(0, eq).trim();
      let v = line.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!(k in env) || !env[k]) env[k] = v;
    }
  }
  return env;
}

const ENV = loadEnvSilent();
const BOT_TOKEN = ENV.TELEGRAM_BOT_TOKEN || '';
// CHAT_ID resolution: first explicit CHAT_ID env, otherwise first ID from ALLOWED_TELEGRAM_USER_IDS
let CHAT_ID = ENV.TELEGRAM_CHAT_ID || ENV.TELEGRAM_ADMIN_CHAT_ID || ENV.OWNER_TELEGRAM_CHAT_ID || '';
if (!CHAT_ID && ENV.ALLOWED_TELEGRAM_USER_IDS) {
  const ids = String(ENV.ALLOWED_TELEGRAM_USER_IDS).split(/[,\s]+/).filter(Boolean);
  if (ids.length) CHAT_ID = ids[0];
}

console.log('=== ENV CHECK (no secrets printed) ===');
console.log('BOT_TOKEN present:', BOT_TOKEN ? 'yes' : 'no');
console.log('CHAT_ID present:', CHAT_ID ? 'yes' : 'no');
console.log('CHAT_ID last4:', CHAT_ID ? String(CHAT_ID).slice(-4) : '(none)');
console.log('GATEWAY_LOG_PATH:', fs.existsSync(path.join(ROOT, 'tools/telegram_gateway/logs')) ? 'dir_ok' : 'missing');
console.log('GATEWAY_STATE_PATH:', fs.existsSync(path.join(ROOT, 'tools/telegram_gateway/state')) ? 'dir_ok' : 'missing');

if (!BOT_TOKEN || !CHAT_ID) {
  console.log('ABORT: missing token or chat id.');
  process.exit(2);
}

async function tg(method, body) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  const opts = body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : { method: 'GET' };
  const r = await fetch(url, opts);
  const txt = await r.text();
  let j; try { j = JSON.parse(txt); } catch { j = { raw: txt.slice(0, 200) }; }
  return { ok: r.ok, status: r.status, body: j };
}

console.log('\n=== Telegram API CHECK ===');
try {
  const me = await tg('getMe');
  if (me.ok && me.body.ok) {
    const u = me.body.result || {};
    console.log('getMe OK: id=', u.id, 'username=@' + (u.username || '?'), 'is_bot=', u.is_bot);
  } else {
    console.log('getMe FAIL status=', me.status, 'description=', me.body?.description || '(none)');
    process.exit(3);
  }

  const wh = await tg('getWebhookInfo');
  if (wh.ok && wh.body.ok) {
    const w = wh.body.result || {};
    const url = w.url || '';
    console.log('webhook url:', url ? '(set, will be removed)' : '(empty - polling OK)');
    console.log('webhook pending_update_count:', w.pending_update_count || 0);
    console.log('webhook last_error_message:', w.last_error_message ? w.last_error_message.slice(0, 80) : '(none)');
    if (url) {
      const del = await tg('deleteWebhook', { drop_pending_updates: false });
      console.log('deleteWebhook result:', del.body?.ok ? 'OK' : 'FAIL', del.body?.description || '');
    }
  }

  // Probe getUpdates with timeout 0 to detect 409 conflict
  const upd = await tg('getUpdates', { timeout: 0, limit: 1 });
  if (upd.body?.ok) {
    console.log('getUpdates OK, updates_buffered=', (upd.body.result || []).length, '(no 409 conflict)');
  } else {
    console.log('getUpdates issue: status=', upd.status, 'desc=', upd.body?.description || '(none)');
    if (String(upd.body?.description || '').includes('Conflict')) {
      console.log('!!! 409 CONFLICT — another poller is running somewhere !!!');
    }
  }
} catch (e) {
  console.log('API ERROR:', (e.message || String(e)).slice(0, 200));
  process.exit(4);
}

console.log('\n=== CHECK DONE ===');
