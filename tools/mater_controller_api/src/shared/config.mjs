// shared/config.mjs
// Central configuration + canonical paths. Resolves the workspace root from this
// file location so the API never depends on cwd. Reads the API secret from
// AI_SECRETS only (never from AI_WORKSPACE, never printed).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// tools/mater_controller_api/src/shared -> workspace root is 4 up.
export const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
export const API_ROOT = path.resolve(__dirname, '..', '..');

export const PORT = Number(process.env.MATER_API_PORT || 8787);
// Default bind is loopback; LAN mode requires MATER_API_LAN=true (explicit).
export const BIND = process.env.MATER_API_LAN === 'true' ? '0.0.0.0' : '127.0.0.1';

export const STORE_SEED_PATH = process.env.MATER_STORE_SEED_PATH
    ? path.resolve(process.env.MATER_STORE_SEED_PATH)
    : path.join(WORKSPACE, '13_sales', 'lead_pipeline_store.json');
export const RUNTIME_DIR = process.env.MATER_RUNTIME_DIR
    ? path.resolve(process.env.MATER_RUNTIME_DIR)
    : path.join(WORKSPACE, '.runtime', 'mater_controller_api');
export const STORE_PATH = process.env.MATER_STORE_PATH
    ? path.resolve(process.env.MATER_STORE_PATH)
    : path.join(RUNTIME_DIR, 'lead_pipeline_store.local.json');
// Campaign Governor store (Phase 2). Separate file, SAME atomic+revision writer
// (updateStoreWithRevision with storePath). Not a second canonical lead store.
// Empty-by-default, additive, rollback-safe.
export const CAMPAIGNS_STORE_PATH = process.env.MATER_CAMPAIGNS_STORE_PATH
    ? path.resolve(process.env.MATER_CAMPAIGNS_STORE_PATH)
    : path.join(path.dirname(STORE_PATH), 'campaigns_store.json');
// Owner Command & Autonomy Center store (0.8.0). Separate file, SAME atomic+revision
// writer. Append-only events/notifications/incidents/decisions. Not a second lead store.
export const OWNER_CENTER_STORE_PATH = process.env.MATER_OWNER_CENTER_STORE_PATH
    ? path.resolve(process.env.MATER_OWNER_CENTER_STORE_PATH)
    : path.join(path.dirname(STORE_PATH), 'owner_center_store.json');
export const EMAIL_LEDGER_PATH = path.join(WORKSPACE, '13_sales', 'outbound_email_ledger.jsonl');
export const SEND_LEDGER_PATH = path.join(WORKSPACE, '13_sales', 'outbound_send_ledger.jsonl');

// Authoritative AI usage ledger (append-only JSONL). Persists provider token usage / calculated
// units across API restarts so the owner dashboard reflects real cumulative spend (not in-memory 0).
// Lives next to the canonical store dir by default; overridable for tests.
export const AI_USAGE_LEDGER_PATH = process.env.MATER_AI_USAGE_LEDGER_PATH
    ? path.resolve(process.env.MATER_AI_USAGE_LEDGER_PATH)
    : path.join(path.dirname(STORE_PATH), 'ai_usage_ledger.jsonl');
// Knowledge Radar store (read-only findings / proposals). Owner-gated; never mutates canonical.
export const KNOWLEDGE_STORE_PATH = process.env.MATER_KNOWLEDGE_STORE_PATH
    ? path.resolve(process.env.MATER_KNOWLEDGE_STORE_PATH)
    : path.join(path.dirname(STORE_PATH), 'knowledge_radar_store.json');

// FCM push registry (device push tokens + per-owner notification preferences). NOT a second
// notification truth — the owner-center store remains the source of notifications. This only holds
// device push tokens and routing preferences. Push delivery is DISABLED by default and requires a
// real Firebase service credential (never stored here, never in Git).
export const PUSH_STORE_PATH = process.env.MATER_PUSH_STORE_PATH
    ? path.resolve(process.env.MATER_PUSH_STORE_PATH)
    : path.join(path.dirname(STORE_PATH), 'push_registry.json');
