// Emergency live fix — Step 1: backups + env presence + API probe (no secret output)
import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const WORKSPACE  = path.resolve(path.join(__dirname, '..', '..'));
const STAMP      = '2026-05-27';
const BAK_SUFFIX = `.bak_emergency_live_fix_${STAMP}`;

function parseEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  const raw = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const k = t.substring(0, eq).trim();
    const v = t.substring(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (k) out[k] = v;
  }
  return out;
}

// ── Step A: backups ─────────────────────────────────────────────────────────
const filesToBackup = [
  'tools/telegram_gateway/telegram_master_bot.mjs',
  'tools/telegram_gateway/sales_commands_phase1.mjs',
  'tools/master_controller/run_command.mjs',
  'tools/telegram_gateway/README_RUN.md',
];
const backupResults = [];
for (const rel of filesToBackup) {
  const abs = path.join(WORKSPACE, rel);
  if (!fs.existsSync(abs)) { backupResults.push({ file: rel, status: 'missing' }); continue; }
  const bak = abs + BAK_SUFFIX;
  try {
    if (!fs.existsSync(bak)) fs.copyFileSync(abs, bak);
    backupResults.push({ file: rel, status: 'ok', bak: path.basename(bak) });
  } catch (e) {
    backupResults.push({ file: rel, status: 'error', err: e.message });
  }
}
console.log('== BACKUPS ==');
for (const r of backupResults) console.log(' ', r.status.padEnd(8), r.file, r.bak || r.err || '');

// ── Step B: env presence ────────────────────────────────────────────────────
const gatewayEnv = parseEnvFile(path.join(__dirname, '.env'));
const rootEnv    = parseEnvFile(path.join(WORKSPACE, '.env'));
const token = gatewayEnv.TELEGRAM_BOT_TOKEN || rootEnv.TELEGRAM_BOT_TOKEN || gatewayEnv.BOT_TOKEN || rootEnv.BOT_TOKEN || '';
const chatId = gatewayEnv.TELEGRAM_CHAT_ID || rootEnv.TELEGRAM_CHAT_ID || gatewayEnv.CHAT_ID || rootEnv.CHAT_ID || '';
const chatIdLast4 = chatId ? String(chatId).slice(-4) : '----';
console.log('\n== ENV PRESENCE ==');
console.log(' BOT_TOKEN present:', token ? 'yes' : 'NO');
console.log(' CHAT_ID  present:', chatId ? 'yes' : 'NO');
console.log(' CHAT_ID  last4:', chatIdLast4);

if (!token || !chatId) {
  console.log('\n[FATAL] missing token or chat_id — cannot proceed with API probe');
  process.exit(2);
}

// ── Step C: getMe ───────────────────────────────────────────────────────────
function tgGet(method, params={}, timeoutMs=15000) {
  return new Promise((resolve) => {
    const qs = new URLSearchParams(params).toString();
    const url = `https://api.telegram.org/bot${token}/${method}${qs ? '?' + qs : ''}`;
    const req = https.get(url, (res) => {
      let buf = '';
      res.on('data', (c) => buf += c);
      res.on('end', () => {
        try { resolve({ ok: true, status: res.statusCode, body: JSON.parse(buf) }); }
        catch { resolve({ ok: false, status: res.statusCode, body: buf.slice(0, 200) }); }
      });
    });
    req.on('error', (e) => resolve({ ok: false, error: e.code || e.message }));
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ ok: false, error: 'TIMEOUT' }); });
  });
}

console.log('\n== API PROBE ==');
const me = await tgGet('getMe');
if (me.ok && me.body && me.body.ok) {
  console.log(' getMe: OK   username=@' + me.body.result.username + ' id=' + me.body.result.id);
} else {
  console.log(' getMe: FAIL', me.status || '', me.error || JSON.stringify(me.body).slice(0, 200));
}

const wh = await tgGet('getWebhookInfo');
let webhookUrl = '';
if (wh.ok && wh.body && wh.body.ok) {
  webhookUrl = wh.body.result.url || '';
  console.log(' webhook url:', webhookUrl ? '"' + webhookUrl + '"' : '(none)');
  console.log(' pending_update_count:', wh.body.result.pending_update_count);
  if (wh.body.result.last_error_message) console.log(' last_error:', wh.body.result.last_error_message);
} else {
  console.log(' getWebhookInfo: FAIL', wh.error || JSON.stringify(wh.body).slice(0, 200));
}

if (webhookUrl) {
  console.log('\n== DELETE WEBHOOK (interferes with polling) ==');
  const del = await tgGet('deleteWebhook', { drop_pending_updates: 'false' });
  if (del.ok && del.body && del.body.ok) {
    console.log(' deleteWebhook: OK');
  } else {
    console.log(' deleteWebhook: FAIL', del.error || JSON.stringify(del.body).slice(0, 200));
  }
}

// quick conflict check via getUpdates short-poll
console.log('\n== CONFLICT CHECK (getUpdates, timeout=1) ==');
const upd = await tgGet('getUpdates', { timeout: '1', limit: '1' }, 8000);
if (upd.ok && upd.body && upd.body.ok) {
  console.log(' getUpdates: OK (no 409 conflict). updates pending:', upd.body.result.length);
} else if (upd.body && upd.body.error_code === 409) {
  console.log(' getUpdates: 409 CONFLICT — another poller is consuming updates somewhere');
} else {
  console.log(' getUpdates: result=', upd.error || JSON.stringify(upd.body).slice(0, 200));
}

console.log('\n[DONE step1]');
