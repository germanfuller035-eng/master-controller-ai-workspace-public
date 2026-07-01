/**
 * contact_channel_extractor.mjs — Automatic Contact Channel Extractor (Phase C2.7a)
 *
 * APPROVAL: APPROVE_AUTOMATIC_CONTACT_CHANNEL_EXTRACTOR_C27A_STANDALONE_2026-05-31
 *
 * Purpose:
 *   A pure, standalone, OFFLINE module that extracts public contact channels
 *   (email, phone, WhatsApp, Telegram, MAX, website forms) from raw text or
 *   HTML. It performs NO network requests, NO site scanning, NO sending of any
 *   message, and reads NO secrets. It is a string-in / structured-data-out
 *   analyzer only.
 *
 * Exports:
 *   - extractContactChannels(input, options = {})
 *   - extractEmails(text)
 *   - extractPhones(text)
 *   - extractWhatsAppChannels(text)
 *   - extractTelegramChannels(text)
 *   - extractMaxChannels(text)
 *   - extractWebsiteForms(text)
 *   - classifyBestContactChannel(channels)
 *   - normalizeExtractedChannels(channels)
 *
 * Channel object shape:
 *   {
 *     type:       'email' | 'phone' | 'whatsapp' | 'telegram' | 'max' | 'website_form',
 *     value:      string,                       // normalized value
 *     status:     'public_found' | 'confirmed' | 'possible',
 *     source:     'text' | 'html' | 'text_or_html',
 *     confidence: number                        // 0..1
 *   }
 *
 * SAFETY CONTRACT (HARD MODE):
 *   - NEVER reads .env / AI_SECRETS. NEVER prints BOT_TOKEN / CHAT_ID / SMTP creds.
 *   - NEVER sends email / WhatsApp / Telegram / MAX. NEVER opens SMTP.
 *   - NEVER performs any network request (no fetch / http / https / net / tls / dns).
 *   - Pure functions: input string → structured channel objects only.
 *   - No filesystem writes. No process mutation.
 */

// ──────────────────────────────────────────────
// Constants / channel taxonomy
// ──────────────────────────────────────────────

export const CHANNEL_TYPES = Object.freeze({
    EMAIL: 'email',
    PHONE: 'phone',
    WHATSAPP: 'whatsapp',
    TELEGRAM: 'telegram',
    MAX: 'max',
    WEBSITE_FORM: 'website_form',
});

export const CHANNEL_STATUS = Object.freeze({
    PUBLIC_FOUND: 'public_found',
    CONFIRMED: 'confirmed',
    POSSIBLE: 'possible',
});

// Verified/manual sources (used by classifyBestContactChannel for ranking).
const VERIFIED_SOURCES = new Set(['manual', 'manual_verified', 'verified']);

// ──────────────────────────────────────────────
// Safe input helpers
// ──────────────────────────────────────────────

function asText(input) {
    if (input == null) return '';
    if (typeof input === 'string') return input;
    try { return String(input); } catch (_) { return ''; }
}

// Crude HTML detection (presence of a tag-like construct).
function looksLikeHtml(text) {
    return /<\s*[a-zA-Z!/]/.test(text);
}

function sourceLabel(text) {
    return looksLikeHtml(text) ? 'html' : 'text';
}

