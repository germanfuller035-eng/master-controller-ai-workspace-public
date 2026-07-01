/**
 * lead_resolver.mjs — Universal Lead Resolver (STANDALONE)
 *
 * Purpose:
 *   Resolve a lead_id from free Russian/English text against the known lead
 *   universe, WITHOUT hardcoding ZB23 as the only lead. The resolver reads
 *   local lead/followup queue sources when they exist, and falls back to a
 *   non-exclusive alias layer (ZB23, EDERA, KZHBI, ATOM, GSK and any future ids).
 *
 * Exports:
 *   - loadKnownLeads(workspace)            → { leads: [...], ids: [...], sources: [...] }
 *   - resolveLeadId(inputText, workspace)  → { found, leadId, record, source, knownIds, error }
 *   - listKnownLeadIds(workspace)          → string[]
 *
 * SAFETY CONTRACT (HARD MODE):
 *   - READ-ONLY. Never writes, never sends, never restarts anything.
 *   - Never reads .env / AI_SECRETS. Never prints BOT_TOKEN / CHAT_ID / tokens.
 *   - If a source file is missing or malformed → never throws, just skips it.
 *   - No single-lead hardcoding: ZB23 is only one of several seed aliases.
 */

import fs   from 'fs';
import path from 'path';

// ──────────────────────────────────────────────
// Seed aliases (NON-EXCLUSIVE fallback layer only)
// These are NOT the primary source. They guarantee a minimum known set
// even before any queue file exists. Real queue files always take priority
// and extend this set with future lead_ids automatically.
// ──────────────────────────────────────────────

const SEED_LEAD_IDS = ['ZB23', 'EDERA', 'KZHBI', 'ATOM', 'GSK'];

// ──────────────────────────────────────────────
// Safe file helpers (never throw)
// ──────────────────────────────────────────────

function readJSON(p, fb = null) {
    try {
        if (!p || !fs.existsSync(p)) return fb;
        const raw = fs.readFileSync(p, 'utf-8').trim();
        return raw ? JSON.parse(raw) : fb;
    } catch (_) { return fb; }
}

function readText(p) {
    try {
        if (!p || !fs.existsSync(p)) return null;
        return fs.readFileSync(p, 'utf-8');
    } catch (_) { return null; }
}

function findLatestFile(dir, prefix, ext) {
    try {
        if (!fs.existsSync(dir)) return null;
        const files = fs.readdirSync(dir)
            .filter(f => f.startsWith(prefix) && f.endsWith(ext) && !f.includes('.bak'))
            .sort()
            .reverse();
        return files.length ? path.join(dir, files[0]) : null;
    } catch (_) { return null; }
}

// ──────────────────────────────────────────────
// Source paths (mirror sales_commands_phase2 + extra non-exclusive sources)
// ──────────────────────────────────────────────

function getPaths(workspace) {
    const dlf    = path.join(workspace, '13_sales', 'daily_lead_factory');
    const output = path.join(dlf, 'output');
    const data   = path.join(dlf, 'data');
    return {
        dlf,
        output,
        followupQueue: findLatestFile(output, 'followup_queue_',    '.json'),
        activeLeads:   findLatestFile(output, 'active_leads_queue_', '.json'),
        touchLog:      path.join(output, 'sales_ops_touch_log.json'),
        telegramQueue: path.join(data, 'processed', 'telegram_queue.json'),
        leadsCsv:      path.join(data, 'leads_test.csv'),
    };
}

// ──────────────────────────────────────────────
// Record extraction helpers
// ──────────────────────────────────────────────

function asArray(raw, keys = ['queue', 'leads', 'active_leads', 'touches']) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    for (const k of keys) {
        if (Array.isArray(raw[k])) return raw[k];
    }
    return [];
}

function leadIdOf(rec) {
    if (!rec || typeof rec !== 'object') return null;
    const id = rec.lead_id || rec.id || rec.leadId || null;
    return id ? String(id).trim() : null;
}

function pushLead(map, leadId, record, source) {
    if (!leadId) return;
    const key = leadId.toUpperCase();
    if (!map.has(key)) {
        map.set(key, { leadId, canonical: key, record: record || null, source, aliases: new Set([key]) });
    } else if (record && !map.get(key).record) {
        // enrich an alias-only entry with a real record from a queue source
        const entry = map.get(key);
        entry.record = record;
        entry.source = source;
    }
}

