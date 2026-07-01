/**
 * lead_contact_commands.mjs — Lead Contact Commands (Phase C2.6a Standalone)
 *
 * APPROVAL: APPROVE_LEAD_CONTACT_COMMANDS_C26A_STANDALONE_2026-05-31
 *
 * Purpose:
 *   Standalone command handlers for managing lead contact records stored in the
 *   Universal Lead Contact Registry (13_sales/lead_contacts.json) via
 *   lead_contact_registry.mjs.
 *
 *   This module is STANDALONE: it is NOT wired into telegram_master_bot.mjs and
 *   does NOT change russian_command_router.mjs at this phase. It only exports a
 *   single entry point, handleLeadContactCommand(text, context).
 *
 * Exports:
 *   - handleLeadContactCommand(text, context) -> Promise<boolean>
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
 *   /contact_show <lead_id>
 *   /contact_add_email <lead_id> <email>
 *   /contact_verify_email <lead_id> <email>
 *   /contact_add_phone <lead_id> <phone>
 *   /contact_hold_whatsapp <lead_id> <reason...>
 *   /contact_registry
 *
 * Return contract:
 *   - returns false if text is NOT a contact command (caller may continue routing)
 *   - returns true if the command was handled (reply already sent via sendTelegram)
 *
 * SAFETY CONTRACT (HARD MODE):
 *   - NEVER reads .env / AI_SECRETS. NEVER prints BOT_TOKEN / CHAT_ID / SMTP creds.
 *   - NEVER sends email / WhatsApp / Telegram to CLIENTS. NEVER opens SMTP.
 *   - sendTelegram is used ONLY to reply to the operator chat (UI), never clients.
 *   - WRITE-TO-LOCAL-DATA-FILE ONLY (13_sales/lead_contacts.json) via registry.
 *   - Existing schema is preserved; verification adds a safe `verified_emails` field.
 */

import {
    loadLeadContactRegistry,
    saveLeadContactRegistry,
    normalizeLeadId,
    isValidEmail,
    upsertLeadEmail,
} from './lead_contact_registry.mjs';

// ──────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────

const PHONE_RE = /^[0-9+()\-\s]{7,20}$/;

function nowISO() { return new Date().toISOString(); }

function isValidPhone(phone) {
    const p = typeof phone === 'string' ? phone.trim() : '';
    if (p.length < 7 || p.length > 20) return false;
    if (!PHONE_RE.test(p)) return false;
    // require at least 7 digits to avoid pure punctuation strings
    const digits = (p.match(/\d/g) || []).length;
    return digits >= 7;
}

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

// Tokenize: command, then whitespace-separated args (trailing args grouped where needed).
function parse(text) {
    const trimmed = String(text == null ? '' : text).trim();
    const parts = trimmed.split(/\s+/).filter(Boolean);
    const command = (parts[0] || '').toLowerCase();
    const args = parts.slice(1);
    return { trimmed, command, args };
}

function formatContact(entry) {
    const lines = [];
    lines.push(`📇 Contact: ${entry.lead_id}`);
    lines.push(`primary_email: ${entry.primary_email || '—'}`);
    lines.push(`emails: ${Array.isArray(entry.emails) && entry.emails.length ? entry.emails.join(', ') : '—'}`);
    if (Array.isArray(entry.verified_emails) && entry.verified_emails.length) {
        lines.push(`verified_emails: ${entry.verified_emails.join(', ')}`);
    }
    lines.push(`phones: ${Array.isArray(entry.phones) && entry.phones.length ? entry.phones.join(', ') : '—'}`);
    lines.push(`whatsapp: ${entry.whatsapp == null ? '—' : entry.whatsapp}`);
    if (entry.whatsapp_status) lines.push(`whatsapp_status: ${entry.whatsapp_status}`);
    if (entry.whatsapp_note) lines.push(`whatsapp_note: ${entry.whatsapp_note}`);
    lines.push(`source: ${entry.source || '—'}`);
    lines.push(`updated_at: ${entry.updated_at || '—'}`);
    lines.push(`note: ${entry.note || '—'}`);
    return lines.join('\n');
}

// The set of commands this module owns.
const CONTACT_COMMANDS = new Set([
    '/contact_show',
    '/contact_add_email',
    '/contact_verify_email',
    '/contact_add_phone',
    '/contact_hold_whatsapp',
    '/contact_registry',
]);

// ──────────────────────────────────────────────
// Public entry point
// ──────────────────────────────────────────────

