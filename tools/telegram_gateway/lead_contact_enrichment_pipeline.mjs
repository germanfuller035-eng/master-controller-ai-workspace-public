/**
 * lead_contact_enrichment_pipeline.mjs — Offline Lead Contact Enrichment Pipeline (Phase C2.7b)
 *
 * APPROVAL: APPROVE_CONTACT_CHANNEL_REGISTRY_ENRICHMENT_C27B_2026-05-31
 *
 * Purpose:
 *   An OFFLINE pipeline that takes raw text / HTML of a lead card, extracts
 *   public contact channels via contact_channel_extractor.mjs, and safely merges
 *   the result into the lead contact registry (13_sales/lead_contacts.json).
 *
 *   This module performs NO network requests, NO site scanning, NO sending of
 *   any message, reads NO secrets, and uses NO SMTP. It is a
 *   text/html-in → registry-enrichment-out pipeline only.
 *
 * Exports:
 *   - enrichLeadContactsFromText(workspace, leadId, inputTextOrHtml, meta = {})
 *   - mergeExtractedChannelsIntoRegistry(workspace, leadId, extractedChannels, meta = {})
 *   - getLeadContactEnrichmentPaths(workspace)
 *   - buildContactEnrichmentSummary(result)
 *
 * Registry compatibility (existing C2.5 / C2.6 schema preserved):
 *   - primary_email stays a string
 *   - emails stays an array of strings
 *   - phones stays an array of strings
 *   - whatsapp may stay null / hold / status for older commands
 *
 * Extended object added by enrichment:
 *   channels: {
 *     email:        [ { value, status, source, confidence, detected_at } ],
 *     phone:        [ ... ],
 *     whatsapp:     [ ... ],   // confirmed links only
 *     telegram:     [ ... ],   // confirmed only
 *     max:          [ ... ],   // confirmed / possible
 *     website_form: [ ... ]
 *   }
 *   best_contact_channel: classifyBestContactChannel(channels)
 *   last_enriched_at, enrichment_source, enrichment_note
 *
 * SAFETY CONTRACT (HARD MODE):
 *   - NEVER reads .env / AI_SECRETS. NEVER prints BOT_TOKEN / CHAT_ID / SMTP creds.
 *   - NEVER sends email / WhatsApp / Telegram / MAX. NEVER opens SMTP.
 *   - NEVER performs any network request.
 *   - WRITE-TO-LOCAL-DATA-FILE ONLY (13_sales/lead_contacts.json).
 *   - Existing contacts are NEVER deleted.
 *   - manual_verified contacts are NEVER overwritten by weaker auto-detected data.
 *   - No specific lead email is hardcoded in this module.
 */

import path from 'path';

import {
    extractContactChannels,
    classifyBestContactChannel,
    normalizeExtractedChannels,
    CHANNEL_TYPES,
    CHANNEL_STATUS,
} from './contact_channel_extractor.mjs';

import {
    getLeadContactRegistryPaths,
    loadLeadContactRegistry,
    saveLeadContactRegistry,
    normalizeLeadId,
    isValidEmail,
} from './lead_contact_registry.mjs';

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const VERIFIED_SOURCE = 'manual_verified';
const DEFAULT_ENRICHMENT_SOURCE = 'offline_text_enrichment';

// The set of channel buckets in the extended `channels` object.
const CHANNEL_BUCKETS = Object.freeze([
    CHANNEL_TYPES.EMAIL,
    CHANNEL_TYPES.PHONE,
    CHANNEL_TYPES.WHATSAPP,
    CHANNEL_TYPES.TELEGRAM,
    CHANNEL_TYPES.MAX,
    CHANNEL_TYPES.WEBSITE_FORM,
]);

// ──────────────────────────────────────────────
// Small helpers
// ──────────────────────────────────────────────

function nowISO() { return new Date().toISOString(); }

function statusRank(s) {
    if (s === CHANNEL_STATUS.CONFIRMED) return 3;
    if (s === CHANNEL_STATUS.PUBLIC_FOUND) return 2;
    if (s === CHANNEL_STATUS.POSSIBLE) return 1;
    return 0;
}

