// One-shot runner: send EXACTLY ONE audit_send TOP-1 preview email to Dmitry
// (EMAIL_TEST_TO) using the SAME exported handler the Telegram command uses.
// Safety: owner-forced, recipient forced to EMAIL_TEST_TO, real client recipient
// never used, no client send, no contacted status, no SENT client log, no autosend.
// This script never prints secret values.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleAuditSendPreviewToMe } from './telegram_approved_send_controller.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAIL_KEYS = [
    'YANDEX_MAIL_LOGIN', 'YANDEX_MAIL_APP_PASSWORD', 'EMAIL_TEST_TO',
    'EMAIL_TEST_ONLY', 'EMAIL_REAL_SEND_ENABLED', 'EMAIL_PROVIDER',
    'EMAIL_SMTP_HOST', 'EMAIL_SMTP_PORT', 'EMAIL_SMTP_SECURE',
    'EMAIL_SMTP_USER', 'EMAIL_SMTP_PASS', 'EMAIL_FROM', 'EMAIL_FROM_LABEL',
];

function parseEnvFile(p) {
    const out = {};
    if (!fs.existsSync(p)) return out;
    const raw = fs.readFileSync(p, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const eq = t.indexOf('=');
        if (eq < 0) continue;
        const k = t.slice(0, eq).trim();
        let v = t.slice(eq + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
        }
        out[k] = v;
    }
    return out;
}

const fileValues = {};
Object.assign(fileValues, parseEnvFile(path.join(__dirname, '.env')));
const secretsPath = 'D:\\AI_SECRETS\\01_env\\telegram_gateway.env';
if (fs.existsSync(secretsPath)) Object.assign(fileValues, parseEnvFile(secretsPath));

for (const k of MAIL_KEYS) {
    if (Object.prototype.hasOwnProperty.call(fileValues, k) && String(fileValues[k] ?? '').length > 0) {
        if (!process.env[k]) process.env[k] = fileValues[k];
    }
}

// Presence-only diagnostics (no values printed).
console.log('ENV presence:', MAIL_KEYS.reduce((a, k) => {
    a[k] = process.env[k] ? 'present' : 'missing';
    return a;
}, {}));

const out = await handleAuditSendPreviewToMe('top1', { isOwner: true, env: process.env });
console.log('--- RESULT ---');
console.log('ok:', out.ok);
console.log('code:', out.code);
console.log('recipient:', out.recipient || process.env.EMAIL_TEST_TO || '(none)');
console.log('subject:', out.subject || '(none)');
console.log('real_client_recipient_used:', out.real_client_recipient_used === true ? 'YES' : 'NO');
console.log('--- TELEGRAM TEXT ---');
console.log(out.text);
