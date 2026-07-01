/**
 * lead_contact_enrichment_commands.mjs — Lead Contact Enrichment Commands (Phase C2.7c Standalone)
 *
 * APPROVAL: APPROVE_CONTACT_ENRICHMENT_COMMANDS_C27C_STANDALONE_2026-05-31
 *
 * Purpose:
 *   Standalone command handlers that drive the OFFLINE lead contact enrichment
 *   pipeline (lead_contact_enrichment_pipeline.mjs) from chat-style commands.
 *   Given raw text / HTML of a lead card, these commands extract public contact
 *   channels and safely merge them into the Universal Lead Contact Registry
 *   (13_sales/lead_contacts.json), then report a Telegram-friendly summary.
 *
 *   This module is STANDALONE: it is NOT wired into telegram_master_bot.mjs and
 *   does NOT change russian_command_router.mjs at this phase. It only exports a
 *   single entry point, handleLeadContactEnrichmentCommand(text, context).
 *
 * Exports:
 *   - handleLeadContactEnrichmentCommand(text, context) -> Promise<boolean>
 *
 * context shape:
 *   {
 *     workspace,        // absolute workspace path (registry root)
 *     chatId,           // telegram chat id (opaque, never printed by this module)
 *     sendTelegram,     // async (chatId, message) => void   (UI reply only)
 *     botLog,           // (message) => void                 (optional logger)
 *   }
 *
 * Supported commands:
 *   /contact_enrich_text <lead_id> <text_or_html>
 *   /contact_channels <lead_id>
 *   /contact_best_channel <lead_id>
 *   /contact_enrichment_status <lead_id>
 *
 * Return contract:
 *   - returns false if text is NOT an enrichment command (caller may continue routing)
 *   - returns true if the command was handled (reply already sent via sendTelegram)
 *
 * SAFETY CONTRACT (HARD MODE):
 *   - NEVER reads .env / AI_SECRETS. NEVER prints BOT_TOKEN / CHAT_ID / SMTP creds.
 *   - NEVER sends email / WhatsApp / Telegram / MAX to CLIENTS. NEVER opens SMTP.
 *   - NEVER performs any network request. No site scanning, no auto-send.
 *   - sendTelegram is used ONLY to reply to the operator chat (UI), never clients.
 *   - WRITE-TO-LOCAL-DATA-FILE ONLY (13_sales/lead_contacts.json) via the pipeline.
 *   - Existing contacts never deleted; manual_verified primary never overwritten.
 *   - No lead email / lead id hardcoded in this module.
 */

import {
    enrichLeadContactsFromText,
    buildContactEnrichmentSummary,
} from './lead_contact_enrichment_pipeline.mjs';

import {
    loadLeadContactRegistry,
    normalizeLeadId,
} from './lead_contact_registry.mjs';

// ──────────────────────────────────────────────
// Channel buckets used by the extended channels object.
// ──────────────────────────────────────────────

const CHANNEL_BUCKETS = Object.freeze([
    'email',
    'phone',
    'whatsapp',
    'telegram',
    'max',
    'website_form',
]);

// The set of commands this module owns.
const ENRICHMENT_COMMANDS = new Set([
    '/contact_enrich_text',
    '/contact_channels',
    '/contact_best_channel',
    '/contact_enrichment_status',
]);

// ──────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────

// Safe reply that never throws even if sendTelegram is missing.
async function reply(context, message) {
    try {
        if (context && typeof context.sendTelegram === 'function') {
            await context.sendTelegram(context.chatId, message);
        }
    } catch (_) { /* swallow UI errors — never crash command handling */ }
}

function log(context, message) {
    try {
        if (context && typeof context.botLog === 'function') {
            context.botLog(message);
        }
    } catch (_) { /* ignore */ }
}

// Tokenize: command + first arg (lead_id). The remaining substring (after the
// lead_id token) is preserved verbatim so HTML / multi-word text is not mangled.
function parse(text) {
    const trimmed = String(text == null ? '' : text).trim();
    const parts = trimmed.split(/\s+/).filter(Boolean);
    const command = (parts[0] || '').toLowerCase();
    const args = parts.slice(1);
    return { trimmed, command, args };
}

// Extract everything after the <command> <lead_id> prefix, preserving original
// spacing of the remaining content (used as inputTextOrHtml).
function extractRemainder(trimmed, command, leadToken) {
    // Remove leading command token.
    let rest = trimmed.slice(command.length).replace(/^\s+/, '');
    // Remove the lead_id token (first whitespace-delimited token of `rest`).
    if (leadToken) {
        if (rest.toLowerCase().startsWith(leadToken.toLowerCase())) {
            rest = rest.slice(leadToken.length);
        }
    }
    return rest.replace(/^\s+/, '');
}