// Path to a Firebase service-account JSON (OUTSIDE the workspace/Git). Presence is reported as a
// boolean only; the file is never read into a response. Absent => push stays DISABLED (no fake creds).
export const FCM_CREDENTIALS_PATH = process.env.MATER_FCM_CREDENTIALS_PATH
    ? path.resolve(process.env.MATER_FCM_CREDENTIALS_PATH)
    : path.join(SECRETS_ENV_DIR_FALLBACK(), 'fcm_service_account.json');
function SECRETS_ENV_DIR_FALLBACK() {
    return process.env.MATER_API_SECRETS_DIR ? path.resolve(process.env.MATER_API_SECRETS_DIR) : path.resolve('D:/AI_SECRETS', '01_env');
}

// Owner automation settings (profiles + limits) and its audit history.
export const OWNER_SETTINGS_PATH = process.env.MATER_OWNER_SETTINGS_PATH
    ? path.resolve(process.env.MATER_OWNER_SETTINGS_PATH)
    : path.join(path.dirname(STORE_PATH), 'owner_automation_settings.json');
// Domain reservoir (Free-First lead factory; NOT a second canonical lead store).
export const DOMAIN_RESERVOIR_PATH = process.env.MATER_DOMAIN_RESERVOIR_PATH
    ? path.resolve(process.env.MATER_DOMAIN_RESERVOIR_PATH)
    : path.join(path.dirname(STORE_PATH), 'domain_reservoir.json');

export const DATA_DIR = process.env.MATER_API_DATA_DIR
    ? path.resolve(process.env.MATER_API_DATA_DIR)
    : path.join(RUNTIME_DIR, 'data');
export const LOG_DIR = path.join(API_ROOT, 'logs');
export const DEVICES_PATH = path.join(DATA_DIR, 'devices.json');
export const PAIRING_PATH = path.join(DATA_DIR, 'pairing.json');
export const PID_FILE = path.join(API_ROOT, '.mater_controller_api.pid');
export const LOCK_FILE = path.join(API_ROOT, '.mater_controller_api.lock');
export const HEARTBEAT_PATH = path.join(DATA_DIR, 'api_heartbeat.json');

// AI_SECRETS lives OUTSIDE the workspace. The API secret is created here on first
// run and never copied into AI_WORKSPACE or printed. The directory is overridable
// via MATER_API_SECRETS_DIR for non-Windows hosts (e.g. the Linux VPS, which has no
// D: drive); Windows behaviour is unchanged when the env var is unset.
export const SECRETS_ENV_DIR = process.env.MATER_API_SECRETS_DIR
    ? path.resolve(process.env.MATER_API_SECRETS_DIR)
    : path.resolve('D:/AI_SECRETS', '01_env');
export const SECRETS_ENV_FILE = path.join(SECRETS_ENV_DIR, 'mater_controller_api.env');

export function ensureDirs() {
    for (const d of [DATA_DIR, LOG_DIR]) {
        try { fs.mkdirSync(d, { recursive: true }); } catch { /* ignore */ }
    }
}

// Read KEY=VALUE env file (BOM tolerant). Returns {} if missing.
export function readEnvFile(filePath) {
    const out = {};
    try {
        if (!fs.existsSync(filePath)) return out;
        const raw = fs.readFileSync(filePath, 'utf8').replace(/^﻿/, '');
        for (const line of raw.split(/\r?\n/)) {
            const t = line.trim();
            if (!t || t.startsWith('#') || !t.includes('=')) continue;
            const i = t.indexOf('=');
            out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
        }
    } catch { /* ignore */ }
    return out;
}

export const API_VERSION = 'v1';
export const API_BASE = `/api/${API_VERSION}`;
