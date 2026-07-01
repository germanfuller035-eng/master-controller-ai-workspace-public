/**
 * telegram_gateway_healthcheck.mjs
 * Checks env files, token presence, allowed users — NO token values logged.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const WORKSPACE  = 'D:\\AI_WORKSPACE';

const GW_ENV_PATH   = path.join(__dirname, '.env');
const ROOT_ENV_PATH = path.join(WORKSPACE, '.env');

// ============================================================
// Robust .env parser — BOM-safe, CRLF-safe, first-'='-split
// ============================================================
function parseEnvFile(filePath) {
    const result = {};
    if (!fs.existsSync(filePath)) return result;
    const raw   = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const eq = t.indexOf('=');
        if (eq < 0) continue;
        const key = t.substring(0, eq).trim();
        const val = t.substring(eq + 1).trim().replace(/^["']|["']$/g, '');
        if (!key) continue;
        result[key] = val;
    }
    return result;
}

// ============================================================
// Main health check
// ============================================================
function runHealthcheck() {
    const gwExists   = fs.existsSync(GW_ENV_PATH);
    const rootExists = fs.existsSync(ROOT_ENV_PATH);

    const gwEnv   = gwExists   ? parseEnvFile(GW_ENV_PATH)   : {};
    const rootEnv = rootExists ? parseEnvFile(ROOT_ENV_PATH) : {};

    // Determine effective token source
    let tokenVal        = '';
    let tokenSource     = 'none';
    let effectiveSource = 'none';

    if (gwEnv.TELEGRAM_BOT_TOKEN) {
        tokenVal    = gwEnv.TELEGRAM_BOT_TOKEN;
        tokenSource = GW_ENV_PATH;
        effectiveSource = 'gateway .env';
    } else if (rootEnv.TELEGRAM_BOT_TOKEN) {
        tokenVal    = rootEnv.TELEGRAM_BOT_TOKEN;
        tokenSource = ROOT_ENV_PATH;
        effectiveSource = 'root .env (fallback)';
    }

    // Token checks — length only, no value
    const tokenPresent     = tokenVal.length > 0;
    const tokenLen         = tokenVal.length;
    const tokenLenOk       = tokenLen > 20;
    const tokenPlaceholder = (
        tokenVal === 'your_token_here' ||
        tokenVal === 'placeholder'     ||
        tokenVal.startsWith('YOUR_')   ||
        tokenLen < 20
    );

    // Allowed users
    const usersVal     = gwEnv.ALLOWED_TELEGRAM_USER_IDS || rootEnv.ALLOWED_TELEGRAM_USER_IDS || '';
    const usersPresent = usersVal.length > 0;

    // ---- Summary checks for color rating ----
    const checks = {
        gwEnvExists       : gwExists,
        rootEnvExists     : rootExists,
        tokenPresent      : tokenPresent,
        tokenLenOk        : tokenLenOk,
        tokenNotPlaceholder: !tokenPlaceholder,
        usersPresent      : usersPresent,
    };

    // Overall: Green = all ok; Yellow = token ok but users missing or only fallback;
    //          Red   = token missing / placeholder / len<20
    let overall = 'Green';
    if (!tokenPresent || !tokenLenOk || tokenPlaceholder) {
        overall = 'Red';
    } else if (!usersPresent || effectiveSource === 'root .env (fallback)') {
        overall = 'Yellow';
    }

    // ---- Print report (NO token values) ----
    console.log('');
    console.log('TELEGRAM GATEWAY HEALTHCHECK');
    console.log('');
    console.log('Env:');
    console.log(`  gateway .env:              ${gwExists   ? 'exists'  : 'missing'}  (${GW_ENV_PATH})`);
    console.log(`  root .env:                 ${rootExists ? 'exists'  : 'missing'}  (${ROOT_ENV_PATH})`);
    console.log(`  TELEGRAM_BOT_TOKEN:        ${tokenPresent ? 'present' : 'missing'}, length=${tokenLen}, placeholder=${tokenPlaceholder}`);
    console.log(`  ALLOWED_TELEGRAM_USER_IDS: ${usersPresent ? 'present' : 'missing'}`);
    console.log(`  effective env source:      ${effectiveSource}`);
    console.log('');
    console.log('Checks:');
    for (const [k, v] of Object.entries(checks)) {
        console.log(`  ${v ? '✅' : '❌'} ${k}: ${v}`);
    }
    console.log('');
    console.log(`Overall: ${overall}`);
    console.log('');

    if (overall === 'Red') {
        console.error('ERROR: Token missing or invalid. Bot cannot start.');
        process.exit(2);
    } else if (overall === 'Yellow') {
        console.warn('WARNING: Token OK but some settings are non-ideal (check above).');
        process.exit(0);
    } else {
        console.log('All checks passed. Gateway is ready.');
        process.exit(0);
    }
}

runHealthcheck();
