// system/system.mjs
// Read-only system status. SMTP presence is reported as a boolean only — never
// the credentials themselves. Telegram token presence is boolean only.
import fs from 'node:fs';
import path from 'node:path';
import { WORKSPACE, STORE_PATH, EMAIL_LEDGER_PATH, SEND_LEDGER_PATH, readEnvFile } from '../shared/config.mjs';
import * as ma from '../mini_audit/service.mjs';
import { statusSnapshot as serverFunnelStatus } from '../server_funnel/service.mjs';

function fileInfo(p) {
    try { const st = fs.statSync(p); return { exists: true, sizeBytes: st.size, modified: st.mtime.toISOString() }; }
    catch { return { exists: false }; }
}

function telegramHeartbeat() {
    try {
        const hb = JSON.parse(fs.readFileSync(path.join(WORKSPACE, 'tools', 'telegram_gateway', 'data', 'bot_heartbeat.json'), 'utf8'));
        return { polling: !!hb.polling, status: hb.status || null, lastBeat: hb.last_heartbeat_at || null };
    } catch { return { polling: null, status: null, lastBeat: null }; }
}

export function getSystemStatus() {
    const rootEnv = readEnvFile(path.join(WORKSPACE, '.env'));
    const smtpConfigured = !!(rootEnv.YANDEX_MAIL_LOGIN || rootEnv.EMAIL_SMTP_USER) && !!(rootEnv.YANDEX_MAIL_APP_PASSWORD || rootEnv.EMAIL_SMTP_PASS);
    let channel = null;
    try { channel = ma.channelReadiness(); } catch { /* ignore */ }
    return {
        api: { status: 'ok' },
        telegramBot: telegramHeartbeat(),
        leadStore: fileInfo(STORE_PATH),
        outboundLedger: fileInfo(SEND_LEDGER_PATH),
        emailLedger: fileInfo(EMAIL_LEDGER_PATH),
        smtpConfigured, // boolean only — no credentials
        serverFunnel: serverFunnelStatus(),
        outboundRouter: channel ? { channels: Object.keys(channel.channels || {}) } : null,
        autosend: 'BLOCKED',
        lastSync: new Date().toISOString(),
    };
}

export function getRecentEvents() {
    // Safe, redacted recent events placeholder (no secrets). Real event stream can
    // be wired to the API log later.
    return [];
}
