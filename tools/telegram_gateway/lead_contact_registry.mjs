/**
 * lead_contact_registry.mjs — Universal Lead Contact Registry (Phase C2.5)
 *
 * APPROVAL: APPROVE_UNIVERSAL_LEAD_CONTACT_REGISTRY_C25_2026-05-31
 *
 * Purpose:
 *   A single, universal contact source for lead recipient emails. Instead of
 *   one-off approval patches, every approved-email dry-run resolves the
 *   recipient email through this registry (data file), keyed by lead_id.
 *
 *   This module DOES NOT hardcode any specific lead email in code. All contact
 *   values live ONLY in the data file 13_sales/lead_contacts.json.
 *
 * Data file (relative to <workspace>):
 *   13_sales/lead_contacts.json
 *
 * Data shape:
 *   {
 *     "ZB23": {
 *       "lead_id": "ZB23",
 *       "primary_email": "kvs@zb23.ru",
 *       "emails": ["kvs@zb23.ru"],
 *       "phones": [],
 *       "whatsapp": null,
 *       "source": "manual_verified",
 *       "updated_at": "2026-05-31T..."
 *     }
 *   }
 *
 * Exports:
 *   - getLeadContactRegistryPaths(workspace)
 *   - loadLeadContactRegistry(workspace)
 *   - saveLeadContactRegistry(workspace, registry)
 *   - normalizeLeadId(leadId)
 *   - isValidEmail(email)
 *   - upsertLeadEmail(workspace, leadId, email, meta = {})
 *   - resolveLeadEmailFromContactRegistry(workspace, leadId)
 *
 * SAFETY CONTRACT (HARD MODE):
 *   - NEVER reads .env / AI_SECRETS. NEVER prints BOT_TOKEN / CHAT_ID / SMTP creds.
 *   - NEVER sends email / WhatsApp / Telegram. NEVER opens SMTP.
 *   - WRITE-TO-LOCAL-DATA-FILE ONLY (13_sales/lead_contacts.json).
 *   - lead_id is normalized to UPPERCASE.
 *   - emails are de-duplicated; existing contacts are NEVER deleted.
 *   - Missing registry file → an empty registry is created/used safely.
 */

import fs   from 'fs';
import path from 'path';

// ──────────────────────────────────────────────
// Safe email validation (local@domain.tld)
// ──────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email) {
    return typeof email === 'string' && EMAIL_RE.test(email.trim());
}

// ──────────────────────────────────────────────
// Lead id normalization
// ──────────────────────────────────────────────

export function normalizeLeadId(leadId) {
    return String(leadId == null ? '' : leadId).trim().toUpperCase();
}

// ──────────────────────────────────────────────
// Safe file helpers (never throw on read)
// ──────────────────────────────────────────────

function readJSON(p, fb = null) {
    try {
        if (!p || !fs.existsSync(p)) return fb;
        const raw = fs.readFileSync(p, 'utf-8').trim();
        return raw ? JSON.parse(raw) : fb;
    } catch (_) { return fb; }
}

function writeJSON(p, obj) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf-8');
}

function nowISO() { return new Date().toISOString(); }

// ──────────────────────────────────────────────
// Paths
// ──────────────────────────────────────────────

export function getLeadContactRegistryPaths(workspace) {
    const root = path.join(workspace, '13_sales');
    return {
        root,
        registryFile: path.join(root, 'lead_contacts.json'),
    };
}

// ──────────────────────────────────────────────
// Public: loadLeadContactRegistry(workspace)
//   Returns a plain object keyed by normalized lead_id. Missing/malformed
//   file → empty registry object.
// ──────────────────────────────────────────────

export function loadLeadContactRegistry(workspace) {
    const P = getLeadContactRegistryPaths(workspace);
    const raw = readJSON(P.registryFile, null);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    // Support an optional { leads: {...} } wrapper as well as a flat map.
    if (raw.leads && typeof raw.leads === 'object' && !Array.isArray(raw.leads)) {
        return { ...raw.leads };
    }
    return { ...raw };
}

// ──────────────────────────────────────────────
// Public: saveLeadContactRegistry(workspace, registry)
// ──────────────────────────────────────────────

export function saveLeadContactRegistry(workspace, registry) {
    const P = getLeadContactRegistryPaths(workspace);
    const safe = (registry && typeof registry === 'object' && !Array.isArray(registry))
        ? registry
        : {};
    writeJSON(P.registryFile, safe);
    return { ok: true, path: P.registryFile };
}