export async function handleLeadContactCommand(text, context) {
    const { command, args } = parse(text);

    // Not a contact command → let caller continue routing.
    if (!CONTACT_COMMANDS.has(command)) {
        return false;
    }

    const ctx = context || {};
    const workspace = ctx.workspace;

    if (!workspace) {
        await reply(ctx, '⚠️ Internal error: workspace is not configured for contact commands.');
        return true;
    }

    switch (command) {
        case '/contact_show':       return await cmdShow(args, ctx, workspace);
        case '/contact_add_email':  return await cmdAddEmail(args, ctx, workspace);
        case '/contact_verify_email': return await cmdVerifyEmail(args, ctx, workspace);
        case '/contact_add_phone':  return await cmdAddPhone(args, ctx, workspace);
        case '/contact_hold_whatsapp': return await cmdHoldWhatsapp(args, ctx, workspace);
        case '/contact_registry':   return await cmdRegistry(args, ctx, workspace);
        default:
            // Should be unreachable due to the guard above.
            return false;
    }
}

// ──────────────────────────────────────────────
// /contact_show <lead_id>
// ──────────────────────────────────────────────

async function cmdShow(args, ctx, workspace) {
    if (args.length < 1) {
        await reply(ctx, 'Usage: /contact_show <lead_id>\nExample: /contact_show ZB23');
        return true;
    }
    const id = normalizeLeadId(args[0]);
    const registry = loadLeadContactRegistry(workspace);
    const entry = registry[id];
    if (!entry || typeof entry !== 'object') {
        await reply(ctx, `❌ Contact not found for lead "${id}".\nUse /contact_add_email ${id} <email> to create it.`);
        return true;
    }
    await reply(ctx, formatContact(entry));
    return true;
}

// ──────────────────────────────────────────────
// /contact_add_email <lead_id> <email>
// ──────────────────────────────────────────────

async function cmdAddEmail(args, ctx, workspace) {
    if (args.length < 2) {
        await reply(ctx, 'Usage: /contact_add_email <lead_id> <email>\nExample: /contact_add_email ZB23 sales@example.com');
        return true;
    }
    const id = normalizeLeadId(args[0]);
    const email = args[1].trim();

    if (!isValidEmail(email)) {
        await reply(ctx, `❌ Invalid email: "${email}". Email not added.`);
        return true;
    }

    const r = upsertLeadEmail(workspace, id, email, { source: 'contact_command' });
    if (!r.ok) {
        await reply(ctx, `❌ Could not add email: ${r.reason || 'unknown error'}`);
        return true;
    }

    log(ctx, `contact_add_email ${id}`);
    await reply(ctx, `✅ Email added to ${id}.\n${formatContact(r.entry)}`);
    return true;
}

// ──────────────────────────────────────────────
// /contact_verify_email <lead_id> <email>
//   Adds the email to a safe verified_emails[] field without breaking schema.
// ──────────────────────────────────────────────

async function cmdVerifyEmail(args, ctx, workspace) {
    if (args.length < 2) {
        await reply(ctx, 'Usage: /contact_verify_email <lead_id> <email>\nExample: /contact_verify_email ZB23 sales@example.com');
        return true;
    }
    const id = normalizeLeadId(args[0]);
    const email = args[1].trim();

    if (!isValidEmail(email)) {
        await reply(ctx, `❌ Invalid email: "${email}". Nothing verified.`);
        return true;
    }

    const registry = loadLeadContactRegistry(workspace);
    const entry = registry[id];
    if (!entry || typeof entry !== 'object') {
        await reply(ctx, `❌ Contact not found for lead "${id}".\nAdd the email first: /contact_add_email ${id} ${email}`);
        return true;
    }

    if (!Array.isArray(entry.emails)) entry.emails = [];
    const known = entry.emails.some(e => String(e).trim().toLowerCase() === email.toLowerCase());
    if (!known) {
        await reply(ctx, `❌ Email "${email}" is not registered for ${id}. Add it first: /contact_add_email ${id} ${email}`);
        return true;
    }

    if (!Array.isArray(entry.verified_emails)) entry.verified_emails = [];
    const already = entry.verified_emails.some(e => String(e).trim().toLowerCase() === email.toLowerCase());
    if (!already) entry.verified_emails.push(email);

    entry.updated_at = nowISO();
    registry[id] = entry;
    saveLeadContactRegistry(workspace, registry);

    log(ctx, `contact_verify_email ${id}`);
    await reply(ctx, `✅ Email verified for ${id}.\n${formatContact(entry)}`);
    return true;
}

// ──────────────────────────────────────────────
// /contact_add_phone <lead_id> <phone>
// ──────────────────────────────────────────────

