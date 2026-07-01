import fs from 'fs';
import dq from './mini_audit_draft_quality.mjs';

export const MINI_AUDIT_OPERATOR_COMMANDS = new Set([
    '/mini_audit',
    '/next_action',
    '/waiting_reply',
    '/followups',
    '/send_uncertain',
    '/ready_send',
    '/needs_check',
]);

const FOLLOWUP_AFTER_HOURS = 48;

// Leads that must NEVER appear in any operator surface (internal test mailbox).
const HIDDEN_LEAD_IDS = new Set(['INTERNAL_VALIDATION_ONLY_20260614']);

// Canonical "ready to send" status produced by lead_store.mjs. A lead is only
// sendable when it carries this status — NOT merely when it happens to have an
// email + preview. This is what prevents needs_identity_verification /
// needs_domain_verification / hold_* leads from leaking into ready-send.
const CANONICAL_READY_STATUS = 'ready';

// Statuses that explicitly mean "blocked / not sendable yet" — surfaced in the
// ⚠️ Требуют проверки screen with a concrete reason. NOTE: `rejected` is NOT
// here on purpose — a rejected lead is archived, not an active blocked lead.
const VERIFICATION_BLOCK_STATUS = {
    needs_identity_verification: 'identity not verified',
    needs_domain_verification: 'domain not verified',
    hold_no_public_email: 'no public email',
    hold_later: 'on hold',
    written_channel_search_queue: 'no email — written-channel search',
    blocked_fake_email: 'invalid email domain',
};

// Rejected / archived statuses — excluded from EVERY active operator surface.
const ARCHIVED_STATUSES = new Set(['rejected']);
function isArchived(lead) { return ARCHIVED_STATUSES.has(String(lead && lead.status || '')); }

function asArray(store) {
    if (Array.isArray(store)) return store;
    if (store && Array.isArray(store.leads)) return store.leads;
    if (store && store.leads && typeof store.leads === 'object') return Object.values(store.leads);
    if (store && typeof store === 'object') return Object.values(store).filter(v => v && typeof v === 'object');
    return [];
}

export function loadMiniAuditStore(storePath) {
    const raw = fs.readFileSync(storePath, 'utf-8');
    return JSON.parse(raw);
}

export function normalizeMiniAuditCommand(text) {
    const t = String(text || '').trim().split(/\s+/)[0].toLowerCase();
    return MINI_AUDIT_OPERATOR_COMMANDS.has(t) ? t : null;
}

function leadId(lead) { return String(lead.lead_id || lead.id || '').trim(); }
function company(lead) { return String(lead.company || lead.company_name || lead.name || leadId(lead) || '—').trim(); }
function isHidden(lead) { return HIDDEN_LEAD_IDS.has(leadId(lead)); }
function hasEmail(lead) { return !!String(lead.email || lead.recipient || lead.contact_email || '').trim(); }
function previewBody(lead) {
    const p = lead.email_preview || lead.audit_preview || null;
    return String(lead.body || lead.audit_draft_body || lead.audit_draft_preview || lead.preview || (p && p.body) || '').trim();
}
function hasPreview(lead) { return !!previewBody(lead); }
function isLegacyOverlayOnly(lead) { return lead.legacy_overlay_only === true || lead.source_provider === 'dashboard_legacy_overlay'; }
// Canonical ready gate: the lead MUST carry the canonical ready status produced
// by the verified pipeline AND still have a usable email + preview, must not be
// already sent / uncertain / legacy. Status is the source of truth — a stray
// email+preview on a needs_*_verification lead does NOT make it sendable.
function isReadyToSend(lead) {
    if (isHidden(lead) || isLegacyOverlayOnly(lead)) return false;
    if (lead.status === 'waiting_reply' || lead.status === 'send_uncertain') return false;
    if (lead.last_send_status || lead.send_proof_status === 'proven') return false;
    if (String(lead.status || '') !== CANONICAL_READY_STATUS) return false;
    return hasEmail(lead) && hasPreview(lead);
}
function isProvenSend(lead) {
    return lead.status === 'waiting_reply'
        && lead.last_send_status === 'success'
        && lead.send_proof_status === 'proven'
        && Number(lead.smtp_response_code) === 250;
}
function hoursSinceSent(lead, now = new Date()) {
    const raw = lead.last_sent_at || lead.last_contacted_at;
    const d = raw ? new Date(raw) : null;
    if (!d || Number.isNaN(d.getTime())) return null;
    return (now.getTime() - d.getTime()) / 36e5;
}
function followupDue(lead, now = new Date()) {
    const h = hoursSinceSent(lead, now);
    return isProvenSend(lead) && h != null && h >= FOLLOWUP_AFTER_HOURS;
}

