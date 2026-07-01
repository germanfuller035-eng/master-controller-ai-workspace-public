// Owner-safe probe: getMe + getWebhookInfo via patched IPv4 transport.
// No token / chat_id printed.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { tgCall, TRANSPORT_NAME } from './telegram_api_transport.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load token from .env without printing it
function loadEnv() {
    const candidates = [
        path.resolve(__dirname, '.env'),
        path.resolve(__dirname, '../../.env'),
        path.resolve(__dirname, '../.env'),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) {
            const txt = fs.readFileSync(p, 'utf8');
            for (const line of txt.split(/\r?\n/)) {
                const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
                if (m) {
                    let v = m[2];
                    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
                        v = v.slice(1, -1);
                    }
                    if (!process.env[m[1]]) process.env[m[1]] = v;
                }
            }
        }
    }
}
loadEnv();

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || '';
if (!TOKEN) {
    console.log(JSON.stringify({ ok: false, error: 'NO_TOKEN_PRESENT' }));
    process.exit(1);
}

(async () => {
    const out = { transport: TRANSPORT_NAME, getMe: null, getWebhookInfo: null };
    try {
        const me = await tgCall(TOKEN, 'getMe', {});
        out.getMe = {
            ok: !!me?.ok,
            id_present: !!me?.result?.id,
            username: me?.result?.username || null,
            is_bot: !!me?.result?.is_bot,
        };
    } catch (e) {
        out.getMe = { ok: false, error: String(e && e.message || e) };
    }
    try {
        const wh = await tgCall(TOKEN, 'getWebhookInfo', {});
        out.getWebhookInfo = {
            ok: !!wh?.ok,
            url_set: !!(wh?.result?.url && wh.result.url.length > 0),
            pending_update_count: wh?.result?.pending_update_count ?? null,
            last_error_message: wh?.result?.last_error_message || null,
        };
    } catch (e) {
        out.getWebhookInfo = { ok: false, error: String(e && e.message || e) };
    }
    console.log(JSON.stringify(out, null, 2));
})();