// Ensure the entry has all the compatibility fields and the extended channels
// object — without dropping any existing data.
function ensureEntryShape(existing, id) {
    const entry = (existing && typeof existing === 'object' && !Array.isArray(existing))
        ? { ...existing }
        : {};

    entry.lead_id = id;
    if (typeof entry.primary_email !== 'string') {
        entry.primary_email = (entry.primary_email == null) ? null : entry.primary_email;
    }
    if (!Array.isArray(entry.emails)) entry.emails = [];
    if (!Array.isArray(entry.phones)) entry.phones = [];
    if (!('whatsapp' in entry)) entry.whatsapp = null;

    // Extended channels object.
    const ch = (entry.channels && typeof entry.channels === 'object' && !Array.isArray(entry.channels))
        ? entry.channels
        : {};
    for (const bucket of CHANNEL_BUCKETS) {
        if (!Array.isArray(ch[bucket])) ch[bucket] = [];
    }
    entry.channels = ch;

    return entry;
}

// Build a structured channel entry stored inside the extended channels object.
function makeChannelEntry(ch) {
    const out = {
        value: String(ch.value).trim(),
        status: ch.status || CHANNEL_STATUS.PUBLIC_FOUND,
        source: ch.source || 'text_or_html',
        confidence: typeof ch.confidence === 'number' ? ch.confidence : 0,
        detected_at: nowISO(),
    };
    if (ch.detected_by) out.detected_by = ch.detected_by;
    return out;
}

// Push a structured channel entry into a bucket array, de-duplicating by value
// (case-insensitive) and keeping the strongest status / confidence.
// Returns true if a new value was added (not a duplicate).
function pushChannelEntry(bucketArr, entry) {
    const key = String(entry.value).trim().toLowerCase();
    const idx = bucketArr.findIndex(e => String(e.value).trim().toLowerCase() === key);
    if (idx === -1) {
        bucketArr.push(entry);
        return true;
    }
    // Duplicate — upgrade in place if the new one is stronger.
    const existing = bucketArr[idx];
    if (statusRank(entry.status) > statusRank(existing.status) ||
        (statusRank(entry.status) === statusRank(existing.status) &&
         entry.confidence > existing.confidence)) {
        // Preserve the original detected_at (first time we saw it).
        const detected_at = existing.detected_at || entry.detected_at;
        bucketArr[idx] = { ...entry, detected_at };
    }
    return false;
}

// Add a string value to a flat string array (emails[] / phones[]) without
// duplicates (case-insensitive for emails, exact for phones).
function pushUniqueString(arr, value, caseInsensitive) {
    const v = String(value).trim();
    if (!v) return false;
    const cmp = caseInsensitive ? v.toLowerCase() : v;
    const exists = arr.some(x =>
        (caseInsensitive ? String(x).trim().toLowerCase() : String(x).trim()) === cmp);
    if (exists) return false;
    arr.push(v);
    return true;
}

// ──────────────────────────────────────────────
// Paths
// ──────────────────────────────────────────────

export function getLeadContactEnrichmentPaths(workspace) {
    const base = getLeadContactRegistryPaths(workspace);
    return {
        root: base.root,
        registryFile: base.registryFile,
        salesDir: path.join(workspace, '13_sales'),
    };
}

// ──────────────────────────────────────────────
// Build the flat channel list used for best-channel classification.
// Marks a manual_verified primary email with source `manual_verified` so the
// classifier ranks it first.
// ──────────────────────────────────────────────