// Decode the handful of HTML entities that matter for contact extraction.
function decodeBasicEntities(text) {
    return text
        .replace(/&amp;/gi, '&')
        .replace(/&#0*64;/g, '@')
        .replace(/&#x0*40;/gi, '@')
        .replace(/&#0*46;/g, '.')
        .replace(/&#x0*2e;/gi, '.')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&nbsp;/gi, ' ');
}

function dedupeKey(ch) {
    return `${ch.type}::${String(ch.value).trim().toLowerCase()}`;
}

// ──────────────────────────────────────────────
// 1. Email extraction
// ──────────────────────────────────────────────

const EMAIL_CORE_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const MAILTO_RE = /mailto:\s*([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi;

// ──────────────────────────────────────────────
// Placeholder / example email detection (pure)
//
// Documentation, templates and theme demos litter pages with fake addresses like
// example@mail.ru, ivan@domain.ru, user@example.com, your@email.com. These must
// NEVER become a real contact (the system could otherwise prepare a letter to a
// fictitious recipient). This is a conservative blocklist — when in doubt we drop.
// ──────────────────────────────────────────────

// Domains that are reserved for documentation/examples (RFC 2606) or are obvious
// stand-ins used in RU/EN web templates.
const PLACEHOLDER_DOMAINS = new Set([
    'example.com', 'example.org', 'example.net', 'example.ru', 'example.edu',
    'domain.ru', 'domain.com', 'mail.example', 'email.com', 'yourdomain.com',
    'yourcompany.com', 'company.com', 'site.ru', 'sait.ru', 'test.com', 'test.ru',
    'mydomain.com', 'somedomain.com', 'nomail.com', 'noreply.example',
]);

// Local-parts that signal a placeholder regardless of domain.
const PLACEHOLDER_LOCALPARTS = new Set([
    'example', 'test', 'user', 'username', 'name', 'your', 'youremail', 'your_email',
    'email', 'mail', 'sample', 'demo', 'placeholder', 'firstname', 'lastname',
    'ivan', 'ivanov', 'petrov', 'noreply', 'no-reply', 'donotreply',
]);

// Whole-address patterns that are unmistakably templates.
const PLACEHOLDER_FULL_RE = [
    /^[a-z]+@domain\.[a-z]{2,}$/i,        // ivan@domain.ru, name@domain.com
    /^[a-z]+@your[a-z]*\.[a-z]{2,}$/i,    // you@yourdomain.com
    /^(your|user|name|email|mail)[._-]?(name|email|mail)?@/i,
];

// Extract the lowercased domain part of an email (after @). Returns '' if invalid.
export function emailDomain(email) {
    const s = String(email || '').trim().toLowerCase();
    const at = s.lastIndexOf('@');
    if (at < 0) return '';
    return s.slice(at + 1).replace(/^www\./, '');
}

// Pure: is this email a placeholder / example / template address (never a real lead)?
export function isPlaceholderEmail(email) {
    const e = String(email || '').trim().toLowerCase();
    if (!e || e.indexOf('@') < 0) return true; // not a usable address
    const local = e.slice(0, e.indexOf('@'));
    const domain = emailDomain(e);
    if (PLACEHOLDER_DOMAINS.has(domain)) return true;
    if (PLACEHOLDER_LOCALPARTS.has(local)) return true;
    for (const re of PLACEHOLDER_FULL_RE) { if (re.test(e)) return true; }
    // domains whose label is literally "domain"/"example"/"site" at any level
    if (/(^|\.)(example|domain|yourdomain|test)\.[a-z]{2,}$/i.test(domain)) return true;
    return false;
}

// Pure: does the email's domain match an official site domain (same registrable host)?
// Used by the crawler to boost confidence for emails found on the company's own domain.
export function emailMatchesDomain(email, siteDomainOrUrl) {
    const ed = emailDomain(email);
    if (!ed) return false;
    let sd = String(siteDomainOrUrl || '').trim().toLowerCase();
    try { if (/^https?:\/\//.test(sd)) sd = new URL(sd).host; } catch { /* keep as-is */ }
    sd = sd.replace(/^www\./, '');
    if (!sd) return false;
    if (ed === sd) return true;
    // allow subdomain relationship in either direction (mail.acme.ru ↔ acme.ru)
    return ed.endsWith('.' + sd) || sd.endsWith('.' + ed);
}

export function extractEmails(text) {
    const raw = decodeBasicEntities(asText(text));
    if (!raw.trim()) return [];
    const src = sourceLabel(raw);
    const out = [];
    const seen = new Set();

    function pushEmail(value, fromMailto) {
        const v = String(value).trim().replace(/[.,;:)>\]]+$/, '').toLowerCase();
        if (!v) return;
        // Never emit documentation / template / example addresses.
        if (isPlaceholderEmail(v)) return;
        const key = v;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({
            type: CHANNEL_TYPES.EMAIL,
            value: v,
            status: CHANNEL_STATUS.PUBLIC_FOUND,
            source: src,
            // mailto: links are slightly more reliable than a bare in-text match.
            confidence: fromMailto ? 0.92 : 0.9,
        });
    }

    let m;
    MAILTO_RE.lastIndex = 0;
    while ((m = MAILTO_RE.exec(raw)) !== null) {
        pushEmail(m[1], true);
    }

    EMAIL_CORE_RE.lastIndex = 0;
    while ((m = EMAIL_CORE_RE.exec(raw)) !== null) {
        pushEmail(m[0], false);
    }

    return out;
}

// ──────────────────────────────────────────────
// 2. Phone extraction (Russian numbers)
// ──────────────────────────────────────────────

// Match Russian phone shapes: +7, 8, with optional separators (space, dash,
// parens, dot). We capture loosely then normalize/validate by digit count.
const PHONE_CANDIDATE_RE =
    /(?:\+7|\b8|\b7)[\s\-.()]*\d(?:[\s\-.()]*\d){9}/g;

// Normalize a raw phone candidate to canonical +7XXXXXXXXXX (11 digits total).
export function normalizeRussianPhone(raw) {
    const digits = String(raw == null ? '' : raw).replace(/\D/g, '');
    if (!digits) return null;
    let d = digits;
    // 8XXXXXXXXXX  → 7XXXXXXXXXX
    if (d.length === 11 && d[0] === '8') d = '7' + d.slice(1);
    // 7XXXXXXXXXX  → keep
    // 10 digits (no country code) → assume RU, prepend 7
    if (d.length === 10) d = '7' + d;
    if (d.length !== 11 || d[0] !== '7') return null;
    return '+' + d;
}

export function extractPhones(text) {
    const raw = decodeBasicEntities(asText(text));
    if (!raw.trim()) return [];
    const src = sourceLabel(raw);
    const out = [];
    const seen = new Set();

    let m;
    PHONE_CANDIDATE_RE.lastIndex = 0;
    while ((m = PHONE_CANDIDATE_RE.exec(raw)) !== null) {
        const normalized = normalizeRussianPhone(m[0]);
        if (!normalized) continue;
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        out.push({
            type: CHANNEL_TYPES.PHONE,
            value: normalized,
            status: CHANNEL_STATUS.PUBLIC_FOUND,
            source: src,
            confidence: 0.75,
        });
    }

    return out;
}

// ──────────────────────────────────────────────
// Shared: find a phone mentioned near a keyword (for messenger "possible")
// ──────────────────────────────────────────────

function findPhonesNearKeywords(text, keywords, windowSize = 40) {
    const found = [];
    const lower = text.toLowerCase();
    const matches = [];
    let m;
    PHONE_CANDIDATE_RE.lastIndex = 0;
    while ((m = PHONE_CANDIDATE_RE.exec(text)) !== null) {
        const normalized = normalizeRussianPhone(m[0]);
        if (!normalized) continue;
        matches.push({ normalized, index: m.index, length: m[0].length });
    }
    for (const ph of matches) {
        const start = Math.max(0, ph.index - windowSize);
        const end = Math.min(text.length, ph.index + ph.length + windowSize);
        const ctx = lower.slice(start, end);
        if (keywords.some(k => ctx.includes(k))) {
            found.push(ph.normalized);
        }
    }
    return Array.from(new Set(found));
}

// ──────────────────────────────────────────────
// 3. WhatsApp extraction
// ──────────────────────────────────────────────

const WA_LINK_RE =
    /(?:https?:\/\/)?(?:wa\.me\/\+?\d{6,15}|api\.whatsapp\.com\/send\?[^\s"'<>]*phone=\+?\d{6,15}|api\.whatsapp\.com\/send\/?\?[^\s"'<>]*|whatsapp:\/\/send\?[^\s"'<>]*|whatsapp:\/\/[^\s"'<>]*)/gi;

const WA_KEYWORDS = ['whatsapp', 'ватсап', 'вотсап', 'вацап', ' wa '];

export function extractWhatsAppChannels(text) {
    const raw = decodeBasicEntities(asText(text));
    if (!raw.trim()) return [];
    const src = sourceLabel(raw);
    const out = [];
    const seen = new Set();

    function pushChannel(value, status, confidence) {
        const v = String(value).trim();
        const key = v.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push({
            type: CHANNEL_TYPES.WHATSAPP,
            value: v,
            status,
            source: src,
            confidence,
        });
    }

    // Confirmed: explicit wa.me / api.whatsapp.com / whatsapp:// links.
    let m;
    WA_LINK_RE.lastIndex = 0;
    while ((m = WA_LINK_RE.exec(raw)) !== null) {
        pushChannel(m[0], CHANNEL_STATUS.CONFIRMED, 0.95);
    }

    // Possible: a phone number sitting next to a WhatsApp keyword.
    if (out.length === 0) {
        const nearby = findPhonesNearKeywords(raw, WA_KEYWORDS);
        for (const phone of nearby) {
            pushChannel(phone, CHANNEL_STATUS.POSSIBLE, 0.5);
        }
    }

    return out;
}

// ──────────────────────────────────────────────
// 4. Telegram extraction
// ──────────────────────────────────────────────

const TG_LINK_RE =
    /(?:https?:\/\/)?(?:t\.me|telegram\.me|telegram\.dog)\/(?:joinchat\/)?[A-Za-z0-9_+\-]{2,}/gi;

const TG_KEYWORDS = ['telegram', 'телеграм', 'телеграмм', 'тг ', ' tg ', 'тлг'];

// @username candidates (must NOT be part of an email).
const TG_HANDLE_RE = /(^|[\s(>"'\[])@([A-Za-z][A-Za-z0-9_]{3,31})\b/g;

export function extractTelegramChannels(text) {
    const raw = decodeBasicEntities(asText(text));
    if (!raw.trim()) return [];
    const src = sourceLabel(raw);
    const lower = raw.toLowerCase();
    const out = [];
    const seen = new Set();
    const hasTelegramContext = TG_KEYWORDS.some(k => lower.includes(k.trim()));

    function pushChannel(value, status, confidence) {
        const v = String(value).trim();
        const key = v.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push({
            type: CHANNEL_TYPES.TELEGRAM,
            value: v,
            status,
            source: src,
            confidence,
        });
    }

    // Confirmed: explicit t.me / telegram.me links.
    let m;
    TG_LINK_RE.lastIndex = 0;
    while ((m = TG_LINK_RE.exec(raw)) !== null) {
        pushChannel(m[0], CHANNEL_STATUS.CONFIRMED, 0.95);
    }

    // @username — only if Telegram context exists nearby/in document, and the
    // handle is NOT part of an email address (avoid hitting user@domain).
    TG_HANDLE_RE.lastIndex = 0;
    while ((m = TG_HANDLE_RE.exec(raw)) !== null) {
        const handle = m[2];
        const matchStart = m.index + m[1].length; // position of '@'
        // Skip if this '@' is inside an email (preceded by a word char, or the
        // handle is immediately followed by a domain dot pattern → email).
        const before = raw[matchStart - 1] || '';
        if (/[A-Za-z0-9._%+\-]/.test(before)) continue; // local-part@ → email
        const after = raw.slice(matchStart + 1 + handle.length, matchStart + 1 + handle.length + 40);
        if (/^\.[A-Za-z]{2,}/.test(after)) continue;     // @domain.tld → email
        if (!hasTelegramContext) continue;               // need explicit TG context
        pushChannel('@' + handle, CHANNEL_STATUS.CONFIRMED, 0.8);
    }

    return out;
}

// ──────────────────────────────────────────────
// 5. MAX (Russian messenger) extraction
// ──────────────────────────────────────────────

const MAX_LINK_RE =
    /(?:https?:\/\/)?(?:max\.ru|max\.me)\/[A-Za-z0-9_+\-]{2,}/gi;

// Word-boundary MAX / МАКС, and explicit button phrasing.
const MAX_WORD_RE = /(^|[\s(>"'\[])(MAX|МАКС)([\s).,!?:;<"'\]]|$)/g;
const MAX_BUTTON_RE = /написать\s+в\s+(?:max|макс)/i;
const MAX_KEYWORDS = ['max', 'макс'];

export function extractMaxChannels(text) {
    const raw = decodeBasicEntities(asText(text));
    if (!raw.trim()) return [];
    const src = sourceLabel(raw);
    const out = [];
    const seen = new Set();

    function pushChannel(value, status, confidence) {
        const v = String(value).trim();
        const key = `${status}::${v.toLowerCase()}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({
            type: CHANNEL_TYPES.MAX,
            value: v,
            status,
            source: src,
            confidence,
        });
    }

    // Confirmed: explicit MAX public link.
    let m;
    MAX_LINK_RE.lastIndex = 0;
    while ((m = MAX_LINK_RE.exec(raw)) !== null) {
        pushChannel(m[0], CHANNEL_STATUS.CONFIRMED, 0.9);
    }

    // Confirmed: explicit "Написать в MAX" button text.
    const hasButton = MAX_BUTTON_RE.test(raw);
    if (hasButton) {
        pushChannel('max_button', CHANNEL_STATUS.CONFIRMED, 0.85);
    }

    // Possible: explicit MAX / МАКС word (only if not already confirmed by link/button),
    // OR a phone number near a MAX keyword.
    MAX_WORD_RE.lastIndex = 0;
    let hasMaxWord = false;
    while ((m = MAX_WORD_RE.exec(raw)) !== null) { hasMaxWord = true; break; }

    if (out.length === 0 && hasMaxWord) {
        pushChannel('max_mention', CHANNEL_STATUS.POSSIBLE, 0.45);
    }

    // Possible: phone near MAX keyword (separate from a generic phone).
    const nearby = findPhonesNearKeywords(raw, MAX_KEYWORDS);
    for (const phone of nearby) {
        pushChannel(phone, CHANNEL_STATUS.POSSIBLE, 0.45);
    }

    return out;
}

// ──────────────────────────────────────────────
// 6. Website forms extraction
// ──────────────────────────────────────────────

const FORM_TAG_RE = /<\s*form\b/i;
const FORM_PHRASES = [
    'оставить заявку',
    'оставьте заявку',
    'обратная связь',
    'обратной связи',
    'задать вопрос',
    'заказать звонок',
    'заказать обратный звонок',
];

export function extractWebsiteForms(text) {
    const raw = asText(text);
    if (!raw.trim()) return [];
    const src = sourceLabel(raw);
    const lower = raw.toLowerCase();
    const out = [];
    let detected = false;
    let reason = null;

    if (FORM_TAG_RE.test(raw)) {
        detected = true;
        reason = 'form_tag';
    } else {
        for (const phrase of FORM_PHRASES) {
            if (lower.includes(phrase)) {
                detected = true;
                reason = 'form_phrase';
                break;
            }
        }
    }

    if (detected) {
        out.push({
            type: CHANNEL_TYPES.WEBSITE_FORM,
            value: 'form_detected',
            status: CHANNEL_STATUS.PUBLIC_FOUND,
            source: src,
            confidence: 0.65,
            detected_by: reason,
        });
    }

    return out;
}

// ──────────────────────────────────────────────
// normalizeExtractedChannels — dedupe + stable ordering
// ──────────────────────────────────────────────

export function normalizeExtractedChannels(channels) {
    if (!Array.isArray(channels)) return [];
    const byKey = new Map();

    for (const ch of channels) {
        if (!ch || typeof ch !== 'object' || !ch.type) continue;
        const value = ch.value == null ? '' : String(ch.value).trim();
        if (!value) continue;
        const normalized = {
            type: ch.type,
            value: (ch.type === CHANNEL_TYPES.EMAIL) ? value.toLowerCase() : value,
            status: ch.status || CHANNEL_STATUS.PUBLIC_FOUND,
            source: ch.source || 'text_or_html',
            confidence: typeof ch.confidence === 'number' ? ch.confidence : 0,
        };
        if (ch.detected_by) normalized.detected_by = ch.detected_by;

        const key = dedupeKey(normalized);
        const existing = byKey.get(key);
        if (!existing) {
            byKey.set(key, normalized);
        } else {
            // Keep the strongest status/confidence on duplicate.
            const rank = s =>
                s === CHANNEL_STATUS.CONFIRMED ? 3 :
                s === CHANNEL_STATUS.PUBLIC_FOUND ? 2 :
                s === CHANNEL_STATUS.POSSIBLE ? 1 : 0;
            if (rank(normalized.status) > rank(existing.status) ||
                (rank(normalized.status) === rank(existing.status) &&
                 normalized.confidence > existing.confidence)) {
                byKey.set(key, { ...normalized });
            }
        }
    }

    return Array.from(byKey.values());
}

// ──────────────────────────────────────────────
// extractContactChannels — orchestrator
// ──────────────────────────────────────────────

export function extractContactChannels(input, options = {}) {
    const text = asText(input);
    const opts = (options && typeof options === 'object') ? options : {};

    const collected = [];
    collected.push(...extractEmails(text));
    collected.push(...extractPhones(text));
    collected.push(...extractWhatsAppChannels(text));
    collected.push(...extractTelegramChannels(text));
    collected.push(...extractMaxChannels(text));
    collected.push(...extractWebsiteForms(text));

    let channels = normalizeExtractedChannels(collected);

    // Optionally inject verified/manual channels (e.g. from the registry) so
    // that classifyBestContactChannel can prefer them. These never come from
    // the network — caller supplies them explicitly.
    if (Array.isArray(opts.knownChannels) && opts.knownChannels.length) {
        channels = normalizeExtractedChannels([...opts.knownChannels, ...channels]);
    }

    const best = classifyBestContactChannel(channels);

    return {
        ok: true,
        input_kind: looksLikeHtml(text) ? 'html' : 'text',
        channels,
        best,
        counts: countByType(channels),
        safety: {
            network_used: false,
            external_send: false,
            smtp_used: false,
            env_read: false,
        },
    };
}

function countByType(channels) {
    const counts = {};
    for (const ch of channels) {
        counts[ch.type] = (counts[ch.type] || 0) + 1;
    }
    return counts;
}

// ──────────────────────────────────────────────
// classifyBestContactChannel — priority selection
//
// Priority order:
//   1. verified/manual email
//   2. public_found email
//   3. confirmed WhatsApp public link
//   4. confirmed Telegram public link
//   5. confirmed MAX public link
//   6. phone
//   7. website_form
//   8. possible channels (any)
// ──────────────────────────────────────────────

export function classifyBestContactChannel(channels) {
    const list = Array.isArray(channels) ? channels : [];

    const find = pred => list.find(pred) || null;
    const isEmail = c => c.type === CHANNEL_TYPES.EMAIL;
    const isConfirmed = c => c.status === CHANNEL_STATUS.CONFIRMED;
    const isPossible = c => c.status === CHANNEL_STATUS.POSSIBLE;

    const result = (channel, reason) => channel
        ? {
            best_channel_type: channel.type,
            best_value: channel.value,
            reason,
            confidence: typeof channel.confidence === 'number' ? channel.confidence : 0,
        }
        : null;

    // 1. verified/manual email
    const verifiedEmail = find(c => isEmail(c) &&
        (VERIFIED_SOURCES.has(String(c.source)) ||
         c.status === 'verified' || c.status === 'manual'));
    if (verifiedEmail) return result(verifiedEmail, 'verified_or_manual_email');

    // 2. public_found email
    const publicEmail = find(c => isEmail(c) && c.status === CHANNEL_STATUS.PUBLIC_FOUND);
    if (publicEmail) return result(publicEmail, 'public_found_email');

    // 3. confirmed WhatsApp public link
    const waConfirmed = find(c => c.type === CHANNEL_TYPES.WHATSAPP && isConfirmed(c));
    if (waConfirmed) return result(waConfirmed, 'confirmed_whatsapp_link');

    // 4. confirmed Telegram public link
    const tgConfirmed = find(c => c.type === CHANNEL_TYPES.TELEGRAM && isConfirmed(c));
    if (tgConfirmed) return result(tgConfirmed, 'confirmed_telegram_link');

    // 5. confirmed MAX public link
    const maxConfirmed = find(c => c.type === CHANNEL_TYPES.MAX && isConfirmed(c));
    if (maxConfirmed) return result(maxConfirmed, 'confirmed_max_link');

    // 6. phone
    const phone = find(c => c.type === CHANNEL_TYPES.PHONE);
    if (phone) return result(phone, 'phone');

    // 7. website_form
    const form = find(c => c.type === CHANNEL_TYPES.WEBSITE_FORM);
    if (form) return result(form, 'website_form');

    // 8. any possible channel
    const possible = find(c => isPossible(c));
    if (possible) return result(possible, `possible_${possible.type}`);

    return {
        best_channel_type: null,
        best_value: null,
        reason: 'no_contact_channel_found',
        confidence: 0,
    };
}

export default {
    CHANNEL_TYPES,
    CHANNEL_STATUS,
    extractContactChannels,
    extractEmails,
    extractPhones,
    extractWhatsAppChannels,
    extractTelegramChannels,
    extractMaxChannels,
    extractWebsiteForms,
    classifyBestContactChannel,
    normalizeExtractedChannels,
    normalizeRussianPhone,
    isPlaceholderEmail,
    emailDomain,
    emailMatchesDomain,
};
