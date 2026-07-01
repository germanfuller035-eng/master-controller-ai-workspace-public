// telegram_contact_resolver.mjs
// Mini Audit Contact Resolver — PRODUCTION real-contact resolution for TOP leads.
//
// SAFETY CONTRACT:
//   - NO Telegram API, NO PowerShell, NO token read, NO .env read.
//   - READ-ONLY. NEVER writes to 13_sales / lead_contacts.json / any production
//     data. NEVER performs network calls / web scraping / DNS lookups.
//   - Reading local registry / local website-contact files is allowed (offline,
//     local disk only). NO client contact is ever made here. NO send. NO
//     "contacted" flag is ever stamped.
//   - Fake / example / test recipients are HARD-BLOCKED and never returned as a
//     sendable contact. If no REAL email is found the resolver returns
//     REAL_CLIENT_RECIPIENT_REQUIRED.

import fs from 'node:fs';
import path from 'node:path';

export const OWNER_REFUSAL =
    'Команда контакта доступна только владельцу. Доступ отклонён.';

export const CONTACT_NOT_FOUND = 'CONTACT_NOT_FOUND';
export const REAL_CLIENT_RECIPIENT_REQUIRED = 'REAL_CLIENT_RECIPIENT_REQUIRED';

// Default production lead-contact registry (READ-ONLY).
export const DEFAULT_REGISTRY_PATH = 'D:/AI_WORKSPACE/13_sales/lead_contacts.json';

// ----------------------------------------------------------------------------
// Fake / non-production recipient detection. These must NEVER be sendable.
// ----------------------------------------------------------------------------
const FAKE_EMAIL_PATTERNS = [
    /@example\.(com|org|net)$/i,
    /@test\./i,
    /@localhost$/i,
    /@invalid$/i,
    /@(mailinator|example)\b/i,
    /^test[-_.]/i,
    /^test@/i,
    /^demo@/i,
    /^demo\d*@/i,
    /^noreply@/i,
    /^no-reply@/i,
    /\bEMAIL_TEST_TO\b/i,
];

export function isFakeEmail(email) {
    if (!email || typeof email !== 'string') return true;
    const e = email.trim();
    if (!e) return true;
    // Basic shape check — must look like an email.
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return true;
    return FAKE_EMAIL_PATTERNS.some((re) => re.test(e));
}

export function isRealEmail(email) {
    return !isFakeEmail(email);
}

// ----------------------------------------------------------------------------
// Offline fixture contact (build/test only). NOT production data.
// NOTE: deliberately carries NO email so the fixture can NEVER inject a fake /
// example recipient into the production send path.
// ----------------------------------------------------------------------------
export const OFFLINE_FIXTURE_CONTACTS = [
    {
        lead_id: '002',
        target: 'top1',
        company: 'ЖЕЛЕЗОБЕТОН',
        website: 'zb23.ru',
        channel: '',
        email: '',
        phone: '',
        form: '',
        confidence: 'none',
        risk: 'low',
        source_file: '(offline-fixture-no-email)',
    },
];

// ----------------------------------------------------------------------------
// Command classification
// ----------------------------------------------------------------------------
// Legacy: /audit_contact, /audit_resolve, "контакт ..."
export function classifyContactCommand(rawText) {
    if (rawText == null) return null;
    const t = String(rawText).trim();
    const low = t.toLowerCase();
    if (!low) return null;

    let m = t.match(/^\/audit_contact\s+(\S+)$/i);
    if (m) return { action: 'resolve', query: m[1] };
    m = t.match(/^\/audit_resolve\s+(\S+)$/i);
    if (m) return { action: 'resolve', query: m[1] };

    m = low.match(/^(?:найди|покажи)?\s*контакт\s+(.+)$/i);
    if (m) {
        return { action: 'resolve', query: normalizeQuery(m[1]) };
    }

    return null;
}

// Production: /contact_resolve top1  (and RU "разреши контакт топ 1")
export function classifyContactResolveCommand(rawText) {
    if (rawText == null) return null;
    const t = String(rawText).trim();
    const low = t.toLowerCase();
    if (!low) return null;

    let m = t.match(/^\/contact_resolve\s+(\S+)$/i);
    if (m) return { action: 'contact_resolve', query: normalizeQuery(m[1]) };

    m = low.match(/^(?:разреши|резолв|resolve)\s+контакт\s+(.+)$/i);
    if (m) return { action: 'contact_resolve', query: normalizeQuery(m[1]) };

    return null;
}

