// auth/auth.mjs
// Owner-only authentication: one-time pairing codes (10 min, single-use),
// device access/refresh tokens stored only as salted hashes, device revocation.
// The server secret is created in AI_SECRETS on first run and never printed.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {
    DEVICES_PATH, PAIRING_PATH, ensureDirs,
    SECRETS_ENV_DIR, SECRETS_ENV_FILE, readEnvFile,
} from '../shared/config.mjs';

const PAIRING_TTL_MS = 10 * 60 * 1000;
const ACCESS_TTL_MS = 24 * 60 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function readJson(p, fallback) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}
function writeJson(p, obj) {
    ensureDirs();
    const tmp = `${p}.tmp_${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
    fs.renameSync(tmp, p);
}

// --- server secret (AI_SECRETS only) ---
export function ensureServerSecret() {
    let env = readEnvFile(SECRETS_ENV_FILE);
    if (env.MATER_API_SECRET && env.MATER_API_SECRET.length >= 32) return env.MATER_API_SECRET;
    try { fs.mkdirSync(SECRETS_ENV_DIR, { recursive: true }); } catch { /* ignore */ }
    const secret = crypto.randomBytes(48).toString('base64url');
    const lines = [];
    const existing = fs.existsSync(SECRETS_ENV_FILE) ? fs.readFileSync(SECRETS_ENV_FILE, 'utf8') : '';
    if (existing && !/MATER_API_SECRET=/.test(existing)) lines.push(existing.trimEnd());
    lines.push(`MATER_API_SECRET=${secret}`);
    fs.writeFileSync(SECRETS_ENV_FILE, lines.join('\n') + '\n', 'utf8');
    return secret;
}

function hmac(value) {
    const secret = ensureServerSecret();
    return crypto.createHmac('sha256', secret).update(String(value)).digest('hex');
}

// --- pairing ---
export function startPairing(deviceNameHint = '') {
    const code = (crypto.randomInt(0, 1e6) + '').padStart(6, '0');
    const pairing = readJson(PAIRING_PATH, { codes: [] });
    pairing.codes = (pairing.codes || []).filter((c) => c.expiresAt > Date.now() && !c.used);
    pairing.codes.push({
        codeHash: hmac(code),
        deviceNameHint: String(deviceNameHint || '').slice(0, 64),
        createdAt: Date.now(),
        expiresAt: Date.now() + PAIRING_TTL_MS,
        used: false,
    });
    writeJson(PAIRING_PATH, pairing);
    return { code, expiresInSeconds: PAIRING_TTL_MS / 1000 };
}

export function completePairing(code, deviceName) {
    const pairing = readJson(PAIRING_PATH, { codes: [] });
    const h = hmac(code);
    const entry = (pairing.codes || []).find((c) => c.codeHash === h);
    if (!entry) return { ok: false, code: 'PAIRING_CODE_INVALID' };
    if (entry.used) return { ok: false, code: 'PAIRING_CODE_USED' };
    if (entry.expiresAt <= Date.now()) return { ok: false, code: 'PAIRING_CODE_EXPIRED' };
    entry.used = true;
    writeJson(PAIRING_PATH, pairing);

    const deviceId = 'dev_' + crypto.randomBytes(8).toString('hex');
    const accessToken = crypto.randomBytes(32).toString('base64url');
    const refreshToken = crypto.randomBytes(32).toString('base64url');
    const devices = readJson(DEVICES_PATH, { devices: [] });
    devices.devices = devices.devices || [];
    devices.devices.push({
        deviceId,
        deviceName: String(deviceName || entry.deviceNameHint || 'Android').slice(0, 64),
        accessTokenHash: hmac(accessToken),
        refreshTokenHash: hmac(refreshToken),
        accessExpiresAt: Date.now() + ACCESS_TTL_MS,
        refreshExpiresAt: Date.now() + REFRESH_TTL_MS,
        createdAt: Date.now(),
        revoked: false,
    });
    writeJson(DEVICES_PATH, devices);
    return { ok: true, deviceId, accessToken, refreshToken, accessExpiresInSeconds: ACCESS_TTL_MS / 1000 };
}

export function refresh(refreshToken) {
    const devices = readJson(DEVICES_PATH, { devices: [] });
    const h = hmac(refreshToken);
    const dev = (devices.devices || []).find((d) => d.refreshTokenHash === h && !d.revoked);
    if (!dev) return { ok: false, code: 'REFRESH_INVALID' };
    if (dev.refreshExpiresAt <= Date.now()) return { ok: false, code: 'REFRESH_EXPIRED' };
    const accessToken = crypto.randomBytes(32).toString('base64url');
    dev.accessTokenHash = hmac(accessToken);
    dev.accessExpiresAt = Date.now() + ACCESS_TTL_MS;
    writeJson(DEVICES_PATH, devices);
    return { ok: true, accessToken, accessExpiresInSeconds: ACCESS_TTL_MS / 1000 };
}

// Verify a bearer access token. Returns the device or null.
export function verifyAccess(token) {
    if (!token) return null;
    const devices = readJson(DEVICES_PATH, { devices: [] });
    const h = hmac(token);
    const dev = (devices.devices || []).find((d) => d.accessTokenHash === h && !d.revoked);
    if (!dev) return null;
    if (dev.accessExpiresAt <= Date.now()) return null;
    return { deviceId: dev.deviceId, deviceName: dev.deviceName };
}

export function listDevices() {
    const devices = readJson(DEVICES_PATH, { devices: [] });
    return (devices.devices || []).map((d) => ({
        deviceId: d.deviceId,
        deviceName: d.deviceName,
        createdAt: d.createdAt,
        revoked: !!d.revoked,
        accessExpiresAt: d.accessExpiresAt,
    }));
}

export function revokeDevice(deviceId) {
    const devices = readJson(DEVICES_PATH, { devices: [] });
    const dev = (devices.devices || []).find((d) => d.deviceId === deviceId);
    if (!dev) return { ok: false, code: 'DEVICE_NOT_FOUND' };
    dev.revoked = true;
    writeJson(DEVICES_PATH, devices);
    return { ok: true };
}

// --- service credentials (worker / telegram) ---
// A service token is provided out-of-band via the server-side env (MATER_WORKER_TOKEN /
// MATER_TELEGRAM_TOKEN_API), never via pairing. verifyService() returns the scope set for a
// presented bearer token, or null. Scopes are coarse and enforced at the route layer.
const SERVICE_SCOPES = {
    worker: ['jobs:claim', 'jobs:heartbeat', 'jobs:complete', 'jobs:fail', 'jobs:read', 'leads:write'],
    telegram: ['read', 'approvals:write', 'jobs:read'],
};
export function verifyService(token) {
    if (!token) return null;
    const env = readEnvFile(SECRETS_ENV_FILE);
    // tokens live only in AI_SECRETS env (server-side), compared by constant-time hmac match
    const workerTok = process.env.MATER_WORKER_TOKEN || env.MATER_WORKER_TOKEN;
    const tgTok = process.env.MATER_TELEGRAM_TOKEN_API || env.MATER_TELEGRAM_TOKEN_API;
    const h = hmac(token);
    if (workerTok && hmac(workerTok) === h) return { service: 'worker', scopes: SERVICE_SCOPES.worker };
    if (tgTok && hmac(tgTok) === h) return { service: 'telegram', scopes: SERVICE_SCOPES.telegram };
    return null;
}

