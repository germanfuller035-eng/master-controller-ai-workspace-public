/**
 * lead_intake_contract.mjs
 *
 * Daily Lead Factory — D1 Preflight B — Lead Intake Contract (standalone)
 *
 * APPROVAL: APPROVE_DAILY_LEAD_FACTORY_D1_PREFLIGHT_B_LEAD_INTAKE_CONTRACT_2026-05-31
 *
 * Purpose:
 *   Standalone Lead Intake CONTRACT for the future D1 Lead Intake pipeline.
 *   - Split an input text block into rows.
 *   - Detect row format (pipe / semicolon / loose).
 *   - Parse a row into a lead candidate (output candidate schema).
 *   - Parse a whole block into candidates.
 *   - Validate a candidate (valid if lead_id OR name OR website).
 *   - Build a contract summary from a parse result.
 *
 *   Normalization of lead_id and website/domain is delegated to the dedupe
 *   engine (lead_dedupe_engine.mjs) so downstream dedupe stays compatible.
 *
 * HARD MODE — what this module DOES NOT do:
 *   - No network. No HTTP/fetch. No site scanning.
 *   - No SMTP. No email/Telegram/WhatsApp/MAX send. No auto-send.
 *   - No .env / secrets / tokens / CHAT_ID reads.
 *   - No real data writes. No leads_master.json write.
 *   - No contact enrichment. No lead_contact_registry write.
 *   - No bot integration. No git. No VPS/SSH.
 *   Pure in-memory parse/validate only. Real save happens later in D1a.
 *
 * NOT integrated into telegram_master_bot.mjs or russian_command_router.mjs.
 */

'use strict';

import {
    normalizeLeadId,
    normalizeDomain,
} from './lead_dedupe_engine.mjs';

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const CONTRACT_VERSION = 'lead-intake-contract-v1';

const DEFAULT_SOURCE = 'manual';
const DEFAULT_STATUS = 'new';

// Confidence levels per the contract rubric.
const CONF_STRUCTURED = 0.9; // pipe/semicolon with website/name/contact
const CONF_LOOSE      = 0.7; // loose row with website/contact
const CONF_PARTIAL    = 0.4; // partial row
const CONF_UNCLEAR    = 0.1; // unclear/garbage row

// Loose detection of an email / telegram / phone inside a text fragment.
const EMAIL_RE    = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const TELEGRAM_RE = /(?:t\.me\/|@)[a-z0-9_]{3,}/i;
const PHONE_RE    = /(?:\+?\d[\d\s().-]{6,}\d)/;

// A loose "looks like a website / domain" detector (before normalization).
const DOMAINISH_RE = /\b((?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s,;|]*)?)/i;

// Contact label prefixes used in structured rows.
const LABEL_RE = /^\s*(email|e-mail|mail|почта|telegram|tg|телеграм|tel|phone|тел|телефон|сайт|site|website|web)\s*[:=]?\s*/i;

// ──────────────────────────────────────────────
// Version
// ──────────────────────────────────────────────

/**
 * Return the contract version string.
 * @returns {string}
 */
