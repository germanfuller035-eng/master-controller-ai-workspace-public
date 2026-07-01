// Emergency preflight: env presence, getMe, webhookInfo. NEVER prints token/chat_id.
import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

function parseEnvFile(p) {
  const out = {};
  if (!fs.existsSync(p)) return out;
  const raw = fs.readFileSync(p, 'utf-8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1,-1);
    out[m[1]] = v;
  }
  return out;
}

const envPath = path.join(__dirname, '.env');
const env = { ...process.env, ...parseEnvFile(envPath) };

const BOT_TOKEN = env.TELEGRAM_BOT_TOKEN || env.BOT_TOKEN || '';
const CHAT_ID   = env.TELEGRAM_CHAT_ID   || env.CHAT_ID   || env.OWNER_CHAT_ID || '';

console.log('=== EMERGENCY PREFLIGHT ===');
console.log('.env path exists:', fs.existsSync(envPath));
console.log('BOT_TOKEN present:', BOT_TOKEN ? 'yes' : 'no');
console.log('CHAT_ID present:',   CHAT_ID   ? 'yes' : 'no');
console.log('CHAT_ID last4:',     CHAT_ID ? String(CHAT_ID).slice(-4) : '(none)');

function tg(method, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/${method}`,
      method: data ? 'POST' : 'GET',
      headers: data ? { 'Content-Type':'application/json','Content-Length':Buffer.byteLength(data) } : {},
      timeout: 15000,
    };
    const req = https.request(opts, (res) => {
      let chunks = '';
      res.on('data', c => chunks += c);
      res.on('end', () => {
        try { resolve(JSON.parse(chunks)); } catch (e) { resolve({ ok:false, raw:chunks.substring(0,200) }); }
      });
    });
    req.on('error', (e) => resolve({ ok:false, error:e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok:false, error:'timeout' }); });
    if (data) req.write(data);
    req.end();
  });
}

if (!BOT_TOKEN) {
  console.log('FATAL: no BOT_TOKEN — cannot probe API.');
  process.exit(2);
}

const me = await tg('getMe');
if (me && me.ok) {
  console.log('getMe: OK  username=@' + (me.result.username || '?') + '  id_last4=' + String(me.result.id || '').slice(-4));
} else {
  console.log('getMe: FAIL  ', JSON.stringify(me).substring(0,200));
}

const wh = await tg('getWebhookInfo');
if (wh && wh.ok) {
  const url = wh.result.url || '';
  console.log('webhookInfo: url_set=' + (url ? 'yes' : 'no') + '  pending=' + (wh.result.pending_update_count ?? 0));
  if (url) {
    console.log('webhook URL is set — deleting to free polling...');
    const del = await tg('deleteWebhook', { drop_pending_updates: false });
    console.log('deleteWebhook result: ok=' + (del && del.ok));
  }
} else {
  console.log('getWebhookInfo: FAIL  ', JSON.stringify(wh).substring(0,200));
}

// Quick poll probe to detect 409 conflict (offset trick using empty)
const upd = await tg('getUpdates', { timeout: 0, limit: 1 });
if (upd && upd.ok) {
  console.log('getUpdates probe: OK (no 409 conflict). pending=' + (upd.result?.length ?? 0));
} else {
  const desc = upd?.description || JSON.stringify(upd).substring(0,200);
  console.log('getUpdates probe: ' + (desc.includes('409') || desc.toLowerCase().includes('conflict') ? '409 CONFLICT' : 'FAIL') + '  ' + desc);
}

console.log('=== PREFLIGHT DONE ===');
