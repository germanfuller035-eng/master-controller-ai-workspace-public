/**
 * WATCHDOG — Telegram Gateway
 * Monitors telegram_master_bot.mjs every 30 seconds.
 * Restarts if: not running, heartbeat stale >3min, is_processing stuck >120s.
 * 
 * Run manually:
 *   node "D:\AI_WORKSPACE\tools\telegram_gateway\watchdog_telegram_gateway.mjs"
 */

import fs from 'fs';
import path from 'path';
import { execFile, spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSPACE_DIR = 'D:\\AI_WORKSPACE';
const GATEWAY_DIR = path.join(WORKSPACE_DIR, 'tools', 'telegram_gateway');
const BOT_SCRIPT = path.join(GATEWAY_DIR, 'telegram_master_bot.mjs');
const STATE_FILE = path.join(GATEWAY_DIR, 'state', 'telegram_gateway_state.json');
const LOCK_FILE = path.join(GATEWAY_DIR, 'state', 'telegram_gateway.lock');
const LOG_FILE = path.join(GATEWAY_DIR, 'logs', 'telegram_gateway_log.md');

const CHECK_INTERVAL_MS = 30000; // 30 seconds
const HEARTBEAT_MAX_AGE_MS = 3 * 60 * 1000; // 3 minutes
const PROCESSING_MAX_AGE_MS = 120 * 1000; // 120 seconds

let restartCount = 0;
let lastRestartTime = 0;
const MIN_RESTART_INTERVAL_MS = 15000; // minimum 15s between restarts

function log(msg) {
    const ts = new Date().toISOString();
    console.log(`[WATCHDOG] ${ts} ${msg}`);
    try {
        fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
        if (!fs.existsSync(LOG_FILE)) {
            fs.writeFileSync(LOG_FILE, '# TELEGRAM_GATEWAY_LOG\n\n| Date | User ID | Command | Result | Notes |\n|---|---|---|---|---|\n', 'utf-8');
        }
        const safeMsg = msg.replace(/[|\n\r]/g, ' ').slice(0, 200);
        fs.appendFileSync(LOG_FILE, `| ${ts} | WATCHDOG | watch | Info | ${safeMsg} |\n`, 'utf-8');
    } catch (_) {}
}

function readState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
        }
    } catch (_) {}
    return null;
}

function writeStateField(field, value) {
    try {
        const state = readState() || {};
        state[field] = value;
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
    } catch (_) {}
}

function isBotRunning(callback) {
    execFile('powershell.exe', [
        '-NoProfile', '-NonInteractive',
        '-Command',
        'Get-CimInstance Win32_Process -Filter "name=\'node.exe\'" | Where-Object { $_.CommandLine -like "*telegram_master_bot.mjs*" } | Select-Object -ExpandProperty ProcessId'
    ], { timeout: 10000 }, (err, stdout) => {
        if (err) {
            callback(false, []);
            return;
        }
        const pids = stdout.trim().split('\n').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
        callback(pids.length > 0, pids);
    });
}

function startBot() {
    const now = Date.now();
    if (now - lastRestartTime < MIN_RESTART_INTERVAL_MS) {
        log('Restart throttled — too soon since last restart.');
        return;
    }

    restartCount++;
    lastRestartTime = now;
    log(`Starting bot (restart #${restartCount})...`);

    // Remove stale lock first
    try {
        if (fs.existsSync(LOCK_FILE)) {
            fs.unlinkSync(LOCK_FILE);
            log('Removed stale lock before restart.');
        }
    } catch (_) {}

    // Reset stuck is_processing
    try {
        const state = readState();
        if (state && state.is_processing) {
            state.is_processing = false;
            state.processing_started_at = null;
            state.last_error = 'Watchdog reset is_processing before restart';
            fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
        }
    } catch (_) {}

    const child = spawn('node', [BOT_SCRIPT], {
        detached: true,
        stdio: 'ignore',
        cwd: WORKSPACE_DIR
    });

    child.unref();
    log(`Bot started. PID: ${child.pid}`);
}

async function check() {
    isBotRunning((running, pids) => {
        if (!running) {
            log('Bot NOT running. Starting...');
            startBot();
            return;
        }

        // Multiple instances
        if (pids.length > 1) {
            log(`WARNING: ${pids.length} bot instances running! PIDs: ${pids.join(', ')}`);
        }

        // Check heartbeat
        const state = readState();
        if (!state) {
            log('State file missing or unreadable.');
            return;
        }

        // Heartbeat staleness
        if (state.heartbeat && state.heartbeat.last_seen) {
            const hbAge = Date.now() - new Date(state.heartbeat.last_seen).getTime();
            if (hbAge > HEARTBEAT_MAX_AGE_MS) {
                log(`Heartbeat stale by ${Math.round(hbAge / 1000)}s (>${HEARTBEAT_MAX_AGE_MS / 1000}s). Restarting...`);
                // Kill existing first
                killPids(pids, () => {
                    setTimeout(() => startBot(), 2000);
                });
                return;
            }
        }

        // is_processing stuck
        if (state.is_processing && state.processing_started_at) {
            const elapsed = Date.now() - new Date(state.processing_started_at).getTime();
            if (elapsed > PROCESSING_MAX_AGE_MS) {
                log(`is_processing stuck for ${Math.round(elapsed / 1000)}s. Resetting state and restarting.`);
                writeStateField('is_processing', false);
                writeStateField('processing_started_at', null);
                writeStateField('last_error', 'Watchdog force-reset: is_processing stuck');
                killPids(pids, () => {
                    setTimeout(() => startBot(), 2000);
                });
                return;
            }
        }

        log(`Bot OK. PID: ${pids[0]}. HB: ${state.heartbeat ? state.heartbeat.last_seen : 'unknown'}`);
    });
}

function killPids(pids, callback) {
    if (!pids || pids.length === 0) {
        callback();
        return;
    }
    const pidStr = pids.join(',');
    execFile('powershell.exe', [
        '-NoProfile', '-NonInteractive',
        '-Command',
        `Stop-Process -Id ${pidStr} -Force -ErrorAction SilentlyContinue`
    ], { timeout: 10000 }, () => {
        log(`Killed PIDs: ${pidStr}`);
        callback();
    });
}

// ============================================================
// MAIN
// ============================================================
log(`Watchdog started. Checking every ${CHECK_INTERVAL_MS / 1000}s.`);
log(`Bot script: ${BOT_SCRIPT}`);

// Run immediately
check();

// Then on interval
setInterval(check, CHECK_INTERVAL_MS);

// Keep process alive
process.on('SIGINT', () => {
    log('Watchdog stopping (SIGINT).');
    process.exit(0);
});

process.on('SIGTERM', () => {
    log('Watchdog stopping (SIGTERM).');
    process.exit(0);
});
