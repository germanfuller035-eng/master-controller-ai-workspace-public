/**
 * telegram_ops_executor.mjs — T2 Telegram Read-only Ops Executor
 *
 * Purpose:
 *   Safely run ONLY whitelisted read-only operator checks (status / watchdog /
 *   regression) from Telegram, so Dmitry can drive the gateway through Telegram
 *   instead of manual PowerShell.
 *
 * HARD SAFETY CONTRACT (T2):
 *   - Whitelist ONLY: status | watchdog | regression. No arbitrary user shell.
 *   - NO restart / start / stop of the bot.
 *   - NO import / send / client contact / autosend.
 *   - NO queue write. NO real import. NO scheduled task. NO autorestart.
 *   - Does NOT read .env / AI_SECRETS / tokens.
 *   - Does NOT use the Telegram API (pure local PowerShell exec + structured result).
 *   - Does NOT write to 13_sales/** or any project files.
 *   - 30s timeout per command. Output truncated to 3500 chars for Telegram.
 *
 * This module is intent-recognition + safe local exec ONLY. The bot decides who
 * may call it (owner gate) and how to render replies.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Limits ───────────────────────────────────────────────────────────────────
export const OPS_TIMEOUT_MS = 30_000;        // 30s hard timeout per command
export const OPS_MAX_OUTPUT = 3500;          // max chars sent to Telegram
const TRUNCATE_MARKER = '\n...output truncated';

// ── Whitelist ────────────────────────────────────────────────────────────────
// EXACTLY three read-only actions. Each maps to a fixed PowerShell script call.
// No user-supplied argument is ever interpolated into the command.
const GATEWAY_DIR = __dirname; // tools/telegram_gateway

export const OPS_WHITELIST = Object.freeze({
    status: Object.freeze({
        action: 'status',
        script: 'telegram_gateway.ps1',
        psArg: 'status',
        title: '🧭 Gateway Status',
    }),
    watchdog: Object.freeze({
        action: 'watchdog',
        script: 'watchdog_telegram_gateway.ps1',
        psArg: 'check',
        title: '🩺 Watchdog Check',
    }),
    regression: Object.freeze({
        action: 'regression',
        script: 'regression_telegram_gateway.ps1',
        psArg: 'run',
        title: '🧪 Regression / R4',
    }),
});

// Defensive: actions that must NEVER appear in the whitelist.
const FORBIDDEN_ACTIONS = Object.freeze([
    'restart', 'start', 'stop', 'import', 'send', 'client', 'autosend',
    'lead_import', 'queue', 'reset', 'clean',
]);

/**
 * Validate the whitelist contains only the three allowed read-only actions and
 * none of the forbidden ones. Exposed for the offline test.
 */
export function validateWhitelist() {
    const keys = Object.keys(OPS_WHITELIST).sort();
    const expected = ['regression', 'status', 'watchdog'];
    const onlyExpected = keys.length === expected.length &&
        keys.every((k, i) => k === expected[i]);
    const noForbidden = keys.every(k => !FORBIDDEN_ACTIONS.includes(k));
    return { ok: onlyExpected && noForbidden, keys, expected, noForbidden };
}

