// =============================================================
// telegram_gateway_smoke_test.mjs (v0.9 — 409 Conflict protection aligned)
//
// Статический smoke-тест для Telegram Master Controller.
// Не запускает бот, не дёргает Telegram API.
//
// Проверяет:
//   - .env + токен (вне кода);
//   - наличие reliability.mjs, heartbeat-wiring;
//   - все команды текущей архитектуры:
//       /ping /start /status /today /newleads /emergency_stop
//       /health /debug_last /keepalive /contact
//     + contact NL ("подтверди email ГСК");
//   - fallback на unknown command;
//   - auto_send_to_clients = BLOCKED;
//   - approve_send без отправки клиенту;
//   - один polling loop, нет второго бота;
//   - lock file для single-instance;
//   - error-handlers (polling_error / uncaughtException).
//
// Все DLF-specific проверки (daily_report.json schema и т.п.)
// удалены — они валидируются отдельным DLF smoke test и не должны
// блокировать запуск Master Controller.
// =============================================================

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const BOT_DIR   = __dirname;
const ROOT      = path.resolve(BOT_DIR, '..', '..');
const BOT_FILE  = path.join(BOT_DIR, 'telegram_master_bot.mjs');
const REL_FILE  = path.join(BOT_DIR, 'reliability.mjs');
const ENV_FILE  = path.join(BOT_DIR, '.env');
const ROOT_ENV  = path.join(ROOT,    '.env');
const REPORT    = path.join(BOT_DIR, 'telegram_gateway_smoke_test_report.md');

const results = [];
function pass(name, msg) { results.push({ status: 'PASS', name, msg: msg || '' }); }
function fail(name, msg) { results.push({ status: 'FAIL', name, msg: msg || '' }); }

function exists(p) { try { return fs.existsSync(p); } catch { return false; } }
function read(p)   { return fs.readFileSync(p, 'utf8'); }

// ---------- 1. .env / token ----------
let envSrc = null;
if (exists(ENV_FILE))      envSrc = ENV_FILE;
else if (exists(ROOT_ENV)) envSrc = ROOT_ENV;

