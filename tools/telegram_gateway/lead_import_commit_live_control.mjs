// lead_import_commit_live_control.mjs
// D3-4 Lead Commit Telegram Live-Control (L3 write-gated)
//
// Purpose:
//   Provide L3 write-gated control to COMMIT an already-APPROVED lead-import
//   card into the lead_contacts store, then stamp the approval queue COMMITTED.
//   Two commands, each with a mandatory check -> confirm discipline:
//     /lead_commit <import_id> check   -> read-only inspect, NO write
//     /lead_commit <import_id> confirm -> gated: real importer + recorder write
//
//   This module DELEGATES the actual writes to the audited D2N primitives:
//     - lead_import_committed_importer_real.mjs  (writes lead_contacts store)
//     - lead_import_commit_recorder_real.mjs     (stamps approval queue COMMITTED)
//   Both are triple-gated; this module only arms those gates for an exact
//   owner `confirm`, after a fresh dry-run, and verifies post-state.
//
// Hard safety boundaries (ALWAYS enforced & reported in the footer):
//   - client_contact: BLOCKED   (never touches messaging APIs / contacts outbound)
//   - auto_send:      BLOCKED   (no email / SMTP / WhatsApp / MAX / Telegram send)
//   - outreach:       BLOCKED   (no batch / bulk outreach)
//   - batch_ops:      BLOCKED   (single card only; never multiple)
//   - live_bot_patch: D3-4 only
//
// Write gate requires ALL of (confirm phase only):
//   - owner/Dmitry-only context (isOwner === true)
//   - exact command intent (verb 'commit' + 'confirm', no stray tokens)
//   - expectedImportId === parsed import_id (exact match)
//   - card.status === 'APPROVED_BY_DMITRY' and approved_by === 'Dmitry'
//   - card.committed !== true, card.snapshot_id == null, card.commit_result == null
//   - leadRecord resolvable read-only (never fabricated)
//   - fresh importer dry-run OK
//   - importer real write OK (allowRealImport + confirmRealImport + expectedImportId)
//   - recorder real write OK (allowCommit + confirmCommit + expectedImportId)
//   - post-verify: lead_contacts has snapshot_id, card COMMITTED, committed_by Dmitry,
//     commit_result present
//
// PRODUCTION NOTE:
//   Production /lead_commit confirm is *possible in code* but MUST NOT be executed
//   in the D3-4 test stage. It can only succeed when a leadRecord is resolvable and
//   Dmitry approval is explicit. Never expose raw PII in the Telegram response.

import fs from 'fs';
import crypto from 'crypto';

import { importApprovedCard } from './lead_import_committed_importer_real.mjs';
import { recordCommit } from './lead_import_commit_recorder_real.mjs';

export const SAFETY_FOOTER = Object.freeze({
    client_contact: 'BLOCKED',
    auto_send: 'BLOCKED',
    outreach: 'BLOCKED',
    live_bot_patch: 'D3-4 only',
    batch_ops: 'BLOCKED',
});

const IMPORT_ID_RE = /^IMP-\d{8}-\d{6}-\d{6}$/;
const VALID_PHASES = Object.freeze(['check', 'confirm']);
const APPROVED_STATUS = 'APPROVED_BY_DMITRY';
const COMMITTED_STATUS = 'COMMITTED';
const APPROVER_DMITRY = 'Dmitry';

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
export function sha256File(p) {
    const buf = fs.readFileSync(p);
    return crypto.createHash('sha256').update(buf).digest('hex');
}

function nonEmptyStr(v) {
    return typeof v === 'string' && v.trim() !== '';
}

function isPlainObject(v) {
    return v && typeof v === 'object' && !Array.isArray(v);
}

// ---------------------------------------------------------------------------
// Command parsing — ONLY /lead_commit
// ---------------------------------------------------------------------------
export function parseCommitCommand(text) {
    const raw = (text == null ? '' : String(text)).trim();
    const m = raw.match(/^\/lead_commit\b(.*)$/i);
    if (!m) return { ok: false, reason: 'not_commit_command' };
    const rest = m[1].trim();
    const parts = rest.length ? rest.split(/\s+/) : [];
    return {
        ok: true,
        importId: parts[0] != null ? parts[0] : null,
        phase: parts[1] != null ? String(parts[1]).toLowerCase() : null,
        extra: parts.slice(2),
    };
}

export function isCommitCommand(text) {
    return parseCommitCommand(text).ok;
}

