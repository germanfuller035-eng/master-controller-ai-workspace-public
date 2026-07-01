// Safe getMe + getWebhookInfo via direct https. Never prints token or chat id.
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

function parseEnvFile(p) {
  const out = {};
  if (!fs.existsSync(p)) return out;
  const txt = fs.readFileSync(p, 'utf8');
  for (const line of txt.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

const gw   = parseEnvFile(path.join(__dirname, '.env'));
const root = parseEnvFile(path.join('D:\\AI_WORKSPACE', '.env'));
const ENV  = { ...root, ...gw };

const BOT_TOKEN = ENV.TELEGRAM_BOT_TOKEN || ENV.BOT_TOKEN || '';
const CHAT_ID   = String(ENV.TELEGRAM_CHAT_ID || ENV.TELEGRAM_ADMIN_CHAT_ID || ENV.CHAT_ID || '').trim();

console.log('BOT_TOKEN present:', BOT_TOKEN ? 'yes' : 'no');
console.log('CHAT_ID present:',   CHAT_ID   ? 'yes' : 'no');
console.log('CHAT_ID last4:',     CHAT_ID ? CHAT_ID.slice(-4) : '(none)');

if (!BOT_TOKEN) { console.log('ABORT: no BOT_TOKEN.'); process.exit(2); }

function tg(method, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${BOT_TOKEN}/${method}`,
      method: data ? 'POST' : 'GET',
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
      timeout: 10000,
    }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(buf) }); }
        catch { resolve({ status: res.statusCode, json: null, raw: buf.slice(0, 200) }); }
      });
    });
    req.on('error', e => resolve({ status: 0, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, error: 'timeout' }); });
    if (data) req.write(data);
    req.end();
  });
}

const me = await tg('getMe');
console.log('getMe.ok:', me.json && me.json.ok === true);
if (me.json && me.json.ok) {
  console.log('bot.username:', '@' + (me.json.result.username || '?'));
  console.log('bot.id:', me.json.result.id);
} else {
  console.log('getMe error:', me.error || (me.json && me.json.description) || me.raw || 'unknown');
}

const wh = await tg('getWebhookInfo');
if (wh.json && wh.json.ok) {
  const w = wh.json.result;
  const hasWebhook = !!(w.url && w.url.length > 0);
  console.log('webhook.url_present:', hasWebhook ? 'yes' : 'no');
  console.log('webhook.pending_update_count:', w.pending_update_count || 0);
  console.log('webhook.last_error_message:', w.last_error_message || '(none)');
  if (hasWebhook) {
    console.log('Webhook is set — deleting to allow polling...');
    const del = await tg('deleteWebhook', { drop_pending_updates: false });
    console.log('deleteWebhook.ok:', del.json && del.json.ok === true);
  }
} else {
  console.log('getWebhookInfo error:', wh.error || (wh.json && wh.json.description));
}

console.log('---DONE---');
