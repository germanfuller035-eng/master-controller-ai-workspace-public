// =============================================================
// telegram_reliability_smoke_test.mjs
// Reliability Sprint smoke test для Telegram Master Controller.
//
// НЕ ЗАПУСКАЕТ бот, НЕ полит и НЕ дёргает Telegram API.
// Проверяет только статические свойства проекта.
// =============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const BOT_DIR   = __dirname;
const ROOT      = path.resolve(BOT_DIR, '..', '..');
const BOT_FILE  = path.join(BOT_DIR, 'telegram_master_bot.mjs');
const REL_FILE  = path.join(BOT_DIR, 'reliability.mjs');
const LOGS_DIR  = path.join(BOT_DIR, 'logs');
const DATA_DIR  = path.join(BOT_DIR, 'data');
const HB_FILE   = path.join(DATA_DIR, 'bot_heartbeat.json');
const WATCH     = path.join(BOT_DIR, 'watch_master_bot.ps1');
const START_PS1 = path.join(BOT_DIR, 'start_master_bot.ps1');
const STOP_PS1  = path.join(BOT_DIR, 'stop_master_bot.ps1');
const CHECK_PS1 = path.join(BOT_DIR, 'check_master_bot.ps1');

const CONTACT_JSON = path.join(ROOT, 'tools', 'contact_resolution', 'contact_resolution.json');
const CONTACT_HND  = path.join(ROOT, 'tools', 'contact_resolution', 'contact_handler.mjs');

const results = [];
function ok(name, msg)     { results.push({ status: 'OK',   name, msg: msg || '' }); }
function warn(name, msg)   { results.push({ status: 'WARN', name, msg: msg || '' }); }
function fail(name, msg)   { results.push({ status: 'FAIL', name, msg: msg || '' }); }

function exists(p) { try { return fs.existsSync(p); } catch { return false; } }
function read(p)   { return fs.readFileSync(p, 'utf8'); }

// 1. telegram_master_bot.mjs существует
exists(BOT_FILE) ? ok('bot_file_exists', BOT_FILE) : fail('bot_file_exists', BOT_FILE);

// 2. logs папка
if (!exists(LOGS_DIR)) {
    try { fs.mkdirSync(LOGS_DIR, { recursive: true }); ok('logs_dir', 'created'); }
    catch (e) { fail('logs_dir', e.message); }
} else ok('logs_dir', LOGS_DIR);

// 3. data dir (для heartbeat)
if (!exists(DATA_DIR)) {
    try { fs.mkdirSync(DATA_DIR, { recursive: true }); ok('data_dir', 'created'); }
    catch (e) { fail('data_dir', e.message); }
} else ok('data_dir', DATA_DIR);

// 4. reliability module
exists(REL_FILE) ? ok('reliability_module', REL_FILE) : fail('reliability_module', REL_FILE);

// 5. Команды зарегистрированы — проверяем по содержимому файла
const required = ['/ping', '/start', '/status', '/health', '/debug_last',
                  '/today', '/newleads', '/import_status', '/contact', '/keepalive'];
