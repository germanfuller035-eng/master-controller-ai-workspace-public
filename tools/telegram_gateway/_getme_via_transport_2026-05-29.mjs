// _getme_via_transport_2026-05-29.mjs
// Verify getMe + getWebhookInfo via new IPv4-only built-in https transport.
// NEVER prints token / chat_id / env values.
import fs from 'node:fs';
import path from 'node:path';
import { getMe, getWebhookInfo, deleteWebhook, TRANSPORT_NAME } from './telegram_api_transport.mjs';

const ENV_PATH = path.join(process.cwd(), 'tools', 'telegram_gateway', '.env');
let token = '';
try {
    const txt = fs.readFileSync(ENV_PATH, 'utf8');
    for (const line of txt.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && m[1] === 'TELEGRAM_BOT_TOKEN') {
            token = m[2].replace(/^['"]|['"]$/g, '');
        }
    }
} catch (e) {
    console.log(JSON.stringify({ ok: false, error: 'env_read_failed' }));
    process.exit(2);
}

if (!token) {
    console.log(JSON.stringify({ ok: false, error: 'no_token_in_env', token_printed: 'no' }));
    process.exit(2);
}

const me = await getMe(token);
const safeMe = me.ok && me.result
    ? { ok: true, username: me.result.username, is_bot: me.result.is_bot, latency_ms: me.latency_ms }
    : { ok: false, error: me.description || me.error, status: me.status || null, latency_ms: me.latency_ms };

const wh = await getWebhookInfo(token);
const safeWh = wh.ok && wh.result
    ? {
        ok: true,
        url_present: !!wh.result.url,
        url_host: wh.result.url ? (new URL(wh.result.url)).host : null,
        pending_update_count: wh.result.pending_update_count,
        last_error_date: wh.result.last_error_date || null,
        last_error_message: wh.result.last_error_message || null,
        latency_ms: wh.latency_ms,
    }
    : { ok: false, error: wh.description || wh.error, status: wh.status || null, latency_ms: wh.latency_ms };

let deleteWebhookResult = null;
if (safeWh.ok && safeWh.url_present) {
    const dw = await deleteWebhook(token);
    deleteWebhookResult = dw.ok ? { ok: true, latency_ms: dw.latency_ms } : { ok: false, error: dw.description || dw.error };
}

console.log(JSON.stringify({
    transport: TRANSPORT_NAME,
    token_printed: 'no',
    chat_id_printed: 'no',
    getMe: safeMe,
    getWebhookInfo: safeWh,
    deleteWebhook: deleteWebhookResult,
}, null, 2));