export function getLeadIntakeContractVersion() {
    return CONTRACT_VERSION;
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function isNonEmptyStr(v) {
    return typeof v === 'string' && v.trim() !== '';
}

/** Build a fresh candidate object with schema defaults. */
function emptyCandidate(rawText = '') {
    return {
        lead_id: '',
        name: '',
        website: '',
        segment: '',
        region: '',
        source: DEFAULT_SOURCE,
        status: DEFAULT_STATUS,
        score: null,
        raw_text: typeof rawText === 'string' ? rawText : String(rawText ?? ''),
        parse_confidence: 0.0,
        needs_review_reason: '',
        contacts: {},
    };
}

/** Extract contacts (email/telegram/phone) from a free fragment. Pure regex. */
function extractContacts(fragment) {
    const out = {};
    if (!isNonEmptyStr(fragment)) return out;
    const email = fragment.match(EMAIL_RE);
    if (email) out.email = email[0];
    const tg = fragment.match(TELEGRAM_RE);
    if (tg) out.telegram = tg[0];
    const phone = fragment.match(PHONE_RE);
    // Avoid matching the email's digits etc.: only take phone if no email overlap.
    if (phone && !email) out.phone = phone[0].trim();
    return out;
}

/** Does this fragment carry a contact signal? */
function hasContactSignal(fragment) {
    if (!isNonEmptyStr(fragment)) return false;
    return EMAIL_RE.test(fragment) || TELEGRAM_RE.test(fragment);
}

/** Looks like a lead_id token? (short, safe charset, often alphanumeric code) */
function looksLikeLeadId(token) {
    if (!isNonEmptyStr(token)) return false;
    const t = token.trim();
    // safe charset and contains at least one digit OR is short uppercase code
    if (!/^[A-Za-z0-9_-]{2,20}$/.test(t)) return false;
    return /\d/.test(t) || /^[A-Z0-9_-]+$/.test(t);
}

// ──────────────────────────────────────────────
// Row splitting
// ──────────────────────────────────────────────

/**
 * Split an input text block into trimmed rows.
 * - Splits on newlines (\r\n, \r, \n).
 * - Drops empty lines after trim.
 *
 * @param {string} textBlock
 * @returns {string[]}
 */
export function splitLeadInputRows(textBlock) {
    if (textBlock === null || textBlock === undefined) return [];
    const s = String(textBlock);
    return s
        .split(/\r\n|\r|\n/)
        .map(line => line.trim())
        .filter(line => line !== '');
}

// ──────────────────────────────────────────────
// Format detection
// ──────────────────────────────────────────────

/**
 * Detect the format of a single row.
 * @param {string} row
 * @returns {'pipe'|'semicolon'|'loose'|'empty'}
 */
export function detectLeadRowFormat(row) {
    if (!isNonEmptyStr(row)) return 'empty';
    const r = row.trim();
    if (r.includes('|')) return 'pipe';
    if (r.includes(';')) return 'semicolon';
    return 'loose';
}

// ──────────────────────────────────────────────
// Field extraction from a labeled or positional segment
// ──────────────────────────────────────────────

/** Strip a known label prefix from a segment, returning {label, value}. */
function splitLabel(segment) {
    const m = segment.match(LABEL_RE);
    if (!m) return { label: '', value: segment.trim() };
    return { label: m[1].toLowerCase(), value: segment.slice(m[0].length).trim() };
}

/** Try to read a domain from a fragment, returning normalized domain or ''. */
function domainFromFragment(fragment) {
    if (!isNonEmptyStr(fragment)) return '';
    const m = fragment.match(DOMAINISH_RE);
    if (!m) return '';
    return normalizeDomain(m[1]);
}

// ──────────────────────────────────────────────
// Structured parse (pipe / semicolon)
// ──────────────────────────────────────────────

function parseStructuredRow(row, sep, cand) {
    const parts = row.split(sep).map(p => p.trim()).filter(p => p !== '');
    const positional = []; // unlabeled, non-contact segments in order

    for (const part of parts) {
        const { label, value } = splitLabel(part);
        if (!isNonEmptyStr(value) && !isNonEmptyStr(label)) continue;

        // Labeled contact segments.
        if (label === 'email' || label === 'e-mail' || label === 'mail' || label === 'почта') {
            const c = extractContacts(value);
            if (c.email) cand.contacts.email = c.email;
            continue;
        }
        if (label === 'telegram' || label === 'tg' || label === 'телеграм') {
            const c = extractContacts(value);
            cand.contacts.telegram = c.telegram || value;
            continue;
        }
        if (label === 'tel' || label === 'phone' || label === 'тел' || label === 'телефон') {
            const c = extractContacts(value);
            cand.contacts.phone = c.phone || value;
            continue;
        }
        if (label === 'сайт' || label === 'site' || label === 'website' || label === 'web') {
            const d = domainFromFragment(value);
            if (d && !cand.website) cand.website = d;
            continue;
        }

        // Unlabeled: detect contacts inline first.
        const inline = extractContacts(value);
        if (inline.email && !cand.contacts.email) cand.contacts.email = inline.email;
        if (inline.telegram && !cand.contacts.telegram) cand.contacts.telegram = inline.telegram;
        const looksContact = inline.email || inline.telegram || /t\.me\//i.test(value);

        // Detect a website segment.
        const d = domainFromFragment(value);
        if (d && !cand.website) {
            cand.website = d;
            continue;
        }

        if (!looksContact) positional.push(value);
    }

    // Assign positional fields: [lead_id?, name?, segment, region]
    // Heuristic: first positional that looks like a lead_id → lead_id.
    let idx = 0;
    if (positional.length && looksLikeLeadId(positional[0]) && !cand.lead_id) {
        cand.lead_id = normalizeLeadId(positional[0]);
        // If normalization rejected it, treat as name instead.
        if (!cand.lead_id) cand.name = positional[0];
        idx = 1;
    }
    const rest = positional.slice(idx);
    if (rest[0] && !cand.name) cand.name = rest[0];
    if (rest[1] && !cand.segment) cand.segment = rest[1];
    if (rest[2] && !cand.region) cand.region = rest[2];
    // Extra trailing positional → keep region if not set.
    if (rest[3] && !cand.region) cand.region = rest[3];

    return cand;
}

// ──────────────────────────────────────────────
// Loose parse
// ──────────────────────────────────────────────

function parseLooseRow(row, cand) {
    // Split on commas, but extract website/contacts from anywhere.
    const parts = row.split(',').map(p => p.trim()).filter(p => p !== '');
    const positional = [];

    for (const part of parts) {
        const inline = extractContacts(part);
        if (inline.email && !cand.contacts.email) cand.contacts.email = inline.email;
        if (inline.telegram && !cand.contacts.telegram) cand.contacts.telegram = inline.telegram;
        if (inline.phone && !cand.contacts.phone) cand.contacts.phone = inline.phone;

        const d = domainFromFragment(part);
        if (d && !cand.website) {
            cand.website = d;
            continue;
        }

        if (inline.email || inline.telegram) continue;

        // Strip leading helper words like "сайт", "email" from loose fragments.
        const cleaned = part.replace(LABEL_RE, '').trim();
        if (cleaned !== '') positional.push(cleaned);
    }

    // Loose heuristic: first positional → name, then segment, then region.
    if (positional[0] && !cand.name) cand.name = positional[0];
    if (positional[1] && !cand.segment) cand.segment = positional[1];
    if (positional[2] && !cand.region) cand.region = positional[2];

    return cand;
}

// ──────────────────────────────────────────────
// Confidence scoring
// ──────────────────────────────────────────────

function scoreConfidence(cand, format) {
    const hasWebsite = isNonEmptyStr(cand.website);
    const hasName    = isNonEmptyStr(cand.name);
    const hasLeadId  = isNonEmptyStr(cand.lead_id);
    const hasContact = !!(cand.contacts && (cand.contacts.email || cand.contacts.telegram));
    const hasAnyRequired = hasWebsite || hasName || hasLeadId;

    if (!hasAnyRequired) return CONF_UNCLEAR; // 0.1

    if (format === 'pipe' || format === 'semicolon') {
        if ((hasWebsite || hasName) && (hasContact || hasWebsite || hasName)) {
            // structured with website/name/contact
            if (hasWebsite || hasContact || (hasName && (hasLeadId || isNonEmptyStr(cand.segment)))) {
                return CONF_STRUCTURED; // 0.9
            }
        }
    }

    if (format === 'loose') {
        if (hasWebsite || hasContact) return CONF_LOOSE; // 0.7
    } else {
        // structured but weak (e.g. only a lead_id or only a bare name)
        if (hasWebsite || hasContact) return CONF_STRUCTURED;
    }

    // Has a required field but nothing strong → partial.
    return CONF_PARTIAL; // 0.4
}

// ──────────────────────────────────────────────
// Single-row parse
// ──────────────────────────────────────────────

/**
 * Parse one input row into a lead candidate (output candidate schema).
 *
 * @param {string} row
 * @param {object} [meta] { source, status }
 * @returns {object} candidate
 */
export function parseLeadInputRow(row, meta = {}) {
    const rawText = typeof row === 'string' ? row : String(row ?? '');
    const cand = emptyCandidate(rawText);
    if (meta && isNonEmptyStr(meta.source)) cand.source = meta.source.trim();
    if (meta && isNonEmptyStr(meta.status)) cand.status = meta.status.trim();

    const format = detectLeadRowFormat(rawText);

    if (format === 'empty') {
        cand.parse_confidence = CONF_UNCLEAR;
        cand.needs_review_reason = 'empty row';
        return cleanupCandidate(cand);
    }

    if (format === 'pipe') {
        parseStructuredRow(rawText, '|', cand);
    } else if (format === 'semicolon') {
        parseStructuredRow(rawText, ';', cand);
    } else {
        parseLooseRow(rawText, cand);
    }

    cand.parse_confidence = scoreConfidence(cand, format);

    const hasAnyRequired = isNonEmptyStr(cand.lead_id)
        || isNonEmptyStr(cand.name)
        || isNonEmptyStr(cand.website);

    if (!hasAnyRequired) {
        cand.needs_review_reason = 'no lead_id, name or website detected';
        if (cand.parse_confidence > CONF_UNCLEAR) cand.parse_confidence = CONF_UNCLEAR;
    } else if (cand.parse_confidence <= CONF_PARTIAL) {
        cand.needs_review_reason = 'partial parse — please verify';
    }

    return cleanupCandidate(cand);
}

/** Drop empty contacts object so schema stays clean. */
function cleanupCandidate(cand) {
    if (cand.contacts && Object.keys(cand.contacts).length === 0) {
        delete cand.contacts;
    }
    return cand;
}

// ──────────────────────────────────────────────
// Block parse
// ──────────────────────────────────────────────

/**
 * Parse a whole text block into candidates + per-row meta.
 *
 * @param {string} textBlock
 * @param {object} [meta] { source, status }
 * @returns {{
 *   candidates: object[],
 *   total: number,
 *   valid: object[],
 *   needs_review: object[],
 *   valid_count: number,
 *   needs_review_count: number
 * }}
 */
export function parseLeadInputBlock(textBlock, meta = {}) {
    const rows = splitLeadInputRows(textBlock);
    const candidates = rows.map(r => parseLeadInputRow(r, meta));

    const valid = [];
    const needsReview = [];
    for (const c of candidates) {
        const v = validateLeadCandidate(c);
        if (v.valid && !v.needs_review) valid.push(c);
        else needsReview.push(c);
    }

    return {
        candidates,
        total: candidates.length,
        valid,
        needs_review: needsReview,
        valid_count: valid.length,
        needs_review_count: needsReview.length,
    };
}

// ──────────────────────────────────────────────
// Validation
// ──────────────────────────────────────────────

/**
 * Validate a candidate.
 * - valid if lead_id OR name OR website present.
 * - needs_review if empty/garbage/unclear (no required field) or low confidence.
 *
 * @param {object} candidate
 * @returns {{ valid: boolean, needs_review: boolean, reason: string }}
 */
export function validateLeadCandidate(candidate) {
    const c = candidate && typeof candidate === 'object' ? candidate : {};
    const hasLeadId  = isNonEmptyStr(c.lead_id);
    const hasName    = isNonEmptyStr(c.name);
    const hasWebsite = isNonEmptyStr(c.website);
    const hasRequired = hasLeadId || hasName || hasWebsite;

    if (!hasRequired) {
        return {
            valid: false,
            needs_review: true,
            reason: isNonEmptyStr(c.needs_review_reason)
                ? c.needs_review_reason
                : 'no lead_id, name or website',
        };
    }

    // Explicit needs_review_reason already set → flag for review but still "valid input".
    if (isNonEmptyStr(c.needs_review_reason)) {
        return { valid: true, needs_review: true, reason: c.needs_review_reason };
    }

    return { valid: true, needs_review: false, reason: '' };
}

// ──────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────

/**
 * Build a compact contract summary from a parseLeadInputBlock() result.
 *
 * @param {object} result
 * @returns {{
 *   total: number,
 *   valid_count: number,
 *   needs_review_count: number,
 *   format_counts: { pipe:number, semicolon:number, loose:number, empty:number },
 *   confidence_buckets: { high:number, loose:number, partial:number, unclear:number },
 *   contract_version: string
 * }}
 */
export function buildLeadIntakeContractSummary(result) {
    const r = result && typeof result === 'object' ? result : {};
    const candidates = Array.isArray(r.candidates) ? r.candidates : [];

    const format_counts = { pipe: 0, semicolon: 0, loose: 0, empty: 0 };
    const confidence_buckets = { high: 0, loose: 0, partial: 0, unclear: 0 };

    for (const c of candidates) {
        const fmt = detectLeadRowFormat(c && c.raw_text);
        if (Object.prototype.hasOwnProperty.call(format_counts, fmt)) format_counts[fmt] += 1;

        const conf = c && Number.isFinite(c.parse_confidence) ? c.parse_confidence : 0;
        if (conf >= CONF_STRUCTURED) confidence_buckets.high += 1;
        else if (conf >= CONF_LOOSE) confidence_buckets.loose += 1;
        else if (conf >= CONF_PARTIAL) confidence_buckets.partial += 1;
        else confidence_buckets.unclear += 1;
    }

    return {
        total: Number.isFinite(r.total) ? r.total : candidates.length,
        valid_count: Number.isFinite(r.valid_count) ? r.valid_count : 0,
        needs_review_count: Number.isFinite(r.needs_review_count) ? r.needs_review_count : 0,
        format_counts,
        confidence_buckets,
        contract_version: CONTRACT_VERSION,
    };
}

export default {
    getLeadIntakeContractVersion,
    splitLeadInputRows,
    detectLeadRowFormat,
    parseLeadInputRow,
    parseLeadInputBlock,
    validateLeadCandidate,
    buildLeadIntakeContractSummary,
};
