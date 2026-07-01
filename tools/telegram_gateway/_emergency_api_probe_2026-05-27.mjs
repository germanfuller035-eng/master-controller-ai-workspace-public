// Emergency API probe - reads .env via dotenv style without printing secrets,
// hits getMe + getWebhookInfo via HTTPS with strict timeouts.
// Prints ONLY: BOT_TOKEN/CHAT_ID presence (yes/no), CHAT_ID last4,
// getMe ok+username, webhook url present/absent, last_error if any.
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ''));
const WORKSPACE = 'D:\\AI_WORKSPACE';
const ENV_PATHS = [
  path.join(HERE, '.env'),
  path.join(WORKSPACE, '.env'),
];

function readEnv(p) {
  if (!fs.existsSync(p)) return {};
  const out = {};
  const txt = fs.readFileSync(p, 'utf8');
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in out)) out[k] = v;
  }
  return out;
}

const env = { ...readEnv(ENV_PATHS[1]), ...readEnv(ENV_PATHS[0]) };
const BOT_TOKEN = env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID   = env.TELEGRAM_CHAT_ID   || env.TELEGRAM_ADMIN_CHAT_ID || '';

console.log('BOT_TOKEN present:', BOT_TOKEN ? 'yes' : 'no');
console.log('CHAT_ID present:', CHAT_ID ? 'yes' : 'no');
console.log('CHAT_ID last4:', CHAT_ID ? String(CHAT_ID).slice(-4) : 'n/a');

function tg(method, timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (!BOT_TOKEN) return resolve({ ok: false, error: 'no token' });
    const req = https.request({
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${BOT_TOKEN}/${method}`,
      method: 'GET',
      timeout: timeoutMs,
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ ok: false, error: 'bad_json', http_status: res.statusCode }); }
      });
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', (e) => resolve({ ok: false, error: e.code || e.message }));
    req.end();
  });
}

(async () => {
  console.log('--- getMe ---');
  const me = await tg('getMe', 8000);
  if (me.ok && me.result) {
    console.log('getMe ok: yes  username:@' + me.result.username + '  id:' + me.result.id);
  } else {
    console.log('getMe ok: NO  reason:', me.error || me.description || JSON.stringify(me));
  }

  console.log('--- getWebhookInfo ---');
  const wh = await tg('getWebhookInfo', 8000);
  if (wh.ok && wh.result) {
    const r = wh.result;
    console.log('webhook url set:', r.url ? 'YES' : 'no');
    console.log('pending_updates:', r.pending_update_count);
    console.log('last_error_message:', r.last_error_message || 'none');
    if (r.url) {
      console.log('--- webhook url is set, deleting (drop_pending=false) ---');
      const del = await tg('deleteWebhook', 8000);
      console.log('deleteWebhook ok:', del.ok === true);
    }
  } else {
    console.log('webhook check ok: NO  reason:', wh.error || wh.description || JSON.stringify(wh));
  }
})();
