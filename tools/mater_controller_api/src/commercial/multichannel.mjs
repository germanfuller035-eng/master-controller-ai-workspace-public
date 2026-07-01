// commercial/multichannel.mjs — multichannel read models, public intake, webhook ingest (gated).
// Read-only/no-send. Reuses the single canonical store (additive sections) via store_access; never
// writes a second store, never dispatches. Webhooks verify signature/replay and quarantine unknowns.
import fs from 'node:fs';
import { readStore, STORE_PATH, leadsArray } from '../shared/store_access.mjs';
import { defaultRegistry, normalizeCandidate, scoreVkCandidate } from '../../../commercial_core/lib/source_registry.mjs';
import { arbitrate, detectConflicts } from '../../../commercial_core/lib/identity_graph.mjs';
import { evaluatePolicy } from '../../../commercial_core/lib/consent_policy.mjs';
import { ingestInbound, prepareOutbound, dispatch, verifyWebhook, quarantineEvent, redactSecrets } from '../../../commercial_core/lib/channel_router.mjs';
import { runMultichannelChain } from '../../../commercial_core/lib/multichannel_agents.mjs';

export const MULTICHANNEL_FLAGS = () => ({
    webIntake: process.env.WEB_INTAKE !== 'false', // default ON
    vkDiscovery: process.env.VK_DISCOVERY === 'true',
    vkInbound: process.env.VK_INBOUND === 'true',
    maxInbound: process.env.MAX_INBOUND === 'true',
    clientTelegramInbound: process.env.CLIENT_TELEGRAM_INBOUND === 'true',
    // outbound for every new channel is OFF and not configurable to ON in this build
    newChannelOutbound: false,
});

function section(store, key) { return Object.values(store[key] || {}); }

// Source registry merges the seed with any persisted overrides in the canonical section.
export function sources() {
    const store = readStore(STORE_PATH);
    const persisted = store['source_registry'] || {};
    const reg = defaultRegistry().map((s) => ({ ...s, ...(persisted[s.source_id] || {}) }));
    return { items: reg, total: reg.length };
}

export function sourceById(id) {
    return sources().items.find((s) => s.source_id === id) || null;
}

// Source health: "no data" (null) when a source has never run — never fabricate 0.
export function sourceHealth() {
    const store = readStore(STORE_PATH);
    const runs = store['source_health'] || {};
    return {
        items: sources().items.map((s) => {
            const h = runs[s.source_id];
            return {
                source_id: s.source_id, status: s.status,
                last_run: h?.last_run ?? null, candidates: h?.candidates ?? null,
                verified: h?.verified ?? null, duplicates: h?.duplicates ?? null,
                errors: h?.errors ?? null, has_data: !!h,
            };
        }),
    };
}

// Enriched source telemetry with NORMALIZED states (never bare "no data" for a known disabled
// source). cost_class FREE/PAID; disabled_reason for disabled/credential states; "never run" is
// explicit (IDLE), not fabricated 0.
const PAID_SOURCES = new Set(['two_gis', 'dataforseo', 'yandex_business']);
function normalizeSourceState(s) {
    const st = String(s.status || '').toUpperCase();
    if (st === 'ACTIVE') return 'HEALTHY';
    if (st === 'DISABLED') return 'DISABLED';
    if (st === 'PENDING_CREDENTIAL') return 'CREDENTIAL_REQUIRED';
    if (st === 'NOT_CONFIGURED') return 'NOT_CONFIGURED';
    return 'UNKNOWN';
}
function disabledReason(s, state) {
    if (state === 'CREDENTIAL_REQUIRED') return PAID_SOURCES.has(s.source_id) ? 'требуется ключ платного источника' : 'требуется ключ/токен';
    if (state === 'DISABLED') return PAID_SOURCES.has(s.source_id) ? 'отключён (платный источник вне текущей волны)' : 'отключён владельцем/политикой';
    return null;
}
export function sourceTelemetry() {
    const store = readStore(STORE_PATH);
    const runs = store['source_health'] || {};
    return {
        items: sources().items.map((s) => {
            const h = runs[s.source_id] || null;
            const state = normalizeSourceState(s);
            const everRan = !!h && (h.last_run != null);
            return {
                source_id: s.source_id,
                display_name: s.display_name,
                source_type: s.source_type,
                enabled: state === 'HEALTHY',
                credential_state: s.credential_state || (state === 'CREDENTIAL_REQUIRED' ? 'ABSENT' : 'NA'),
                health_state: everRan ? state : (state === 'HEALTHY' ? 'IDLE' : state),
                disabled_reason: disabledReason(s, state),
                last_check_at: h?.last_check_at ?? null,
                last_success_at: h?.last_success_at ?? (everRan ? h?.last_run : null),
                last_failure_at: h?.last_failure_at ?? null,
                last_error_category: h?.errors ? 'ERROR' : null,
                records_discovered_total: h?.discovered_total ?? null,
                records_discovered_last_run: h?.candidates ?? null,
                records_promoted_total: h?.promoted_total ?? null,
                records_rejected_total: h?.rejected_total ?? null,
                cost_class: PAID_SOURCES.has(s.source_id) ? 'PAID' : 'FREE',
                inbound_capability: (s.capabilities || []).some((c) => /INBOUND/.test(c)),
                discovery_capability: (s.capabilities || []).includes('DISCOVERY'),
                outbound_capability: false, // outbound always OFF for discovery/new channels
                never_run_note: everRan ? null : 'ещё не запускался',
            };
        }),
    };
}
export function channels() {
    const f = MULTICHANNEL_FLAGS();
    const ch = (channel, inbound) => ({ channel, discovery: channel === 'EMAIL' ? 'NA' : 'separate', inbound: inbound ? 'ON' : 'PENDING_CREDENTIAL', outbound: channel === 'EMAIL' ? 'GATED' : 'OFF' });
    return {
        items: [
            ch('EMAIL', true), ch('VK', f.vkInbound), ch('MAX', f.maxInbound),
            ch('TELEGRAM', f.clientTelegramInbound), ch('WEB_FORM', f.webIntake),
            ch('WHATSAPP', false), ch('SMS', false), ch('PHONE', false), ch('AVITO', false),
        ],
        outbound_channels_enabled: 0,
    };
}
export function channelHealth() {
    const store = readStore(STORE_PATH);
    const h = store['channel_health'] || {};
    return { items: channels().items.map((c) => ({ ...c, last_inbound: h[c.channel]?.last_inbound ?? null, webhook_health: h[c.channel]?.webhook_health ?? 'unknown', quarantine_count: h[c.channel]?.quarantine ?? null })) };
}

