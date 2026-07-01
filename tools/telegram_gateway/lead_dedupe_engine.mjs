/**
 * lead_dedupe_engine.mjs
 *
 * Daily Lead Factory — D1 Preflight A — Lead Dedupe Engine (standalone)
 *
 * APPROVAL: APPROVE_DAILY_LEAD_FACTORY_D1_PREFLIGHT_A_LEAD_DEDUPE_ENGINE_2026-05-31
 *
 * Purpose:
 *   Standalone lead dedupe engine for the future D1 Lead Intake pipeline.
 *   - Normalize lead_id / name / domain / region.
 *   - Build dedupe keys (exact lead_id, normalized domain, normalized name+region).
 *   - Find duplicates among existing leads.
 *   - Merge candidate into existing WITHOUT losing data.
 *   - Dedupe a batch of candidates against existing + each other.
 *   - Build a summary of the dedupe run.
 *
 * HARD MODE — what this module DOES NOT do:
 *   - No network. No HTTP/fetch. No site scanning.
 *   - No SMTP. No email/Telegram/WhatsApp/MAX send. No auto-send.
 *   - No .env / secrets / tokens / CHAT_ID reads.
 *   - No bot integration. No git. No VPS/SSH.
 *   Pure in-memory data transformations only.
 *
 * NOT integrated into telegram_master_bot.mjs or russian_command_router.mjs.
 */

'use strict';

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

// Soft legal-form tokens (RU). Treated softly during name normalization:
// they are stripped only for the name-key, but the displayed name is preserved.
const RU_LEGAL_FORMS = [
    'ооо', 'оао', 'зао', 'пао', 'нао', 'ао', 'ип', 'тоо', 'нко',
    'фгуп', 'гуп', 'муп', 'пк', 'кфх',
];

