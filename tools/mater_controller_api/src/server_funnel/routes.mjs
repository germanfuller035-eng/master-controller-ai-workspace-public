// server_funnel/routes.mjs
// Owner/API routes for the server-connected funnel. These routes expose status
// and guarded packet checks; they do not send email, do not call Telegram, do
// not touch payments and do not write the production DB.
import {
    statusSnapshot,
    refreshImapReadonlySnapshot,
    applyCurrentEmailHubSnapshot,
    listEmailHubItems,
    getEmailHubItem,
    getEmailHubRawHeader,
    buildReplyDraft,
    buildTelegramApprovalCard,
    buildSendPacket,
    persistApprovalCard,
    sendTelegramApprovalCardToOwner,
    processTelegramApprovalCallback,
    evaluateSmtpSendGuard,
} from './service.mjs';

export function registerServerFunnelRoutes(r, { ok, fail, requireAuthOrService, requireAuth }) {
    r.get('/server-funnel/status', requireAuthOrService, (req, res) => ok(res, statusSnapshot()));

    r.post('/server-funnel/refresh-imap-readonly', requireAuth, (req, res) => {
        const result = refreshImapReadonlySnapshot();
        if (!result.ok) return fail(res, 409, result.code, 'Read-only обновление почты не выполнено', result);
        return ok(res, result);
    });

    r.post('/server-funnel/apply-snapshot', requireAuth, (req, res) => {
        const result = applyCurrentEmailHubSnapshot();
        return ok(res, {
            ...result,
            production_db_write: 'OFF',
        });
    });

    r.get('/server-funnel/mail', requireAuthOrService, (req, res) => ok(res, listEmailHubItems()));

    r.get('/server-funnel/mail/:emailId', requireAuthOrService, (req, res) => {
        const item = getEmailHubItem(req.params.emailId);
        if (!item) return fail(res, 404, 'EMAIL_NOT_FOUND', 'Письмо не найдено');
        return ok(res, {
            email: item,
            linked: {
                lead_id: item.classification?.type === 'lead' ? `lead_${item.thread_id.slice(0, 12)}` : null,
                deal_id: item.classification?.type === 'deal_reply' ? `deal_${item.thread_id.slice(0, 12)}` : null,
            },
            risk_ru: item.classification?.type === 'stop_request'
                ? 'Адресат просит не продолжать контакт.'
                : 'Перед ответом требуется подтверждение владельца.',
            proposed_next_action_ru: item.classification?.type === 'stop_request'
                ? 'Не отвечать и зафиксировать ограничение контакта.'
                : 'Подготовить ответ.',
        });
    });

    r.post('/server-funnel/reply-draft', requireAuth, (req, res) => {
        const draft = buildReplyDraft(req.body?.email || req.body || {});
        return ok(res, { ...draft, sends: false, auto_reply: 'OFF' });
    });

    r.post('/server-funnel/mail/:emailId/reply-draft', requireAuth, (req, res) => {
        const item = getEmailHubItem(req.params.emailId);
        if (!item) return fail(res, 404, 'EMAIL_NOT_FOUND', 'Письмо не найдено');
        const draft = buildReplyDraft({
            subject: item.subject,
            from: item.from_masked,
            date: item.date,
            in_reply_to: item.thread_id,
        });
        return ok(res, {
            email_id: item.email_id,
            ...draft,
            sends: false,
            auto_reply: 'OFF',
        });
    });

    r.post('/server-funnel/approval-card', requireAuth, (req, res) => {
        const packet = buildSendPacket(req.body?.packet || req.body || {});
        const card = buildTelegramApprovalCard({
            ...packet,
            from: req.body?.from,
            summary_ru: req.body?.summary_ru,
            risk_ru: req.body?.risk_ru,
            type: req.body?.type,
        });
        persistApprovalCard(card);
        return ok(res, {
            packet,
            approval_card: card,
            telegram_sent: false,
            note_ru: 'Карточка подготовлена. Отправка в Telegram выполняется отдельным approval gateway.',
        });
    });

    r.post('/server-funnel/mail/:emailId/approval-card', requireAuth, async (req, res) => {
        const item = getEmailHubItem(req.params.emailId);
        if (!item) return fail(res, 404, 'EMAIL_NOT_FOUND', 'Письмо не найдено');
        const raw = getEmailHubRawHeader(req.params.emailId);
        const draft = buildReplyDraft({ subject: item.subject, from: item.from_masked, in_reply_to: item.thread_id });
        const packet = buildSendPacket({
            lead_id: item.classification?.type === 'lead' ? `lead_${item.thread_id.slice(0, 12)}` : null,
            deal_id: item.classification?.type === 'deal_reply' ? `deal_${item.thread_id.slice(0, 12)}` : null,
            recipient: req.body?.recipient || raw?.from || '',
            channel: 'email',
            subject: req.body?.subject || draft.subject,
            body: req.body?.body || draft.body,
            stop_request: item.classification?.type === 'stop_request',
            quality_status: draft.quality?.status || 'NEEDS_OWNER_DECISION',
        });
        const card = buildTelegramApprovalCard({
            ...packet,
            from: item.from_masked,
            summary_ru: draft.summary_ru,
            risk_ru: draft.risk_ru,
            type: item.classification?.type || 'reply',
        });
        persistApprovalCard(card);
        let telegram = { ok: false, sent: false, code: 'TELEGRAM_SEND_NOT_REQUESTED' };
        if (req.body?.sendTelegram === true) {
            telegram = await sendTelegramApprovalCardToOwner(card);
        }
        return ok(res, {
            email_id: item.email_id,
            packet,
            approval_card: card,
            telegram_sent: telegram.sent === true,
            telegram_status: telegram.code,
            sends_client_email: false,
        });
    });

    r.post('/server-funnel/telegram/callback', requireAuthOrService, (req, res) => {
        const result = processTelegramApprovalCallback({
            callbackData: req.body?.callbackData || req.body?.callback_data || '',
            actor: req.body?.actor || 'owner_telegram',
        });
        if (!result.ok) return fail(res, 409, result.code, 'Telegram решение не принято', result);
        return ok(res, result);
    });

    r.post('/server-funnel/smtp/guard', requireAuth, (req, res) => {
        const guard = evaluateSmtpSendGuard({
            packet: req.body?.packet || {},
            approval: req.body?.approval || {},
            request: req.body?.request || {},
            usedPacketHashes: new Set(Array.isArray(req.body?.usedPacketHashes) ? req.body.usedPacketHashes : []),
        });
        if (!guard.allowed) return fail(res, 409, 'SMTP_SEND_BLOCKED', 'Отправка заблокирована до точного подтверждения владельца', guard);
        return ok(res, { ...guard, sent: false, note_ru: 'Guard пройден. Этот endpoint не отправляет письмо.' });
    });
}

export default { registerServerFunnelRoutes };
