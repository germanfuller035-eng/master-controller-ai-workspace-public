/**
 * telegram_api_transport.mjs — Safe Telegram API transport (Node built-in https, IPv4 only)
 *
 * Created: 2026-05-29
 * Purpose: replace problematic `fetch`/default-resolver path. Forces IPv4 via
 *          dns.lookup({family:4}) + https.request({family:4}).
 *
 * Safety:
 *  - Never logs BOT_TOKEN.
 *  - Never logs full chat_id (last 4 only).
 *  - Logs only: method, ok, status/error, latency(ms).
 *  - Hard timeout (default 35s — long enough for getUpdates long-poll).
 *  - JSON.parse safe.
 */

import https from 'node:https';
import dns from 'node:dns';
import tls from 'node:tls';

const HOST = 'api.telegram.org';

// Force IPv4 lookup at the agent / request level.
function ipv4Lookup(hostname, _opts, cb) {
    return dns.lookup(hostname, { family: 4 }, cb);
}

const ipv4Agent = new https.Agent({
    keepAlive: true,
    family: 4,
    lookup: ipv4Lookup,
});

function safeChatLast4(chatId) {
    const s = chatId == null ? '' : String(chatId);
    return s.slice(-4);
}

function safeLog(line) {
    // single-line, no secrets
    try { console.log(`[tg_transport] ${line}`); } catch (_) {}
}

function parseSocksProxy(raw) {
    if (!raw) return null;
    try {
        const value = String(raw).trim();
        const u = new URL(value.includes('://') ? value : `socks5://${value}`);
        if (!/^socks5h?:$/.test(u.protocol)) return null;
        return {
            host: u.hostname,
            port: Number(u.port || 1080),
            type: 5,
            userId: u.username ? decodeURIComponent(u.username) : undefined,
            password: u.password ? decodeURIComponent(u.password) : undefined,
        };
    } catch {
        return null;
    }
}

async function tgCallViaSocks(token, method, payload, timeoutMs, started, proxy) {
    try {
        const { SocksClient } = await import('socks');
        const { socket } = await SocksClient.createConnection({
            proxy,
            command: 'connect',
            destination: { host: HOST, port: 443 },
            timeout: timeoutMs,
        });
        return await new Promise((resolve) => {
            const chunks = [];
            const secureSocket = tls.connect({ socket, servername: HOST }, () => {
                const req = [
                    `POST /bot${token}/${method} HTTP/1.1`,
                    `Host: ${HOST}`,
                    'Content-Type: application/json',
                    `Content-Length: ${payload.length}`,
                    'User-Agent: AI_WORKSPACE/telegram_api_transport_2026-05-29',
                    'Accept: application/json',
                    'Connection: close',
                    '',
                    '',
                ].join('\r\n');
                secureSocket.write(req);
                secureSocket.write(payload);
            });
            const finish = (out) => {
                try { secureSocket.destroy(); } catch (_) {}
                resolve(out);
            };
            secureSocket.setTimeout(timeoutMs, () => {
                const latency = Date.now() - started;
                safeLog(`method=${method} ok=false error=timeout latency=${latency}ms`);
                finish({ ok: false, error: 'timeout', latency_ms: latency });
            });
            secureSocket.on('data', (c) => chunks.push(c));
            secureSocket.on('end', () => {
                const latency = Date.now() - started;
                const raw = Buffer.concat(chunks).toString('utf8');
                const sep = raw.indexOf('\r\n\r\n');
                const head = sep >= 0 ? raw.slice(0, sep) : '';
                const body = sep >= 0 ? raw.slice(sep + 4) : raw;
                const status = Number((/^HTTP\/\S+\s+(\d+)/.exec(head) || [])[1] || 0);
                let parsed = null;
                try { parsed = JSON.parse(body); } catch (_) {}
                if (parsed) {
                    safeLog(`method=${method} ok=${!!parsed.ok} status=${status || '-'} latency=${latency}ms`);
                    return finish({ ...parsed, status, latency_ms: latency });
                }
                safeLog(`method=${method} ok=false status=${status || '-'} error=non_json latency=${latency}ms`);
                finish({ ok: false, error: 'non_json_response', status, latency_ms: latency });
            });
            secureSocket.on('error', (err) => {
                const latency = Date.now() - started;
                const msg = (err && err.message) ? err.message : String(err);
                safeLog(`method=${method} ok=false error=${msg.substring(0, 80)} latency=${latency}ms`);
                finish({ ok: false, error: msg, latency_ms: latency });
            });
        });
    } catch (err) {
        const latency = Date.now() - started;
        const msg = (err && err.message) ? err.message : String(err);
        safeLog(`method=${method} ok=false error=${msg.substring(0, 80)} latency=${latency}ms`);
        return { ok: false, error: msg, latency_ms: latency };
    }
}