// ──────────────────────────────────────────────
// Public: upsertLeadEmail(workspace, leadId, email, meta = {})
//   - normalizes lead_id to UPPERCASE
//   - validates email (safe regex)
//   - never duplicates emails
//   - never deletes existing contacts
//   - creates the entry if missing; sets primary_email if absent
//   Returns { ok, leadId, entry } | { ok:false, reason }
// ──────────────────────────────────────────────

export function upsertLeadEmail(workspace, leadId, email, meta = {}) {
    const id = normalizeLeadId(leadId);
    if (!id) {
        return { ok: false, reason: 'lead_id is empty' };
    }
    const cleanEmail = typeof email === 'string' ? email.trim() : '';
    if (!isValidEmail(cleanEmail)) {
        return { ok: false, reason: `invalid email: "${email}"` };
    }

    const registry = loadLeadContactRegistry(workspace);
    const existing = (registry[id] && typeof registry[id] === 'object')
        ? registry[id]
        : null;

    const entry = existing
        ? { ...existing }
        : {
            lead_id: id,
            primary_email: null,
            emails: [],
            phones: [],
            whatsapp: null,
            source: null,
            updated_at: null,
        };

    // Guarantee canonical id + array shapes without dropping existing data.
    entry.lead_id = id;
    if (!Array.isArray(entry.emails)) entry.emails = [];
    if (!Array.isArray(entry.phones)) entry.phones = [];

    // De-duplicate emails (case-insensitive compare, preserve stored form).
    const already = entry.emails.some(e => String(e).trim().toLowerCase() === cleanEmail.toLowerCase());
    if (!already) entry.emails.push(cleanEmail);

    // Set primary_email only if not already present (never overwrite/delete).
    if (!entry.primary_email || !isValidEmail(entry.primary_email)) {
        entry.primary_email = cleanEmail;
    }

    // Apply non-destructive meta fields.
    if (meta && typeof meta === 'object') {
        if (typeof meta.source === 'string' && meta.source.trim()) {
            entry.source = meta.source.trim();
        }
        if (typeof meta.whatsapp === 'string' && meta.whatsapp.trim()) {
            entry.whatsapp = meta.whatsapp.trim();
        }
        if (typeof meta.note === 'string' && meta.note.trim()) {
            entry.note = meta.note.trim();
        }
        if (Array.isArray(meta.phones)) {
            for (const ph of meta.phones) {
                const p = String(ph).trim();
                if (p && !entry.phones.includes(p)) entry.phones.push(p);
            }
        }
    }

    entry.updated_at = nowISO();

    registry[id] = entry;
    saveLeadContactRegistry(workspace, registry);

    return { ok: true, leadId: id, entry };
}

// ──────────────────────────────────────────────
// Public: resolveLeadEmailFromContactRegistry(workspace, leadId)
//   Resolution order inside an entry:
//     1. primary_email (if valid)
//     2. first valid email in emails[]
//   Returns:
//     { ok:true, email, source } | { ok:false, reason }
//   source is one of:
//     'lead_contact_registry.primary_email' | 'lead_contact_registry.emails[0]'
// ──────────────────────────────────────────────

export function resolveLeadEmailFromContactRegistry(workspace, leadId) {
    const id = normalizeLeadId(leadId);
    if (!id) {
        return { ok: false, reason: 'lead_id is empty' };
    }
    const registry = loadLeadContactRegistry(workspace);
    const entry = registry[id];
    if (!entry || typeof entry !== 'object') {
        return { ok: false, reason: `lead "${id}" not found in contact registry` };
    }

    if (isValidEmail(entry.primary_email)) {
        return {
            ok: true,
            email: entry.primary_email.trim(),
            source: 'lead_contact_registry.primary_email',
        };
    }

    if (Array.isArray(entry.emails)) {
        for (const e of entry.emails) {
            if (isValidEmail(e)) {
                return {
                    ok: true,
                    email: String(e).trim(),
                    source: 'lead_contact_registry.emails[0]',
                };
            }
        }
    }

    return { ok: false, reason: `no valid email for lead "${id}" in contact registry` };
}

export default {
    getLeadContactRegistryPaths,
    loadLeadContactRegistry,
    saveLeadContactRegistry,
    normalizeLeadId,
    isValidEmail,
    upsertLeadEmail,
    resolveLeadEmailFromContactRegistry,
};
