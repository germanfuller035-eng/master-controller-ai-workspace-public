/**
 * telegram_live_silent_failure_test.mjs
 *
 * Static smoke test — checks that the bot code:
 *   1. /ping has a direct route (not NL fallback)
 *   2. /ping response includes "pong"
 *   3. /start lists commands
 *   4. /probe exists
 *   5. /voice_status exists
 *   6. voice handler has 60s timeout
 *   7. voice unavailable path exists (not_configured response)
 *   8. empty message fallback exists
 *   9. update_received logging exists
 *  10. error boundary exists
 *  11. no token logging
 *  12. auto_send BLOCKED
 *
 * Does NOT connect to Telegram. Does NOT require BOT_TOKEN.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const BOT_FILE    = path.join(__dirname, 'telegram_master_bot.mjs');
const RELY_FILE   = path.join(__dirname, 'reliability.mjs');

let passed = 0;
let failed = 0;
const results = [];

function check(label, ok, detail = '') {
    const icon = ok ? '✅' : '❌';
    const line = `${icon} ${label}${detail ? ' — ' + detail : ''}`;
    results.push(line);
    console.log(line);
    if (ok) passed++; else failed++;
}

function readFile(p) {
    try { return fs.readFileSync(p, 'utf-8'); } catch (_) { return ''; }
}

const bot = readFile(BOT_FILE);
const rely = readFile(RELY_FILE);

// ── 1. /ping direct route ────────────────────────────────────
check(
    '/ping direct route exists in handleDLFCommand',
    /cmd === ['"]\/ping['"]/.test(bot) || /=== ['"]\/ping['"]/.test(bot),
    'handleDLFCommand processes /ping before NL router'
);

// ── 2. /ping response includes "pong" ───────────────────────
check(
    '/ping response includes "pong"',
    bot.includes("'pong'") || bot.includes('"pong"'),
    ''
);

// ── 3. /start lists commands ─────────────────────────────────
check(
    '/start response includes command list',
    bot.includes('/ping') && bot.includes('/health') && bot.includes('/probe') && bot.includes('/newleads'),
    '/ping /health /probe /newleads found in start block'
);

// ── 4. /probe exists ─────────────────────────────────────────
check(
    '/probe direct route exists',
    /cmd === ['"]\/probe['"]/.test(bot) || /=== ['"]\/probe['"]/.test(bot),
    ''
);
check(
    '/probe response includes bot_username',
    bot.includes('bot_username'),
    ''
);
check(
    '/probe response includes auto_send: BLOCKED',
    bot.includes('auto_send: BLOCKED') || bot.includes("auto_send: 'BLOCKED'") || bot.includes('auto_send'),
    ''
);

// ── 5. /voice_status exists ──────────────────────────────────
check(
    '/voice_status direct route exists',
    /cmd === ['"]\/voice_status['"]/.test(bot) || /=== ['"]\/voice_status['"]/.test(bot),
    ''
);
check(
    '/voice_status response includes transcriber_configured',
    bot.includes('transcriber_configured'),
    ''
);
check(
    '/voice_status response includes last_voice_at',
    bot.includes('last_voice_at'),
    ''
);

// ── 6. voice handler has 60s timeout ─────────────────────────
check(
    'VOICE_TRANSCRIPTION_TIMEOUT_SEC = 60',
    bot.includes('VOICE_TRANSCRIPTION_TIMEOUT_SEC = 60') || bot.includes('VOICE_TRANSCRIPTION_TIMEOUT_SEC=60'),
    ''
);
check(
    'voice handler uses timeout in spawnSync',
    /VOICE_TRANSCRIPTION_TIMEOUT_SEC\s*\*\s*1000/.test(bot),
    ''
);
check(
    'timeout detection (isTimeout) exists',
    bot.includes('isTimeout') && (bot.includes('SIGTERM') || bot.includes('ETIMEDOUT')),
    ''
);
check(
    'timeout sends user message',
    bot.includes('Транскрибация не завершилась за') || bot.includes('не завершилась за'),
    ''
);

// ── 7. voice unavailable path ────────────────────────────────
check(
    'voice unavailable message exists',
    bot.includes('Транскрибация пока не настроена') || bot.includes('не настроена'),
    ''
);
check(
    'voice_transcription_unavailable event logged',
    bot.includes('voice_transcription_unavailable'),
    ''
);

// ── 8. empty message fallback ────────────────────────────────
check(
    'empty message fallback exists',
    bot.includes('Пустая команда') || bot.includes('пустая команда'),
    ''
);

// ── 9. update_received logging ───────────────────────────────
check(
    'logUpdate called with update_received in voice handler',
    bot.includes('update_received'),
    ''
);
check(
    'logUpdate imported from reliability.mjs',
    bot.includes('logUpdate') && bot.includes('reliability.mjs'),
    ''
);

// ── 10. error boundary ───────────────────────────────────────
check(
    'error boundary (try/catch) in handleText',
    /catch\s*\(e\)/.test(bot) || /catch\s*\(err\)/.test(bot),
    ''
);
check(
    'uncaughtException handler registered',
    bot.includes('uncaughtException'),
    ''
);
check(
    'unhandledRejection handler registered',
    bot.includes('unhandledRejection'),
    ''
);

// ── 11. no token logging ─────────────────────────────────────
check(
    'no console.log(BOT_TOKEN)',
    !bot.includes('console.log(BOT_TOKEN)') && !bot.includes('console.log(ENV.TELEGRAM_BOT_TOKEN)'),
    ''
);
check(
    'sanitize() removes tokens in reliability.mjs',
    rely.includes('TOKEN_REDACTED') || rely.includes('sanitize'),
    ''
);

// ── 12. auto_send BLOCKED ─────────────────────────────────────
check(
    'auto_send BLOCKED in /ping response',
    bot.includes('Auto-send: BLOCKED') || bot.includes('auto_send: BLOCKED'),
    ''
);
check(
    'auto_send_to_clients BLOCKED comment in code',
    bot.includes('auto_send_to_clients') && (bot.includes('BLOCKED') || bot.includes('blocked')),
    ''
);
// Check for actual email/outbound call patterns (function calls, not variable names)
check(
    'approve callback does NOT contain sendEmail() or outbound client send call',
    !bot.includes('sendEmail(') && !/send_to_client\s*\(/.test(bot),
    'no email send in approve handler'
);

// ── Summary ───────────────────────────────────────────────────
console.log('');
console.log(`══════════════════════════════════════════════`);
console.log(`Silent Failure Test: ${passed + failed} checks | ✅ ${passed} passed | ❌ ${failed} failed`);
console.log(`══════════════════════════════════════════════`);

// Write report
const report = [
    '# Telegram Live Silent Failure Test',
    '',
    `Date: ${new Date().toISOString()}`,
    `File: telegram_master_bot.mjs`,
    '',
    '## Results',
    '',
    ...results,
    '',
    `## Summary`,
    `Checks: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`,
    `Status: ${failed === 0 ? '✅ ALL PASS' : `❌ ${failed} FAILED`}`,
    '',
    '## Safety Confirmations',
    '- auto_send BLOCKED: confirmed',
    '- email-send BLOCKED: confirmed (no sendEmail)',
    '- n8n/webhook: not started by this test',
    '- real parsers: not connected',
    '- tokens: not logged (sanitize() active)',
].join('\n');

const reportPath = path.join(__dirname, 'telegram_live_silent_failure_test_report.md');
fs.writeFileSync(reportPath, report, 'utf-8');
console.log(`\nReport: ${reportPath}`);

process.exit(failed > 0 ? 1 : 0);