function reasonForBlockedLead(lead, now = new Date()) {
    if (isLegacyOverlayOnly(lead)) return 'legacy overlay only';
    if (lead.status === 'send_uncertain' || lead.send_proof_status === 'missing') return 'send_uncertain';
    if (lead.status === 'waiting_reply' && !followupDue(lead, now)) return 'waiting_reply too early';
    if (VERIFICATION_BLOCK_STATUS[lead.status]) return VERIFICATION_BLOCK_STATUS[lead.status];
    if (!hasEmail(lead)) return 'missing email';
    if (!hasPreview(lead)) return 'missing preview';
    return null;
}

export function getMiniAuditOperatorState(store, options = {}) {
    const now = options.now || new Date();
    const allLeads = asArray(store).filter(Boolean).filter(l => !isHidden(l));
    // Archived (rejected) leads are kept for the Archive screen but excluded from
    // EVERY active workflow surface below.
    const archived = allLeads.filter(isArchived);
    const leads = allLeads.filter(l => !isArchived(l));
    const waitingReply = leads.filter(isProvenSend).sort((a, b) => String(a.last_sent_at || '').localeCompare(String(b.last_sent_at || '')));
    const sendUncertain = leads.filter(l => l.status === 'send_uncertain' || l.last_send_status === 'uncertain_no_smtp_proof' || l.send_proof_status === 'missing');
    const followupCandidates = waitingReply.filter(l => followupDue(l, now));
    const readySend = leads.filter(isReadyToSend);
    // Leads that have a finished audit but no email draft yet (audit ready, no preview).
    const auditNoEmailDraft = leads.filter(l => !isReadyToSend(l) && l.status !== 'waiting_reply' && l.status !== 'send_uncertain' && hasEmail(l) && !hasPreview(l) && !isLegacyOverlayOnly(l));
    const needsCheck = leads.map(l => ({ lead: l, reason: reasonForBlockedLead(l, now) })).filter(x => x.reason);
    const followupCandidate = followupCandidates[0] || null;
    // PRIORITY ORDER (per ТЗ Этап 4.4):
    //   1) due follow-up with proven send
    //   2) ready-to-send verified lead
    //   3) lead with finished audit but no email draft
    //   4) lead missing audit preview
    //   5) lead missing email
    //   6) send_uncertain requiring a decision
    //   7) nothing
    let nextAction = { kind: 'none', lead: null, reason: 'No action' };
    if (followupCandidate) nextAction = { kind: 'followup', lead: followupCandidate, reason: 'proven SMTP 250 and >48h since send' };
    else if (readySend[0]) nextAction = { kind: 'ready_send', lead: readySend[0], reason: 'email + preview + verified + not sent' };
    else if (auditNoEmailDraft[0]) nextAction = { kind: 'prepare_email', lead: auditNoEmailDraft[0], reason: 'audit ready, email draft missing' };
    else if (needsCheck.find(x => x.reason === 'missing preview')) nextAction = { kind: 'repair_preview', lead: needsCheck.find(x => x.reason === 'missing preview').lead, reason: 'missing preview' };
    else if (needsCheck.find(x => x.reason === 'missing email')) nextAction = { kind: 'verify_email', lead: needsCheck.find(x => x.reason === 'missing email').lead, reason: 'missing email' };
    else if (sendUncertain[0]) nextAction = { kind: 'verify_proof', lead: sendUncertain[0], reason: 'send_uncertain / proof missing' };
    return { leads, allLeads, archived, waitingReply, sendUncertain, followupCandidates, followupCandidate, readySend, auditNoEmailDraft, needsCheck, nextAction, now };
}