// ---------------------------------------------------------------------------
// Read-only queue access
// ---------------------------------------------------------------------------
function readQueue(queuePath) {
    if (!queuePath || !fs.existsSync(queuePath)) {
        return { ok: false, reason: 'queue_unreadable', detail: 'queue file not found' };
    }
    let parsed;
    try {
        parsed = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
    } catch (e) {
        return { ok: false, reason: 'queue_unreadable', detail: 'invalid JSON' };
    }
    const cards = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.cards) ? parsed.cards : null);
    if (!cards) return { ok: false, reason: 'queue_unreadable', detail: 'no cards array' };
    return { ok: true, root: parsed, cards };
}

function findCard(cards, importId) {
    return cards.find((c) => c && (c.import_id === importId || c.importId === importId)) || null;
}

function cardStatusOf(card) {
    return card ? (card.status || card.state || null) : null;
}

// ---------------------------------------------------------------------------
// LeadRecord resolution — READ-ONLY, NEVER fabricated
// ---------------------------------------------------------------------------
// Resolution order (all read-only):
//   1. opts.resolveLeadRecord(card) custom resolver (used by tests / D2 mapping)
//   2. embedded card.lead_record / card.leadRecord
//   3. card.leads array of length exactly 1 (single lead card)
// Ambiguous (card.leads length > 1) -> FAIL_LEAD_RECORD_AMBIGUOUS.
// Nothing resolvable -> FAIL_LEAD_RECORD_NOT_FOUND.
function resolveLeadRecord(card, opts) {
    if (opts && typeof opts.resolveLeadRecord === 'function') {
        let r;
        try {
            r = opts.resolveLeadRecord(card);
        } catch (e) {
            return { ok: false, reason: 'FAIL_LEAD_RECORD_NOT_FOUND', detail: (e && e.message) || '' };
        }
        if (r && r.ambiguous === true) return { ok: false, reason: 'FAIL_LEAD_RECORD_AMBIGUOUS' };
        if (isPlainObject(r) && isPlainObject(r.leadRecord)) return { ok: true, leadRecord: r.leadRecord };
        if (isPlainObject(r)) return { ok: true, leadRecord: r };
        return { ok: false, reason: 'FAIL_LEAD_RECORD_NOT_FOUND' };
    }
    if (isPlainObject(card.lead_record)) return { ok: true, leadRecord: card.lead_record };
    if (isPlainObject(card.leadRecord)) return { ok: true, leadRecord: card.leadRecord };
    if (Array.isArray(card.leads)) {
        if (card.leads.length === 1 && isPlainObject(card.leads[0])) {
            return { ok: true, leadRecord: card.leads[0] };
        }
        if (card.leads.length > 1) return { ok: false, reason: 'FAIL_LEAD_RECORD_AMBIGUOUS' };
    }
    return { ok: false, reason: 'FAIL_LEAD_RECORD_NOT_FOUND' };
}

// Compute a non-PII safe lead label (never expose raw PII in Telegram).
function safeLeadLabel(leadRecord) {
    if (!isPlainObject(leadRecord)) return null;
    const id = leadRecord.lead_id || leadRecord.id || leadRecord.leadId || null;
    return id != null ? String(id) : '(resolvable, id hidden)';
}

function refusal(reason, extra) {
    return {
        ok: false,
        wrote: false,
        reason,
        safety: SAFETY_FOOTER,
        ...(extra || {}),
    };
}

function validateBasics(parsed) {
    if (!parsed.ok) return { ok: false, reason: 'not_commit_command' };
    if (!parsed.importId) return { ok: false, reason: 'missing_import_id' };
    if (!IMPORT_ID_RE.test(parsed.importId)) return { ok: false, reason: 'malformed_import_id' };
    if (!parsed.phase || !VALID_PHASES.includes(parsed.phase)) {
        return { ok: false, reason: 'missing_or_invalid_phase' };
    }
    return { ok: true };
}

// Shared eligibility gate: card must be APPROVED_BY_DMITRY, not committed,
// no snapshot_id and no commit_result yet.
function checkCommitEligibility(card) {
    const status = cardStatusOf(card);
    if (status === COMMITTED_STATUS) {
        return { ok: false, reason: 'status_already_committed', current_status: status };
    }
    if (status !== APPROVED_STATUS) {
        return { ok: false, reason: 'status_not_approved', current_status: status };
    }
    if (card.approved_by !== APPROVER_DMITRY) {
        return { ok: false, reason: 'approver_not_dmitry', current_status: status };
    }
    if (card.committed === true) {
        return { ok: false, reason: 'already_committed', current_status: status };
    }
    if (card.snapshot_id != null) {
        return { ok: false, reason: 'snapshot_already_present', current_status: status };
    }
    if (card.commit_result != null) {
        return { ok: false, reason: 'commit_result_already_present', current_status: status };
    }
    return { ok: true, current_status: status };
}