function normalizeQuery(raw) {
    const q = String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (/^(топ|top)\s*1$/.test(q)) return 'top1';
    return q;
}

function bareHost(website) {
    const host = String(website || '')
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .split('/')[0];
    return host.split('.')[0];
}

// ----------------------------------------------------------------------------
// Real registry loader (READ-ONLY, local disk). Returns a MAP keyed by lead_id
// (production lead_contacts.json shape) or {} on any error.
// ----------------------------------------------------------------------------
export function loadRealRegistrySync(registryPath = DEFAULT_REGISTRY_PATH) {
    try {
        const raw = fs.readFileSync(registryPath, 'utf8');
        const data = JSON.parse(raw);
        if (data && typeof data === 'object' && !Array.isArray(data)) return data;
        return {};
    } catch {
        return {};
    }
}

// Pick the first REAL (non-fake) email from a registry record.
function pickRealEmailFromRecord(rec) {
    if (!rec) return '';
    const candidates = [];
    if (rec.primary_email) candidates.push(rec.primary_email);
    if (Array.isArray(rec.emails)) candidates.push(...rec.emails);
    if (rec.channels && Array.isArray(rec.channels.email)) {
        for (const e of rec.channels.email) {
            if (e && e.value) candidates.push(e.value);
        }
    }
    for (const c of candidates) {
        if (isRealEmail(c)) return c;
    }
    return '';
}

// Find a registry record for a TOP lead by lead_id OR by website host.
//   - lead.lead_id (e.g. "002")
//   - bare host (e.g. "zb23" -> registry key "ZB23")
//   - note/source/website substring containing the host
function findRegistryRecord(registry, { leadId, website } = {}) {
    if (!registry || typeof registry !== 'object') return null;
    const keys = Object.keys(registry);
    const host = bareHost(website);

    // 1. direct lead_id key (case-insensitive)
    if (leadId) {
        const exact = keys.find((k) => k.toLowerCase() === String(leadId).toLowerCase());
        if (exact) return { key: exact, rec: registry[exact] };
    }

    // 2. bare host -> key match (e.g. "zb23" === "ZB23")
    if (host) {
        const byHost = keys.find((k) => k.toLowerCase() === host);
        if (byHost) return { key: byHost, rec: registry[byHost] };
    }

    // 3. website host appears in record website/note/source
    if (host) {
        for (const k of keys) {
            const rec = registry[k] || {};
            const blob = `${rec.website || ''} ${rec.note || ''} ${rec.source || ''}`.toLowerCase();
            if (blob.includes(host)) return { key: k, rec };
        }
    }

    return null;
}

