/**
 * lead_markdown_reconciliation_dry_run.mjs
 *
 * READ-ONLY DRY-RUN reconciliation between:
 *   1. legacy markdown leads:   13_sales/leads/*.md
 *   2. canonical pipeline JSON: 13_sales/daily_lead_factory/data/processed/leads_master.json
 *
 * HARD MODE — what this script DOES NOT do:
 *   - No network. No HTTP/fetch. No site scanning. No Telegram/email/SMTP/VPS.
 *   - No .env / AI_SECRETS / tokens reads.
 *   - No confirm=true. No write to leads_master. No write to ANY real data file.
 *   - Does not touch the bot, the dashboard, or the pipeline module.
 *   Pure read + in-memory dedupe simulation, printed to stdout only.
 *
 * It reuses the EXISTING dedupe engine:
 *   tools/telegram_gateway/lead_dedupe_engine.mjs
 *
 * Usage:
 *   node --check tools/tests/lead_markdown_reconciliation_dry_run.mjs
 *   node tools/tests/lead_markdown_reconciliation_dry_run.mjs
 */

'use strict';

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, basename } from 'node:path';

import {
    normalizeDomain,
    dedupeLeadRecords,
    buildLeadDedupeKeys,
} from '../telegram_gateway/lead_dedupe_engine.mjs';

// ──────────────────────────────────────────────
// Paths (read-only)
// ──────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
// tools/tests -> workspace root is two levels up.
const WORKSPACE_ROOT = resolve(__dirname, '..', '..');

const MARKDOWN_LEADS_DIR = join(WORKSPACE_ROOT, '13_sales', 'leads');
const CANONICAL_JSON_PATH = join(
    WORKSPACE_ROOT,
    '13_sales',
    'daily_lead_factory',
    'data',
    'processed',
    'leads_master.json',
);

const ZB23_DOMAIN = 'zb23.ru';

// ──────────────────────────────────────────────
// Lightweight YAML front-matter parser (read-only, no deps)
// ──────────────────────────────────────────────

/**
 * Extract the YAML front-matter block (between leading --- and ---).
 * Returns a flat key->string map. No nested structures needed here.
 */
function parseFrontMatter(content) {
    const out = {};
    if (typeof content !== 'string') return out;

    const text = content.replace(/^\uFEFF/, ''); // strip BOM
    const m = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(\r?\n|$)/);
    if (!m) return out;

    const block = m[1];
    for (const rawLine of block.split(/\r?\n/)) {
        const line = rawLine.trimEnd();
        if (!line.trim()) continue;
        // Only top-level "key: value" pairs.
        const km = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
        if (!km) continue;
        const key = km[1].trim().toLowerCase();
        let value = km[2].trim();
        // Strip surrounding quotes.
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        out[key] = value;
    }
    return out;
}

// ──────────────────────────────────────────────
// Field extraction helpers (read-only, best-effort)
// ──────────────────────────────────────────────

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_RE = /(\+?\d[\d\s().-]{6,}\d)/;
const TELEGRAM_RE = /(?:t\.me\/|@)[A-Za-z0-9_]{3,}/;

function firstMatch(text, re) {
    if (typeof text !== 'string') return '';
    const m = text.match(re);
    return m ? m[0].trim() : '';
}

function pick(fm, ...keys) {
    for (const k of keys) {
        if (fm[k] !== undefined && String(fm[k]).trim() !== '') {
            return String(fm[k]).trim();
        }
    }
    return '';
}

/**
 * Build one candidate lead object from a markdown file.
 * Returns { candidate, meta } where meta carries diagnostics
 * (voided/test/missing-name flags) used for needs_review counting.
 */
function buildCandidateFromMarkdown(filePath, content) {
    const fm = parseFrontMatter(content);
    const body = content;

    const type = pick(fm, 'type').toLowerCase();
    const status = pick(fm, 'status', 'state');
    const isVoided = type === 'voided' || status === 'removed' || status === 'voided';
    const isTest = String(fm['test_card'] || '').toLowerCase() === 'true';

    const lead_id = pick(fm, 'lead_id', 'id');
    const name = pick(fm, 'company', 'name', 'title');
    const websiteRaw = pick(fm, 'website', 'site', 'domain', 'url');
    const website = websiteRaw;
    const domain = websiteRaw ? normalizeDomain(websiteRaw) : '';

    // email: front-matter first, then body scan.
    let email = pick(fm, 'email');
    if (!email) email = firstMatch(body, EMAIL_RE);

    // phone / telegram: front-matter "contact" first, then body scan.
    const contact = pick(fm, 'contact', 'phone', 'telegram', 'tg');
    let phone = '';
    let telegram = '';
    if (contact) {
        telegram = firstMatch(contact, TELEGRAM_RE);
        phone = firstMatch(contact, PHONE_RE);
    }
    if (!telegram) telegram = firstMatch(body, TELEGRAM_RE);
    if (!phone) phone = firstMatch(body, PHONE_RE);

    const source = pick(fm, 'source');
    const region = pick(fm, 'region', 'city');

    const candidate = {
        lead_id: lead_id || '',
        name: name || '',
        website: website || '',
        domain: domain || '',
        region: region || '',
        status: status || '',
        source: source || `markdown:${basename(filePath)}`,
        contacts: {
            email: email || '',
            phone: phone || '',
            telegram: telegram || '',
        },
        raw: { markdown_file: basename(filePath) },
    };

    const meta = {
        file: basename(filePath),
        isVoided,
        isTest,
        hasName: Boolean(name),
        hasDomain: Boolean(domain),
        domain,
    };

    return { candidate, meta };
}

