/**
 * approval_commands.mjs — Standalone Approval Commands (Phase B1.2, semi-automatic sales)
 *
 * Purpose:
 *   Parse and handle Telegram approval commands on top of the standalone
 *   approval_queue.mjs module. This file is STANDALONE: it is NOT integrated
 *   into telegram_master_bot.mjs and does NOT modify russian_command_router.mjs.
 *
 *   It prepares email follow-up DRAFTS, stores them as pending approvals, lists
 *   pending approvals, shows approval status, and approves/rejects approvals.
 *
 *   APPROVE/REJECT ONLY CHANGE A LOCAL STATUS. Nothing is ever sent to clients.
 *
 * Exported entry point:
 *   handleApprovalCommand(text, context) → Promise<boolean>
 *     - returns false  → the text is NOT an approval command (caller should ignore)
 *     - returns true   → the command was handled (reply already produced via context)
 *
 *   context:
 *     {
 *       workspace,        // absolute path to D:\AI_WORKSPACE
 *       chatId,           // telegram chat id (passed through to sendTelegram, never printed)
 *       sendTelegram,     // async (chatId, text) => void   (reply transport — local/telegram)
 *       botLog            // optional (msg) => void          (diagnostics)
 *     }
 *
 * Supported commands:
 *   /prepare_send <lead_id> email followup   → create pending approval (NO email sent)
 *   /pending_approvals                       → list pending approvals
 *   /approval_status <approval_id>           → show one approval
 *   /approve <approval_id>                   → set approved_ready_to_send (NO email sent)
 *   /reject <approval_id> <reason>           → set rejected
 *
 * SAFETY CONTRACT (HARD MODE):
 *   - Never sends email / WhatsApp / Telegram to clients. Reply only goes through
 *     context.sendTelegram (owner-facing transport). No auto-send is ever triggered.
 *   - approve/reject only change local status via approval_queue.mjs.
 *   - Never reads .env / AI_SECRETS. Never prints BOT_TOKEN / CHAT_ID / tokens.
 *   - Never touches VPS / dashboard production files / git.
 *   - Unknown lead_id / approval_id / bad format → clear, friendly reply text.
 *   - Never throws to the caller; all errors become a reply string.
 */

import {
    createApproval,
    listPendingApprovals,
    getApproval,
    approveApproval,
    rejectApproval,
    renderApprovalForTelegram,
} from './approval_queue.mjs';

import { resolveLeadId, listKnownLeadIds } from './lead_resolver.mjs';

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

// Recognised approval commands (leading slash stripped before matching).
const APPROVAL_COMMANDS = new Set([
    'prepare_send',
    'pending_approvals',
    'approval_status',
    'approve',
    'reject',
]);

// Extract an approval_id token (AP-...) from free text.
const APPROVAL_ID_RE = /\b(AP-[A-Za-z0-9-]+)\b/i;

// ──────────────────────────────────────────────
// Small helpers
// ──────────────────────────────────────────────

function safeLog(context, msg) {
    try {
        if (context && typeof context.botLog === 'function') context.botLog(msg);
    } catch (_) { /* never throw from logging */ }
}

async function reply(context, text) {
    // Owner-facing reply only. This is NOT a client send.
    if (context && typeof context.sendTelegram === 'function') {
        await context.sendTelegram(context.chatId, text);
    }
    return true;
}

/** Build a Russian email draft for a lead (mirrors DRAFT_TEMPLATES.email style). */
function buildEmailDraft(leadId, record) {
    const lead = record && typeof record === 'object' ? record : {};
    const company = lead.company_name || lead.company || leadId;
    const domain  = lead.domain || lead.site || lead.website || '';

    const subject = `${company} — продолжение по аудиту сайта`;
    const body = [
        'Здравствуйте!',
        '',
        `Ранее писали по поводу мини-аудита сайта ${domain || ''}. Хотели уточнить,`.trim(),
        'успели ли посмотреть материалы и остались ли вопросы.',
        '',
        'Готовы созвониться в удобное время или прислать короткое резюме по точкам роста.',
        '',
        'С уважением,',
        'Дмитрий',
    ].join('\n');

    return { subject, body };
}

function previewOf(text, max = 200) {
    const s = String(text || '').replace(/\s+/g, ' ').trim();
    return s.length > max ? s.slice(0, max) + '…' : s;
}

// ──────────────────────────────────────────────
// Command handlers (each returns a reply string)
// ──────────────────────────────────────────────

/** /prepare_send <lead_id> email followup */
function cmdPrepareSend(rawText, args, workspace) {
    // Expected shape: prepare_send <lead_id> email followup
    if (args.length < 1) {
        return [
            '❌ Неверный формат команды.',
            'Пример: `/prepare_send ZB23 email followup`',
            '',
            `Известные lead_id: ${listKnownLeadIds(workspace).join(', ') || '(пусто)'}`,
        ].join('\n');
    }

    // Resolve lead_id from the full text (resolver scans tokens for a known id).
    const res = resolveLeadId(rawText, workspace);
    if (!res.found) {
        return [
            '❌ Lead_id не распознан.',
            res.error || 'Lead_id не найден.',
            '',
            'Пример: `/prepare_send ZB23 email followup`',
        ].join('\n');
    }

    // Optional sanity: this command path is email/followup only.
    const lower = rawText.toLowerCase();
    const isEmail = lower.includes('email');
    if (!isEmail) {
        return [
            '❌ Поддерживается только канал email в этой команде.',
            'Пример: `/prepare_send ' + res.leadId + ' email followup`',
        ].join('\n');
    }

    const { subject, body } = buildEmailDraft(res.leadId, res.record);

    const created = createApproval(workspace, {
        lead_id: res.leadId,
        action_type: 'email_followup',
        channel: 'email',
        subject,
        body,
    });

    if (!created.ok) {
        return `❌ Не удалось создать approval: ${created.error || 'неизвестная ошибка'}`;
    }

    const a = created.approval;
    return [
        '🟡 *DRAFT создан и поставлен на подтверждение*',
        '🚫 Email НЕ отправлен. Авто-отправка ЗАБЛОКИРОВАНА.',
        '',
        `approval_id: \`${a.approval_id}\``,
        `lead_id: \`${a.lead_id}\``,
        `subject: ${a.subject}`,
        `status: ${a.status}`,
        '',
        '*Превью письма:*',
        previewOf(a.body_preview || subject + ' ' + body),
        a.draft_path ? `\n💾 draft: \`${a.draft_path}\`` : '',
        '',
        'Действия:',
        `  ✅ \`/approve ${a.approval_id}\``,
        `  ❌ \`/reject ${a.approval_id} <причина>\``,
    ].filter(Boolean).join('\n');
}