// Quote-like and separator characters collapsed during name normalization.
const NAME_PUNCT_RE = /["'«»“”„`’‘()\[\]{}.,;:!?]+/g;

// ──────────────────────────────────────────────
// Normalizers
// ──────────────────────────────────────────────

/**
 * Normalize a lead_id.
 * - Trim, uppercase.
 * - Allowed charset: A-Z 0-9 _ -.
 * - Returns '' for empty/invalid input or if unsafe chars present.
 *
 * @param {*} value
 * @returns {string} normalized lead_id or '' when unsafe/empty
 */
export function normalizeLeadId(value) {
    if (value === null || value === undefined) return '';
    const raw = String(value).trim();
    if (raw === '') return '';
    const upper = raw.toUpperCase();
    // Reject if it contains anything outside the safe charset.
    if (!/^[A-Z0-9_-]+$/.test(upper)) return '';
    return upper;
}

/**
 * Normalize a domain / website.
 * - Lowercase, trim.
 * - Strip protocol (http/https/ftp), strip leading 'www.'.
 * - Strip path, query (?...), hash (#...), port (:8080), and trailing slash.
 * - Strip user@host credentials prefix if present.
 *
 * @param {*} value
 * @returns {string} bare domain or '' when empty/invalid
 */
export function normalizeDomain(value) {
    if (value === null || value === undefined) return '';
    let s = String(value).trim().toLowerCase();
    if (s === '') return '';

    // Remove protocol.
    s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
    // Remove credentials (user:pass@host).
    s = s.replace(/^[^/@]*@/, '');
    // Cut at first path / query / hash separator.
    s = s.split('/')[0].split('?')[0].split('#')[0];
    // Remove port.
    s = s.split(':')[0];
    // Remove leading www.
    s = s.replace(/^www\./, '');
    // Trim stray dots.
    s = s.replace(/^\.+/, '').replace(/\.+$/, '');

    // Basic sanity: a domain must contain at least one dot and valid chars.
    if (!/^[a-z0-9.-]+$/.test(s)) return '';
    if (!s.includes('.')) return '';
    return s;
}

/**
 * Normalize a company / lead name (for the dedupe key).
 * - Lowercase, trim, collapse internal whitespace.
 * - Replace punctuation/quotes with spaces.
 * - Softly drop RU legal-form tokens (ООО/ИП/АО/ЗАО/...) — only as whole tokens.
 *   The original display name is NOT modified anywhere; this is key material only.
 *
 * @param {*} value
 * @returns {string} normalized name key or ''
 */
export function normalizeName(value) {
    if (value === null || value === undefined) return '';
    let s = String(value).trim().toLowerCase();
    if (s === '') return '';

    // Replace punctuation with spaces, normalize the Cyrillic 'ё'.
    s = s.replace(NAME_PUNCT_RE, ' ').replace(/ё/g, 'е');
    // Collapse whitespace.
    s = s.replace(/\s+/g, ' ').trim();
    if (s === '') return '';

    // Drop legal-form tokens softly (whole tokens only).
    const tokens = s.split(' ').filter(tok => tok && !RU_LEGAL_FORMS.includes(tok));
    const result = tokens.join(' ').trim();

    // If stripping legal forms emptied the name, fall back to the punctuation-cleaned name.
    return result === '' ? s : result;
}

/**
 * Normalize a region.
 * - Lowercase, trim, collapse internal whitespace.
 *
 * @param {*} value
 * @returns {string} normalized region or ''
 */
export function normalizeRegion(value) {
    if (value === null || value === undefined) return '';
    let s = String(value).trim().toLowerCase();
    if (s === '') return '';
    s = s.replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
    return s;
}

// ──────────────────────────────────────────────
// Dedupe keys
// ──────────────────────────────────────────────

/**
 * Build the set of dedupe keys for a lead.
 * Keys (any may be null when source field is empty):
 *   - leadIdKey:      `id:<NORMALIZED_LEAD_ID>`
 *   - domainKey:      `domain:<normalized.domain>`
 *   - nameRegionKey:  `nr:<normalized name>|<normalized region>`
 *
 * @param {object} lead
 * @returns {{ leadIdKey: string|null, domainKey: string|null, nameRegionKey: string|null,
 *            normalized: { leadId: string, domain: string, name: string, region: string } }}
 */
export function buildLeadDedupeKeys(lead) {
    const safeLead = lead && typeof lead === 'object' ? lead : {};
    const leadId = normalizeLeadId(safeLead.lead_id);
    const domain = normalizeDomain(safeLead.website ?? safeLead.domain);
    const name = normalizeName(safeLead.name);
    const region = normalizeRegion(safeLead.region);

    const leadIdKey = leadId ? `id:${leadId}` : null;
    const domainKey = domain ? `domain:${domain}` : null;
    // name+region key requires a name; region may be empty string.
    const nameRegionKey = name ? `nr:${name}|${region}` : null;

    return {
        leadIdKey,
        domainKey,
        nameRegionKey,
        normalized: { leadId, domain, name, region },
    };
}

/**
 * Determine whether two leads collide on any dedupe key.
 * @returns {{ match: boolean, key: string|null, reason: string|null }}
 */
function keysCollide(keysA, keysB) {
    if (keysA.leadIdKey && keysB.leadIdKey && keysA.leadIdKey === keysB.leadIdKey) {
        return { match: true, key: keysA.leadIdKey, reason: 'lead_id' };
    }
    if (keysA.domainKey && keysB.domainKey && keysA.domainKey === keysB.domainKey) {
        return { match: true, key: keysA.domainKey, reason: 'domain' };
    }
    if (keysA.nameRegionKey && keysB.nameRegionKey && keysA.nameRegionKey === keysB.nameRegionKey) {
        return { match: true, key: keysA.nameRegionKey, reason: 'name+region' };
    }
    return { match: false, key: null, reason: null };
}

/**
 * Find a duplicate of candidateLead among existingLeads.
 * Priority of match reasons: lead_id > domain > name+region.
 *
 * @param {object[]} existingLeads
 * @param {object} candidateLead
 * @returns {{ found: boolean, index: number, match: object|null, reason: string|null, key: string|null }}
 */
export function findDuplicateLead(existingLeads, candidateLead) {
    const list = Array.isArray(existingLeads) ? existingLeads : [];
    const candKeys = buildLeadDedupeKeys(candidateLead);

    // Pass in priority order so a stronger key wins over a weaker one.
    const reasonsOrder = ['lead_id', 'domain', 'name+region'];
    for (const wantReason of reasonsOrder) {
        for (let i = 0; i < list.length; i++) {
            const exKeys = buildLeadDedupeKeys(list[i]);
            const c = keysCollide(exKeys, candKeys);
            if (c.match && c.reason === wantReason) {
                return { found: true, index: i, match: list[i], reason: c.reason, key: c.key };
            }
        }
    }
    return { found: false, index: -1, match: null, reason: null, key: null };
}

// ──────────────────────────────────────────────
// Merge
// ──────────────────────────────────────────────

function isEmptyValue(v) {
    if (v === null || v === undefined) return true;
    if (typeof v === 'string') return v.trim() === '';
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === 'object') return Object.keys(v).length === 0;
    return false; // numbers (incl. 0), booleans count as non-empty
}