export function buildFollowupDraft(lead) {
    if (!lead || !leadId(lead)) return null;
    const site = lead.website || lead.domain || leadId(lead);
    return {
        lead_id: leadId(lead),
        subject: `Re: ${lead.subject || `${site} — мини-аудит сайта`}`,
        body: [
            'Здравствуйте.',
            '',
            `Недавно отправлял короткий разбор сайта ${site}.`,
            'Подскажите, актуально ли посмотреть 1–2 страницы с конкретными правками по заявке и структуре сайта?',
            '',
            'Если сейчас неактуально — просто напишите, я не буду отвлекать.',
            '',
            'С уважением,',
            'Дмитрий',
        ].join('\n'),
    };
}

function leadLine(lead, now) {
    const h = hoursSinceSent(lead, now);
    const age = h == null ? 'sent: —' : `sent: ${lead.last_sent_at || lead.last_contacted_at} (${Math.floor(h)}h)`;
    return `• ${leadId(lead)} — ${company(lead)} · proof=${lead.send_proof_status || '—'} · smtp=${lead.smtp_response_code || '—'} · ${age}`;
}

export function buildMiniAuditOperatorKeyboard() {
    return { inline_keyboard: [
        [{ text: '🎯 Следующее действие', callback_data: 'maop:next' }],
        [{ text: '🔎 Найти лиды', callback_data: 'maop:find' }],
        [{ text: '✅ Готовы к отправке', callback_data: 'maop:ready' }, { text: '🛠 Готовят аудит', callback_data: 'maop:preparing' }],
        [{ text: '📬 Ожидают ответа', callback_data: 'maop:waiting' }, { text: '🔁 Follow-up', callback_data: 'maop:followups' }],
        [{ text: '⚠️ Требуют проверки', callback_data: 'maop:needs' }, { text: '🧾 Неопределённые', callback_data: 'maop:uncertain' }],
        [{ text: '🗄 Архив / Отклонённые', callback_data: 'maop:archived' }],
        [{ text: '📊 Статус Mini Audit', callback_data: 'maop:status' }],
        [{ text: '🏠 Главное меню', callback_data: 'maop:home' }],
    ] };
}

export function buildFollowupKeyboard(lead) {
    const id = leadId(lead);
    return { inline_keyboard: [
        [{ text: '👁 Посмотреть', callback_data: `maop:view:${id}` }],
        [{ text: '✅ Отправить', callback_data: `fu:a:${id}` }, { text: '⏭ Отложить', callback_data: `fu:p:${id}` }],
        [{ text: '❌ Отклонить', callback_data: `fu:r:${id}` }, { text: '🏠 Главное меню', callback_data: 'maop:status' }],
    ] };
}

const PAGE_SIZE = 5;

// Paginated lead list. Each lead is its own button; max 5 per screen with
// prev/next navigation. `section` is the callback that rebuilds this list.
function buildLeadListKeyboard(leads, section, page = 0) {
    const total = leads.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const p = Math.max(0, Math.min(page, pages - 1));
    const slice = leads.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE);
    const rows = slice.map(l => ([{ text: company(l), callback_data: `maop:view:${leadId(l)}` }]));
    const nav = [];
    if (p > 0) nav.push({ text: '⬅️ Предыдущие', callback_data: `${section}#${p - 1}` });
    if (p < pages - 1) nav.push({ text: '➡️ Следующие', callback_data: `${section}#${p + 1}` });
    if (nav.length) rows.push(nav);
    rows.push([{ text: '🔄 Обновить', callback_data: `${section}#${p}` }]);
    rows.push([{ text: '⬅️ Назад', callback_data: 'maop:status' }, { text: '🏠 Меню', callback_data: 'maop:home' }]);
    return { inline_keyboard: rows };
}