// ──────────────────────────────────────────────
// Canonical leads loader (read-only)
// ──────────────────────────────────────────────

function loadCanonicalLeads(jsonPath) {
    if (!existsSync(jsonPath)) {
        return { leads: [], error: 'canonical file not found' };
    }
    let parsed;
    try {
        parsed = JSON.parse(readFileSync(jsonPath, 'utf8'));
    } catch (e) {
        return { leads: [], error: `JSON parse error: ${e.message}` };
    }
    // Accept either an array, or an object with a leads[] field.
    let leads = [];
    if (Array.isArray(parsed)) {
        leads = parsed;
    } else if (parsed && Array.isArray(parsed.leads)) {
        leads = parsed.leads;
    } else if (parsed && typeof parsed === 'object') {
        // Fall back: collect array values if any.
        for (const v of Object.values(parsed)) {
            if (Array.isArray(v)) { leads = v; break; }
        }
    }
    return { leads, error: null };
}

// ──────────────────────────────────────────────
// ZB23 inspection
// ──────────────────────────────────────────────

function leadMatchesZb23(lead) {
    if (!lead || typeof lead !== 'object') return false;
    const d = normalizeDomain(lead.website ?? lead.domain ?? '');
    if (d === ZB23_DOMAIN) return true;
    // Also scan obvious string fields for the token.
    const blob = JSON.stringify(lead).toLowerCase();
    return blob.includes('zb23');
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────

function main() {
    const safety = {
        network: false,
        writes_real_data: false,
        confirm: false,
        touched_bot: false,
        touched_dashboard: false,
        read_secrets: false,
    };

    // 1. Read markdown files.
    let mdFiles = [];
    if (existsSync(MARKDOWN_LEADS_DIR)) {
        mdFiles = readdirSync(MARKDOWN_LEADS_DIR)
            .filter(f => f.toLowerCase().endsWith('.md'))
            .map(f => join(MARKDOWN_LEADS_DIR, f));
    }

    const candidates = [];
    const candidateMeta = [];
    const zb23Markdown = [];

    for (const filePath of mdFiles) {
        let content = '';
        try {
            content = readFileSync(filePath, 'utf8');
        } catch {
            continue;
        }
        const { candidate, meta } = buildCandidateFromMarkdown(filePath, content);

        // ZB23 in markdown? (by domain OR token in file)
        if (meta.domain === ZB23_DOMAIN || content.toLowerCase().includes('zb23')) {
            zb23Markdown.push({
                file: meta.file,
                voided: meta.isVoided,
                domain: meta.domain || '(none)',
            });
        }

        // Skip voided / test cards from being treated as importable candidates,
        // but still count them as "needs_review" diagnostics.
        candidateMeta.push(meta);

        if (meta.isVoided || meta.isTest) {
            continue; // not added to importable candidates
        }
        // A candidate must have at least a usable dedupe key.
        const keys = buildLeadDedupeKeys(candidate);
        if (!keys.leadIdKey && !keys.domainKey && !keys.nameRegionKey) {
            continue;
        }
        candidates.push(candidate);
    }

    // 2. Read canonical leads.
    const { leads: canonicalLeads, error: canonicalError } = loadCanonicalLeads(CANONICAL_JSON_PATH);

    // 5. Run candidates through the existing dedupe engine (in-memory only).
    const dedupeResult = dedupeLeadRecords(canonicalLeads, candidates, {
        now: new Date().toISOString(),
    });

    // needs_review: voided/test cards skipped + candidates with no key.
    const skippedVoidedOrTest = candidateMeta.filter(m => m.isVoided || m.isTest).length;
    const noKeyCandidates = candidateMeta.filter(
        m => !m.isVoided && !m.isTest && !m.hasName && !m.hasDomain,
    ).length;
    const needsReview = skippedVoidedOrTest + noKeyCandidates;

    // 6. ZB23 / zb23.ru reconciliation.
    const zb23Canonical = canonicalLeads.filter(leadMatchesZb23);
    const zb23InMarkdown = zb23Markdown.length > 0;
    const zb23VoidedInMarkdown = zb23Markdown.some(z => z.voided);

    // Would zb23 produce a duplicate/merge? Only if a non-voided candidate
    // for zb23 exists AND it collides with canonical.
    const zb23Candidate = candidates.find(c => normalizeDomain(c.website ?? c.domain) === ZB23_DOMAIN);
    let zb23Reconciliation = 'not_present';
    if (zb23Candidate) {
        const collided = dedupeResult.merged.some(
            m => normalizeDomain(m.candidate.website ?? m.candidate.domain) === ZB23_DOMAIN,
        );
        zb23Reconciliation = collided ? 'would_merge' : 'would_add';
    } else if (zb23VoidedInMarkdown) {
        zb23Reconciliation = 'voided_in_markdown_skipped';
    } else if (zb23InMarkdown) {
        zb23Reconciliation = 'present_in_markdown_no_candidate';
    }

    let zb23Status;
    if (zb23InMarkdown && zb23Canonical.length > 0) {
        zb23Status = `markdown=yes(voided=${zb23VoidedInMarkdown}); canonical=yes(${zb23Canonical.length}); reconcile=${zb23Reconciliation}`;
    } else if (zb23InMarkdown) {
        zb23Status = `markdown=yes(voided=${zb23VoidedInMarkdown}); canonical=no; reconcile=${zb23Reconciliation}`;
    } else if (zb23Canonical.length > 0) {
        zb23Status = `markdown=no; canonical=yes(${zb23Canonical.length}); reconcile=${zb23Reconciliation}`;
    } else {
        zb23Status = 'markdown=no; canonical=no; reconcile=not_present';
    }

    // 7. Summary.
    const wouldAdd = dedupeResult.added_count;
    const wouldMerge = dedupeResult.merged_count;
    const wouldDuplicate = dedupeResult.duplicate_count;

    let recommendedNextAction;
    if (canonicalError) {
        recommendedNextAction = `Resolve canonical JSON issue first: ${canonicalError}`;
    } else if (candidates.length === 0) {
        recommendedNextAction = 'No importable candidates (all voided/test/keyless). No action needed.';
    } else if (wouldMerge > 0 && wouldAdd === 0) {
        recommendedNextAction = 'All candidates already covered by canonical (merge-only). Review merges, then optionally run a real import with explicit approval.';
    } else if (wouldAdd > 0) {
        recommendedNextAction = `${wouldAdd} new lead(s) would be added. Manually review candidates, then request approval for a real (confirm) import.`;
    } else {
        recommendedNextAction = 'No changes would result. Reconciliation is in sync.';
    }

    const summary = {
        markdown_files_found: mdFiles.length,
        canonical_leads_before: canonicalLeads.length,
        candidates_extracted: candidates.length,
        would_add: wouldAdd,
        would_merge: wouldMerge,
        would_duplicate: wouldDuplicate,
        needs_review: needsReview,
        zb23_status: zb23Status,
        recommended_next_action: recommendedNextAction,
    };

    // ── Output ───────────────────────────────
    console.log('============================================================');
    console.log(' LEAD MARKDOWN ↔ CANONICAL — READ-ONLY DRY-RUN RECONCILIATION');
    console.log('============================================================');
    console.log('');
    console.log(`markdown dir   : ${MARKDOWN_LEADS_DIR}`);
    console.log(`canonical json : ${CANONICAL_JSON_PATH}`);
    if (canonicalError) console.log(`canonical note : ${canonicalError}`);
    console.log('');

    console.log('--- candidate diagnostics ---');
    for (const m of candidateMeta) {
        const flags = [];
        if (m.isVoided) flags.push('VOIDED');
        if (m.isTest) flags.push('TEST');
        if (!m.hasName) flags.push('no-name');
        if (!m.hasDomain) flags.push('no-domain');
        console.log(`  • ${m.file}  ${flags.length ? '[' + flags.join(',') + ']' : '[ok]'}  domain=${m.domain || '-'}`);
    }
    console.log('');

    console.log('--- ZB23 / zb23.ru inspection ---');
    console.log(`  markdown matches : ${zb23Markdown.length}`);
    for (const z of zb23Markdown) {
        console.log(`    - ${z.file} (voided=${z.voided}, domain=${z.domain})`);
    }
    console.log(`  canonical matches: ${zb23Canonical.length}`);
    console.log(`  reconciliation   : ${zb23Reconciliation}`);
    console.log('');

    console.log('--- SUMMARY (JSON) ---');
    console.log(JSON.stringify(summary, null, 2));
    console.log('');

    console.log('--- SAFETY ---');
    console.log(JSON.stringify(safety, null, 2));
    console.log('');
    console.log('real_data_changed: NO (dry-run, nothing written)');
    console.log('============================================================');

    return summary;
}

main();