function uniqStrings(arr) {
    const seen = new Set();
    const out = [];
    for (const item of arr) {
        if (item === null || item === undefined) continue;
        const s = String(item);
        const k = s.toLowerCase();
        if (!seen.has(k)) { seen.add(k); out.push(s); }
    }
    return out;
}

// Fields that are "weak": never let an empty candidate overwrite a non-empty existing.
// Conversely an empty existing can be filled by a non-empty candidate.
const PROTECTED_FILL_FIELDS = [
    'name', 'website', 'domain', 'segment', 'region', 'status', 'score', 'contacts',
];

/**
 * Merge candidateLead into existingLead without losing data.
 * Rules:
 *   - existing.created_at preserved.
 *   - updated_at refreshed (meta.now or new Date().toISOString()).
 *   - Non-empty candidate fields fill empty existing fields.
 *   - Non-empty existing fields are NOT overwritten by empty candidate values.
 *   - source(s) merged into sources[] (deduped).
 *   - raw merged safely (existing wins on key conflict; candidate raw kept under raw).
 *   - contacts/status/score never clobbered by a weak empty value.
 *
 * @param {object} existingLead
 * @param {object} candidateLead
 * @param {object} [meta]  { now, matchReason, matchKey }
 * @returns {object} merged lead (new object; inputs not mutated)
 */
export function mergeLeadRecords(existingLead, candidateLead, meta = {}) {
    const existing = existingLead && typeof existingLead === 'object' ? existingLead : {};
    const candidate = candidateLead && typeof candidateLead === 'object' ? candidateLead : {};
    const now = meta.now || new Date().toISOString();

    // Start from a shallow copy of existing.
    const merged = { ...existing };

    // Fill scalar/string fields from candidate where existing is empty.
    const fieldKeys = new Set([...Object.keys(existing), ...Object.keys(candidate)]);
    for (const key of fieldKeys) {
        if (['created_at', 'updated_at', 'raw', 'source', 'sources', 'contacts'].includes(key)) {
            continue; // handled explicitly below
        }
        const exVal = existing[key];
        const caVal = candidate[key];
        if (isEmptyValue(exVal) && !isEmptyValue(caVal)) {
            // Fill empty existing with non-empty candidate.
            merged[key] = caVal;
        } else {
            // Keep existing (do not let empty candidate clobber non-empty existing).
            merged[key] = exVal !== undefined ? exVal : caVal;
        }
    }

    // created_at: always preserve existing if present, else take candidate, else now.
    merged.created_at = !isEmptyValue(existing.created_at)
        ? existing.created_at
        : (!isEmptyValue(candidate.created_at) ? candidate.created_at : now);

    // updated_at: always refresh.
    merged.updated_at = now;

    // sources[]: union of existing.sources, existing.source, candidate.source(s).
    const sourcesPool = [];
    if (Array.isArray(existing.sources)) sourcesPool.push(...existing.sources);
    if (!isEmptyValue(existing.source)) sourcesPool.push(existing.source);
    if (Array.isArray(candidate.sources)) sourcesPool.push(...candidate.sources);
    if (!isEmptyValue(candidate.source)) sourcesPool.push(candidate.source);
    const sources = uniqStrings(sourcesPool);
    if (sources.length > 0) merged.sources = sources;

    // Keep a primary `source` field: prefer existing, else first candidate source.
    if (!isEmptyValue(existing.source)) merged.source = existing.source;
    else if (!isEmptyValue(candidate.source)) merged.source = candidate.source;
    else if (sources.length > 0) merged.source = sources[0];

    // contacts: never clobber non-empty existing with empty candidate; fill if empty.
    if (isEmptyValue(existing.contacts) && !isEmptyValue(candidate.contacts)) {
        merged.contacts = candidate.contacts;
    } else if (!isEmptyValue(existing.contacts)) {
        merged.contacts = existing.contacts;
    }

    // raw: merge safely. Existing keys win on conflict; candidate raw preserved.
    const exRaw = (existing.raw && typeof existing.raw === 'object') ? existing.raw : {};
    const caRaw = (candidate.raw && typeof candidate.raw === 'object') ? candidate.raw : {};
    merged.raw = { ...caRaw, ...exRaw };

    // Provenance: record merge event without losing anything.
    const history = Array.isArray(existing.merge_history) ? existing.merge_history.slice() : [];
    history.push({
        at: now,
        match_reason: meta.matchReason || null,
        match_key: meta.matchKey || null,
        merged_lead_id: normalizeLeadId(candidate.lead_id) || null,
        candidate_source: !isEmptyValue(candidate.source) ? candidate.source : null,
    });
    merged.merge_history = history;

    return merged;
}