if (exists(BOT_FILE)) {
    const code = read(BOT_FILE);
    for (const cmd of required) {
        if (code.includes(`'${cmd}'`) || code.includes(`"${cmd}"`) || code.includes(`=== '${cmd}'`) || code.includes(cmd.replace('/', '/'))) {
            // simple substring check
            const idx = code.indexOf(cmd);
            if (idx >= 0) ok(`cmd_registered:${cmd}`); else warn(`cmd_registered:${cmd}`, 'not found');
        } else {
            warn(`cmd_registered:${cmd}`, 'substring not found');
        }
    }

    // 6. auto_send_to_clients BLOCKED
    if (/auto_send_to_clients\s*[:=]\s*['"]?BLOCKED/i.test(code) || /AUTO_SEND.*BLOCKED/i.test(code)) {
        ok('auto_send_blocked');
    } else {
        warn('auto_send_blocked', 'flag not detected — verify manually');
    }

    // 7. нет hard-coded TOKEN
    if (/TELEGRAM_BOT_TOKEN\s*=\s*['"][0-9]{5,}:/i.test(code)) {
        fail('no_hardcoded_token', 'hard-coded token detected!');
    } else {
        ok('no_hardcoded_token');
    }

    // 8. нет DLF_WEBHOOK_SECRET hard-coded
    if (/DLF_WEBHOOK_SECRET\s*=\s*['"][A-Za-z0-9]{8,}['"]/.test(code)) {
        fail('no_hardcoded_webhook_secret', 'hard-coded secret detected!');
    } else {
        ok('no_hardcoded_webhook_secret');
    }

    // 9. fallback handler
    if (code.includes('unknown_command') || code.includes('Команда не распознана') || code.includes('?? �������⨪�')) {
        ok('unknown_fallback');
    } else {
        warn('unknown_fallback', 'fallback string not detected');
    }

    // 10. polling_error / uncaughtException
    if (code.includes('polling_error') || code.includes('uncaughtException')) {
        ok('error_handlers_present');
    } else {
        fail('error_handlers_present', 'no polling_error / uncaughtException handlers');
    }

    // 11. heartbeat timer
    if (code.includes('startHeartbeatTimer') || code.includes('bot_heartbeat')) {
        ok('heartbeat_wired');
    } else {
        warn('heartbeat_wired', 'heartbeat timer not detected');
    }

    // 12. contact handler import
    if (code.includes('parseContactIntent') && code.includes('handleContactIntent')) {
        ok('contact_handler_wired');
    } else {
        warn('contact_handler_wired', 'contact handler not wired in bot');
    }
}

// 13. contact_resolution.json существует / создаётся
if (!exists(CONTACT_JSON)) {
    try {
        const stub = {
            GSK: {
                display_name: 'ГСК', email: '2@900-800.ru',
                status: 'confirmed', allowlist_active: true,
                send_allowed: false, approval_required: true
            },
            KGBI: {
                display_name: 'КЖБИ', email: 'kgbi2020@mail.ru',
                status: 'confirmed', allowlist_active: true,
                send_allowed: false, approval_required: true
            }
        };
        fs.mkdirSync(path.dirname(CONTACT_JSON), { recursive: true });
        fs.writeFileSync(CONTACT_JSON, JSON.stringify(stub, null, 2), 'utf8');
        ok('contact_resolution_json', 'created');
    } catch (e) {
        fail('contact_resolution_json', e.message);
    }
} else {
    ok('contact_resolution_json', CONTACT_JSON);
}

// 14. contact handler module
exists(CONTACT_HND) ? ok('contact_handler_module') : warn('contact_handler_module', 'missing');

// 15. watchdog script
exists(WATCH) ? ok('watchdog_script') : fail('watchdog_script', WATCH);

// 16. management scripts
exists(START_PS1) ? ok('start_script') : fail('start_script', START_PS1);
exists(STOP_PS1)  ? ok('stop_script')  : fail('stop_script',  STOP_PS1);
exists(CHECK_PS1) ? ok('check_script') : fail('check_script', CHECK_PS1);

// 17. logs writable
try {
    const probe = path.join(LOGS_DIR, '.probe.tmp');
    fs.writeFileSync(probe, 'probe', 'utf8');
    fs.unlinkSync(probe);
    ok('logs_writable');
} catch (e) {
    fail('logs_writable', e.message);
}

// 18. data writable
try {
    const probe = path.join(DATA_DIR, '.probe.tmp');
    fs.writeFileSync(probe, 'probe', 'utf8');
    fs.unlinkSync(probe);
    ok('data_writable');
} catch (e) {
    fail('data_writable', e.message);
}

// 19. one polling enforced by lock-file convention (cannot verify dynamically here; just confirm the lock-file path is referenced)
if (exists(BOT_FILE) && read(BOT_FILE).includes('.telegram_master_bot.lock')) {
    ok('single_polling_lock_referenced');
} else {
    warn('single_polling_lock_referenced', 'lock file path not referenced in bot code');
}

// ========================
// 409 Conflict protection checks
// ========================
const FIND_POLLERS = path.join(BOT_DIR, 'find_telegram_pollers.ps1');
const DIAG_MJS     = path.join(BOT_DIR, 'telegram_api_diagnostics.mjs');

// 20. find_telegram_pollers.ps1 exists
exists(FIND_POLLERS)
    ? ok('find_telegram_pollers_exists', FIND_POLLERS)
    : fail('find_telegram_pollers_exists', 'missing: ' + FIND_POLLERS);

// 21. telegram_api_diagnostics.mjs exists
exists(DIAG_MJS)
    ? ok('telegram_api_diagnostics_exists', DIAG_MJS)
    : fail('telegram_api_diagnostics_exists', 'missing: ' + DIAG_MJS);

// 22. stop_master_bot.ps1 supports -Deep
if (exists(STOP_PS1)) {
    const stopCode = read(STOP_PS1);
    if (stopCode.includes('-Deep') || stopCode.includes('Deep')) {
        ok('stop_script_supports_deep');
    } else {
        fail('stop_script_supports_deep', 'stop_master_bot.ps1 has no -Deep mode');
    }
} else {
    fail('stop_script_supports_deep', 'stop_master_bot.ps1 missing');
}

// 23. 409 handler exists in bot or reliability module
if (exists(BOT_FILE)) {
    const botCode = read(BOT_FILE);
    const relCode = exists(REL_FILE) ? read(REL_FILE) : '';
    if (botCode.includes('409') || relCode.includes('409')) {
        ok('handler_409_exists');
    } else {
        fail('handler_409_exists', '409 Conflict handler not found in bot or reliability.mjs');
    }
}

// 24. start script checks webhook before polling
if (exists(START_PS1)) {
    const startCode = read(START_PS1);
    if (startCode.includes('webhook') || startCode.includes('telegram_api_diagnostics')) {
        ok('start_checks_webhook');
    } else {
        warn('start_checks_webhook', 'start_master_bot.ps1 does not appear to check webhook state');
    }
} else {
    fail('start_checks_webhook', 'start_master_bot.ps1 missing');
}

// 25. start script checks duplicate pollers before polling
if (exists(START_PS1)) {
    const startCode = read(START_PS1);
    if (startCode.includes('find_telegram_pollers') || startCode.includes('preflight')) {
        ok('start_checks_duplicate_pollers');
    } else {
        warn('start_checks_duplicate_pollers', 'start_master_bot.ps1 does not check for duplicate pollers');
    }
} else {
    fail('start_checks_duplicate_pollers', 'start_master_bot.ps1 missing');
}

// 26. no token logging — ensure token is never console.log'd
if (exists(BOT_FILE)) {
    const botCode = read(BOT_FILE);
    // Check if there's a console.log that outputs the raw token variable
    if (/console\.log\s*\(.*TELEGRAM_BOT_TOKEN/i.test(botCode) ||
        /console\.log\s*\(.*token[^)]*\)/i.test(botCode)) {
        warn('no_token_logging', 'possible token logging detected — review manually');
    } else {
        ok('no_token_logging');
    }
}

// ----- Report -----
const okN   = results.filter(r => r.status === 'OK').length;
const warnN = results.filter(r => r.status === 'WARN').length;
const failN = results.filter(r => r.status === 'FAIL').length;

console.log('========================================');
console.log(' Telegram Reliability Smoke Test');
console.log('========================================');
for (const r of results) {
    const icon = r.status === 'OK' ? '✅' : r.status === 'WARN' ? '⚠️' : '🔴';
    console.log(`${icon} [${r.status}] ${r.name}${r.msg ? '  — ' + r.msg : ''}`);
}
console.log('----------------------------------------');
console.log(`OK: ${okN}   WARN: ${warnN}   FAIL: ${failN}`);
console.log('========================================');

process.exit(failN === 0 ? 0 : 1);