// ── Intent recognition (slash + text + button) ───────────────────────────────
// Returns one of: 'status' | 'watchdog' | 'regression' | 'menu' | null
export function classifyOpsCommand(raw) {
    if (raw == null) return null;
    const t = String(raw).trim();
    if (!t) return null;
    const lower = t.toLowerCase();

    // ---- Slash commands (exact token, ignore @botname suffix) ----
    const slashToken = lower.split(/\s+/)[0].replace(/@[\w_]+$/, '');
    switch (slashToken) {
        case '/ops':            return 'menu';
        case '/ops_status':     return 'status';
        case '/ops_watchdog':   return 'watchdog';
        case '/ops_regression': return 'regression';
        case '/r4':             return 'regression';
    }
    // Never intercept these critical/public/frozen routes here.
    if (/^\/(ping|health|today|lead_import_prepare|leadimportprepare)\b/.test(lower)) {
        return null;
    }
    // Any other slash command is NOT an ops command.
    if (slashToken.startsWith('/')) return null;

    // ---- Button label ----
    if (t === '🧪 Проверка' || lower === '🧪 проверка'.toLowerCase()) {
        return 'regression';
    }

    // ---- Free-form text (Russian operator phrases) ----
    // Order matters: watchdog and status phrases are checked before generic
    // regression triggers so "проверь watchdog" → watchdog (not regression).
    const norm = lower.replace(/[!.,?]+$/g, '').trim();

    // watchdog
    if (norm === 'watchdog' ||
        norm === 'проверь watchdog' ||
        norm === 'проверить watchdog' ||
        norm === 'вотчдог' ||
        norm === 'проверь вотчдог') {
        return 'watchdog';
    }

    // status
    if (norm === 'статус системы' ||
        norm === 'статус' && false) { // 'статус' alone reserved for existing routes
        return 'status';
    }
    if (norm === 'статус системы') return 'status';

    // regression (system-wide checks)
    if (norm === 'проверь систему' ||
        norm === 'проверить систему' ||
        norm === 'прогони проверку' ||
        norm === 'прогнать проверку' ||
        norm === 'регрессия' ||
        norm === 'r4' ||
        norm === 'всё зелёное' ||
        norm === 'все зеленое' ||
        norm === 'всё зеленое' ||
        norm === 'все зелёное' ||
        norm === 'проверка') {
        return 'regression';
    }

    return null;
}

// ── Status classification from output ────────────────────────────────────────
// IMPORTANT: An authoritative "OVERALL: <COLOR>" line ALWAYS wins. This prevents
// the old false-RED bug where the summary line "PASS: 33 | WARN: 0 | FAIL: 0"
// (which contains the literal token "FAIL") was misread as RED even though the
// run reported "OVERALL: GREEN".
export function extractStatus(text) {
    if (!text) return 'UNKNOWN';
    const up = String(text).toUpperCase();

    // 1) Authoritative OVERALL marker takes absolute priority.
    const overall = up.match(/OVERALL:\s*(GREEN|YELLOW|RED)\b/);
    if (overall) return overall[1];

    // 2) Fallback heuristics (only when OVERALL is absent).
    if (/\bRED\b|\bFAIL\b/.test(up)) return 'RED';
    if (/\bYELLOW\b|\bWARN\b/.test(up)) return 'YELLOW';
    if (/\bGREEN\b|\bPASS\b/.test(up)) return 'GREEN';
    return 'UNKNOWN';
}

export function extractPassWarnFail(text) {
    if (!text) return null;
    const up = String(text).toUpperCase();

    // OVERALL marker maps directly to a pass/warn/fail result so that the
    // count-summary line ("PASS: 33 | WARN: 0 | FAIL: 0") cannot trigger a
    // false FAIL.
    const overall = up.match(/OVERALL:\s*(GREEN|YELLOW|RED)\b/);
    if (overall) {
        if (overall[1] === 'GREEN') return 'PASS';
        if (overall[1] === 'YELLOW') return 'WARN';
        return 'FAIL';
    }

    if (/\bFAIL\b/.test(up)) return 'FAIL';
    if (/\bWARN\b/.test(up)) return 'WARN';
    if (/\bPASS\b/.test(up)) return 'PASS';
    return null;
}


// ── Output truncation ────────────────────────────────────────────────────────
export function truncateOutput(text, max = OPS_MAX_OUTPUT) {
    const s = text == null ? '' : String(text);
    if (s.length <= max) return s;
    const keep = Math.max(0, max - TRUNCATE_MARKER.length);
    return s.slice(0, keep) + TRUNCATE_MARKER;
}