function buildBestChannelInput(entry) {
    const list = [];
    const ch = entry.channels || {};
    const primaryLower = String(entry.primary_email || '').trim().toLowerCase();
    const isManualVerified = entry.source === VERIFIED_SOURCE;

    for (const e of (ch.email || [])) {
        const isVerifiedPrimary = isManualVerified &&
            String(e.value).trim().toLowerCase() === primaryLower;
        list.push({
            type: CHANNEL_TYPES.EMAIL,
            value: e.value,
            status: e.status,
            source: isVerifiedPrimary ? VERIFIED_SOURCE : e.source,
            confidence: e.confidence,
        });
    }
    for (const p of (ch.phone || [])) {
        list.push({ type: CHANNEL_TYPES.PHONE, value: p.value, status: p.status, source: p.source, confidence: p.confidence });
    }
    for (const w of (ch.whatsapp || [])) {
        list.push({ type: CHANNEL_TYPES.WHATSAPP, value: w.value, status: w.status, source: w.source, confidence: w.confidence });
    }
    for (const t of (ch.telegram || [])) {
        list.push({ type: CHANNEL_TYPES.TELEGRAM, value: t.value, status: t.status, source: t.source, confidence: t.confidence });
    }
    for (const m of (ch.max || [])) {
        list.push({ type: CHANNEL_TYPES.MAX, value: m.value, status: m.status, source: m.source, confidence: m.confidence });
    }
    for (const f of (ch.website_form || [])) {
        list.push({ type: CHANNEL_TYPES.WEBSITE_FORM, value: f.value, status: f.status, source: f.source, confidence: f.confidence });
    }
    return list;
}

// ──────────────────────────────────────────────
// mergeExtractedChannelsIntoRegistry
// ──────────────────────────────────────────────

export function mergeExtractedChannelsIntoRegistry(workspace, leadId, extractedChannels, meta = {}) {
    const id = normalizeLeadId(leadId);
    if (!id) {
        return { ok: false, reason: 'lead_id is empty' };
    }

    const channelList = normalizeExtractedChannels(
        Array.isArray(extractedChannels) ? extractedChannels : []);

    const safeMeta = (meta && typeof meta === 'object') ? meta : {};

    const registry = loadLeadContactRegistry(workspace);
    const entry = ensureEntryShape(registry[id], id);

    // manual_verified lock: a manual_verified primary email is never replaced.
    const isManualVerified = entry.source === VERIFIED_SOURCE;
    const hasValidPrimary = isValidEmail(entry.primary_email);

    const added = {
        emails: 0, phones: 0,
        channels: { email: 0, phone: 0, whatsapp: 0, telegram: 0, max: 0, website_form: 0 },
        invalid_emails: 0,
    };

    // Track the best new email candidate (highest confidence) to use as primary
    // when no valid primary email exists yet.
    let bestNewEmail = null;
    let bestNewEmailConf = -1;

    for (const ch of channelList) {
        if (!ch || !ch.type) continue;

        switch (ch.type) {
            case CHANNEL_TYPES.EMAIL: {
                const email = String(ch.value).trim().toLowerCase();
                // Drop invalid emails — never let them into the registry.
                if (!isValidEmail(email)) { added.invalid_emails++; break; }
                if (pushUniqueString(entry.emails, email, true)) added.emails++;
                if (pushChannelEntry(entry.channels.email, makeChannelEntry({ ...ch, value: email }))) {
                    added.channels.email++;
                }
                if (ch.confidence > bestNewEmailConf) {
                    bestNewEmailConf = ch.confidence;
                    bestNewEmail = email;
                }
                break;
            }
            case CHANNEL_TYPES.PHONE: {
                const phone = String(ch.value).trim();
                if (!phone) break;
                if (pushUniqueString(entry.phones, phone, false)) added.phones++;
                if (pushChannelEntry(entry.channels.phone, makeChannelEntry(ch))) {
                    added.channels.phone++;
                }
                break;
            }
            case CHANNEL_TYPES.WHATSAPP: {
                // Only confirmed WhatsApp links — phone-only never becomes confirmed.
                if (ch.status !== CHANNEL_STATUS.CONFIRMED) break;
                if (pushChannelEntry(entry.channels.whatsapp, makeChannelEntry(ch))) {
                    added.channels.whatsapp++;
                }
                break;
            }
            case CHANNEL_TYPES.TELEGRAM: {
                // Only confirmed Telegram.
                if (ch.status !== CHANNEL_STATUS.CONFIRMED) break;
                if (pushChannelEntry(entry.channels.telegram, makeChannelEntry(ch))) {
                    added.channels.telegram++;
                }
                break;
            }
            case CHANNEL_TYPES.MAX: {
                // confirmed / possible MAX.
                if (ch.status !== CHANNEL_STATUS.CONFIRMED && ch.status !== CHANNEL_STATUS.POSSIBLE) break;
                if (pushChannelEntry(entry.channels.max, makeChannelEntry(ch))) {
                    added.channels.max++;
                }
                break;
            }
            case CHANNEL_TYPES.WEBSITE_FORM: {
                if (pushChannelEntry(entry.channels.website_form, makeChannelEntry(ch))) {
                    added.channels.website_form++;
                }
                break;
            }
            default:
                break;
        }
    }

    // Set primary_email only when there is no valid primary yet.
    // Never overwrite a manual_verified primary with weaker auto-detected data.
    if (!hasValidPrimary && !isManualVerified && bestNewEmail) {
        entry.primary_email = bestNewEmail;
    } else if (!hasValidPrimary && !isManualVerified && !bestNewEmail) {
        // keep whatever was there (possibly null) — do not invent anything.
    }

    // Compute best contact channel from the (now merged) extended channels.
    const best = classifyBestContactChannel(buildBestChannelInput(entry));
    entry.best_contact_channel = best;

    // Enrichment metadata.
    entry.last_enriched_at = nowISO();
    entry.enrichment_source = (typeof safeMeta.source === 'string' && safeMeta.source.trim())
        ? safeMeta.source.trim()
        : DEFAULT_ENRICHMENT_SOURCE;
    if (typeof safeMeta.note === 'string' && safeMeta.note.trim()) {
        entry.enrichment_note = safeMeta.note.trim();
    } else if (!('enrichment_note' in entry)) {
        entry.enrichment_note = 'offline text/html → contact registry enrichment (C2.7b)';
    }

    // Standard registry bookkeeping (non-destructive).
    entry.updated_at = nowISO();

    registry[id] = entry;
    saveLeadContactRegistry(workspace, registry);

    return {
        ok: true,
        leadId: id,
        entry,
        added,
        best,
        safety: {
            network_used: false,
            external_send: false,
            smtp_used: false,
            env_read: false,
            auto_send: false,
        },
    };
}