/** /pending_approvals */
function cmdPendingApprovals(workspace) {
    const pending = listPendingApprovals(workspace);
    if (!pending.length) {
        return '✅ Нет ожидающих approvals (pending пуст).';
    }
    const blocks = pending.map(renderApprovalForTelegram);
    return [
        `🟡 *Ожидающие подтверждения: ${pending.length}*`,
        '',
        blocks.join('\n\n— — —\n\n'),
    ].join('\n');
}

/** /approval_status <approval_id> */
function cmdApprovalStatus(rawText, workspace) {
    const m = rawText.match(APPROVAL_ID_RE);
    if (!m) {
        return [
            '❌ Не указан approval_id.',
            'Пример: `/approval_status AP-20260531-120000-ZB23-EMAIL`',
        ].join('\n');
    }
    const approvalId = m[1];
    const approval = getApproval(workspace, approvalId);
    if (!approval) {
        return `❌ Неизвестный approval_id: \`${approvalId}\`. Проверьте /pending_approvals.`;
    }
    return renderApprovalForTelegram(approval);
}

/** /approve <approval_id> */
function cmdApprove(rawText, workspace) {
    const m = rawText.match(APPROVAL_ID_RE);
    if (!m) {
        return [
            '❌ Не указан approval_id.',
            'Пример: `/approve AP-20260531-120000-ZB23-EMAIL`',
        ].join('\n');
    }
    const approvalId = m[1];
    const res = approveApproval(workspace, approvalId, 'owner');
    if (!res.ok) {
        return `❌ ${res.error || 'Не удалось подтвердить approval.'}`;
    }
    return [
        '🟢 *Подтверждено.*',
        '🚫 Email НЕ отправлен. Авто-отправка ЗАБЛОКИРОВАНА.',
        'Готово к ручной отправке / Phase C.',
        '',
        renderApprovalForTelegram(res.approval),
    ].join('\n');
}

/** /reject <approval_id> <reason> */
function cmdReject(rawText, workspace) {
    const m = rawText.match(APPROVAL_ID_RE);
    if (!m) {
        return [
            '❌ Не указан approval_id.',
            'Пример: `/reject AP-20260531-120000-ZB23-EMAIL не актуально`',
        ].join('\n');
    }
    const approvalId = m[1];
    // Reason = everything after the approval_id token.
    const after = rawText.slice(m.index + m[0].length).trim();
    const reason = after || '(причина не указана)';

    const res = rejectApproval(workspace, approvalId, reason);
    if (!res.ok) {
        return `❌ ${res.error || 'Не удалось отклонить approval.'}`;
    }
    return [
        '🔴 *Отклонено.*',
        'Ничего не отправлено клиенту.',
        '',
        renderApprovalForTelegram(res.approval),
    ].join('\n');
}

// ──────────────────────────────────────────────
// Public: handleApprovalCommand(text, context)
// ──────────────────────────────────────────────

export async function handleApprovalCommand(text, context = {}) {
    const rawText = String(text || '').trim();
    if (!rawText) return false;

    // Must start with a slash command to be considered.
    if (!rawText.startsWith('/')) return false;

    // First token after the slash, lowercased, without arguments.
    const firstToken = rawText.slice(1).split(/\s+/)[0].toLowerCase();
    if (!APPROVAL_COMMANDS.has(firstToken)) {
        return false; // not an approval command → let other routers handle it
    }

    const workspace = context && context.workspace;
    if (!workspace) {
        await reply(context, '❌ Внутренняя ошибка: workspace не задан в context.');
        return true;
    }

    // args = tokens after the command word
    const args = rawText.slice(1).split(/\s+/).slice(1);

    let replyText;
    try {
        switch (firstToken) {
            case 'prepare_send':
                replyText = cmdPrepareSend(rawText, args, workspace);
                break;
            case 'pending_approvals':
                replyText = cmdPendingApprovals(workspace);
                break;
            case 'approval_status':
                replyText = cmdApprovalStatus(rawText, workspace);
                break;
            case 'approve':
                replyText = cmdApprove(rawText, workspace);
                break;
            case 'reject':
                replyText = cmdReject(rawText, workspace);
                break;
            default:
                return false;
        }
    } catch (e) {
        safeLog(context, `approval_commands error: ${e.message}`);
        replyText = `❌ Внутренняя ошибка обработки команды: ${e.message}`;
    }

    safeLog(context, `approval_commands handled: /${firstToken}`);
    await reply(context, replyText);
    return true;
}

export default { handleApprovalCommand };
