// tools/mater_controller_api/src/commercial/owner_settings.mjs
// Owner automation settings (profiles + discovery/AI/budget limits + source strategy + schedule).
// Read + safe command (expectedRevision / idempotency / audit history). Backend is the source of
// truth; Android is a client. Server hard limits are enforced here regardless of client input.
// No setting here can enable send/payment/paid-source — those remain hard-OFF.
import fs from 'node:fs';
import path from 'node:path';
import { OWNER_SETTINGS_PATH } from '../shared/config.mjs';

// Server hard ceilings (client values are clamped/rejected against these).
const HARD = {
    discovery_runs_per_day: 6, raw_candidates_per_day: 300, verified_leads_per_day: 50,
    sites_checked_per_day: 500, owner_queue_max: 100, audit_ready_queue_max: 200,
    ai_audits_per_day: 20, offers_per_day: 20, premium_calls_per_day: 10, provider_concurrency: 3,
    daily_calculated_units_limit: 1000000,
};

const PROFILES = {
    'Экономный': { discovery_runs_per_day: 1, raw_candidates_per_day: 50, verified_leads_per_day: 5, sites_checked_per_day: 50, ai_audits_per_day: 1, offers_per_day: 1, premium_calls_per_day: 0, daily_calculated_units_limit: 100000 },
    'Сбалансированный': { discovery_runs_per_day: 2, raw_candidates_per_day: 100, verified_leads_per_day: 10, sites_checked_per_day: 100, ai_audits_per_day: 3, offers_per_day: 3, premium_calls_per_day: 1, daily_calculated_units_limit: 300000 },
    'Активный': { discovery_runs_per_day: 4, raw_candidates_per_day: 200, verified_leads_per_day: 25, sites_checked_per_day: 300, ai_audits_per_day: 8, offers_per_day: 8, premium_calls_per_day: 3, daily_calculated_units_limit: 600000 },
};

function defaults() {
    return {
        settings_revision: 0,
        profile: 'Сбалансированный',
        // discovery
        discovery_runs_per_day: 2, raw_candidates_per_day: 100, verified_leads_per_day: 10,
        sites_checked_per_day: 100, same_segment_rescan_days: 14, domain_reservoir_batch_size: 200,
        owner_queue_max: 10, audit_ready_queue_max: 30,
        // ai + cost
        ai_audits_per_day: 3, offers_per_day: 3, daily_calculated_units_limit: 300000,
        premium_calls_per_day: 1, repair_attempts: 1, fallback_attempts: 1, provider_concurrency: 1,
        // sources
        source_strategy: 'FREE_ONLY', paid_sources_enabled: false,
        // schedule
        morning_discovery_time: '09:00', evening_discovery_time: '18:00',
        processing_window: '09:00-21:00', timezone: process.env.MC_OWNER_TIMEZONE || 'Europe/Moscow',
        updated_at: null, updated_by: null,
    };
}

function read() {
    try { return { ...defaults(), ...JSON.parse(fs.readFileSync(OWNER_SETTINGS_PATH, 'utf8')) }; }
    catch { return defaults(); }
}
function write(obj) {
    try { fs.mkdirSync(path.dirname(OWNER_SETTINGS_PATH), { recursive: true }); } catch { /* ignore */ }
    fs.writeFileSync(OWNER_SETTINGS_PATH, JSON.stringify(obj, null, 2), 'utf8');
}

export function getSettings() {
    const s = read();
    return { ...s, hard_limits: HARD, profiles_available: ['Экономный', 'Сбалансированный', 'Активный', 'Пользовательский'], source_strategy_active: ['FREE_ONLY'] };
}

export function getAuditHistory() {
    const s = read();
    return { items: (s._audit || []).slice(-50) };
}

// Validate + clamp one numeric field against hard limits.
function validateNumeric(out, key, errors) {
    if (out[key] == null) return;
    const v = Number(out[key]);
    if (!Number.isFinite(v) || v < 0) { errors.push(`invalid:${key}`); return; }
    if (HARD[key] != null && v > HARD[key]) errors.push(`exceeds_hard_limit:${key}:max=${HARD[key]}`);
}

export function updateSettings(body, { ownerIdentity } = {}) {
    const cur = read();
    const errors = [];
    // optimistic concurrency
    if (body.expectedRevision != null && Number(body.expectedRevision) !== Number(cur.settings_revision)) {
        return { ok: false, code: 'REVISION_CONFLICT', actual: cur.settings_revision };
    }
    if (!body.idempotencyKey) return { ok: false, code: 'MISSING_IDEMPOTENCY', message: 'Требуется ключ идемпотентности' };
    // idempotent replay
    if ((cur._idem || []).includes(body.idempotencyKey)) {
        return { ok: true, settings_revision: cur.settings_revision, idempotent_replay: true, settings: getSettings() };
    }

    let next = { ...cur };
    // profile application
    if (body.profile && body.profile !== 'Пользовательский' && PROFILES[body.profile]) {
        next = { ...next, ...PROFILES[body.profile], profile: body.profile };
    } else if (body.profile) {
        next.profile = body.profile;
    }
    // apply changed numeric/select fields
    const NUMERIC = ['discovery_runs_per_day', 'raw_candidates_per_day', 'verified_leads_per_day', 'sites_checked_per_day',
        'same_segment_rescan_days', 'domain_reservoir_batch_size', 'owner_queue_max', 'audit_ready_queue_max',
        'ai_audits_per_day', 'offers_per_day', 'daily_calculated_units_limit', 'premium_calls_per_day',
        'repair_attempts', 'fallback_attempts', 'provider_concurrency'];
    for (const k of NUMERIC) if (body[k] != null) next[k] = Number(body[k]);
    for (const k of ['morning_discovery_time', 'evening_discovery_time', 'processing_window', 'timezone']) if (body[k] != null) next[k] = body[k];

    // source strategy: only FREE_ONLY is activatable this wave; paid requires explicit confirmation + creds
    if (body.source_strategy) {
        if (body.source_strategy === 'FREE_ONLY') { next.source_strategy = 'FREE_ONLY'; next.paid_sources_enabled = false; }
        else if (['FREE_WITH_PAID_FALLBACK', 'ALL_AVAILABLE'].includes(body.source_strategy)) {
            if (body.confirm_paid_sources !== true) errors.push('paid_source_requires_confirmation');
            else errors.push('paid_source_credentials_absent'); // creds not present this wave
        } else errors.push('invalid:source_strategy');
    }
    // never allow enabling paid sources
    next.paid_sources_enabled = false;

    for (const k of NUMERIC) validateNumeric(next, k, errors);
    if (errors.length) return { ok: false, code: 'VALIDATION_FAILED', errors };

    next.settings_revision = Number(cur.settings_revision) + 1;
    next.updated_at = body.timestamp || cur.updated_at;
    next.updated_by = ownerIdentity || 'owner';
    next._idem = [...(cur._idem || []), body.idempotencyKey].slice(-100);
    next._audit = [...(cur._audit || []), {
        revision: next.settings_revision, at: body.timestamp || null, by: ownerIdentity || 'owner',
        changed_fields: body.changedFields || Object.keys(body).filter((k) => !['expectedRevision', 'idempotencyKey', 'changedFields', 'timestamp', 'confirm_paid_sources'].includes(k)),
        profile: next.profile,
    }].slice(-100);
    write(next);
    return { ok: true, settings_revision: next.settings_revision, settings: getSettings() };
}

export default { getSettings, getAuditHistory, updateSettings, HARD, PROFILES };
