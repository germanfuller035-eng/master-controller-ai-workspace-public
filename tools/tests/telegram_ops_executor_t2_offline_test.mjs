/**
 * telegram_ops_executor_t2_offline_test.mjs — T2 offline safety test
 *
 * Pure offline. Does NOT run PowerShell, does NOT use the Telegram API, does NOT
 * read tokens / .env / AI_SECRETS, does NOT write any queue. It only imports the
 * executor module and asserts intent classification, whitelist safety, owner-gate
 * presence in the bot, and that critical/frozen routes are NOT intercepted.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    OPS_WHITELIST,
    OPS_TIMEOUT_MS,
    OPS_MAX_OUTPUT,
    validateWhitelist,
    classifyOpsCommand,
    truncateOutput,
} from '../telegram_gateway/telegram_ops_executor.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOT_PATH = path.join(__dirname, '..', 'telegram_gateway', 'telegram_master_bot.mjs');
const EXEC_PATH = path.join(__dirname, '..', 'telegram_gateway', 'telegram_ops_executor.mjs');

let pass = 0, fail = 0;
const fails = [];
function check(name, cond) {
    if (cond) { pass++; }
    else { fail++; fails.push(name); }
    console.log(`${cond ? '✅' : '❌'} ${name}`);
}

// ── 1. Whitelist contains ONLY status/watchdog/regression ────────────────────
const wl = validateWhitelist();
check('whitelist validates ok', wl.ok === true);
check('whitelist keys = [regression, status, watchdog]',
    JSON.stringify(Object.keys(OPS_WHITELIST).sort()) === JSON.stringify(['regression', 'status', 'watchdog']));

// ── 2. No restart/start/stop/import/send/client/autosend in whitelist ────────
const forbidden = ['restart', 'start', 'stop', 'import', 'send', 'client', 'autosend'];
const wlKeys = Object.keys(OPS_WHITELIST);
check('no forbidden actions in whitelist', forbidden.every(f => !wlKeys.includes(f)));
// And the underlying script args must be read-only verbs only.
const psArgs = Object.values(OPS_WHITELIST).map(s => s.psArg);
check('ps args are read-only (status/check/run only)',
    psArgs.every(a => ['status', 'check', 'run'].includes(a)));

// ── 3. Intent recognition ────────────────────────────────────────────────────
check('/ops → menu', classifyOpsCommand('/ops') === 'menu');
check('/ops_status → status', classifyOpsCommand('/ops_status') === 'status');
check('/ops_watchdog → watchdog', classifyOpsCommand('/ops_watchdog') === 'watchdog');
check('/ops_regression → regression', classifyOpsCommand('/ops_regression') === 'regression');
check('/r4 → regression', classifyOpsCommand('/r4') === 'regression');
check('"статус системы" → status', classifyOpsCommand('статус системы') === 'status');
check('"проверь watchdog" → watchdog', classifyOpsCommand('проверь watchdog') === 'watchdog');
check('"watchdog" → watchdog', classifyOpsCommand('watchdog') === 'watchdog');
check('"проверь систему" → regression', classifyOpsCommand('проверь систему') === 'regression');
check('"регрессия" → regression', classifyOpsCommand('регрессия') === 'regression');
check('"r4" → regression', classifyOpsCommand('r4') === 'regression');
check('"всё зелёное" → regression', classifyOpsCommand('всё зелёное') === 'regression');
check('"проверка" → regression', classifyOpsCommand('проверка') === 'regression');
check('"🧪 Проверка" button → regression', classifyOpsCommand('🧪 Проверка') === 'regression');

// ── 4. Critical/public/frozen routes NOT intercepted ─────────────────────────
check('/ping NOT intercepted', classifyOpsCommand('/ping') === null);
check('/health NOT intercepted', classifyOpsCommand('/health') === null);
check('/today NOT intercepted', classifyOpsCommand('/today') === null);
check('/lead_import_prepare NOT intercepted (D3C frozen)',
    classifyOpsCommand('/lead_import_prepare ACME corp') === null);
check('arbitrary text NOT intercepted', classifyOpsCommand('привет как дела') === null);
check('arbitrary shell-like command NOT intercepted',
    classifyOpsCommand('rm -rf / ; powershell evil') === null);
check('empty NOT intercepted', classifyOpsCommand('') === null);
check('null NOT intercepted', classifyOpsCommand(null) === null);

// ── 5. Timeout & truncation configured ───────────────────────────────────────
check('timeout configured (30s)', OPS_TIMEOUT_MS === 30000);
check('max output configured (3500)', OPS_MAX_OUTPUT === 3500);
const longStr = 'x'.repeat(5000);
const truncated = truncateOutput(longStr);
check('output truncation enforced (<= max)', truncated.length <= OPS_MAX_OUTPUT);
check('output truncation adds marker', /output truncated/.test(truncated));

// ── 6. Bot integration: owner gate + safe wiring (static source checks) ──────
const botSrc = fs.readFileSync(BOT_PATH, 'utf-8');
check('bot imports telegram_ops_executor', /telegram_ops_executor\.mjs/.test(botSrc));
check('bot uses isOwnerSender for T2 ops', /_t2IsOwner\s*=\s*isOwnerSender/.test(botSrc));
check('bot refuses non-owner with OWNER_REFUSAL', /_T2_OWNER_REFUSAL/.test(botSrc) && /owner_gate_blocked/.test(botSrc));
check('bot routes T2 before T1 hotkey menu', botSrc.indexOf('_t2ClassifyOps(originalText)') < botSrc.indexOf('handleHotkeyMenu(text)'));
check('bot does NOT unfreeze D3C (freeze block intact)', /D3C SAFETY FREEZE/.test(botSrc) && /d3c_safety_freeze_blocked/.test(botSrc));

// ── 7. Executor module safety: no Telegram API / no token read / no queue write ─
const execSrc = fs.readFileSync(EXEC_PATH, 'utf-8');
check('executor does NOT call Telegram API (no api.telegram.org)', !/api\.telegram\.org/.test(execSrc));
check('executor does NOT read .env', !/\.env\b/.test(execSrc.replace(/NOT read \.env|\/\/.*$/gm, '')));
check('executor does NOT reference AI_SECRETS', !/AI_SECRETS/.test(execSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')));
check('executor does NOT read process tokens', !/TELEGRAM_BOT_TOKEN|readFileSync/.test(execSrc));
check('executor has no queue write (no writeFileSync)', !/writeFileSync|appendFileSync/.test(execSrc));
check('executor spawns powershell with fixed argv (no user interpolation)',
    /spawn\('powershell'/.test(execSrc) && /spec\.psArg/.test(execSrc) && !/\$\{.*text.*\}/.test(execSrc));

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\nT2 offline test: ${pass} passed, ${fail} failed`);
if (fail > 0) {
    console.log('FAILED:', fails.join(', '));
    process.exit(1);
}
console.log('ALL T2 OFFLINE TESTS PASSED ✅');
process.exit(0);
