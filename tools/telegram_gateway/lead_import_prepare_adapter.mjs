// lead_import_prepare_adapter.mjs
// =============================================================================
// D3C — Controlled "prepare PENDING approval card" adapter (write-gated)
//
// Dmitry approved D3C ONLY (2026-06-06): create exactly ONE controlled PENDING
// approval card so D3B approve/reject can be tested on a real PENDING card.
//
// Command surface (wired in telegram_master_bot.mjs):
//     /lead_import_prepare <lead text>
//
// CONTRACT (hard):
//   1. Owner-only (enforced by caller; adapter also fail-closes on isOwner).
//   2. Requires lead text after the command.
//   3. Parses the lead text using the EXISTING offline lead-intake pipeline
//      (lead_intake_pipeline.runLeadIntakeDryRun — never writes, never sends).
//   4. Creates exactly ONE PENDING approval card in the approval queue.
//   5. Writes ONLY the approval queue file it is given (opts.queuePath).
//   6. Does NOT write leads_master.json / lead_contacts.json /
//      lead_intake_events.jsonl. (The dry-run pipeline performs NO write.)
//   7. Creates a timestamped backup BEFORE any queue write.
//   8. Atomic write: tmp file + rename.
//   9. Card carries import_id, status PENDING, created_at, source, counts,
//      leads payload (for a LATER D4 commit) and safety flags.
//  10. QA FAIL with valid_count > 0 still yields a PENDING card WITH a warning
//      (qa_status: FAIL, review_required: true, commit_blocked_until_approved).
//  11. Idempotency: a repeated identical text does NOT overwrite an existing
//      card; it is refused as a duplicate of the existing PENDING card.
//
// SAFETY — what this module NEVER does:
//   - No real lead import. No leads_master / lead_contacts / events write.
//   - No client contact. No auto-send. No email/SMTP. No fetch/axios/network.
//   - No secrets / .env / AI_SECRETS reads.
//   - No hardcoded confirm:true. No bot start/stop. No D4 commit.
// =============================================================================

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import {
    runLeadIntakeDryRun,
    prepareLeadCandidatesFromText,
    buildImportId,
} from './lead_intake_pipeline.mjs';


export const D3C_PREPARE_VERSION = 'd3c-prepare-pending-card-1.0.0';

const PREPARE_COMMAND = '/lead_import_prepare';
const CARD_SOURCE = 'telegram_manual_prepare';

// Frozen safety flags embedded into every card + every adapter result.
export const PREPARE_SAFETY = Object.freeze({
    real_import: 'BLOCKED',
    client_contact: 'BLOCKED',
    auto_send: 'BLOCKED',
});

// ---------------------------------------------------------------------------
// Command routing / parsing
// ---------------------------------------------------------------------------

/**
 * True only for the exact `/lead_import_prepare` command token. The short
 * decision/review commands are intentionally NOT matched here.
 */
export function shouldRouteToPrepare(text) {
    const raw = (text == null ? '' : String(text)).trim();
    if (!raw.startsWith('/')) return false;
    const token = raw.split(/\s+/)[0].split('@')[0].toLowerCase();
    return token === PREPARE_COMMAND;
}

/**
 * Split the command from its free-text lead payload.
 * @returns {{ ok: boolean, leadText: string }}
 */
