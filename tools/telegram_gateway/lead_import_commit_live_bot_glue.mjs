// lead_import_commit_live_bot_glue.mjs
// D3-4 glue: connects the /lead_commit Telegram command to the write-gated
// commit live-control module.
//
// Routing contract (STRICT):
//   - ONLY /lead_commit is handled here.
//   - /lead_approve, /lead_reject, /lead_queue and every other verb are NOT
//     handled by this glue (handled:false).
//   - check -> never writes; confirm -> gated importer + recorder write.
//
// The glue formats a Telegram-ready text response. It never contacts a client,
// never auto-sends, never runs batch operations, and never exposes raw PII.

import {
    parseCommitCommand,
    isCommitCommand,
    handleCommitCommand,
    SAFETY_FOOTER,
} from './lead_import_commit_live_control.mjs';

// Decide whether the incoming text should be routed to this D3-4 handler.
// STRICT: only /lead_commit, never approve/reject/queue.
export function shouldRouteToCommitLiveControl(text) {
    const raw = (text == null ? '' : String(text)).trim();
    return /^\/lead_commit\b/i.test(raw);
}

function fmtSafety() {
    return [
        '— Safety —',
        `• client_contact: ${SAFETY_FOOTER.client_contact}`,
        `• auto_send: ${SAFETY_FOOTER.auto_send}`,
        `• outreach: ${SAFETY_FOOTER.outreach}`,
        `• batch_ops: ${SAFETY_FOOTER.batch_ops}`,
        `• live_bot_patch: ${SAFETY_FOOTER.live_bot_patch}`,
    ].join('\n');
}

const REFUSAL_TEXT = {
    not_commit_command: 'Не команда /lead_commit.',
    missing_import_id: 'Не указан import_id. Формат: /lead_commit <import_id> check',
    malformed_import_id: 'Некорректный import_id (ожидается IMP-YYYYMMDD-HHMMSS-NNNNNN).',
    missing_or_invalid_phase: 'Укажите фазу: check или confirm.',
    unknown_import_id: 'Карточка с таким import_id не найдена в очереди.',
    status_already_committed: 'Карточка уже COMMITTED — повторный commit запрещён.',
    status_not_approved: 'Commit возможен только для карточки APPROVED_BY_DMITRY.',
    approver_not_dmitry: 'Карточка одобрена не Dmitry — commit заблокирован.',
    already_committed: 'Карточка уже зафиксирована (committed=true).',
    snapshot_already_present: 'У карточки уже есть snapshot_id — commit заблокирован.',
    commit_result_already_present: 'У карточки уже есть commit_result — commit заблокирован.',
    FAIL_LEAD_RECORD_NOT_FOUND: 'Lead record не найден (read-only) — commit невозможен.',
    FAIL_LEAD_RECORD_AMBIGUOUS: 'Lead record неоднозначен — commit заблокирован.',
    owner_gate_blocked: 'confirm доступен только владельцу (Dmitry-only).',
    confirm_intent_not_exact: 'Неточная команда confirm. Используйте ровно: /lead_commit <import_id> confirm',
    expected_import_id_mismatch: 'expectedImportId не совпадает — запись заблокирована.',
    write_gate_not_armed: 'Шлюз записи не активирован (gate not armed).',
    leads_store_path_required: 'Не задан путь lead_contacts store.',
    queue_unreadable: 'Очередь недоступна для чтения.',
    importer_dry_run_failed: 'Dry-run импортёра не прошёл — запись отменена.',
    importer_write_failed: 'Ошибка реальной записи импортёра — commit отменён.',
    recorder_failed: 'Ошибка recorder при фиксации очереди — см. backup.',
    post_verify_failed: 'Проверка после записи не прошла — см. backup.',
};

function formatResult(res) {
    if (res.ok && res.phase === 'check') {
        return [
            `🔎 COMMIT CHECK — ${res.import_id}`,
            `Статус: ${res.current_status}`,
            `Источник: ${res.source != null ? res.source : '—'}`,
            `Ожидаемый lead_id: ${res.expected_lead_id != null ? res.expected_lead_id : '—'}`,
            'Будет выполнено:',
            ...res.would_happen.map((w) => `  • ${w}`),
            `Backup: ${res.backup_rule}`,
            `Подтверждение: ${res.confirm_command}`,
            '',
            fmtSafety(),
        ].join('\n');
    }
    if (res.ok && res.phase === 'confirm') {
        return [
            `✅ COMMIT CONFIRM — ${res.import_id}`,
            `${res.previous_status} → ${res.new_status}`,
            `snapshot_id: ${res.snapshot_id}`,
            `committed_by: ${res.committed_by}`,
            `Verify: ${res.verified ? 'OK' : 'FAIL'}`,
            '',
            fmtSafety(),
        ].join('\n');
    }
    const base = REFUSAL_TEXT[res.reason] || `Отказ: ${res.reason}`;
    const extra = res.current_status ? ` (статус: ${res.current_status})` : '';
    return [
        `⛔ ${base}${extra}`,
        '',
        fmtSafety(),
    ].join('\n');
}

// Main entry for the live bot. opts must include queuePath, and for confirm:
// leadsStorePath, isOwner, expectedImportId, gate flags.
export async function handleCommitLiveControlBotMessage(text, opts = {}) {
    if (!shouldRouteToCommitLiveControl(text)) {
        return { handled: false };
    }
    const parsed = parseCommitCommand(text);
    const result = await handleCommitCommand(text, opts);
    return {
        handled: true,
        phase: parsed.ok ? parsed.phase : null,
        wrote: !!result.wrote,
        result,
        text: formatResult(result),
    };
}

export { parseCommitCommand, isCommitCommand, SAFETY_FOOTER };