// State-dependent action buttons for a single lead card.
//   - Archived (rejected) leads: ONLY restore / history / back / menu. No email,
//     no send, no approval, no regenerate.
//   - Active leads: audit + email preview + the full draft-editing tool set.
//     A real "Подготовить отправку" button only appears AFTER owner approval.
function buildLeadCardKeyboard(lead, state) {
    const st = state || { followupCandidates: [] };
    const id = leadId(lead);
    if (isArchived(lead)) {
        return { inline_keyboard: [
            [{ text: '♻️ Вернуть в работу', callback_data: `maop:restore:${id}` }],
            [{ text: '👁 История', callback_data: `maop:history:${id}` }],
            [{ text: '⬅️ Назад', callback_data: 'maop:archived' }, { text: '🏠 Меню', callback_data: 'maop:home' }],
        ] };
    }
    const rows = [];
    const isDue = (st.followupCandidates || []).some(l => leadId(l) === id);
    const av = dq.activeDraftVersion(lead);
    const approved = av && av.status === dq.DRAFT_STATUS.APPROVED_BY_OWNER;

    // Audit vs email previews are separate surfaces.
    rows.push([{ text: '👁 Аудит', callback_data: `maop:audit:${id}` }, { text: '✉️ Письмо', callback_data: `maop:email:${id}` }]);

    if (isDue) {
        rows.push([{ text: '✅ Отправить follow-up', callback_data: `fu:a:${id}` }, { text: '⏭ Отложить', callback_data: `fu:p:${id}` }]);
        rows.push([{ text: '❌ Закрыть', callback_data: `fu:r:${id}` }]);
    }

    // Draft-editing tool set (always available for an active lead so the owner
    // can bring a weak draft up to standard from the card).
    rows.push([{ text: '✨ Усилить текст', callback_data: `maop:improve:${id}` }, { text: '✏️ Внести правки', callback_data: `maop:edit:${id}` }]);
    rows.push([{ text: '🔄 Пересоздать', callback_data: `maop:regen:${id}` }]);
    rows.push([{ text: '🎯 Изменить CTA', callback_data: `maop:cta:${id}` }, { text: '🗣 Изменить тон', callback_data: `maop:tone:${id}` }]);

    if (approved) {
        // Only after explicit owner approval does the send-preparation path appear.
        rows.push([{ text: '📤 Подготовить отправку', callback_data: 'maop:ready' }]);
    } else {
        rows.push([{ text: '✅ Утвердить черновик', callback_data: `maop:approve:${id}` }, { text: '❌ Отклонить', callback_data: `maop:rejectdraft:${id}` }]);
    }

    if (lead.status === 'send_uncertain' || lead.send_proof_status === 'missing') {
        rows.push([{ text: '🔍 Проверить proof', callback_data: `maop:checkproof:${id}` }]);
    }
    rows.push([{ text: '⬅️ Назад', callback_data: 'maop:status' }, { text: '🏠 Меню', callback_data: 'maop:home' }]);
    return { inline_keyboard: rows };
}

function sentDate(lead) {
    const raw = lead.last_sent_at || lead.last_contacted_at || '';
    if (!raw) return '—';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit' });
}

// Resolve the draft to display for a lead: the active stored version if present,
// otherwise a freshly generated one (NOT persisted here — persistence happens in
// the bot callbacks via the canonical store accessor).
export function resolveCurrentDraft(lead) {
    const av = dq.activeDraftVersion(lead);
    if (av) return { draft: av, version: av.draft_version, stored: true };
    const generated = dq.generateDraft(lead);
    return { draft: { ...generated, draft_version: 0, status: dq.DRAFT_STATUS.DRAFT }, version: 0, stored: false };
}

