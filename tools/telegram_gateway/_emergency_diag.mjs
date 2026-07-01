// Safe diag - no secret printing
import fs from 'node:fs';
import path from 'node:path';

const envPaths = [
  'D:/AI_WORKSPACE/.env',
  'D:/AI_WORKSPACE/tools/telegram_gateway/.env',
  '../AI_SECRETS/.env',
  'D:/AI_SECRETS/.env'
];

let chosen = null;
for (const p of envPaths) {
  try {
    if (fs.existsSync(p)) {
      const stat = fs.statSync(p);
      console.log('FOUND ENV:', p, 'size:', stat.size);
      if (!chosen) chosen = p;
    }
  } catch {}
}

// Try dotenv load with all candidates - first set wins
try {
  const dotenv = await import('dotenv');
  for (const p of envPaths) {
    if (fs.existsSync(p)) dotenv.config({ path: p, override: false });
  }
} catch (e) {
  console.log('dotenv import err:', e.message);
}

const T = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const C = process.env.CHAT_ID || process.env.TELEGRAM_OWNER_CHAT_ID || process.env.TELEGRAM_CHAT_ID;

console.log('BOT_TOKEN present:', T ? 'yes' : 'no');
console.log('CHAT_ID present:', C ? 'yes' : 'no');
if (C) console.log('CHAT_ID last4:', String(C).slice(-4));

if (T) {
  try {
    const r = await fetch('https://api.telegram.org/bot' + T + '/getMe');
    const j = await r.json();
    console.log('getMe ok:', j.ok, 'username:', j.result && j.result.username);
  } catch (e) {
    console.log('getMe ERROR:', e.message);
  }
  try {
    const r = await fetch('https://api.telegram.org/bot' + T + '/getWebhookInfo');
    const j = await r.json();
    console.log('webhook url set:', j.result && j.result.url ? 'YES (' + (j.result.url.length) + ' chars)' : 'NONE');
    console.log('webhook pending_update_count:', j.result && j.result.pending_update_count);
  } catch (e) {
    console.log('webhookInfo ERROR:', e.message);
  }
}

// Check current bot processes
try {
  const { execSync } = await import('node:child_process');
  const out = execSync('wmic process where "name=\'node.exe\'" get ProcessId,CommandLine /format:csv', { encoding: 'utf8' });
  const lines = out.split(/\r?\n/).filter(l => /telegram_master_bot|telegram_gateway/i.test(l));
  console.log('--- node procs (filtered) ---');
  for (const l of lines) {
    // Mask any token-like 35+ char hex/digit strings
    const masked = l.replace(/\d{6,}:[A-Za-z0-9_-]{20,}/g, '<BOT_TOKEN_MASKED>');
    console.log(masked.slice(0, 300));
  }
} catch (e) {
  console.log('proc scan err:', e.message);
}

// Check lock + state
const lockPath = 'D:/AI_WORKSPACE/tools/telegram_gateway/state/telegram_master_bot.lock';
const statePath = 'D:/AI_WORKSPACE/tools/telegram_gateway/state/telegram_gateway_state.json';
console.log('lock exists:', fs.existsSync(lockPath));
if (fs.existsSync(lockPath)) {
  console.log('lock content:', fs.readFileSync(lockPath, 'utf8').slice(0, 300));
}
if (fs.existsSync(statePath)) {
  console.log('state content:', fs.readFileSync(statePath, 'utf8').slice(0, 500));
}
