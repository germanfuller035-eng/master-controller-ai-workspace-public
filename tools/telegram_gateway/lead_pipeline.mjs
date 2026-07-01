// lead_pipeline.mjs
// ============================================================
// BLOCK B — Lead Pipeline (/lead_run_pipeline)
// ------------------------------------------------------------
// Purpose:
//   Prepare leads and report how many are READY vs BLOCKED.
//   This module PREPARES ONLY. It is a pure, read-only classifier.
//
// HARD CONTRACT (Block B):
//   - NEVER sends email / Telegram. NEVER marks contacted. NEVER writes
//     production data. NEVER returns a fake/example/test recipient as ready.
//   - READ-ONLY: may read lead_contacts.json (via resolver) and the outbound
//     send ledger (Block G) to detect already-contacted leads.
//
// Output shape:
//   {
//     ready:   N,
//     blocked: N,
//     nextReady: <lead|null>,
//     items: [{ lead_id, company, website, status, reason, email, sendable }]
//   }
//
// blocked reasons (single canonical reason per lead, priority order):
//   no_site            — lead has no website at all
//   already_contacted  — lead_id present in ledger with result SENT
//   no_contact         — no real email resolvable
//   fake_email         — only a fake/example/test email is present
// ============================================================

import fs from 'node:fs';
import { resolveRealContact, isFakeEmail, isRealEmail } from './telegram_contact_resolver.mjs';

export const DEFAULT_LEDGER_PATH = 'D:/AI_WORKSPACE/13_sales/outbound_send_ledger.jsonl';

export const REASON_NO_SITE = 'no_site';
export const REASON_ALREADY_CONTACTED = 'already_contacted';
export const REASON_NO_CONTACT = 'no_contact';
export const REASON_FAKE_EMAIL = 'fake_email';

// ----------------------------------------------------------------------------
// Read the outbound send ledger (Block G) and return a Set of lead_ids that
// have at least one result === 'SENT'. READ-ONLY. Missing file -> empty set.
// ----------------------------------------------------------------------------
export function loadContactedIdsFromLedger(ledgerPath = DEFAULT_LEDGER_PATH) {
    const out = new Set();
    let raw = '';
    try {
        raw = fs.readFileSync(ledgerPath, 'utf8');
    } catch {
        return out; // no ledger yet -> nobody contacted
    }
    for (const line of raw.split(/\r?\n/)) {
        const s = line.trim();
        if (!s) continue;
        try {
            const rec = JSON.parse(s);
            if (rec && String(rec.result).toUpperCase() === 'SENT') {
                if (rec.lead_id) out.add(String(rec.lead_id).toLowerCase());
                // also key by website host so backfilled rows without lead_id still match
                if (rec.website) out.add(bareHost(rec.website));
            }
        } catch {
            /* skip malformed line, do not crash pipeline */
        }
    }
    return out;
}

function bareHost(website) {
    return String(website || '')
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .split('/')[0]
        .split('.')[0];
}

function isContacted(lead, contactedIds) {
    if (!contactedIds || contactedIds.size === 0) return false;
    const id = String(lead.lead_id || '').toLowerCase();
    if (id && contactedIds.has(id)) return true;
    const host = bareHost(lead.website);
    if (host && contactedIds.has(host)) return true;
    return false;
}

// ----------------------------------------------------------------------------
// Classify a single lead -> { status, reason, email, sendable }
//   opts: { registry, contactedIds, contactFileDirs, registryPath }
// ----------------------------------------------------------------------------
export function classifyLead(lead, opts = {}) {
    const l = lead || {};
    const contactedIds = opts.contactedIds;

    // 1) no website at all -> cannot audit
    if (!String(l.website || '').trim()) {
        return { status: 'blocked', reason: REASON_NO_SITE, email: '', sendable: false };
    }

    // 2) already contacted (ledger)
    if (isContacted(l, contactedIds)) {
        return { status: 'blocked', reason: REASON_ALREADY_CONTACTED, email: '', sendable: false };
    }

    // 3) resolve a REAL email (resolver hard-blocks fake/example/test)
    const res = resolveRealContact({
        lead: l,
        query: l.target || l.lead_id || 'top1',
        registry: opts.registry,
        registryPath: opts.registryPath,
        contactFileDirs: opts.contactFileDirs,
    });

    if (res.ok && res.sendable && isRealEmail(res.email)) {
        return { status: 'ready', reason: '', email: res.email, sendable: true };
    }

    // 4) distinguish fake_email vs no_contact for an honest report.
    //    If the lead carries an email that is non-empty but fake -> fake_email.
    const rawEmail = String(l.email || '').trim();
    if (rawEmail && isFakeEmail(rawEmail)) {
        return { status: 'blocked', reason: REASON_FAKE_EMAIL, email: '', sendable: false };
    }
    return { status: 'blocked', reason: REASON_NO_CONTACT, email: '', sendable: false };
}

