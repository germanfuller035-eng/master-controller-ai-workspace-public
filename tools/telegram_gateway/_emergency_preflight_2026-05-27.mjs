// Emergency preflight: env presence + getMe + webhookInfo (no secrets printed)
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, '.env');

function parseEnv(p) {
  const out = {};
  if (!fs.existsSync(p)) return out;
  const lines = fs.readFileSync(p, 'utf-8').split(/\r?\n/);
  for (const ln of lines) {
    const t = ln.trim();
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

const env = parseEnv(ENV_PATH);
const ROOT_ENV = path.join(__dirname, '..', '..', '.env');
const rootEnv = parseEnv(ROOT_ENV);

const TOKEN = env.TELEGRAM_BOT_TOKEN || rootEnv.TELEGRAM_BOT_TOKEN || '';
const CHAT  = env.TELEGRAM_CHAT_ID || env.TELEGRAM_ADMIN_CHAT_ID || rootEnv.TELEGRAM_CHAT_ID || rootEnv.TELEGRAM_ADMIN_CHAT_ID || '';

console.log('=== ENV PRESENCE CHECK ===');
console.log('Gateway .env exists:', fs.existsSync(ENV_PATH) ? 'yes' : 'no');
console.log('Root .env exists:   ', fs.existsSync(ROOT_ENV) ? 'yes' : 'no');
console.log('BOT_TOKEN present:  ', TOKEN ? 'yes' : 'no');
console.log('CHAT_ID present:    ', CHAT ? 'yes' : 'no');
console.log('CHAT_ID last4:      ', CHAT ? String(CHAT).slice(-4) : 'n/a');

if (!TOKEN) { console.log('NO TOKEN — abort API checks.'); process.exit(0); }

function api(method, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : '';
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${TOKEN}/${method}`,
      method: data ? 'POST' : 'GET',
      headers: data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {},
      timeout: 15000,
    }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        try { resolve(JSON.parse(buf)); } catch { resolve({ ok: false, raw: buf.slice(0, 200) }); }
      });
    });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  console.log('\n=== getMe ===');
  const me = await api('getMe');
  if (me.ok) {
    console.log('getMe: ok');
    console.log('  username: @' + (me.result.username || '?'));
    console.log('  id_last4:', String(me.result.id).slice(-4));
  } else {
    console.log('getMe FAILED:', me.description || me.error || JSON.stringify(me).slice(0, 200));
  }

  console.log('\n=== getWebhookInfo ===');
  const wh = await api('getWebhookInfo');
  if (wh.ok) {
    const url = wh.result.url || '';
    console.log('  url set:', url ? 'YES (' + url.replace(/https?:\/\/([^/]+).*/, '$1') + ')' : 'NO (empty — good for polling)');
    console.log('  pending_update_count:', wh.result.pending_update_count);
    console.log('  last_error_message:', wh.result.last_error_message || 'none');
    if (url) {
      console.log('\n  Webhook is set → deleting (polling cannot work with active webhook)...');
      const del = await api('deleteWebhook', { drop_pending_updates: false });
      console.log('  deleteWebhook:', del.ok ? 'ok' : (del.description || JSON.stringify(del).slice(0, 200)));
    }
  } else {
    console.log('getWebhookInfo FAILED:', wh.description || wh.error);
  }

  console.log('\n=== getUpdates (probe for 409) ===');
  const up = await api('getUpdates', { timeout: 0, limit: 1 });
  if (up.ok) {
    console.log('  getUpdates ok, count:', (up.result || []).length, '(no 409 conflict)');
  } else {
    console.log('  getUpdates failed:', up.description || up.error);
    if (String(up.description || '').includes('409') || /Conflict/i.test(up.description || '')) {
      console.log('  ⚠ 409 Conflict: another poller or webhook active.');
    }
  }

  console.log('\nPREFLIGHT DONE.');
})();