// ---------------------------------------------------------------------------
// CHECK (read-only, never writes)
// ---------------------------------------------------------------------------
export function handleCheck(parsed, opts = {}) {
    const basics = validateBasics(parsed);
    if (!basics.ok) return refusal(basics.reason);

    const q = readQueue(opts.queuePath);
    if (!q.ok) return refusal(q.reason, { detail: q.detail });

    const card = findCard(q.cards, parsed.importId);
    if (!card) return refusal('unknown_import_id', { import_id: parsed.importId });

    const elig = checkCommitEligibility(card);
    if (!elig.ok) {
        return refusal(elig.reason, { import_id: parsed.importId, current_status: elig.current_status });
    }

    // Resolve leadRecord (read-only) so check can show expected lead + refuse early.
    const lead = resolveLeadRecord(card, opts);
    if (!lead.ok) {
        return refusal(lead.reason, { import_id: parsed.importId, current_status: elig.current_status });
    }

    return {
        ok: true,
        wrote: false,
        phase: 'check',
        import_id: parsed.importId,
        current_status: elig.current_status,
        source: card.source || card.source_label || card.token || null,
        expected_lead_id: safeLeadLabel(lead.leadRecord),
        would_happen: [
            'import lead into lead_contacts store (snapshot_id stamped)',
            'stamp approval card COMMITTED in approval queue',
        ],
        backup_rule: 'pre-write timestamped backup is created before BOTH production writes',
        confirm_command: `/lead_commit ${parsed.importId} confirm`,
        safety: SAFETY_FOOTER,
    };
}

