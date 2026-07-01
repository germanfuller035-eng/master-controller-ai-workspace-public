// _getme_only_via_transport_2026-05-29.mjs
// Strict getMe-only verification via IPv4 transport.
// Approval: APPROVE_GETME_VIA_TRANSPORT_2026-05-29
// HARD rules:
//   - NEVER print BOT_TOKEN, chat_id, or .env content
//   - NO getWebhookInfo / deleteWebhook / sendMessage
//   - NO bot patch / restart
import fs from 'node:fs';
import path from 'node:path';
import { getMe, TRANSPORT_NAME } from './telegram_api_transport.mjs';

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
    console.log(JSON.stringify({ ok: false, error: 'env_read_failed', token_printed: 'no', chat_id_printed: 'no' }));
    process.exit(2);
}

if (!token) {
    console.log(JSON.stringify({ ok: false, error: 'no_token_in_env', token_printed: 'no', chat_id_printed: 'no' }));
    process.exit(2);
}

const me = await getMe(token);

const safeMe = me.ok && me.result
    ? { ok: true, username: me.result.username, is_bot: me.result.is_bot, latency_ms: me.latency_ms }
    : { ok: false, error: me.description || me.error, status: me.status || null, latency_ms: me.latency_ms };

console.log(JSON.stringify({
    transport: TRANSPORT_NAME,
    token_printed: 'no',
    chat_id_printed: 'no',
    webhook_checked: 'no',
    getMe: safeMe,
}, null, 2));