// ──────────────────────────────────────────────
// Batch dedupe
// ──────────────────────────────────────────────

/**
 * Dedupe a batch of candidate leads against existing leads AND against each other.
 *
 * @param {object[]} existingLeads
 * @param {object[]} candidateLeads
 * @param {object} [meta] { now }
 * @returns {{
 *   leads: object[],            // resulting unique set (existing + added, with merges applied)
 *   added: object[],            // newly added unique leads
 *   merged: Array<{ index:number, reason:string, key:string, candidate:object }>,
 *   duplicates: Array<{ reason:string, key:string, candidate:object, into:number }>,
 *   imported_count: number,
 *   added_count: number,
 *   merged_count: number,
 *   duplicate_count: number
 * }}
 */
export function dedupeLeadRecords(existingLeads, candidateLeads, meta = {}) {
    const now = meta.now || new Date().toISOString();
    // Deep-ish copy of existing to avoid mutating caller data.
    const leads = (Array.isArray(existingLeads) ? existingLeads : []).map(l => ({ ...l }));
    const candidates = Array.isArray(candidateLeads) ? candidateLeads : [];

    const added = [];
    const merged = [];
    const duplicates = [];

    for (const candidate of candidates) {
        const dup = findDuplicateLead(leads, candidate);
        if (dup.found) {
            const mergedLead = mergeLeadRecords(leads[dup.index], candidate, {
                now,
                matchReason: dup.reason,
                matchKey: dup.key,
            });
            leads[dup.index] = mergedLead;
            merged.push({ index: dup.index, reason: dup.reason, key: dup.key, candidate });
            duplicates.push({ reason: dup.reason, key: dup.key, candidate, into: dup.index });
        } else {
            const newLead = { ...candidate };
            // Ensure timestamps exist on freshly added leads.
            if (isEmptyValue(newLead.created_at)) newLead.created_at = now;
            newLead.updated_at = now;
            leads.push(newLead);
            added.push(newLead);
        }
    }

    return {
        leads,
        added,
        merged,
        duplicates,
        imported_count: candidates.length,
        added_count: added.length,
        merged_count: merged.length,
        duplicate_count: duplicates.length,
    };
}

// ──────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────

/**
 * Build a compact summary object from a dedupeLeadRecords() result.
 *
 * @param {object} result
 * @returns {{
 *   imported_count: number, added_count: number, merged_count: number,
 *   duplicate_count: number, final_unique_count: number,
 *   duplicate_reasons: { lead_id:number, domain:number, 'name+region':number }
 * }}
 */
export function buildDedupeSummary(result) {
    const r = result && typeof result === 'object' ? result : {};
    const duplicates = Array.isArray(r.duplicates) ? r.duplicates : [];
    const reasons = { lead_id: 0, domain: 0, 'name+region': 0 };
    for (const d of duplicates) {
        if (d && Object.prototype.hasOwnProperty.call(reasons, d.reason)) {
            reasons[d.reason] += 1;
        }
    }
    return {
        imported_count: Number.isFinite(r.imported_count) ? r.imported_count : 0,
        added_count: Number.isFinite(r.added_count) ? r.added_count : 0,
        merged_count: Number.isFinite(r.merged_count) ? r.merged_count : 0,
        duplicate_count: Number.isFinite(r.duplicate_count) ? r.duplicate_count : 0,
        final_unique_count: Array.isArray(r.leads) ? r.leads.length : 0,
        duplicate_reasons: reasons,
    };
}

export default {
    normalizeLeadId,
    normalizeDomain,
    normalizeName,
    normalizeRegion,
    buildLeadDedupeKeys,
    findDuplicateLead,
    mergeLeadRecords,
    dedupeLeadRecords,
    buildDedupeSummary,
};
