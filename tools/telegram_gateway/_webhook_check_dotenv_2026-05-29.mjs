// _webhook_check_dotenv_2026-05-29.mjs
// Dotenv-aware webhook probe (uses verified IPv4 transport).
// - Loads .env identical to telegram_master_bot runtime (gateway .env first, root .env fallback).
// - Calls getWebhookInfo via telegram_api_transport (node_https_ipv4).
// - If webhook is active (non-empty url), calls deleteWebhook (drop_pending_updates=false).
// - NEVER prints token / chat_id.

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    getWebhookInfo,
    deleteWebhook,
    TRANSPORT_NAME,
} from './telegram_api_transport.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const WORKSPACE  = path.resolve(path.join(__dirname, '..', '..'));

function parseEnvFile(filePath) {
    const result = {};
    if (!fs.existsSync(filePath)) return result;
    const raw = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
    for (const line of raw.split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const eq = t.indexOf('=');
        if (eq < 0) continue;
        const key = t.substring(0, eq).trim();
        const val = t.substring(eq + 1).trim().replace(/^["']|["']$/g, '');
        if (key) result[key] = val;
    }
    return result;
}

function loadEnvSafe() {
    const gatewayEnvPath = path.join(__dirname, '.env');
    const rootEnvPath    = path.join(WORKSPACE, '.env');
    let result = parseEnvFile(gatewayEnvPath);
    if (!result.TELEGRAM_BOT_TOKEN) {
        const rootResult = parseEnvFile(rootEnvPath);
        for (const [k, v] of Object.entries(rootResult)) {
            if (!(k in result)) result[k] = v;
        }
    }
    return result;
}

(async () => {
    console.log('[webhook_probe] transport=' + TRANSPORT_NAME);
    const ENV = loadEnvSafe();
    const TOKEN = ENV.TELEGRAM_BOT_TOKEN || '';
    if (!TOKEN) {
        console.error('[webhook_probe] FAIL: TELEGRAM_BOT_TOKEN not found in .env (gateway/root)');
        process.exit(2);
    }
    console.log('[webhook_probe] token loaded (hidden)');

    let infoRes;
    try {
        infoRes = await getWebhookInfo(TOKEN);
    } catch (e) {
        console.error('[webhook_probe] getWebhookInfo threw:', e?.message || String(e));
        process.exit(3);
    }

    if (!infoRes || infoRes.ok === false) {
        console.error('[webhook_probe] getWebhookInfo FAIL:', infoRes && infoRes.error ? infoRes.error : 'unknown');
        process.exit(4);
    }

    const wh = infoRes.result || {};
    const url = (wh.url || '').trim();
    const pending = wh.pending_update_count;
    const lastErr = wh.last_error_message ? String(wh.last_error_message).slice(0, 120) : '';
    console.log('[webhook_probe] webhook.url_present=' + (url ? 'YES' : 'NO'));
    console.log('[webhook_probe] pending_update_count=' + (pending ?? 'n/a'));
    if (lastErr) console.log('[webhook_probe] last_error_message=' + lastErr);

    if (!url) {
        console.log('[webhook_probe] OK: webhook is not set — polling is safe.');
        console.log('[webhook_probe] RESULT: webhook=none deleteWebhook=skipped');
        process.exit(0);
    }

    console.log('[webhook_probe] webhook ACTIVE — calling deleteWebhook (drop_pending_updates=false)');
    let delRes;
    try {
        delRes = await deleteWebhook(TOKEN);
    } catch (e) {
        console.error('[webhook_probe] deleteWebhook threw:', e?.message || String(e));
        process.exit(5);
    }
    if (!delRes || delRes.ok === false) {
        console.error('[webhook_probe] deleteWebhook FAIL:', delRes && delRes.error ? delRes.error : 'unknown');
        console.log('[webhook_probe] RESULT: webhook=present deleteWebhook=failed');
        process.exit(6);
    }
    console.log('[webhook_probe] deleteWebhook OK — polling cleared.');
    console.log('[webhook_probe] RESULT: webhook=present deleteWebhook=ok');
    process.exit(0);
})().catch(e => {
    console.error('[webhook_probe] FATAL', e?.message || String(e));
    process.exit(99);
});