// 👁 Аудит — audit facts / evidence only. Never email copy.
function renderAuditPreview(lead, state) {
    const findings = dq.concreteEvidenceFindings(lead);
    const allObs = dq.evidenceFindings(lead);
    const lines = [
        `👁 *Аудит — ${company(lead)}*`,
        '',
        `Сайт: ${lead.website || lead.domain || '—'}`,
        `Готовность аудита: ${findings.length >= 2 ? 'достаточно данных' : 'данных недостаточно'}`,
        `Специфичность: ${lead.audit_specificity || '—'}`,
        '',
        'Проверенные наблюдения:',
        ...(allObs.length ? allObs.map((x, i) => `${i + 1}. ${x}`) : ['— нет подтверждённых наблюдений аудита.']),
    ];
    if (!findings.length) {
        lines.push('', 'Ещё не проверено: конкретные точки потери заявок (нужен реальный аудит сайта).');
    }
    lines.push('', 'Autosend: BLOCKED');
    return { text: lines.join('\n'), reply_markup: buildLeadCardKeyboard(lead, state) };
}

// ✉️ Письмо — email draft preview with quality score, subject, CTA, facts, version.
function renderEmailPreview(lead, state) {
    const { draft, version, stored } = resolveCurrentDraft(lead);
    const gate = dq.evaluateDraftGate(lead, draft);
    const ctaLabel = draft.cta_key ? (dq.CTA_LABELS_RU[draft.cta_key] || draft.cta_key) : '—';
    const used = Array.isArray(draft.source_findings) ? draft.source_findings
        : (Array.isArray(draft.used_findings) ? draft.used_findings : []);
    const lines = [
        `✉️ *Письмо — ${company(lead)}*`,
        '',
        `Получатель: ${lead.email || lead.recipient || '— (email не найден)'}`,
        `Тип письма: ${dq.EMAIL_TYPE_LABELS_RU[draft.email_type] || draft.email_type || '—'}`,
        `Этап: ${dq.EMAIL_TYPE_LABELS_RU[draft.email_type] || '—'}`,
        `Версия: ${version}${stored ? '' : ' (черновик не сохранён)'}`,
        `Качество черновика: ${gate.score}/100`,
        `Статус черновика: ${draft.status === dq.DRAFT_STATUS.APPROVED_BY_OWNER ? 'Утверждён владельцем' : draft.status === dq.DRAFT_STATUS.REJECTED_DRAFT ? 'Отклонён' : 'Черновик'}`,
        '',
        `Тема:`,
        draft.subject || '—',
        '',
        `Текст:`,
        draft.body || '—',
        '',
        'Использованные факты:',
        ...(used.length ? used.map((x) => `• ${x}`) : ['• нет подтверждённых фактов']),
        '',
        `CTA: ${ctaLabel}`,
    ];
    if (gate.blocked) {
        lines.push('', '⛔ Черновик заблокирован для отправки:');
        gate.blockReasons.forEach((r) => lines.push(`• ${r}`));
    } else if (gate.reasons.length) {
        lines.push('', 'Нужно улучшить:');
        gate.reasons.slice(0, 4).forEach((r) => lines.push(`• ${r}`));
    }
    lines.push('', 'Autosend: BLOCKED');
    return { text: lines.join('\n'), reply_markup: buildLeadCardKeyboard(lead, state || { followupCandidates: [] }) };
}