// Identity graph reads.
export function identities(companyId) {
    const store = readStore(STORE_PATH);
    const co = (store['company_identities'] || {})[companyId];
    if (!co) return null;
    return { company_id: companyId, links: (co.links || []).map((l) => ({ type: l.identity_type, display: l.display_masked, status: l.status, source: l.source })) };
}
export function identityConflicts() {
    const store = readStore(STORE_PATH);
    return { items: detectConflicts(section(store, 'company_identities')) };
}

// Contact policy for a lead (computed from stored consent state; UNKNOWN by default).
export function contactPolicy(leadId) {
    const store = readStore(STORE_PATH);
    const rec = (store['contact_policy_decisions'] || {})[leadId];
    const consentStatus = rec?.consent_status || 'UNKNOWN';
    return { lead_id: leadId, consent_status: consentStatus, policy: evaluatePolicy({ channel: rec?.channel || 'EMAIL', consentStatus, direction: 'inbound' }) };
}

export function inboundList() {
    const store = readStore(STORE_PATH);
    return { items: section(store, 'inbound_submissions').map((s) => ({ id: s.id, source: s.source, channel: s.channel, company: s.company_name || null, received_at: s.received_at || null, status: s.status || 'NEW' })) };
}
export function inboundById(id) {
    const store = readStore(STORE_PATH);
    return (store['inbound_submissions'] || {})[id] || null;
}

export function multichannelOwnerQueue() {
    const store = readStore(STORE_PATH);
    return {
        inbound_to_review: section(store, 'inbound_submissions').filter((s) => (s.status || 'NEW') === 'NEW').length,
        identity_conflicts: detectConflicts(section(store, 'company_identities')).length,
        reply_drafts: section(store, 'channel_messages').filter((m) => m.direction === 'outbound' && m.delivery_status === 'DRAFT').length,
        quarantine: section(store, 'channel_quarantine').length,
        note: 'Никаких авто-действий. Исходящие по новым каналам отключены.',
    };
}

// ---- Public intake (validates + stages; never auto-creates a lead from junk) ----
const isEmail = (s) => typeof s === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
export function validateIntake(body = {}) {
    const errors = [];
    if (body.hp) errors.push('honeypot'); // honeypot field must be empty
    if (!body.company_name && !body.website && !body.message) errors.push('empty_submission');
    if (body.email && !isEmail(body.email)) errors.push('bad_email');
    if (!body.consent) errors.push('consent_required');
    return { ok: errors.length === 0, errors };
}
// Build an inbound submission record (no canonical write here; route layer commits via single writer).
export function buildIntakeRecord(body, sourceId, at) {
    return {
        id: `intake_${(body.idempotency_token || at || '').toString().slice(0, 24) || Math.abs(hashStr(JSON.stringify(redactSecrets(body)))).toString(36)}`,
        source: sourceId, channel: 'WEB_FORM',
        company_name: body.company_name || null, website: body.website || null,
        email_present: isEmail(body.email), phone_present: !!body.phone,
        preferred_channel: body.preferred_channel || null,
        product_interest: body.product_interest || null,
        consent: body.consent === true, consent_at: at,
        utm: { source: body.utm_source || null, medium: body.utm_medium || null, campaign: body.utm_campaign || null },
        status: 'NEW', received_at: at,
        evidence_hash: hashStr(JSON.stringify(redactSecrets(body))).toString(16),
    };
}
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return h; }

export default {
    MULTICHANNEL_FLAGS, sources, sourceById, sourceHealth, sourceTelemetry, channels, channelHealth,
    identities, identityConflicts, contactPolicy, inboundList, inboundById, multichannelOwnerQueue,
    validateIntake, buildIntakeRecord,
    // expose router/webhook helpers for the route layer
    ingestInbound, prepareOutbound, dispatch, verifyWebhook, quarantineEvent, runMultichannelChain,
    normalizeCandidate, scoreVkCandidate, arbitrate,
};