// ----------------------------------------------------------------------------
// Run the pipeline over a list of leads. PREPARES ONLY. No send. No mark.
//   opts: { leads, registry, contactedIds, ledgerPath, contactFileDirs }
// ----------------------------------------------------------------------------
export function runLeadPipeline(opts = {}) {
    const leads = Array.isArray(opts.leads) ? opts.leads : [];
    const contactedIds =
        opts.contactedIds instanceof Set
            ? opts.contactedIds
            : loadContactedIdsFromLedger(opts.ledgerPath);

    const items = [];
    let ready = 0;
    let blocked = 0;
    let nextReady = null;

    for (const lead of leads) {
        const c = classifyLead(lead, { ...opts, contactedIds });
        const item = {
            lead_id: lead.lead_id || '',
            company: lead.company || '',
            website: lead.website || '',
            status: c.status,
            reason: c.reason,
            email: c.email,
            sendable: c.sendable,
        };
        items.push(item);
        if (c.status === 'ready') {
            ready++;
            if (!nextReady) nextReady = item;
        } else {
            blocked++;
        }
    }

    return { ready, blocked, total: items.length, nextReady, items };
}

// ----------------------------------------------------------------------------
// Format the Telegram report. Read-only wording — NOTHING is sent here.
// ----------------------------------------------------------------------------
export function formatLeadPipelineReport(result) {
    if (!result) return 'Lead pipeline: нет результата.';
    const lines = [];
    lines.push('🧮 Lead pipeline (подготовка — НИЧЕГО не отправлено)');
    lines.push('');
    lines.push(`ready leads: ${result.ready}`);
    lines.push(`blocked leads: ${result.blocked}`);

    if (result.nextReady) {
        const n = result.nextReady;
        lines.push('');
        lines.push(`next ready lead: ${n.company || n.lead_id || '(unknown)'} — ${n.website}`);
    } else {
        lines.push('');
        lines.push('next ready lead: (нет готовых лидов)');
    }

    // blocked reasons breakdown
    const reasons = {};
    for (const it of result.items) {
        if (it.status === 'blocked') {
            reasons[it.reason] = (reasons[it.reason] || 0) + 1;
        }
    }
    const reasonKeys = Object.keys(reasons);
    if (reasonKeys.length) {
        lines.push('');
        lines.push('blocked reasons:');
        for (const k of reasonKeys) lines.push(`  ${k}: ${reasons[k]}`);
    }

    lines.push('');
    if (result.nextReady) {
        lines.push('Следующий шаг: /sales_next (preview → ✅ → SMTP)');
    } else {
        lines.push('Следующий шаг: добавь реальные контакты (13_sales/lead_contacts.json) и повтори.');
    }
    return lines.join('\n');
}

// Telegram entrypoint. opts.loadLeads() should supply the lead list (kept
// injectable so this module stays pure and offline-testable).
export function handleLeadRunPipeline(opts = {}) {
    const leads = typeof opts.loadLeads === 'function' ? opts.loadLeads() : opts.leads || [];
    const result = runLeadPipeline({ ...opts, leads });
    return { result, text: formatLeadPipelineReport(result) };
}

export default {
    DEFAULT_LEDGER_PATH,
    REASON_NO_SITE,
    REASON_ALREADY_CONTACTED,
    REASON_NO_CONTACT,
    REASON_FAKE_EMAIL,
    loadContactedIdsFromLedger,
    classifyLead,
    runLeadPipeline,
    formatLeadPipelineReport,
    handleLeadRunPipeline,
};