// ──────────────────────────────────────────────
// enrichLeadContactsFromText
//   Extract channels from raw text/HTML, then merge into the registry.
// ──────────────────────────────────────────────

export function enrichLeadContactsFromText(workspace, leadId, inputTextOrHtml, meta = {}) {
    const id = normalizeLeadId(leadId);
    if (!id) {
        return { ok: false, reason: 'lead_id is empty' };
    }

    const extraction = extractContactChannels(inputTextOrHtml == null ? '' : inputTextOrHtml);
    const merged = mergeExtractedChannelsIntoRegistry(workspace, id, extraction.channels, meta);

    if (!merged.ok) return merged;

    return {
        ...merged,
        input_kind: extraction.input_kind,
        extracted: {
            channels: extraction.channels,
            counts: extraction.counts,
        },
    };
}

// ──────────────────────────────────────────────
// buildContactEnrichmentSummary
//   Human/dashboard-friendly summary of an enrichment result.
//   Never prints secrets — only public contact data the caller already has.
// ──────────────────────────────────────────────

export function buildContactEnrichmentSummary(result) {
    if (!result || typeof result !== 'object' || !result.ok) {
        return {
            ok: false,
            reason: (result && result.reason) ? result.reason : 'invalid enrichment result',
        };
    }

    const entry = result.entry || {};
    const ch = entry.channels || {};
    const counts = {};
    for (const bucket of CHANNEL_BUCKETS) {
        counts[bucket] = Array.isArray(ch[bucket]) ? ch[bucket].length : 0;
    }

    return {
        ok: true,
        lead_id: result.leadId || entry.lead_id || null,
        primary_email: entry.primary_email || null,
        emails_count: Array.isArray(entry.emails) ? entry.emails.length : 0,
        phones_count: Array.isArray(entry.phones) ? entry.phones.length : 0,
        channels_counts: counts,
        best_contact_channel: result.best || entry.best_contact_channel || null,
        last_enriched_at: entry.last_enriched_at || null,
        enrichment_source: entry.enrichment_source || null,
        added: result.added || null,
        safety: result.safety || {
            network_used: false,
            external_send: false,
            smtp_used: false,
            env_read: false,
            auto_send: false,
        },
    };
}

export default {
    enrichLeadContactsFromText,
    mergeExtractedChannelsIntoRegistry,
    getLeadContactEnrichmentPaths,
    buildContactEnrichmentSummary,
};