// ----------------------------------------------------------------------------
// Optional: parse a local website-contact file for mailto/email text.
// READ-ONLY, local file only. No network.
// ----------------------------------------------------------------------------
const EMAIL_TEXT_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const MAILTO_RE = /mailto:([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi;

export function parseEmailsFromText(text) {
    const out = [];
    if (!text) return out;
    let m;
    while ((m = MAILTO_RE.exec(text)) !== null) out.push(m[1]);
    const generic = String(text).match(EMAIL_TEXT_RE) || [];
    out.push(...generic);
    // de-dup + keep only real
    return [...new Set(out)].filter((e) => isRealEmail(e));
}

function tryWebsiteContactFile(website, opts = {}) {
    const host = bareHost(website);
    if (!host) return { email: '', source: '' };
    const dirs = Array.isArray(opts.contactFileDirs)
        ? opts.contactFileDirs
        : ['D:/AI_WORKSPACE/13_sales/site_contacts'];
    const names = [`${host}.html`, `${host}.txt`, `${host}_contact.html`, `${host}_contact.txt`];
    for (const dir of dirs) {
        for (const name of names) {
            const fp = path.join(dir, name);
            try {
                if (!fs.existsSync(fp)) continue;
                const text = fs.readFileSync(fp, 'utf8');
                const emails = parseEmailsFromText(text);
                if (emails.length) {
                    return { email: emails[0], source: `website_contact_file:${name}` };
                }
            } catch {
                /* ignore */
            }
        }
    }
    return { email: '', source: '' };
}

// ----------------------------------------------------------------------------
// PRODUCTION resolver — returns a real, sendable contact or
// REAL_CLIENT_RECIPIENT_REQUIRED. NEVER returns a fake/example/test email.
//
// opts:
//   - lead         : { lead_id, company, website } (e.g. from findTop1)
//   - query        : 'top1' | 'zb23.ru' | lead_id ...
//   - registryPath : override registry file (tests)
//   - registry     : injected registry map (tests; skips file read)
//   - contactFileDirs : override local site-contact dirs (tests)
// ----------------------------------------------------------------------------
export function resolveRealContact(opts = {}) {
    const lead = opts.lead || {};
    const query = normalizeQuery(opts.query || lead.target || 'top1');
    const company = lead.company || '';
    const website = lead.website || '';
    const leadId = lead.lead_id || '';

    const registry = opts.registry || loadRealRegistrySync(opts.registryPath);

    // 1 + 2. existing lead email / existing contact database
    const found = findRegistryRecord(registry, { leadId, website });
    if (found) {
        const realEmail = pickRealEmailFromRecord(found.rec);
        if (realEmail) {
            return {
                ok: true,
                sendable: true,
                query,
                lead_id: found.key,
                company: company || found.rec.company || '',
                website: website || found.rec.website || '',
                email: realEmail,
                email_found: true,
                source: found.rec.source
                    ? `lead_contacts:${found.rec.source}`
                    : 'lead_contacts',
                confidence: 'high',
            };
        }
    }

    // 3 + 4. parse local website contact file / detect mailto + email text
    const fromSite = tryWebsiteContactFile(website, opts);
    if (fromSite.email) {
        return {
            ok: true,
            sendable: true,
            query,
            lead_id: leadId || (found ? found.key : ''),
            company,
            website,
            email: fromSite.email,
            email_found: true,
            source: fromSite.source,
            confidence: 'medium',
        };
    }

    // 5. no real email -> blocked
    return {
        ok: false,
        sendable: false,
        code: REAL_CLIENT_RECIPIENT_REQUIRED,
        query,
        lead_id: leadId || (found ? found.key : ''),
        company,
        website,
        email: '',
        email_found: false,
        source: '',
        confidence: 'none',
    };
}

// ----------------------------------------------------------------------------
// Legacy resolveContact kept for backward compat (fixture/in-memory). NOW it
// also blocks fake emails so the legacy path can never produce a fake sendable
// recipient.
// ----------------------------------------------------------------------------
export function resolveContact(query, opts = {}) {
    const q = normalizeQuery(query);
    if (!q) return { ok: false, code: CONTACT_NOT_FOUND, query: '' };

    let source = Array.isArray(opts.contacts) ? opts.contacts : null;
    let usedFixture = false;
    if (!source || opts.useFixture === true) {
        source = OFFLINE_FIXTURE_CONTACTS;
        usedFixture = true;
    }

    const hit = source.find((c) => matchContact(c, q));
    if (!hit) {
        return { ok: false, code: CONTACT_NOT_FOUND, query: q, usedFixture };
    }

    // HARD GUARD: drop fake emails (example/test/etc.) — never sendable.
    const email = isRealEmail(hit.email) ? hit.email : '';

    return {
        ok: true,
        query: q,
        usedFixture,
        contact: {
            lead_id: hit.lead_id || '',
            target: hit.target || 'top1',
            company: hit.company || '',
            website: hit.website || '',
            channel: hit.channel || (email ? 'email' : ''),
            email,
            phone: hit.phone || '',
            form: hit.form || '',
            confidence: email ? hit.confidence || 'low' : 'none',
            risk: hit.risk || 'unknown',
            source_file: hit.source_file || '(in-memory)',
        },
    };
}

function matchContact(c, q) {
    if (!c) return false;
    const target = String(c.target || '').toLowerCase();
    const website = String(c.website || '').toLowerCase();
    const leadId = String(c.lead_id || '').toLowerCase();
    if (q === target) return true;
    if (q === leadId) return true;
    if (website) {
        if (q === website) return true;
        const host = website.replace(/^https?:\/\//, '').split('/')[0];
        const bare = host.split('.')[0];
        if (q === host || q === bare) return true;
    }
    return false;
}

// ----------------------------------------------------------------------------
// Formatting — /contact_resolve report
// ----------------------------------------------------------------------------
export function formatContactResolveResult(result) {
    if (!result) return 'Контакт: нет результата.';
    const lines = [];
    if (result.ok && result.sendable) {
        lines.push('📇 Contact resolve (read-only — клиент НЕ contacted)');
    } else {
        lines.push('🚫 Contact resolve (read-only — клиент НЕ contacted)');
    }
    lines.push('');
    lines.push(`company: ${result.company || '(unknown)'}`);
    lines.push(`website: ${result.website || '(unknown)'}`);
    lines.push(`found email: ${result.email_found ? 'YES' : 'NO'}`);
    lines.push(`email: ${result.email || '(none)'}`);
    lines.push(`email source: ${result.source || '(none)'}`);
    lines.push(`confidence: ${result.confidence || 'none'}`);
    lines.push(`sendable: ${result.sendable ? 'YES' : 'NO'}`);
    lines.push('');
    if (result.ok && result.sendable) {
        lines.push('Следующий шаг: /audit_draft top1');
    } else {
        lines.push(`Статус: ${REAL_CLIENT_RECIPIENT_REQUIRED}`);
        lines.push('Реальный email клиента не найден.');
        lines.push('Следующий шаг: добавь реальный контакт в 13_sales/lead_contacts.json');
        lines.push('или задай вручную: /audit_set_recipient top1 <real-email>');
    }
    return lines.join('\n');
}

// Legacy formatter (kept for compat with old /audit_contact path).
export function formatContactResult(result, opts = {}) {
    if (!result) return 'Контакт: нет результата.';
    if (!result.ok || result.code === CONTACT_NOT_FOUND) {
        const draftId = opts.draft_id || '<draft_id>';
        return [
            `🚫 ${CONTACT_NOT_FOUND}: контакт не найден в текущих данных.`,
            'Добавь получателя вручную одной из команд:',
            `  /audit_edit_recipient ${draftId} email@example.com`,
            '  /audit_set_recipient top1 email@example.com',
        ].join('\n');
    }
    const c = result.contact;
    const lines = [];
    lines.push('📇 Контакт найден (read-only, ничего не отправлено)');
    lines.push('');
    lines.push(`company: ${c.company}`);
    lines.push(`website: ${c.website}`);
    lines.push(`channel: ${c.channel}`);
    if (c.email) lines.push(`email: ${c.email}`);
    if (c.phone) lines.push(`phone: ${c.phone}`);
    if (c.form) lines.push(`form: ${c.form}`);
    lines.push(`confidence: ${c.confidence}`);
    lines.push(`source: ${c.source_file}`);
    lines.push(`risk: ${c.risk}`);
    lines.push('');
    if (c.email) {
        lines.push('Следующий шаг: /audit_draft top1');
    } else {
        lines.push('Реальный email не найден. Используй /contact_resolve top1.');
    }
    return lines.join('\n');
}

export function handleContactCommand(parsed, opts = {}) {
    if (!parsed) return null;
    const result = resolveContact(parsed.query, opts);
    return { result, text: formatContactResult(result, opts) };
}

// Production handler for /contact_resolve top1.
//   opts.lead should be provided by the bot (findTop1). NEVER marks contacted.
export function handleContactResolveCommand(parsed, opts = {}) {
    if (!parsed) return null;
    const result = resolveRealContact({ ...opts, query: parsed.query });
    return { result, text: formatContactResolveResult(result) };
}

export default {
    OWNER_REFUSAL,
    CONTACT_NOT_FOUND,
    REAL_CLIENT_RECIPIENT_REQUIRED,
    DEFAULT_REGISTRY_PATH,
    OFFLINE_FIXTURE_CONTACTS,
    isFakeEmail,
    isRealEmail,
    parseEmailsFromText,
    loadRealRegistrySync,
    classifyContactCommand,
    classifyContactResolveCommand,
    resolveContact,
    resolveRealContact,
    formatContactResult,
    formatContactResolveResult,
    handleContactCommand,
    handleContactResolveCommand,
};