function renderLeadCard(lead, state) {
    if (!lead) return { text: 'Лид не найден.', reply_markup: buildMiniAuditOperatorKeyboard() };

    // Archived (rejected) lead: stopped — no email, no send, no approval.
    if (isArchived(lead)) {
        const reason = lead.blocked_reason || lead.reject_reason || lead.rejected_reason || lead.readiness_reason || 'rejected';
        const text = [
            company(lead),
            '',
            `Статус: ${dq.statusLabelRu(lead.status)}`,
            `Причина: ${reason}`,
            '',
            'Работа по лиду остановлена.',
            'Письмо и отправка недоступны, пока лид не возвращён в работу.',
            '',
            'Autosend: BLOCKED',
        ].join('\n');
        return { text, reply_markup: buildLeadCardKeyboard(lead, state) };
    }

    const isDue = state.followupCandidates.some(l => leadId(l) === leadId(lead));
    const reason = reasonForBlockedLead(lead, state.now);
    const { draft } = resolveCurrentDraft(lead);
    const gate = dq.evaluateDraftGate(lead, draft);
    const next = isDue ? 'Подготовлен follow-up'
        : isReadyToSend(lead) ? 'Готов к отправке — открой отправку'
        : lead.status === 'waiting_reply' ? 'Ждать ответа'
        : reason ? `Заблокирован: ${dq.statusLabelRu(lead.status) || reason}`
        : 'Проверить карточку';
    const text = [
        company(lead),
        '',
        `Сайт: ${lead.website || lead.domain || '—'}`,
        `Email: ${lead.email || lead.recipient || '—'}`,
        `Статус: ${dq.statusLabelRu(lead.status)}`,
        `Тема: ${draft.subject || '—'}`,
        `Готовность письма: ${gate.score}/100`,
        `Этап: ${dq.EMAIL_TYPE_LABELS_RU[draft.email_type] || '—'}`,
        `SMTP proof: ${Number(lead.smtp_response_code) === 250 ? 'Подтверждено (250)' : (lead.send_proof_status || '—')}`,
        `Отправлено: ${sentDate(lead)}`,
        `Следующее действие: ${next}`,
        reason ? `Причина: ${dq.statusLabelRu(lead.status) || reason}` : '',
        '',
        'Открой «👁 Аудит» и «✉️ Письмо» для деталей.',
        'Autosend: BLOCKED',
    ].filter(Boolean).join('\n');
    return { text, reply_markup: buildLeadCardKeyboard(lead, state) };
}