// ──────────────────────────────────────────────
// Public: loadKnownLeads
// ──────────────────────────────────────────────

export function loadKnownLeads(workspace) {
    const P = getPaths(workspace);
    const leadMap = new Map();

    const sources = [];

    // 1) Primary sources: followup + active queues (records win over aliases)
    for (const [p, label] of [
        [P.followupQueue, 'followup_queue'],
        [P.activeLeads,   'active_leads_queue'],
    ]) {
        const raw = readJSON(p, null);
        const arr = asArray(raw);
        if (arr.length) sources.push(label);
        for (const rec of arr) pushLead(leadMap, leadIdOf(rec), rec, label);
    }

    // 2) Touch log (lead_id references inside touches[])
    const touchRaw = readJSON(P.touchLog, null);
    const touches = asArray(touchRaw, ['touches']);
    if (touches.length) sources.push('sales_ops_touch_log');
    for (const t of touches) pushLead(leadMap, leadIdOf(t), null, 'sales_ops_touch_log');

    // 3) DLF telegram_queue.json (processed)
    const tgRaw = readJSON(P.telegramQueue, null);
    const tgArr = asArray(tgRaw);
    if (tgArr.length) sources.push('telegram_queue');
    for (const rec of tgArr) pushLead(leadMap, leadIdOf(rec), rec, 'telegram_queue');

    // 4) DLF leads_test.csv (best-effort header-aware parse)
    const csv = readText(P.leadsCsv);
    if (csv) {
        const lines = csv.split(/\r?\n/).filter(Boolean);
        if (lines.length > 1) {
            const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
            const idCol = headers.findIndex(h => h === 'lead_id' || h === 'id');
            if (idCol >= 0) {
                sources.push('leads_test_csv');
                for (let i = 1; i < lines.length; i++) {
                    const cols = lines[i].split(',');
                    const id = (cols[idCol] || '').trim();
                    if (id) pushLead(leadMap, id, null, 'leads_test_csv');
                }
            }
        }
    }

    // 5) Fallback alias layer (NON-EXCLUSIVE — added only if not already present)
    for (const id of SEED_LEAD_IDS) {
        if (!leadMap.has(id.toUpperCase())) {
            pushLead(leadMap, id, null, 'seed_alias');
        }
    }
    sources.push('seed_alias');

    const leads = [...leadMap.values()].map(e => ({
        leadId: e.leadId,
        canonical: e.canonical,
        record: e.record,
        source: e.source,
    }));
    const ids = leads.map(l => l.leadId);

    return { leads, ids, sources: [...new Set(sources)] };
}

// ──────────────────────────────────────────────
// Public: listKnownLeadIds
// ──────────────────────────────────────────────

export function listKnownLeadIds(workspace) {
    return loadKnownLeads(workspace).ids;
}

// ──────────────────────────────────────────────
// Public: resolveLeadId
//   Finds a known lead_id token inside free text (case-insensitive).
// ──────────────────────────────────────────────

export function resolveLeadId(inputText, workspace) {
    const { leads, ids } = loadKnownLeads(workspace);
    const text = String(inputText || '');

    if (!text.trim()) {
        return {
            found: false,
            leadId: null,
            record: null,
            source: null,
            knownIds: ids,
            error: 'Пустой ввод: lead_id не указан.',
        };
    }

    // Build a quick lookup of canonical id → lead entry
    const byCanon = new Map(leads.map(l => [l.canonical, l]));

    // Tokenize on non-alphanumeric boundaries (latin + digits).
    const tokens = text.toUpperCase().match(/[A-Z0-9]+/g) || [];

    // Prefer the FIRST token that exactly matches a known canonical id.
    for (const tok of tokens) {
        if (byCanon.has(tok)) {
            const hit = byCanon.get(tok);
            return {
                found: true,
                leadId: hit.leadId,
                record: hit.record,
                source: hit.source,
                knownIds: ids,
                error: null,
            };
        }
    }

    return {
        found: false,
        leadId: null,
        record: null,
        source: null,
        knownIds: ids,
        error: `Lead_id не найден в тексте. Известные lead_id: ${ids.join(', ') || '(пусто)'}.`,
    };
}

export default { loadKnownLeads, resolveLeadId, listKnownLeadIds };
