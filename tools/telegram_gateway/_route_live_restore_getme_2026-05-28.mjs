// _route_live_restore_getme_2026-05-28.mjs
// Safe runner: reads .env, calls getMe + getWebhookInfo, optionally deleteWebhook.
// NEVER prints token, chat_id, env values.
import fs from 'node:fs';
import path from 'node:path';

const ENV_PATH = path.join(process.cwd(), 'tools', 'telegram_gateway', '.env');
const txt = fs.readFileSync(ENV_PATH, 'utf8');
const env = {};
for (const line of txt.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
const token = env.TELEGRAM_BOT_TOKEN || '';
if (!token) { console.log(JSON.stringify({ok:false, error:'no_token_in_env'})); process.exit(2); }

async function tg(method) {
  const ctrl = new AbortController();
  const to = setTimeout(()=>ctrl.abort(), 10000);
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { signal: ctrl.signal });
    const j = await r.json();
    return { http: r.status, ok: !!j.ok, result: j.result, description: j.description };
  } catch (e) {
    return { ok:false, error: String(e && e.message || e) };
  } finally { clearTimeout(to); }
}

const me = await tg('getMe');
const wh = await tg('getWebhookInfo');

// Redact: never print full info. Only safe fields.
const safeMe = me.ok && me.result ? { ok:true, username: me.result.username, is_bot: me.result.is_bot, id_present: !!me.result.id } : { ok:false, error: me.description || me.error, http: me.http };
const safeWh = wh.ok && wh.result ? {
  ok:true,
  url_present: !!wh.result.url,
  url_host: wh.result.url ? (new URL(wh.result.url)).host : null,
  pending_update_count: wh.result.pending_update_count,
  has_custom_certificate: wh.result.has_custom_certificate,
  last_error_date: wh.result.last_error_date || null,
  last_error_message: wh.result.last_error_message || null
} : { ok:false, error: wh.description || wh.error, http: wh.http };

let deleteWebhookResult = null;
if (safeWh.ok && safeWh.url_present) {
  const dw = await tg('deleteWebhook?drop_pending_updates=false');
  deleteWebhookResult = dw.ok ? { ok:true } : { ok:false, error: dw.description || dw.error };
}

console.log(JSON.stringify({ getMe: safeMe, getWebhookInfo: safeWh, deleteWebhook: deleteWebhookResult }, null, 2));