export function renderMiniAuditOperator(command, state) {
    const s = state;
    const cmd = String(command || '');
    // Lead lookups search ALL leads (including archived) so an owner can open an
    // archived lead from the Archive screen; the card itself enforces archived UX.
    const findLead = (id) => (s.allLeads || s.leads).find(l => leadId(l) === id);

    // Pagination: "section#page" → render that section's list at the page.
    const hashIdx = cmd.indexOf('#');
    if (hashIdx > 0) {
        const section = cmd.slice(0, hashIdx);
        const page = parseInt(cmd.slice(hashIdx + 1), 10) || 0;
        return renderSectionList(section, s, page);
    }

    if (cmd.startsWith('view:')) {
        return renderLeadCard(findLead(cmd.slice('view:'.length)), s);
    }
    if (cmd.startsWith('audit:')) {
        const lead = findLead(cmd.slice('audit:'.length));
        if (!lead) return { text: 'Лид не найден.', reply_markup: buildMiniAuditOperatorKeyboard() };
        return renderAuditPreview(lead, s);
    }
    if (cmd.startsWith('email:')) {
        const lead = findLead(cmd.slice('email:'.length));
        if (!lead) return { text: 'Лид не найден.', reply_markup: buildMiniAuditOperatorKeyboard() };
        if (isArchived(lead)) return renderLeadCard(lead, s); // no email surface for archived
        return renderEmailPreview(lead, s);
    }
    // Backward-compat: old "preview:" maps to the email preview.
    if (cmd.startsWith('preview:')) {
        const lead = findLead(cmd.slice('preview:'.length));
        if (!lead) return { text: 'Лид не найден.', reply_markup: buildMiniAuditOperatorKeyboard() };
        if (isArchived(lead)) return renderLeadCard(lead, s);
        return renderEmailPreview(lead, s);
    }
    if (cmd === 'archived') {
        const list = s.archived || [];
        return { text: ['🗄 *Архив / Отклонённые*', '',
            ...(list.length ? list.map(l => `• ${company(l)} — ${dq.statusLabelRu(l.status)}`) : ['Архив пуст.']), '',
            'Отклонённые лиды не участвуют в активной работе.',
            'Чтобы вернуть лид — откройте его и нажмите «♻️ Вернуть в работу».',
        ].join('\n'), reply_markup: list.length ? buildLeadListKeyboard(list, 'maop:archived', 0) : buildMiniAuditOperatorKeyboard() };
    }
    if (command === '/mini_audit' || command === 'status') {
        return { text: [
            '💰 *Mini Audit — Command Center*', '',
            `📬 Ожидают ответа: *${s.waitingReply.length}*`,
            `🎯 Следующее действие: *${s.nextAction.lead ? company(s.nextAction.lead) : 'нет'}*`,
            `✅ Готовы к отправке: *${s.readySend.length}*`,
            `🛠 Готовят аудит: *${s.auditNoEmailDraft.length}*`,
            `🔁 Follow-up due: *${s.followupCandidates.length}*`,
            `⚠️ Требуют проверки: *${s.needsCheck.length}*`,
            `🧾 Неопределённые отправки: *${s.sendUncertain.length}*`,
            `🗄 Архив / Отклонённые: *${(s.archived || []).length}*`, '',
            'Всё управление — кнопками ниже. Команды оставлены только как fallback.',
            'Autosend: BLOCKED · реальные письма только после approval Дмитрия.',
        ].join('\n'), reply_markup: buildMiniAuditOperatorKeyboard() };
    }
    if (command === '/next_action' || command === 'next') {
        const a = s.nextAction;
        if (!a.lead) return { text: '🎯 Следующее действие: нет действий.\n\nAutosend: BLOCKED', reply_markup: buildMiniAuditOperatorKeyboard() };
        if (a.kind === 'followup') {
            const draft = buildFollowupDraft(a.lead);
            const text = [company(a.lead), '', 'Follow-up готов.', '', 'Отправлено:', sentDate(a.lead), '', 'Статус:', dq.statusLabelRu(a.lead.status), '', draft ? `Тема: ${draft.subject}` : '', 'Autosend: BLOCKED'].filter(Boolean).join('\n');
            return { text, reply_markup: buildFollowupKeyboard(a.lead) };
        }
        // Non-followup next action: open the lead card directly.
        return renderLeadCard(a.lead, s);
    }
    if (command === '/followups' || command === 'followups') {
        if (!s.followupCandidates.length) return { text: '🔁 Follow-up: кандидатов нет.\n\nSend uncertain и ранние waiting_reply заблокированы.', reply_markup: buildMiniAuditOperatorKeyboard() };
        return { text: ['🔁 *Follow-up кандидаты*', '', ...s.followupCandidates.map(l => leadLine(l, s.now)), '', 'Открой /next_action для черновика и approval-кнопок.'].join('\n'), reply_markup: buildFollowupKeyboard(s.followupCandidates[0]) };
    }
    if (command === '/waiting_reply' || command === 'waiting') return renderSectionList('maop:waiting', s, 0);
    if (command === '/send_uncertain' || command === 'uncertain') return renderSectionList('maop:uncertain', s, 0);
    if (command === '/ready_send' || command === 'ready') return renderSectionList('maop:ready', s, 0);
    if (command === '/needs_check' || command === 'needs') return renderSectionList('maop:needs', s, 0);
    if (command === 'preparing') return renderSectionList('maop:preparing', s, 0);
    if (command === 'find') {
        return { text: [
            '🔎 *Найти лиды*', '',
            'Источник готов: ручной / CSV verified import.',
            'Внешний источник (DataForSEO): требуется разрешение на live request — кредов в окружении нет.',
            '',
            'Импорт verified-лидов проходит отдельный approval-flow перед попаданием в pipeline.',
            'Autosend: BLOCKED.',
        ].join('\n'), reply_markup: buildMiniAuditOperatorKeyboard() };
    }
    return { text: 'Mini Audit Operator Mode: команда не распознана.', reply_markup: buildMiniAuditOperatorKeyboard() };
}