export function parsePrepareCommand(text) {
    const raw = (text == null ? '' : String(text));
    const trimmed = raw.trim();
    const m = trimmed.match(/^\/lead_import_prepare(?:@\S+)?\b([\s\S]*)$/i);
    if (!m) return { ok: false, leadText: '' };
    const leadText = (m[1] || '').trim();
    return { ok: true, leadText };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowStamp() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

function sha256Text(s) {
    return crypto.createHash('sha256').update(String(s == null ? '' : s), 'utf8').digest('hex');
}

function usagePayload(reason) {
    return {
        ok: false,
        wrote: false,
        usage: true,
        reason: reason || 'missing_text',
        usage_lines: [
            `${PREPARE_COMMAND} <lead text>`,
            'Например: /lead_import_prepare Имя; сайт; телефон; email',
        ],
        note: 'No mutation without lead text.',
        safety: PREPARE_SAFETY,
    };
}

function refusal(reason, extra) {
    return {
        ok: false,
        wrote: false,
        reason,
        safety: PREPARE_SAFETY,
        ...(extra || {}),
    };
}

/**
 * Read the queue file. Tolerates both an array payload and a `{ cards: [] }`
 * object payload. Missing file is treated as an empty `{ cards: [] }` root.
 */
function readQueueForAppend(queuePath) {
    if (!queuePath) return { ok: false, reason: 'queue_path_required' };
    if (!fs.existsSync(queuePath)) {
        return { ok: true, root: { schema: 'lead_import_approvals', cards: [] }, cards: [], existed: false, isArrayRoot: false };
    }
    let parsed;
    try {
        parsed = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
    } catch (e) {
        return { ok: false, reason: 'queue_unreadable', detail: 'invalid JSON' };
    }
    if (Array.isArray(parsed)) {
        return { ok: true, root: parsed, cards: parsed, existed: true, isArrayRoot: true };
    }
    if (parsed && Array.isArray(parsed.cards)) {
        return { ok: true, root: parsed, cards: parsed.cards, existed: true, isArrayRoot: false };
    }
    return { ok: false, reason: 'queue_unreadable', detail: 'no cards array' };
}

function backupPathFor(queuePath) {
    const dir = path.dirname(queuePath);
    const base = path.basename(queuePath);
    return path.join(dir, `${base}.bak-${nowStamp()}-d3c_prepare`);
}

// ---------------------------------------------------------------------------
// Card builder (pure)
// ---------------------------------------------------------------------------

/**
 * Build a PENDING approval card from a dry-run pipeline result.
 * Pure: no IO. Used by the writer and exposed for tests.
 */
export function buildPendingCard(dryResult, opts = {}) {
    const r = dryResult && typeof dryResult === 'object' ? dryResult : {};
    const counts = r.counts && typeof r.counts === 'object' ? r.counts : {};
    const importId = opts.importId || buildImportId(new Date());
    const createdAt = opts.now || new Date().toISOString();

    const validCount = counts.valid_count || 0;
    const parsedCount = counts.parsed_count != null ? counts.parsed_count : (counts.total_rows || 0);
    const needsReviewCount = counts.needs_review_count || 0;
    const finalUnique = counts.final_unique_count || 0;
    const invalidCount = Math.max(0, parsedCount - validCount);

    const qaStatus = r.qa_status || 'FAIL';
    const qaFailWithValid = qaStatus === 'FAIL' && validCount > 0;

    // Leads payload preserved for a LATER D4 commit (never committed here).
    // Prefer an explicitly-prepared candidate list (opts.leads) since the
    // dry-run result object does not surface the prepared leads array itself.
    const leadsPayload = Array.isArray(opts.leads)
        ? opts.leads
        : (Array.isArray(r.leads) ? r.leads : []);


    const card = {
        import_id: importId,
        status: 'PENDING',
        created_at: createdAt,
        source: CARD_SOURCE,
        parsed_count: parsedCount,
        valid_count: validCount,
        invalid_count: invalidCount,
        needs_review_count: needsReviewCount,
        final_unique_count: finalUnique,
        qa_status: qaStatus,
        lead_count: finalUnique || leadsPayload.length,
        // Prepared items needed for a later D4 commit.
        leads: leadsPayload,
        needs_review_rows: Array.isArray(r.needs_review_rows) ? r.needs_review_rows : [],
        source_text_sha256: opts.sourceTextSha256 || null,
        prepared_by: 'DMITRY',
        prepare_source: 'telegram_d3c_prepare',
        // Safety flags (rule 9 / rule 10).
        real_import: 'BLOCKED',
        client_contact: 'BLOCKED',
        auto_send: 'BLOCKED',
        commit_blocked_until_approved: true,
    };

    if (qaFailWithValid) {
        card.review_required = true;
        card.warning = 'QA FAIL but valid_count > 0: card created PENDING, commit blocked until approved.';
    }

    return card;
}

// ---------------------------------------------------------------------------
// Main entry — prepare ONE PENDING card (owner-gated, write-gated)
// ---------------------------------------------------------------------------

/**
 * @param {string} commandText  full `/lead_import_prepare <text>` message
 * @param {{
 *   queuePath: string,
 *   isOwner: boolean,
 *   now?: string,
 *   importId?: string,
 *   pipelineWorkspace?: string  // sandbox workspace for the dry-run (read-only)
 * }} opts
 * @returns {Promise<object>}
 */
export async function prepareLeadImportPendingCard(commandText, opts = {}) {
    const queuePath = opts.queuePath;

    // Owner gate (fail-closed) — adapter-level defense-in-depth.
    if (opts.isOwner !== true) {
        return refusal('owner_gate_blocked');
    }

    const parsed = parsePrepareCommand(commandText);
    if (!parsed.ok) {
        return refusal('not_prepare_command');
    }
    if (!parsed.leadText) {
        return usagePayload('missing_text');
    }
    if (!queuePath) {
        return refusal('queue_path_required');
    }

    const sourceTextSha256 = sha256Text(parsed.leadText);

    // --- Parse via the EXISTING offline pipeline (dry-run never writes). ---
    // A sandbox workspace keeps the dry-run far away from real 13_sales data.
    let dryResult;
    try {
        dryResult = await runLeadIntakeDryRun(parsed.leadText, {
            source: CARD_SOURCE,
            workspace: opts.pipelineWorkspace, // optional; default sandbox otherwise
        });
    } catch (e) {
        return refusal('parse_failed', { detail: (e && e.message) || String(e) });
    }

    const counts = (dryResult && dryResult.counts) || {};
    const validCount = counts.valid_count || 0;
    const needsReviewCount = counts.needs_review_count || 0;

    // Nothing usable parsed -> refuse, no mutation.
    if (validCount <= 0 && needsReviewCount <= 0) {
        return refusal('no_leads_parsed', {
            detail: 'Input produced no valid or needs-review leads.',
            counts,
        });
    }

    // --- Read queue for append + duplicate / idempotency guard. ---
    const q = readQueueForAppend(queuePath);
    if (!q.ok) {
        return refusal(q.reason, { detail: q.detail });
    }

    // Idempotency: refuse a duplicate of an existing PENDING card (same text).
    const dup = q.cards.find(
        (c) => c && c.status === 'PENDING' && c.source_text_sha256 === sourceTextSha256
    );
    if (dup) {
        return refusal('duplicate_pending', {
            existing_import_id: dup.import_id || dup.importId || null,
            note: 'An identical PENDING card already exists; refusing to create a duplicate.',
        });
    }

    // --- Recover the prepared candidate leads for the D4 commit payload. ---
    // The dry-run result does not surface the prepared leads array, so we
    // re-derive it offline (pure parse/normalize; never writes, never sends).
    let preparedLeads = [];
    try {
        const prep = prepareLeadCandidatesFromText(parsed.leadText, { source: CARD_SOURCE });
        if (prep && Array.isArray(prep.valid)) preparedLeads = prep.valid;
    } catch (e) {
        // Non-fatal: keep an empty payload; counts/QA still drive the card.
        preparedLeads = [];
    }

    // --- Build the new PENDING card. ---
    const card = buildPendingCard(dryResult, {
        importId: opts.importId,
        now: opts.now,
        sourceTextSha256,
        leads: preparedLeads,
    });


    // --- Pre-write backup (only when the file already exists). ---
    let backupPath = null;
    if (q.existed) {
        try {
            backupPath = backupPathFor(queuePath);
            fs.copyFileSync(queuePath, backupPath);
        } catch (e) {
            return refusal('backup_failed', { detail: (e && e.message) || '' });
        }
        if (!fs.existsSync(backupPath)) {
            return refusal('backup_failed', { detail: 'backup missing post-copy' });
        }
    }

    // --- Append to in-memory copy. ---
    q.cards.push(card);
    let rootToWrite;
    if (q.isArrayRoot) {
        rootToWrite = q.cards;
    } else {
        rootToWrite = q.root;
        rootToWrite.cards = q.cards;
        rootToWrite.updated_at = opts.now || new Date().toISOString();
    }

    // --- Atomic write (tmp + rename). ---
    try {
        fs.mkdirSync(path.dirname(queuePath), { recursive: true });
        const tmp = `${queuePath}.tmp-${nowStamp()}`;
        fs.writeFileSync(tmp, JSON.stringify(rootToWrite, null, 2), 'utf8');
        fs.renameSync(tmp, queuePath);
    } catch (e) {
        return refusal('write_failed', { detail: (e && e.message) || '', backup_path: backupPath });
    }

    // --- Post-write verify. ---
    const verify = readQueueForAppend(queuePath);
    if (!verify.ok) {
        return refusal('post_verify_failed', { backup_path: backupPath });
    }
    const vCard = verify.cards.find(
        (c) => c && (c.import_id === card.import_id) && c.status === 'PENDING'
    );
    if (!vCard) {
        return refusal('post_verify_failed', { backup_path: backupPath, import_id: card.import_id });
    }

    return {
        ok: true,
        wrote: true,
        import_id: card.import_id,
        status: 'PENDING',
        qa_status: card.qa_status,
        review_required: card.review_required === true,
        counts: {
            parsed_count: card.parsed_count,
            valid_count: card.valid_count,
            invalid_count: card.invalid_count,
            needs_review_count: card.needs_review_count,
            final_unique_count: card.final_unique_count,
        },
        backup_path: backupPath,
        backup_created: backupPath != null,
        queue_path: queuePath,
        card,
        safety: PREPARE_SAFETY,
    };
}

// ---------------------------------------------------------------------------
// Bot-glue helper: produce a single owner-facing reply text + route info.
// ---------------------------------------------------------------------------

/**
 * Format an adapter result into a compact Telegram-friendly reply.
 */
export function formatPrepareReply(result) {
    const r = result && typeof result === 'object' ? result : {};
    if (r.ok && r.wrote) {
        const lines = [
            '✅ Создана PENDING-карточка импорта.',
            `import_id: ${r.import_id}`,
            `qa_status: ${r.qa_status}`,
            `valid: ${r.counts.valid_count} | needs_review: ${r.counts.needs_review_count} | invalid: ${r.counts.invalid_count}`,
        ];
        if (r.review_required) lines.push('⚠️ QA FAIL при valid>0 — требуется ревью, commit заблокирован до одобрения.');
        lines.push('real_import: BLOCKED | client_contact: BLOCKED | auto_send: BLOCKED');
        lines.push(`Проверить: /lead_import_review`);
        lines.push(`Отклонить: /lead_import_reject ${r.import_id} check`);
        return lines.join('\n');
    }
    if (r.usage) {
        return ['❓ Использование:', ...r.usage_lines, r.note].join('\n');
    }
    if (r.reason === 'duplicate_pending') {
        return `ℹ️ Такая PENDING-карточка уже существует (import_id: ${r.existing_import_id}). Дубликат не создан.`;
    }
    if (r.reason === 'owner_gate_blocked') {
        return '⛔ Команда доступна только владельцу.';
    }
    if (r.reason === 'no_leads_parsed') {
        return '⚠️ Из текста не удалось извлечь ни одного лида. Карточка не создана.';
    }
    return `⚠️ Не удалось создать карточку: ${r.reason || 'unknown_error'}`;
}

export default {
    D3C_PREPARE_VERSION,
    PREPARE_SAFETY,
    shouldRouteToPrepare,
    parsePrepareCommand,
    buildPendingCard,
    prepareLeadImportPendingCard,
    formatPrepareReply,
};
