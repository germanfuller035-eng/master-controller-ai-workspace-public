// tools/commercial_core/lib/source_registry.mjs
// PURE source registry + common source-adapter contract + candidate normalization. No I/O, no network,
// no canonical write, no send. Adapters produce NORMALIZED CANDIDATES only; promotion to a real lead
// happens later through the single canonical writer after verification. Never guesses email/website.

export const SOURCE_STATUS = ['ACTIVE', 'DEGRADED', 'DISABLED', 'PENDING_CREDENTIAL', 'PENDING_MODERATION', 'POLICY_BLOCKED', 'RATE_LIMITED', 'ERROR'];
export const SOURCE_CAPABILITIES = ['DISCOVERY', 'CONTACT_ENRICHMENT', 'WEBSITE_DISCOVERY', 'INBOUND_LEAD', 'INBOUND_MESSAGE', 'LEAD_FORM', 'REVIEW_DATA', 'CHANNEL_IDENTITY'];

// The registry seed: every known source with its current safe status. credential_state drives whether
// a source can run; without a credential a source is PENDING_CREDENTIAL (never silently active).
export function defaultRegistry() {
    const s = (source_id, source_type, display_name, status, capabilities, region = 'RU') =>
        ({ source_id, source_type, display_name, status, mode: 'DISCOVERY', credential_state: status === 'ACTIVE' ? 'PRESENT' : 'ABSENT', moderation_state: 'NA', region, capabilities, health: 'unknown', freshness: null });
    return [
        s('osm_overpass', 'OSM', 'OpenStreetMap / Overpass', 'ACTIVE', ['DISCOVERY', 'WEBSITE_DISCOVERY']),
        s('vk_communities', 'VK', 'VK Communities', 'PENDING_CREDENTIAL', ['DISCOVERY', 'CONTACT_ENRICHMENT', 'CHANNEL_IDENTITY']),
        s('vk_lead_forms', 'VK', 'VK Lead Forms', 'PENDING_CREDENTIAL', ['INBOUND_LEAD', 'LEAD_FORM']),
        s('vk_inbound', 'VK', 'VK Community Messages', 'PENDING_CREDENTIAL', ['INBOUND_MESSAGE', 'CHANNEL_IDENTITY']),
        s('yandex_business', 'YANDEX', 'Yandex Business', 'DISABLED', ['DISCOVERY', 'REVIEW_DATA']),
        s('two_gis', '2GIS', '2GIS', 'PENDING_CREDENTIAL', ['DISCOVERY', 'CONTACT_ENRICHMENT']),
        s('dataforseo', 'DATAFORSEO', 'DataForSEO', 'PENDING_CREDENTIAL', ['DISCOVERY', 'CONTACT_ENRICHMENT']),
        s('web_intake', 'WEB', 'Web Intake Form', 'ACTIVE', ['INBOUND_LEAD']),
        s('max_inbound', 'MAX', 'MAX Bot', 'PENDING_CREDENTIAL', ['INBOUND_MESSAGE', 'CHANNEL_IDENTITY']),
        s('telegram_client', 'TELEGRAM', 'Telegram Client Bot', 'PENDING_CREDENTIAL', ['INBOUND_MESSAGE', 'CHANNEL_IDENTITY']),
        s('referral', 'REFERRAL', 'Partner Referral', 'ACTIVE', ['INBOUND_LEAD']),
        s('csv_manual', 'MANUAL', 'CSV / Manual', 'ACTIVE', ['DISCOVERY']),
        s('avito', 'AVITO', 'Avito', 'DISABLED', ['DISCOVERY']),
        s('whatsapp', 'WHATSAPP', 'WhatsApp Business', 'DISABLED', ['INBOUND_MESSAGE']),
    ];
}

const isEmail = (s) => typeof s === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
const normName = (s) => String(s || '').toLowerCase().replace(/["«»'`]/g, '').replace(/(^|\s)(ооо|оао|зао|ип|пао|llc|ltd|inc)(\s|$)/gi, ' ').replace(/\s+/g, ' ').trim();
const domainOf = (url) => { const m = String(url || '').match(/^(?:https?:\/\/)?(?:www\.)?([^/\s]+)/i); return m ? m[1].toLowerCase() : null; };

/**
 * Normalize a raw source candidate into the canonical candidate shape. NEVER fabricates email/website;
 * only carries through what the source actually provided, with evidence. Returns a normalized object.
 */
export function normalizeCandidate(raw, sourceId) {
    const emails = (raw.emails || []).filter(isEmail); // drop anything that isn't a real email
    return {
        candidate_id: `cand_${sourceId}_${raw.external_id || normName(raw.company_name)}`.slice(0, 80),
        source_id: sourceId,
        external_id: raw.external_id || null,
        company_name: raw.company_name || null,
        company_name_normalized: normName(raw.company_name),
        category: raw.category || null,
        region: raw.region || null,
        city: raw.city || null,
        address: raw.address || null,
        website: raw.website || null,
        website_domain: domainOf(raw.website),
        phones: raw.phones || [],
        emails, // verified-format only; verification still required downstream
        social_profiles: raw.social_profiles || [],
        source_url: raw.source_url || null,
        source_evidence: raw.source_evidence || { source: sourceId },
        observed_at: raw.observed_at || null,
        confidence: typeof raw.confidence === 'number' ? raw.confidence : 0.5,
        guessed_email: false, // by construction we never set a guessed email
        is_business_evidence: raw.is_business_evidence === true,
    };
}

// VK-specific candidate scoring (public business evidence only). Returns a verdict.
export function scoreVkCandidate(c) {
    if (!c.is_business_evidence) return 'VK_CANDIDATE_REJECTED'; // personal profile / no business evidence
    const signals = [c.company_name_normalized, c.category, c.website_domain, (c.phones || []).length > 0, (c.emails || []).length > 0].filter(Boolean).length;
    if (c.website_domain && signals >= 3) return 'VK_CANDIDATE_READY';
    if (signals >= 2) return 'VK_CANDIDATE_NEEDS_VERIFICATION';
    return 'VK_CANDIDATE_REJECTED';
}

// The common adapter contract every source adapter must satisfy (interface check for tests).
export const ADAPTER_CONTRACT = ['buildQuery', 'validateConfig', 'dryRun', 'discoverCandidates', 'normalizeCandidate', 'extractEvidence', 'reportHealth', 'respectBudget', 'respectRateLimit', 'redactSecrets'];
export function isValidAdapter(adapter) {
    return ADAPTER_CONTRACT.every((m) => typeof adapter?.[m] === 'function');
}