function fmtCount(n) {
    return Number.isFinite(n) ? String(n) : '0';
}

function channelCounts(entry) {
    const ch = (entry && entry.channels && typeof entry.channels === 'object') ? entry.channels : {};
    const counts = {};
    for (const b of CHANNEL_BUCKETS) {
        counts[b] = Array.isArray(ch[b]) ? ch[b].length : 0;
    }
    return counts;
}

function bestChannelString(best) {
    if (!best || typeof best !== 'object' || !best.best_channel_type) return '—';
    return `${best.best_channel_type} (${best.best_value || '—'})`;
}

// ──────────────────────────────────────────────
// Public entry point
// ──────────────────────────────────────────────

export async function handleLeadContactEnrichmentCommand(text, context) {
    const { trimmed, command, args } = parse(text);

    // Not an enrichment command → let caller continue routing.
    if (!ENRICHMENT_COMMANDS.has(command)) {
        return false;
    }

    const ctx = context || {};
    const workspace = ctx.workspace;

    if (!workspace) {
        await reply(ctx, '⚠️ Internal error: workspace is not configured for enrichment commands.');
        return true;
    }

    switch (command) {
        case '/contact_enrich_text':       return await cmdEnrichText(trimmed, command, args, ctx, workspace);
        case '/contact_channels':          return await cmdChannels(args, ctx, workspace);
        case '/contact_best_channel':      return await cmdBestChannel(args, ctx, workspace);
        case '/contact_enrichment_status': return await cmdEnrichmentStatus(args, ctx, workspace);
        default:
            // Unreachable due to the guard above.
            return false;
    }
}

// ──────────────────────────────────────────────
// /contact_enrich_text <lead_id> <text_or_html>
// ──────────────────────────────────────────────

async function cmdEnrichText(trimmed, command, args, ctx, workspace) {
    if (args.length < 2) {
        await reply(ctx,
            'Usage: /contact_enrich_text <lead_id> <text_or_html>\n' +
            'Example: /contact_enrich_text ZB23 <a href="mailto:sales@example.com">write</a>');
        return true;
    }

    const leadToken = args[0];
    const id = normalizeLeadId(leadToken);
    const inputTextOrHtml = extractRemainder(trimmed, command, leadToken);

    if (!inputTextOrHtml) {
        await reply(ctx,
            'Usage: /contact_enrich_text <lead_id> <text_or_html>\n' +
            'Example: /contact_enrich_text ZB23 phone +7 918 000-00-00');
        return true;
    }

    const result = enrichLeadContactsFromText(workspace, id, inputTextOrHtml, {
        source: 'contact_enrich_text_command',
        note: 'offline /contact_enrich_text enrichment (C2.7c)',
    });

    if (!result || !result.ok) {
        await reply(ctx, `❌ Enrichment failed: ${(result && result.reason) || 'unknown error'}`);
        return true;
    }

    const summary = buildContactEnrichmentSummary(result);
    const counts = summary.channels_counts || channelCounts(result.entry);

    const lines = [];
    lines.push(`🧩 Contact enrichment: ${summary.lead_id || id}`);
    lines.push(`emails found: ${fmtCount(counts.email)}`);
    lines.push(`phones found: ${fmtCount(counts.phone)}`);
    lines.push(`whatsapp found: ${fmtCount(counts.whatsapp)}`);
    lines.push(`telegram found: ${fmtCount(counts.telegram)}`);
    lines.push(`max found: ${fmtCount(counts.max)}`);
    lines.push(`website_form found: ${fmtCount(counts.website_form)}`);
    lines.push(`best_contact_channel: ${bestChannelString(summary.best_contact_channel)}`);
    lines.push('network_used: NO');
    lines.push('external_send: NO');

    log(ctx, `contact_enrich_text ${id}`);
    await reply(ctx, lines.join('\n'));
    return true;
}

// ──────────────────────────────────────────────
// /contact_channels <lead_id>
// ──────────────────────────────────────────────

