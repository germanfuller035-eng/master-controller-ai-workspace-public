#!/usr/bin/env node
/**
 * telegram_api_diagnostics.mjs
 * Checks Telegram Bot API state: getMe, getWebhookInfo.
 * Does NOT log the token. Does NOT start polling. Read-only by default.
 *
 * Usage:
 *   node telegram_api_diagnostics.mjs                  — report only
 *   node telegram_api_diagnostics.mjs --delete-webhook — report + deleteWebhook (requires approval)
 */

import https from 'https';
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ---- Load token from env / .env ----
function loadEnv(envPath) {
    if (!fs.existsSync(envPath)) return;
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) process.env[key] = val;
    }
}

loadEnv(path.join(__dirname, '.env'));
loadEnv(path.join(process.cwd(), '.env'));

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
    console.error('[ERROR] TELEGRAM_BOT_TOKEN not found in env or .env');
    console.error('        Create .env with: TELEGRAM_BOT_TOKEN=<your_token>');
    process.exit(1);
}

// ---- HTTP helper (no token in logs) ----
function tgCall(method, params = {}) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(params);
        const options = {
            hostname: 'api.telegram.org',
            path:     `/bot${BOT_TOKEN}/${method}`,
            method:   'POST',
            headers:  {
                'Content-Type':   'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch { resolve({ status: res.statusCode, body: data }); }
            });
        });
        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(new Error('Request timeout')); });
        req.write(body);
        req.end();
    });
}

const deleteWebhookMode = process.argv.includes('--delete-webhook');

// ---- Log file ----
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
const logFile = path.join(logsDir, 'telegram_api_diagnostics.log');

function log(msg) {
    const ts = new Date().toISOString();
    fs.appendFileSync(logFile, `[${ts}] ${msg}\n`);
    console.log(msg);
}

// ---- Main ----
console.log('');
console.log('============================================================');
console.log(` TELEGRAM API DIAGNOSTICS  [${new Date().toISOString()}]`);
if (deleteWebhookMode) console.log(' MODE: --delete-webhook');
console.log('============================================================');
console.log('');

// 1. getMe
let botUsername = '(unknown)';
try {
    log('[1/3] Calling getMe...');
    const resp = await tgCall('getMe');
    if (resp.status === 200 && resp.body.ok) {
        const bot = resp.body.result;
        botUsername = `@${bot.username}`;
        log(`  Bot username:  ${botUsername}`);
        log(`  Bot ID:        ${bot.id}`);
        log(`  Bot name:      ${bot.first_name}`);
        log(`  getMe:         OK`);
    } else {
        log(`  getMe FAILED — HTTP ${resp.status}`);
        if (resp.body && resp.body.description) {
            log(`  Error: ${resp.body.description}`);
        }
    }
} catch (err) {
    log(`  getMe ERROR: ${err.message}`);
}

console.log('');

// 2. getWebhookInfo
let webhookUrl = null;
let pendingCount = 0;
let lastErrorMsg = null;
let lastErrorDate = null;
let webhookActive = false;

try {
    log('[2/3] Calling getWebhookInfo...');
    const resp = await tgCall('getWebhookInfo');
    if (resp.status === 200 && resp.body.ok) {
        const wh = resp.body.result;
        webhookUrl    = wh.url || '';
        pendingCount  = wh.pending_update_count || 0;
        lastErrorMsg  = wh.last_error_message || null;
        lastErrorDate = wh.last_error_date    || null;

        webhookActive = (webhookUrl && webhookUrl.length > 0);

        log(`  Webhook URL:          ${webhookActive ? webhookUrl : '(not set)'}`);
        log(`  Webhook active:       ${webhookActive ? 'YES ⚠️' : 'NO ✅'}`);
        log(`  pending_update_count: ${pendingCount}`);

        if (lastErrorMsg) {
            const errDate = lastErrorDate
                ? new Date(lastErrorDate * 1000).toISOString()
                : 'unknown date';
            log(`  Last error:           [${errDate}] ${lastErrorMsg}`);
        } else {
            log(`  Last error:           (none)`);
        }

        log(`  getWebhookInfo:       OK`);
    } else {
        log(`  getWebhookInfo FAILED — HTTP ${resp.status}`);
        if (resp.body && resp.body.description) log(`  Error: ${resp.body.description}`);
    }
} catch (err) {
    log(`  getWebhookInfo ERROR: ${err.message}`);
}

console.log('');

// 3. Recommendations
log('[3/3] Analysis:');

if (webhookActive) {
    log('  ⚠️  Webhook активен. Для polling нужно deleteWebhook.');
    log('');
    log('  Чтобы удалить webhook (требует подтверждения Дмитрия):');
    log('    node .\\telegram_api_diagnostics.mjs --delete-webhook');
    log('');
    log('  409 Conflict ПРИЧИНА: активный webhook конфликтует с getUpdates polling.');
} else {
    log('  ✅ Webhook не установлен. Polling должен работать нормально.');
    if (pendingCount > 0) {
        log(`  ℹ️  Есть ${pendingCount} pending updates. Будут получены при следующем polling.`);
    }
}

// 4. deleteWebhook (only if --delete-webhook flag given)
if (deleteWebhookMode) {
    console.log('');
    log('[deleteWebhook] --delete-webhook flag detected. Executing...');

    if (!webhookActive) {
        log('  Webhook уже не установлен. deleteWebhook не нужен.');
    } else {
        try {
            const resp = await tgCall('deleteWebhook', { drop_pending_updates: false });
            if (resp.status === 200 && resp.body.ok) {
                log('  ✅ deleteWebhook: SUCCESS');
                log('  Webhook удалён. drop_pending_updates=false (pending обновления сохранены).');
                log('  Теперь можно запустить бота:');
                log('    powershell -ExecutionPolicy Bypass -File .\\start_master_bot.ps1');
            } else {
                log(`  ❌ deleteWebhook FAILED — HTTP ${resp.status}`);
                if (resp.body && resp.body.description) log(`  Error: ${resp.body.description}`);
            }
        } catch (err) {
            log(`  deleteWebhook ERROR: ${err.message}`);
        }
    }
} else if (webhookActive) {
    // Already shown above
}

console.log('');
console.log('============================================================');
console.log(` Log saved: ${logFile}`);
console.log('============================================================');
console.log('');

// Exit code: 1 if webhook active (signals problem to caller), 0 otherwise
process.exit(webhookActive && !deleteWebhookMode ? 1 : 0);