// Render a paginated section list (5 leads/page, each a button).
function renderSectionList(section, s, page = 0) {
    let list = [];
    let title = '';
    let empty = '';
    switch (section) {
        case 'maop:waiting': list = s.waitingReply; title = '📬 *Ожидают ответа*'; empty = 'Нет лидов, ожидающих ответа.'; break;
        case 'maop:uncertain': list = s.sendUncertain; title = '🧾 *Неопределённые отправки*'; empty = 'Нет неопределённых отправок.'; break;
        case 'maop:ready': list = s.readySend; title = '✅ *Готовы к отправке*'; empty = 'Нет лидов, готовых к отправке.'; break;
        case 'maop:preparing': list = s.auditNoEmailDraft; title = '🛠 *Готовят аудит*'; empty = 'Нет лидов на этапе подготовки.'; break;
        case 'maop:needs': list = s.needsCheck.map(x => x.lead); title = '⚠️ *Требуют проверки*'; empty = 'Нет заблокированных лидов.'; break;
        case 'maop:archived': list = s.archived || []; title = '🗄 *Архив / Отклонённые*'; empty = 'Архив пуст.'; break;
        default: return { text: 'Раздел не распознан.', reply_markup: buildMiniAuditOperatorKeyboard() };
    }
    if (!list.length) return { text: `${title}\n\n${empty}`, reply_markup: buildMiniAuditOperatorKeyboard() };
    const PAGE = 5;
    const pages = Math.max(1, Math.ceil(list.length / PAGE));
    const p = Math.max(0, Math.min(page, pages - 1));
    const slice = list.slice(p * PAGE, p * PAGE + PAGE);
    const text = [title, '', `Стр. ${p + 1}/${pages} · всего ${list.length}`, '',
        ...slice.map(l => `• ${company(l)} — ${dq.statusLabelRu(l.status)}`)].join('\n');
    return { text, reply_markup: buildLeadListKeyboard(list, section, p) };
}

export function renderFollowupCallback(action, lead, alreadyProcessed = false) {
    if (alreadyProcessed) return { ok: false, text: `⛔ Duplicate blocked: ${leadId(lead)}. Повторное действие не выполнено.\n\nAutosend: BLOCKED` };
    if (!lead || !followupDue(lead, new Date())) return { ok: false, text: `🚫 Follow-up blocked: ${lead ? leadId(lead) : 'unknown'} не является proven due кандидатом.` };
    if (action === 'reject') return { ok: true, text: `❌ Follow-up отклонён: ${leadId(lead)}\n\nAutosend: BLOCKED` };
    if (action === 'postpone') return { ok: true, text: `⏭ Follow-up отложен: ${leadId(lead)}\n\nAutosend: BLOCKED` };
    const draft = buildFollowupDraft(lead);
    return { ok: true, draft, text: [`✅ Дмитрий подтвердил follow-up: ${leadId(lead)}`, '', 'Approval required: YES', 'Canonical send path: required for real send.', 'Autosend: BLOCKED'].join('\n') };
}

// Re-render the email card for a lead after a callback mutated its draft.
export function renderEmailCardFor(lead, state) {
    if (!lead) return { text: 'Лид не найден.', reply_markup: buildMiniAuditOperatorKeyboard() };
    return renderEmailPreview(lead, state || { followupCandidates: [] });
}

export { isArchived, buildLeadCardKeyboard };

export default {
    MINI_AUDIT_OPERATOR_COMMANDS,
    loadMiniAuditStore,
    normalizeMiniAuditCommand,
    getMiniAuditOperatorState,
    buildFollowupDraft,
    buildMiniAuditOperatorKeyboard,
    buildFollowupKeyboard,
    renderMiniAuditOperator,
    renderFollowupCallback,
    resolveCurrentDraft,
    renderEmailCardFor,
    isArchived,
};