async function cmdChannels(args, ctx, workspace) {
    if (args.length < 1) {
        await reply(ctx, 'Usage: /contact_channels <lead_id>\nExample: /contact_channels ZB23');
        return true;
    }
    const id = normalizeLeadId(args[0]);
    const registry = loadLeadContactRegistry(workspace);
    const entry = registry[id];

    if (!entry || typeof entry !== 'object') {
        await reply(ctx, `❌ No contact record for lead "${id}".\nEnrich it first: /contact_enrich_text ${id} <text_or_html>`);
        return true;
    }

    const ch = (entry.channels && typeof entry.channels === 'object') ? entry.channels : {};

    const fmtBucket = (bucket) => {
        const arr = Array.isArray(ch[bucket]) ? ch[bucket] : [];
        if (!arr.length) return '—';
        return arr.map(e => String(e && e.value != null ? e.value : '—')).join(', ');
    };

    const lines = [];
    lines.push(`📡 Contact channels: ${id}`);
    lines.push(`email: ${fmtBucket('email')}`);
    lines.push(`phone: ${fmtBucket('phone')}`);
    lines.push(`whatsapp: ${fmtBucket('whatsapp')}`);
    lines.push(`telegram: ${fmtBucket('telegram')}`);
    lines.push(`max: ${fmtBucket('max')}`);
    lines.push(`website_form: ${fmtBucket('website_form')}`);
    lines.push(`best_contact_channel: ${bestChannelString(entry.best_contact_channel)}`);
    lines.push(`last_enriched_at: ${entry.last_enriched_at || '—'}`);

    await reply(ctx, lines.join('\n'));
    return true;
}

// ──────────────────────────────────────────────
// /contact_best_channel <lead_id>
// ──────────────────────────────────────────────

async function cmdBestChannel(args, ctx, workspace) {
    if (args.length < 1) {
        await reply(ctx, 'Usage: /contact_best_channel <lead_id>\nExample: /contact_best_channel ZB23');
        return true;
    }
    const id = normalizeLeadId(args[0]);
    const registry = loadLeadContactRegistry(workspace);
    const entry = registry[id];

    if (!entry || typeof entry !== 'object') {
        await reply(ctx, `❌ No contact record for lead "${id}".\nEnrich it first: /contact_enrich_text ${id} <text_or_html>`);
        return true;
    }

    const best = entry.best_contact_channel;
    if (!best || typeof best !== 'object' || !best.best_channel_type) {
        await reply(ctx, `ℹ️ No best contact channel computed yet for "${id}".\nEnrich it first: /contact_enrich_text ${id} <text_or_html>`);
        return true;
    }

    const lines = [];
    lines.push(`⭐ Best contact channel: ${id}`);
    lines.push(`best channel type: ${best.best_channel_type || '—'}`);
    lines.push(`best value: ${best.best_value || '—'}`);
    lines.push(`confidence: ${typeof best.confidence === 'number' ? best.confidence : '—'}`);
    lines.push(`reason: ${best.reason || '—'}`);

    await reply(ctx, lines.join('\n'));
    return true;
}

// ──────────────────────────────────────────────
// /contact_enrichment_status <lead_id>
// ──────────────────────────────────────────────

async function cmdEnrichmentStatus(args, ctx, workspace) {
    if (args.length < 1) {
        await reply(ctx, 'Usage: /contact_enrichment_status <lead_id>\nExample: /contact_enrichment_status ZB23');
        return true;
    }
    const id = normalizeLeadId(args[0]);
    const registry = loadLeadContactRegistry(workspace);
    const entry = registry[id];

    if (!entry || typeof entry !== 'object') {
        await reply(ctx, `❌ No contact record for lead "${id}".\nEnrich it first: /contact_enrich_text ${id} <text_or_html>`);
        return true;
    }

    const hasEnrichment = Boolean(entry.last_enriched_at) ||
        (entry.channels && typeof entry.channels === 'object' &&
            CHANNEL_BUCKETS.some(b => Array.isArray(entry.channels[b]) && entry.channels[b].length));

    const counts = channelCounts(entry);

    const lines = [];
    lines.push(`📋 Enrichment status: ${id}`);
    lines.push(`enrichment data: ${hasEnrichment ? 'YES' : 'NO'}`);
    lines.push(`last_enriched_at: ${entry.last_enriched_at || '—'}`);
    lines.push(`enrichment_source: ${entry.enrichment_source || '—'}`);
    lines.push(`enrichment_note: ${entry.enrichment_note || '—'}`);
    lines.push('counts by channel:');
    lines.push(`  email: ${fmtCount(counts.email)}`);
    lines.push(`  phone: ${fmtCount(counts.phone)}`);
    lines.push(`  whatsapp: ${fmtCount(counts.whatsapp)}`);
    lines.push(`  telegram: ${fmtCount(counts.telegram)}`);
    lines.push(`  max: ${fmtCount(counts.max)}`);
    lines.push(`  website_form: ${fmtCount(counts.website_form)}`);

    await reply(ctx, lines.join('\n'));
    return true;
}

export default {
    handleLeadContactEnrichmentCommand,
};
