/**
 * _emergency_net_probe.mjs
 * Probes Telegram API getMe + getWebhookInfo + deletes webhook if blocking.
 * NEVER prints token. Only prints sanitized status.
 */
import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const WORKSPACE  = path.resolve(path.join(__dirname, '..', '..'));

function parseEnv(p) {
  const r = {};
  if (!fs.existsSync(p)) return r;
  const raw = fs.readFileSync(p, 'utf-8').replace(/^\uFEFF/, '');
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const k = t.substring(0, eq).trim();
    const v = t.substring(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (k) r[k] = v;
  }
  return r;
}
const envA = parseEnv(path.join(__dirname, '.env'));
const envB = parseEnv(path.join(WORKSPACE, '.env'));
const ENV  = { ...envB, ...envA };
const BOT_TOKEN = ENV.TELEGRAM_BOT_TOKEN || ENV.BOT_TOKEN || '';
const CHAT_ID   = String(ENV.TELEGRAM_CHAT_ID || ENV.TELEGRAM_ADMIN_CHAT_ID || ENV.CHAT_ID || '').trim();

console.log('BOT_TOKEN present:', BOT_TOKEN ? 'yes' : 'no');
console.log('CHAT_ID present:', CHAT_ID ? 'yes' : 'no');
console.log('CHAT_ID last4:', CHAT_ID ? CHAT_ID.slice(-4) : '(none)');

if (!BOT_TOKEN) { console.log('ABORT: no token in .env'); process.exit(1); }

function tgReq(method, body = null, timeoutMs = 12000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const postBody = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/${method}`,
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postBody) } : {},
      timeout: timeoutMs,
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const dur = Date.now() - start;
        try { const j = JSON.parse(data); resolve({ ok: j.ok, status: res.statusCode, dur, body: j }); }
        catch (_) { resolve({ ok: false, status: res.statusCode, dur, body: '(non-json)' }); }
      });
    });
    req.on('error', e => resolve({ ok: false, error: e.message, dur: Date.now() - start }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout', dur: Date.now() - start }); });
    if (postBody) req.write(postBody);
    req.end();
  });
}

(async () => {
  console.log('--- getMe ---');
  const me = await tgReq('getMe');
  if (me.ok) {
    console.log('getMe: OK in', me.dur, 'ms');
    console.log('bot username:', me.body.result?.username);
    console.log('bot id last4:', String(me.body.result?.id || '').slice(-4));
  } else {
    console.log('getMe: FAIL', me.error || me.body?.description, 'dur', me.dur, 'ms');
  }

  console.log('--- getWebhookInfo ---');
  const wh = await tgReq('getWebhookInfo');
  if (wh.ok) {
    const r = wh.body.result || {};
    console.log('webhook url set:', r.url ? 'yes' : 'no');
    console.log('pending_update_count:', r.pending_update_count);
    console.log('last_error_message:', r.last_error_message || '(none)');
    if (r.url) {
      console.log('--- deleteWebhook (drop_pending=false) ---');
      const del = await tgReq('deleteWebhook', { drop_pending_updates: false });
      console.log('deleteWebhook:', del.ok ? 'OK' : ('FAIL ' + (del.error || del.body?.description)));
    }
  } else {
    console.log('getWebhookInfo: FAIL', wh.error || wh.body?.description);
  }

  console.log('--- getUpdates short poll ---');
  const up = await tgReq('getUpdates', { timeout: 2, limit: 1 }, 10000);
  if (up.ok) {
    console.log('getUpdates: OK in', up.dur, 'ms; results=', (up.body.result || []).length);
  } else {
    console.log('getUpdates: FAIL', up.error || up.body?.description, 'dur', up.dur, 'ms');
  }
})();