/**
 * Low-level HTTPS POST to Telegram Bot API with IPv4 forced.
 * @param {string} token BOT_TOKEN (never logged)
 * @param {string} method e.g. 'getMe', 'sendMessage'
 * @param {object} body JSON body
 * @param {object} [opts] { timeoutMs }
 * @returns {Promise<{ok:boolean,result?:any,description?:string,error?:string,status?:number,latency_ms:number}>}
 */
export function tgCall(token, method, body = {}, opts = {}) {
    const timeoutMs = opts.timeoutMs || (method === 'getUpdates' ? 35000 : 15000);
    const started = Date.now();
    const socksProxy = parseSocksProxy(opts.socksProxy || process.env.TELEGRAM_SOCKS_PROXY);

    return new Promise((resolve) => {
        if (!token) {
            const latency = Date.now() - started;
            safeLog(`method=${method} ok=false error=no_token latency=${latency}ms`);
            return resolve({ ok: false, error: 'no_token', latency_ms: latency });
        }

        let payload;
        try {
            payload = Buffer.from(JSON.stringify(body || {}), 'utf-8');
        } catch (e) {
            const latency = Date.now() - started;
            safeLog(`method=${method} ok=false error=body_serialize latency=${latency}ms`);
            return resolve({ ok: false, error: 'body_serialize_failed', latency_ms: latency });
        }

        if (socksProxy) {
            return tgCallViaSocks(token, method, payload, timeoutMs, started, socksProxy).then(resolve);
        }

        const requestOptions = {
            hostname: HOST,
            port: 443,
            path: `/bot${token}/${method}`,
            method: 'POST',
            family: 4,
            lookup: ipv4Lookup,
            agent: ipv4Agent,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': payload.length,
                'User-Agent': 'AI_WORKSPACE/telegram_api_transport_2026-05-29',
                'Accept': 'application/json',
            },
            timeout: timeoutMs,
        };

        const req = https.request(requestOptions, (res) => {
            let chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const latency = Date.now() - started;
                const raw = Buffer.concat(chunks).toString('utf-8');
                let parsed = null;
                try { parsed = JSON.parse(raw); } catch (_) {}
                if (parsed) {
                    safeLog(`method=${method} ok=${!!parsed.ok} status=${res.statusCode} latency=${latency}ms`);
                    return resolve({ ...parsed, status: res.statusCode, latency_ms: latency });
                }
                safeLog(`method=${method} ok=false status=${res.statusCode} error=non_json latency=${latency}ms`);
                resolve({ ok: false, error: 'non_json_response', status: res.statusCode, latency_ms: latency });
            });
        });

        req.on('timeout', () => {
            try { req.destroy(new Error('timeout')); } catch (_) {}
        });

        req.on('error', (err) => {
            const latency = Date.now() - started;
            const msg = (err && err.message) ? err.message : String(err);
            safeLog(`method=${method} ok=false error=${msg.substring(0, 80)} latency=${latency}ms`);
            resolve({ ok: false, error: msg, latency_ms: latency });
        });

        req.write(payload);
        req.end();
    });
}

// Convenience wrappers (no token printed anywhere)
export const getMe            = (token)        => tgCall(token, 'getMe', {}, { timeoutMs: 10000 });
export const getWebhookInfo   = (token)        => tgCall(token, 'getWebhookInfo', {}, { timeoutMs: 10000 });
export const deleteWebhook    = (token)        => tgCall(token, 'deleteWebhook', { drop_pending_updates: false }, { timeoutMs: 10000 });
export const getUpdates       = (token, body)  => tgCall(token, 'getUpdates', body || {}, { timeoutMs: 35000 });
export const sendMessage      = (token, body, opts = {})  => {
    // Safe log: only last 4 of chat_id, never full message
    const last4 = safeChatLast4(body && body.chat_id);
    return tgCall(token, 'sendMessage', body, { timeoutMs: 15000, ...opts }).then((r) => {
        safeLog(`sendMessage chat_last4=${last4} ok=${!!r.ok} status=${r.status || '-'} latency=${r.latency_ms}ms`);
        return r;
    });
};

export const TRANSPORT_NAME = 'node_https_ipv4';