// ── Safe runner ──────────────────────────────────────────────────────────────
/**
 * Run a single whitelisted ops action via PowerShell. Pure read-only.
 * @param {'status'|'watchdog'|'regression'} action
 * @returns {Promise<{action,ok,exitCode,stdout,stderr,durationMs,status,passWarnFail,timedOut}>}
 */
export async function runOpsAction(action) {
    const spec = OPS_WHITELIST[action];
    if (!spec) {
        return {
            action: String(action),
            ok: false,
            exitCode: null,
            stdout: '',
            stderr: `Action not whitelisted: ${action}`,
            durationMs: 0,
            status: 'RED',
            passWarnFail: null,
            timedOut: false,
        };
    }

    const scriptPath = path.join(GATEWAY_DIR, spec.script);
    // Fixed argv. No user input is ever passed to PowerShell.
    const args = [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', scriptPath,
        spec.psArg,
    ];

    const started = Date.now();
    return await new Promise((resolve) => {
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        let settled = false;

        const child = spawn('powershell', args, {
            cwd: path.resolve(GATEWAY_DIR, '..', '..'), // d:\AI_WORKSPACE
            windowsHide: true,
            // Inherit env is fine: we never read/print tokens; scripts are local.
        });

        const timer = setTimeout(() => {
            timedOut = true;
            try { child.kill(); } catch { /* ignore */ }
        }, OPS_TIMEOUT_MS);

        child.stdout.on('data', d => { stdout += d.toString(); });
        child.stderr.on('data', d => { stderr += d.toString(); });

        const finish = (exitCode) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            const durationMs = Date.now() - started;
            const combined = `${stdout}\n${stderr}`;
            const status = timedOut ? 'RED' : extractStatus(combined);
            resolve({
                action: spec.action,
                ok: !timedOut && exitCode === 0,
                exitCode: timedOut ? null : exitCode,
                stdout: truncateOutput(stdout),
                stderr: truncateOutput(stderr),
                durationMs,
                status: status === 'UNKNOWN' && !timedOut && exitCode === 0 ? 'GREEN' : status,
                passWarnFail: extractPassWarnFail(combined),
                timedOut,
            });
        };

        child.on('error', (err) => {
            stderr += `\nspawn error: ${err.message}`;
            finish(null);
        });
        child.on('close', (code) => finish(code));
    });
}

// ── Telegram reply formatting (text only; bot does the actual send) ──────────
export function formatOpsReply(result) {
    const spec = OPS_WHITELIST[result.action];
    const title = spec ? spec.title : `Ops: ${result.action}`;
    const lines = [title];

    if (result.timedOut) {
        lines.push('Статус: RED (timeout)');
        lines.push('Команда read-only завершилась ошибкой. Никаких write/send/import действий не выполнялось.');
        return truncateOutput(lines.join('\n'));
    }

    if (result.action === 'watchdog' || result.action === 'regression') {
        lines.push(`Статус: ${result.status || 'UNKNOWN'}`);
        if (result.action === 'regression' && result.passWarnFail) {
            lines.push(`Результат: ${result.passWarnFail}`);
        }
    }

    const body = (result.stdout || '').trim();
    if (body) lines.push('', body);

    if (!result.ok) {
        lines.push('', 'Команда read-only завершилась ошибкой. Никаких write/send/import действий не выполнялось.');
    }

    return truncateOutput(lines.join('\n'));
}

export function opsMenuText() {
    return [
        '🧪 Read-only Ops (T2)',
        '',
        'Доступные проверки (только чтение, без import/send/restart):',
        '• /ops_status — 🧭 статус gateway',
        '• /ops_watchdog — 🩺 watchdog check',
        '• /ops_regression или /r4 — 🧪 regression / R4',
        '',
        'Текстом: «статус системы», «проверь watchdog», «проверь систему», «регрессия», «всё зелёное».',
        'Кнопка: 🧪 Проверка → regression.',
    ].join('\n');
}

export const OWNER_REFUSAL = '⛔ Ops-команды доступны только владельцу.';