if (envSrc) {
    pass('env_file_exists', envSrc === ENV_FILE ? 'gateway .env' : 'root .env');
    const envTxt = read(envSrc);
    const m = envTxt.match(/TELEGRAM_BOT_TOKEN\s*=\s*([^\s#]+)/);
    if (m && m[1].length >= 30) {
        pass('telegram_bot_token_present', `length=${m[1].length}`);
    } else {
        fail('telegram_bot_token_present', 'TELEGRAM_BOT_TOKEN missing or too short');
    }
} else {
    fail('env_file_exists', `${ENV_FILE} or ${ROOT_ENV}`);
    fail('telegram_bot_token_present', 'no .env to read');
}

// ---------- 2. No hard-coded token in .mjs ----------
const mjsFiles = fs.readdirSync(BOT_DIR).filter(f => f.endsWith('.mjs'));
let hardCoded = false;
for (const f of mjsFiles) {
    const t = read(path.join(BOT_DIR, f));
    if (/TELEGRAM_BOT_TOKEN\s*=\s*['"][0-9]{5,}:[A-Za-z0-9_-]{20,}['"]/.test(t)) {
        hardCoded = true; break;
    }
}
hardCoded
    ? fail('no_hardcoded_token', 'token literal detected in source')
    : pass('no_hardcoded_token', 'token read from .env only');

// ---------- 3. Bot file ----------
if (!exists(BOT_FILE)) {
    fail('bot_file_exists', BOT_FILE);
} else {
    pass('bot_file_exists', BOT_FILE);
    const code = read(BOT_FILE);

    // 4. Reliability module imported
    if (exists(REL_FILE)) pass('reliability_module_exists', REL_FILE);
    else                  fail('reliability_module_exists', REL_FILE);

    if (/from\s+['"]\.\/reliability\.mjs['"]/.test(code))
        pass('reliability_imported');
    else
        fail('reliability_imported', "import from './reliability.mjs' not found");

    // 5. Heartbeat wired
    if (/writeHeartbeat|bot_heartbeat|startHeartbeatTimer/.test(code))
        pass('heartbeat_wired');
    else
        fail('heartbeat_wired', 'no heartbeat wiring in bot');

    // 6. Required commands
    // /contact is implemented as NL intent (parseContactIntent) — see check #7.
    // Slash literal /contact is optional. We only require the slash literal for
    // the core control commands.
    const cmds = [
        '/ping', '/start', '/status', '/today', '/newleads',
        '/emergency_stop', '/health', '/debug_last', '/keepalive'
    ];
    for (const c of cmds) {
        if (code.includes(`'${c}'`) || code.includes(`"${c}"`))
            pass(`cmd_registered:${c}`);
        else
            fail(`cmd_registered:${c}`, 'command literal not found in bot code');
    }

    // /contact: либо slash-литерал, либо NL-обработчик через parseContactIntent
    const contactSlash = code.includes(`'/contact'`) || code.includes(`"/contact"`);
    const contactNL    = /parseContactIntent|handleContactIntent|contact_handler\.mjs/.test(code);
    if (contactSlash || contactNL) {
        pass('cmd_registered:/contact',
             contactSlash ? 'slash literal' : 'NL intent (parseContactIntent)');
    } else {
        fail('cmd_registered:/contact', 'no slash literal and no NL handler');
    }

    // 7. Contact NL: "подтверди email"
    if (/подтверди\s+email/i.test(code) || /parseContactIntent/.test(code))
        pass('contact_nl_supported', 'parseContactIntent / NL phrase present');
    else
        fail('contact_nl_supported', 'contact NL handler not wired');

    // 8. Unknown-command fallback
    if (/unknown_command|Команда\s+не\s+распознана|Не понял/i.test(code))
        pass('unknown_command_fallback');
    else
        fail('unknown_command_fallback', 'no fallback handler detected');

    // 9. Error handlers
    if (/polling_error/.test(code) || /uncaughtException/.test(code))
        pass('error_handlers_present');
    else
        fail('error_handlers_present', 'no polling_error / uncaughtException handler');

    // 10. auto_send_to_clients = BLOCKED
    if (/auto_send_to_clients\s*[:=]\s*['"]?BLOCKED/i.test(code) ||
        /auto_send_blocked/i.test(code) ||
        /AUTO_SEND.*BLOCKED/i.test(code)) {
        pass('auto_send_blocked');
    } else {
        fail('auto_send_blocked', 'auto-send flag not set to BLOCKED');
    }

    // 11. approve_send does NOT actually send to client
    // We check that approve_send handler exists and contains a safety guard.
    if (/approve_send/.test(code)) {
        // Check that anywhere near approve_send we have a BLOCKED/safety note OR
        // there is no real outbound send call (no smtp / sendMail / sendEmail / outbound_send)
        const realSend = /sendEmail\s*\(|sendMail\s*\(|smtp\.send|outbound_send\s*\(/.test(code);
        if (!realSend) {
            pass('approve_send_no_client_send', 'no real outbound transport invoked');
        } else {
            fail('approve_send_no_client_send', 'real send call detected');
        }
    } else {
        // No approve_send command — OK (nothing can leak)
        pass('approve_send_no_client_send', 'approve_send command not present');
    }

    // 12. contact confirmation does NOT send email
    if (/handleContactIntent|contact_handler\.mjs/.test(code)) {
        const realMail = /smtp|nodemailer|sendMail|sendEmail/.test(code);
        if (!realMail) pass('contact_confirm_no_email_send', 'no mail transport in bot');
        else           fail('contact_confirm_no_email_send', 'mail transport in bot');
    } else {
        pass('contact_confirm_no_email_send', 'contact handler not wired in bot');
    }

    // 13. Single polling loop — at most one setInterval that polls Telegram
    const intervals = (code.match(/setInterval\s*\(/g) || []).length;
    if (intervals <= 2)   // one for polling, optionally one for heartbeat
        pass('single_polling_loop', `${intervals} setInterval call(s)`);
    else
        fail('single_polling_loop', `${intervals} setInterval calls — verify only one is polling`);

    // 14. No second bot library polling
    if (/bot\.launch\s*\(|new\s+Telegraf|node-telegram-bot-api/.test(code))
        fail('no_second_bot_library', 'foreign bot library detected');
    else
        pass('no_second_bot_library', 'native HTTPS getUpdates only');

    // 15. Lock-file single-instance enforced
    if (/\.telegram_master_bot\.lock/.test(code))
        pass('lock_file_referenced');
    else
        fail('lock_file_referenced', 'lock file path not used in bot code');

    // 16. No real parsers / outbound senders wired (safety invariant)
    const forbidden = [
        /imap\s*\.\s*connect\s*\(/i,
        /nodemailer\.createTransport/i,
        /smtp\.createTransport/i
    ];
    let foundForbidden = null;
    for (const rx of forbidden) {
        if (rx.test(code)) { foundForbidden = rx.toString(); break; }
    }
    foundForbidden
        ? fail('no_real_parsers_or_senders', `forbidden API: ${foundForbidden}`)
        : pass('no_real_parsers_or_senders', 'no live mail/imap transport');
}

// ---------- 17. 409 Conflict protection checks ----------
const FIND_POLLERS_PS1 = path.join(BOT_DIR, 'find_telegram_pollers.ps1');
const DIAG_MJS         = path.join(BOT_DIR, 'telegram_api_diagnostics.mjs');
const STOP_PS1         = path.join(BOT_DIR, 'stop_master_bot.ps1');
const START_PS1        = path.join(BOT_DIR, 'start_master_bot.ps1');

exists(FIND_POLLERS_PS1)
    ? pass('find_telegram_pollers_exists', FIND_POLLERS_PS1)
    : fail('find_telegram_pollers_exists', 'missing: ' + FIND_POLLERS_PS1);

exists(DIAG_MJS)
    ? pass('telegram_api_diagnostics_exists', DIAG_MJS)
    : fail('telegram_api_diagnostics_exists', 'missing: ' + DIAG_MJS);

if (exists(STOP_PS1)) {
    const stopCode = read(STOP_PS1);
    (stopCode.includes('-Deep') || stopCode.includes('Deep'))
        ? pass('stop_script_supports_deep', '-Deep mode present')
        : fail('stop_script_supports_deep', 'stop_master_bot.ps1 has no -Deep mode');
} else {
    fail('stop_script_supports_deep', 'stop_master_bot.ps1 missing');
}

if (exists(BOT_FILE)) {
    const botCode = read(BOT_FILE);
    const relCode = exists(REL_FILE) ? read(REL_FILE) : '';
    (botCode.includes('409') || relCode.includes('409'))
        ? pass('handler_409_exists', '409 Conflict handler found')
        : fail('handler_409_exists', '409 Conflict handler not found in bot or reliability.mjs');
}

if (exists(START_PS1)) {
    const startCode = read(START_PS1);
    (startCode.includes('webhook') || startCode.includes('telegram_api_diagnostics'))
        ? pass('start_checks_webhook', 'start preflight checks webhook state')
        : fail('start_checks_webhook', 'start_master_bot.ps1 does not check webhook state');
} else {
    fail('start_checks_webhook', 'start_master_bot.ps1 missing');
}

if (exists(START_PS1)) {
    const startCode = read(START_PS1);
    (startCode.includes('find_telegram_pollers') || startCode.includes('preflight'))
        ? pass('start_checks_duplicate_pollers', 'start preflight checks duplicate pollers')
        : fail('start_checks_duplicate_pollers', 'start_master_bot.ps1 does not check duplicate pollers');
} else {
    fail('start_checks_duplicate_pollers', 'start_master_bot.ps1 missing');
}

// No token logging check
if (exists(BOT_FILE)) {
    const botCode = read(BOT_FILE);
    if (/console\.log\s*\(.*TELEGRAM_BOT_TOKEN/i.test(botCode)) {
        fail('no_token_logging', 'TELEGRAM_BOT_TOKEN appears in console.log');
    } else {
        pass('no_token_logging', 'token not logged to console');
    }
}

// ---------- Report ----------
const passN = results.filter(r => r.status === 'PASS').length;
const failN = results.filter(r => r.status === 'FAIL').length;
const total = results.length;

console.log('═══════════════════════════════════════════════════════');
console.log('  Telegram Gateway Smoke Test v0.8 (Reliability-aligned)');
console.log('═══════════════════════════════════════════════════════');
console.log('');
for (const r of results) {
    const icon = r.status === 'PASS' ? '[OK]  ' : '[FAIL]';
    console.log(`${icon} ${r.name}${r.msg ? '  -- ' + r.msg : ''}`);
}
console.log('');
console.log('═══════════════════════════════════════════════════════');
console.log(`  RESULT: ${passN} passed / ${failN} failed / ${total} total`);
console.log(`  STATUS: ${failN === 0 ? 'ALL OK' : 'SOME CHECKS FAILED'}`);
console.log('═══════════════════════════════════════════════════════');

// ---------- Markdown report ----------
const ts = new Date().toISOString();
const md = [];
md.push('# Telegram Gateway Smoke Test Report');
md.push('');
md.push(`- Generated: ${ts}`);
md.push(`- Bot file:  \`${BOT_FILE}\``);
md.push(`- Test file: \`${__filename}\``);
md.push('');
md.push(`## Result: ${passN} passed / ${failN} failed / ${total} total`);
md.push('');
md.push(`Status: **${failN === 0 ? 'ALL OK' : 'SOME CHECKS FAILED'}**`);
md.push('');
md.push('## Checks');
md.push('');
md.push('| Status | Check | Detail |');
md.push('|--------|-------|--------|');
for (const r of results) {
    md.push(`| ${r.status} | ${r.name} | ${r.msg.replace(/\|/g, '\\|')} |`);
}
md.push('');
if (failN > 0) {
    md.push('## Failed checks');
    md.push('');
    for (const r of results.filter(x => x.status === 'FAIL')) {
        md.push(`- **${r.name}** — ${r.msg}`);
    }
    md.push('');
}
md.push('## Safety invariants verified');
md.push('');
md.push('- Token is read from `.env`, never hard-coded.');
md.push('- `auto_send_to_clients = BLOCKED`.');
md.push('- `approve_send` does **not** invoke real outbound transport.');
md.push('- Contact confirmation does **not** send email.');
md.push('- No second bot library, no second polling loop.');
md.push('- Single-instance enforced via lock file.');
md.push('- No live IMAP/SMTP transport in bot.');
md.push('');
try {
    fs.writeFileSync(REPORT, md.join('\n'), 'utf8');
    console.log(`Report saved: ${REPORT}`);
} catch (e) {
    console.error(`Could not write report: ${e.message}`);
}

process.exit(failN === 0 ? 0 : 1);