// ---------------------------------------------------------------------------
// CONFIRM (gated: dry-run -> importer -> recorder -> post-verify)
// ---------------------------------------------------------------------------
export async function handleConfirm(parsed, opts = {}) {
    const basics = validateBasics(parsed);
    if (!basics.ok) return refusal(basics.reason);

    // Owner gate (fail-closed).
    if (opts.isOwner !== true) {
        return refusal('owner_gate_blocked', { import_id: parsed.importId });
    }

    // Exact command intent: phase literally 'confirm', no stray extra tokens.
    if (parsed.phase !== 'confirm' || (parsed.extra && parsed.extra.length > 0)) {
        return refusal('confirm_intent_not_exact', { import_id: parsed.importId });
    }

    // Exact expectedImportId match.
    if (!nonEmptyStr(opts.expectedImportId) || opts.expectedImportId !== parsed.importId) {
        return refusal('expected_import_id_mismatch', {
            import_id: parsed.importId,
            expected_import_id: opts.expectedImportId || null,
        });
    }

    // Write gate flags (all required true).
    if (opts.allowRealImport !== true || opts.confirmRealImport !== true ||
        opts.allowCommit !== true || opts.confirmCommit !== true) {
        return refusal('write_gate_not_armed', { import_id: parsed.importId });
    }

    const q = readQueue(opts.queuePath);
    if (!q.ok) return refusal(q.reason, { detail: q.detail });

    const card = findCard(q.cards, parsed.importId);
    if (!card) return refusal('unknown_import_id', { import_id: parsed.importId });

    const elig = checkCommitEligibility(card);
    if (!elig.ok) {
        return refusal(elig.reason, { import_id: parsed.importId, current_status: elig.current_status });
    }

    // Resolve leadRecord read-only (never fabricated).
    const lead = resolveLeadRecord(card, opts);
    if (!lead.ok) {
        return refusal(lead.reason, { import_id: parsed.importId, current_status: elig.current_status });
    }
    const leadRecord = lead.leadRecord;

    if (!nonEmptyStr(opts.leadsStorePath)) {
        return refusal('leads_store_path_required', { import_id: parsed.importId });
    }

    // ---- 1) FRESH DRY-RUN importer first (no gate flags) ----
    let dry;
    try {
        dry = await importApprovedCard({
            queuePath: opts.queuePath,
            leadsStorePath: opts.leadsStorePath,
            importId: parsed.importId,
            leadRecord,
            clock: opts.clock,
            // NO gate flags -> guaranteed dry-run
        });
    } catch (e) {
        return refusal('importer_dry_run_failed', { import_id: parsed.importId, detail: (e && e.message) || '' });
    }
    if (!dry || dry.status !== 'DRY_RUN') {
        return refusal('importer_dry_run_failed', {
            import_id: parsed.importId,
            observed_status: dry ? dry.status : null,
        });
    }

    // ---- 2) REAL importer write (triple gate) ----
    let imp;
    try {
        imp = await importApprovedCard({
            queuePath: opts.queuePath,
            leadsStorePath: opts.leadsStorePath,
            importId: parsed.importId,
            leadRecord,
            expectedImportId: parsed.importId,
            allowRealImport: true,
            confirmRealImport: true,
            clock: opts.clock,
        });
    } catch (e) {
        return refusal('importer_write_failed', { import_id: parsed.importId, detail: (e && e.message) || '' });
    }
    if (!imp || imp.ok !== true || imp.status !== 'OK_IMPORTED' || imp.leads_written !== true) {
        return refusal('importer_write_failed', {
            import_id: parsed.importId,
            observed_status: imp ? imp.status : null,
        });
    }

    // ---- 3) RECORDER write (triple gate) -> stamp queue COMMITTED ----
    let rec;
    try {
        rec = await recordCommit({
            queuePath: opts.queuePath,
            importerResult: imp,
            leadRecord,
            expectedImportId: parsed.importId,
            allowCommit: true,
            confirmCommit: true,
            committedBy: APPROVER_DMITRY,
            clock: opts.clock,
        });
    } catch (e) {
        return refusal('recorder_failed', {
            import_id: parsed.importId,
            detail: (e && e.message) || '',
            importer_backup: imp.backup_file || null,
        });
    }
    if (!rec || rec.ok !== true || rec.status !== 'OK_RECORDED' || rec.queue_written !== true) {
        return refusal('recorder_failed', {
            import_id: parsed.importId,
            observed_status: rec ? rec.status : null,
            importer_backup: imp.backup_file || null,
        });
    }

    // ---- 4) POST-VERIFY ----
    // 4a) approval card COMMITTED + committed_by Dmitry + commit_result present
    const verifyQ = readQueue(opts.queuePath);
    if (!verifyQ.ok) {
        return refusal('post_verify_failed', { import_id: parsed.importId, detail: 'queue unreadable post-write' });
    }
    const vCard = findCard(verifyQ.cards, parsed.importId);
    if (!vCard || cardStatusOf(vCard) !== COMMITTED_STATUS) {
        return refusal('post_verify_failed', {
            import_id: parsed.importId,
            observed_status: vCard ? cardStatusOf(vCard) : null,
        });
    }
    if (vCard.committed_by !== APPROVER_DMITRY) {
        return refusal('post_verify_failed', { import_id: parsed.importId, detail: 'committed_by not Dmitry' });
    }
    if (vCard.commit_result == null || vCard.snapshot_id == null) {
        return refusal('post_verify_failed', { import_id: parsed.importId, detail: 'commit_result/snapshot_id missing on card' });
    }

    // 4b) lead_contacts store has the snapshot_id
    let storeHasSnapshot = false;
    try {
        const storeRaw = JSON.parse(fs.readFileSync(opts.leadsStorePath, 'utf8'));
        storeHasSnapshot = JSON.stringify(storeRaw).includes(imp.snapshot_id);
    } catch (e) {
        return refusal('post_verify_failed', { import_id: parsed.importId, detail: 'leads store unreadable post-write' });
    }
    if (!storeHasSnapshot) {
        return refusal('post_verify_failed', { import_id: parsed.importId, detail: 'snapshot_id absent from leads store' });
    }

    return {
        ok: true,
        wrote: true,
        phase: 'confirm',
        import_id: parsed.importId,
        previous_status: APPROVED_STATUS,
        new_status: COMMITTED_STATUS,
        snapshot_id: imp.snapshot_id,
        committed_by: vCard.committed_by,
        importer_backup: imp.backup_file || null,
        recorder_backup: rec.backup_file || null,
        verified: true,
        safety: SAFETY_FOOTER,
    };
}

// ---------------------------------------------------------------------------
// Top-level dispatch
// ---------------------------------------------------------------------------
export async function handleCommitCommand(text, opts = {}) {
    const parsed = parseCommitCommand(text);
    if (!parsed.ok) return refusal('not_commit_command');

    const basics = validateBasics(parsed);
    if (!basics.ok) return refusal(basics.reason, { import_id: parsed.importId });

    if (parsed.phase === 'check') return handleCheck(parsed, opts);
    if (parsed.phase === 'confirm') return handleConfirm(parsed, opts);
    return refusal('missing_or_invalid_phase');
}

export const _internal = {
    readQueue,
    findCard,
    cardStatusOf,
    resolveLeadRecord,
    checkCommitEligibility,
    safeLeadLabel,
};
