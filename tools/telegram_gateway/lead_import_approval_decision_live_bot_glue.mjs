// lead_import_approval_decision_live_bot_glue.mjs
// =============================================================================
// D3B glue: connects /lead_import_approve and /lead_import_reject Telegram
// commands to the write-gated approval-decision live-control module.
//
// Routing contract (STRICT):
//   - ONLY /lead_import_approve and /lead_import_reject are handled here.
//   - The short aliases /lead_approve and /lead_reject are NOT handled here
//     (they remain inactive at the D3B stage).
//   - No other command verbs (commit, import, send, contact...) are handled.
//   - check   -> never writes.
//   - confirm -> gated atomic write.
//   - bare command (no phase) -> usage, never writes.
//
// The glue formats a Telegram-ready text response. It never contacts a client,
// never imports, never sends to any external channel.
// =============================================================================

import {
    parseDecisionCommand,
    isDecisionCommand,
    handleDecisionCommand,
    safetyFooter,
    SAFETY_FOOTER,
} from './lead_import_approval_decision_live_control.mjs';

// Decide whether the incoming text should be routed to this D3B handler.
// IMPORTANT: matches ONLY the long-form /lead_import_approve|reject commands.
export function shouldRouteToDecisionLiveControl(text) {
    const raw = (text == null ? '' : String(text)).trim();
    return /^\/lead_import_(approve|reject)\b/i.test(raw);
}

function fmtSafety(footer) {
    const f = footer || SAFETY_FOOTER;
    return [
        '— Safety —',
        `queue_write: ${f.queue_write}`,
        `real_import: ${f.real_import}`,
        `client_contact: ${f.client_contact}`,
        `auto_send: ${f.auto_send}`,
    ].join('\n');
}

const REFUSAL_TEXT = {
    not_decision_command: 'Не команда approve/reject.',
    unknown_action: 'Неизвестное действие.',
    missing_import_id: 'Не указан IMPORT_ID. Формат: /lead_import_approve <IMPORT_ID> check',
    missing_phase: 'Укажите фазу: check или confirm.',
    invalid_phase: 'Некорректная фаза. Используйте check или confirm.',
    unknown_import_id: 'Карточка с таким IMPORT_ID не найдена в очереди.',
    status_not_pending: 'Действие возможно только для карточки в статусе PENDING.',
    owner_gate_blocked: 'confirm доступен только владельцу (Dmitry-only).',
    confirm_intent_not_exact: 'Неточная команда confirm. Используйте ровно: /lead_import_<action> <IMPORT_ID> confirm',
    queue_unreadable: 'Очередь недоступна для чтения.',
    backup_failed: 'Не удалось создать резервную копию — запись отменена.',
    write_failed: 'Ошибка записи очереди — изменения отменены.',
    post_verify_failed: 'Проверка после записи не прошла — см. backup.',
};

function formatUsage(res) {
    return [
        '⚠️ Команда не выполнена — отсутствует фаза check/confirm.',
        'Use:',
        `  ${res.usage_lines[0]}`,
        `  ${res.usage_lines[1]}`,
        res.note,
        '',
        fmtSafety(res.safety),
    ].join('\n');
}

function formatResult(res) {
    // Usage (bare command) — never mutates.
    if (res.usage === true) {
        return formatUsage(res);
    }

    // CHECK success.
    if (res.ok && res.phase === 'check') {
        const lines = [
            `🔎 ${res.action.toUpperCase()} CHECK — ${res.import_id}`,
            `Текущий статус: ${res.current_status}`,
            `Планируемый переход: ${res.would_transition}`,
            `Queue path: ${res.queue_path}`,
            `Planned backup: ${res.planned_backup}`,
        ];
        if (res.confirm_command) lines.push(`Подтверждение: ${res.confirm_command}`);
        lines.push('', fmtSafety(res.safety));
        return lines.join('\n');
    }

    // CONFIRM success (write) or idempotent no-op.
    if (res.ok && res.phase === 'confirm') {
        if (res.idempotent === true || res.wrote === false) {
            return [
                `↺ ${res.action.toUpperCase()} CONFIRM (no-op) — ${res.import_id}`,
                `Статус уже: ${res.new_status} (изменений нет)`,
                '',
                fmtSafety(res.safety),
            ].join('\n');
        }
        return [
            `✅ ${res.action.toUpperCase()} CONFIRM — ${res.import_id}`,
            `${res.previous_status} → ${res.new_status}`,
            `Queue path: ${res.queue_path}`,
            `Backup: ${res.backup_path}`,
            `Verify: ${res.verified ? 'OK' : 'FAIL'}`,
            '',
            fmtSafety(res.safety),
        ].join('\n');
    }

    // refusal
    const base = REFUSAL_TEXT[res.reason] || `Отказ: ${res.reason}`;
    const extra = res.current_status ? ` (статус: ${res.current_status})` : '';
    return [
        `⛔ ${base}${extra}`,
        '',
        fmtSafety(res.safety),
    ].join('\n');
}

// Main entry for the live bot. opts must include queuePath and (for confirm)
// isOwner === true. check ignores owner/gate flags but never mutates.
export function handleDecisionLiveControlBotMessage(text, opts = {}) {
    if (!shouldRouteToDecisionLiveControl(text)) {
        return { handled: false };
    }
    const parsed = parseDecisionCommand(text);
    const result = handleDecisionCommand(text, opts);
    return {
        handled: true,
        action: parsed.ok ? parsed.action : null,
        phase: parsed.ok ? parsed.phase : null,
        usage: !!result.usage,
        wrote: !!result.wrote,
        result,
        text: formatResult(result),
    };
}

export { parseDecisionCommand, isDecisionCommand, safetyFooter, SAFETY_FOOTER };