async function cmdAddPhone(args, ctx, workspace) {
    if (args.length < 2) {
        await reply(ctx, 'Usage: /contact_add_phone <lead_id> <phone>\nExample: /contact_add_phone ZB23 +79180000000');
        return true;
    }
    const id = normalizeLeadId(args[0]);
    // Phone may contain spaces; join remaining args.
    const phone = args.slice(1).join(' ').trim();

    if (!isValidPhone(phone)) {
        await reply(ctx, `❌ Invalid phone: "${phone}". Use 7–20 chars: digits, +, spaces, (), -. Not added.`);
        return true;
    }

    const registry = loadLeadContactRegistry(workspace);
    let entry = registry[id];
    if (!entry || typeof entry !== 'object') {
        entry = {
            lead_id: id,
            primary_email: null,
            emails: [],
            phones: [],
            whatsapp: null,
            source: 'contact_command',
            updated_at: null,
        };
    }
    if (!Array.isArray(entry.phones)) entry.phones = [];

    const dup = entry.phones.some(p => String(p).trim() === phone);
    if (dup) {
        await reply(ctx, `ℹ️ Phone already present for ${id}. Not duplicated.\n${formatContact(entry)}`);
        return true;
    }

    entry.lead_id = id;
    entry.phones.push(phone);
    entry.updated_at = nowISO();
    registry[id] = entry;
    saveLeadContactRegistry(workspace, registry);

    log(ctx, `contact_add_phone ${id}`);
    await reply(ctx, `✅ Phone added to ${id}.\n${formatContact(entry)}`);
    return true;
}

// ──────────────────────────────────────────────
// /contact_hold_whatsapp <lead_id> <reason...>
//   Marks whatsapp as not available / on hold.
// ──────────────────────────────────────────────

async function cmdHoldWhatsapp(args, ctx, workspace) {
    if (args.length < 2) {
        await reply(ctx, 'Usage: /contact_hold_whatsapp <lead_id> <reason>\nExample: /contact_hold_whatsapp ZB23 not found on whatsapp');
        return true;
    }
    const id = normalizeLeadId(args[0]);
    const reason = args.slice(1).join(' ').trim();

    if (!reason) {
        await reply(ctx, 'Usage: /contact_hold_whatsapp <lead_id> <reason>\nExample: /contact_hold_whatsapp ZB23 not found on whatsapp');
        return true;
    }

    const registry = loadLeadContactRegistry(workspace);
    let entry = registry[id];
    if (!entry || typeof entry !== 'object') {
        entry = {
            lead_id: id,
            primary_email: null,
            emails: [],
            phones: [],
            whatsapp: null,
            source: 'contact_command',
            updated_at: null,
        };
    }

    // Decide status from reason text: "not found" → not_found, otherwise hold.
    const status = /not[\s_-]*found/i.test(reason) ? 'not_found' : 'hold';

    entry.lead_id = id;
    entry.whatsapp = null;
    entry.whatsapp_status = status;
    entry.whatsapp_note = reason;
    entry.updated_at = nowISO();
    registry[id] = entry;
    saveLeadContactRegistry(workspace, registry);

    log(ctx, `contact_hold_whatsapp ${id} (${status})`);
    await reply(ctx, `✅ WhatsApp set to "${status}" for ${id}.\n${formatContact(entry)}`);
    return true;
}

// ──────────────────────────────────────────────
// /contact_registry — short statistics
// ──────────────────────────────────────────────

async function cmdRegistry(args, ctx, workspace) {
    const registry = loadLeadContactRegistry(workspace);
    const ids = Object.keys(registry).filter(k => registry[k] && typeof registry[k] === 'object');

    let withPrimary = 0;
    let withoutPrimary = 0;
    const examples = [];

    for (const id of ids) {
        const e = registry[id];
        if (isValidEmail(e.primary_email)) withPrimary++;
        else withoutPrimary++;
    }

    // Last updated examples (sorted by updated_at desc, top 3).
    const sorted = ids
        .map(id => ({ id, updated_at: registry[id].updated_at || '' }))
        .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
        .slice(0, 3);
    for (const s of sorted) {
        examples.push(`  - ${s.id} (updated_at: ${s.updated_at || '—'})`);
    }

    const lines = [];
    lines.push('📊 Lead Contact Registry');
    lines.push(`total leads with contacts: ${ids.length}`);
    lines.push(`leads with primary_email: ${withPrimary}`);
    lines.push(`leads without primary_email: ${withoutPrimary}`);
    lines.push('last updated examples:');
    lines.push(examples.length ? examples.join('\n') : '  - (none)');

    await reply(ctx, lines.join('\n'));
    return true;
}

export default {
    handleLeadContactCommand,
};
