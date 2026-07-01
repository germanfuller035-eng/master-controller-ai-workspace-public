// getMe + getWebhookInfo safe check — does NOT print BOT_TOKEN.
// Reads .env from D:\AI_WORKSPACE\.env via fs (without dotenv printing).
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

function loadEnv(envPath) {
  const out = {};
  if (!fs.existsSync(envPath)) return out;
  const txt = fs.readFileSync(envPath, 'utf8');
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

const env = {
  ...process.env,
  ...loadEnv(path.join('D:\\AI_WORKSPACE', '.env')),
  ...loadEnv(path.join('D:\\AI_WORKSPACE', 'tools', 'telegram_gateway', '.env')),
};
const TOKEN = env.TELEGRAM_BOT_TOKEN || env.BOT_TOKEN || env.TG_BOT_TOKEN;
const CHAT_ID = env.TELEGRAM_OWNER_CHAT_ID || env.OWNER_CHAT_ID || env.CHAT_ID || env.TELEGRAM_CHAT_ID;

if (!TOKEN) {
  console.log('ERROR: bot token not found in env (looked for TELEGRAM_BOT_TOKEN / BOT_TOKEN / TG_BOT_TOKEN)');
  process.exit(1);
}

const tokenTail = TOKEN.length > 6 ? '***' + TOKEN.slice(-4) : '***';
console.log('token_present=yes  token_mask=' + tokenTail);
console.log('chat_id_present=' + (CHAT_ID ? 'yes' : 'no'));

function api(method, body = null) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      method: body ? 'POST' : 'GET',
      hostname: 'api.telegram.org',
      path: `/bot${TOKEN}/${method}`,
      headers: body
        ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
        : {},
      timeout: 10000,
    };
    const req = https.request(opts, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        try { resolve({ ok: true, status: res.statusCode, json: JSON.parse(buf) }); }
        catch (e) { resolve({ ok: false, status: res.statusCode, error: 'parse', raw: buf.slice(0, 200) }); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.on('error', (e) => resolve({ ok: false, error: e.code || e.message }));
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  const me = await api('getMe');
  if (me.ok && me.json && me.json.ok) {
    console.log('getMe.ok=true  bot_username=@' + me.json.result.username + '  bot_id=' + me.json.result.id);
  } else {
    console.log('getMe.ok=false  status=' + me.status + '  err=' + (me.error || JSON.stringify(me.json).slice(0,200)));
    process.exit(2);
  }

  const wh = await api('getWebhookInfo');
  if (wh.ok && wh.json && wh.json.ok) {
    const r = wh.json.result;
    console.log('webhook.url_set=' + (r.url ? 'yes' : 'no') + '  pending_updates=' + (r.pending_update_count || 0));
    if (r.url) {
      console.log('webhook.url=' + r.url);
      console.log('Deleting webhook to allow polling...');
      const d = await api('deleteWebhook', { drop_pending_updates: false });
      console.log('deleteWebhook.ok=' + (d.json && d.json.ok ? 'true' : 'false'));
    }
  } else {
    console.log('getWebhookInfo.ok=false  err=' + (wh.error || ''));
  }
})();
