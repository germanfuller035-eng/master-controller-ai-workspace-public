/**
 * russian_command_router.mjs — Universal Russian Command Router (STANDALONE)
 *
 * Purpose:
 *   Translate free-form Russian (and mixed RU/EN) phrases into the canonical
 *   slash commands the Telegram master bot already understands. This module
 *   ONLY translates — it never executes business logic, never sends messages.
 *
 * Exports:
 *   - parseRussianIntent(text, workspace) → {
 *       ok, intent, command, leadId, args, error, examples
 *     }
 *
 * SAFETY CONTRACT (HARD MODE):
 *   - PURE / READ-ONLY translation. No network, no send, no restart.
 *   - Never reads .env / AI_SECRETS. Never prints BOT_TOKEN / CHAT_ID / tokens.
 *   - Lead resolution delegated to lead_resolver.mjs (no single-lead hardcode).
 */

import { resolveLeadId, listKnownLeadIds } from './lead_resolver.mjs';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function norm(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/\s+/g, ' ')
        .trim();
}

function anyOf(haystack, needles) {
    return needles.some(n => haystack.includes(n));
}

const HELP_EXAMPLES = [
    'что сегодня',
    'статус системы',
    'покажи ZB23',
    'подготовь письмо EDERA',
    'я отправил письмо ATOM',
    'ватсап GSK не найден',
    'поставь звонок ZB23 завтра 10:30',
    'добавь заметку KZHBI клиент ответил позже',
    'помощь',
];

function fail(error, examples = HELP_EXAMPLES) {
    return {
        ok: false,
        intent: 'unknown',
        command: null,
        leadId: null,
        args: {},
        error,
        examples,
    };
}

function ok(intent, command, leadId = null, args = {}) {
    return {
        ok: true,
        intent,
        command,
        leadId,
        args,
        error: null,
        examples: [],
    };
}

// Validate a lead_id supplied inline for enrichment-from-text (C2.7g).
// For enrichment-from-text the lead_id is NOT required to exist in
// lead_resolver — a brand-new lead may be seeded. We still validate the token
// safely: latin letters / digits / underscore / hyphen, length 2–40, then
// normalize to uppercase. Returns the uppercased id, or null if invalid.
function validateEnrichLeadId(token) {
    if (!token) return null;
    const tok = String(token).trim();
    if (!/^[A-Za-z0-9_-]{2,40}$/.test(tok)) return null;
    return tok.toUpperCase();
}

// Extract free-text note that follows the lead_id token within the original text.
// Keeps original (non-lowercased) casing for the note body.
function extractNoteAfterLead(rawText, leadId) {
    const re = new RegExp('\\b' + leadId + '\\b', 'i');
    const m = rawText.match(re);
    if (!m) return '';
    return rawText.slice(m.index + m[0].length).trim();
}

// ──────────────────────────────────────────────
// Main: parseRussianIntent
// ──────────────────────────────────────────────

export function parseRussianIntent(text, workspace) {
    const raw = String(text || '');
    const t = norm(raw);

    if (!t) {
        return fail('Пустой ввод. Напишите команду, например: «что сегодня».');
    }

    // 9) HELP — check first (no lead needed)
    if (anyOf(t, ['помощь', 'что ты умеешь', 'команды', 'как тобой управлять'])) {
        return ok('help', 'help_ru');
    }

    // 2) HEALTH / SYSTEM STATUS
    if (anyOf(t, ['статус системы', 'здоровье системы', 'бот живой', 'проверка'])) {
        return ok('health', '/health');
    }

    // 1) SALES TODAY
    if (anyOf(t, [
        'что сегодня', 'задачи на сегодня', 'что по продажам',
        'что делать сегодня', 'план на сегодня',
    ])) {
        return ok('sales_today', '/sales_today');
    }

    // ──────────────────────────────────────────────
    // APPROVAL QUEUE INTENTS (B2 extension)
    // approval_id pattern: AP-...  (e.g. AP-20260531-120000-ZB23-EMAIL)
    // ──────────────────────────────────────────────

    const apMatch = raw.match(/\bAP-[A-Za-z0-9-]+\b/i);
    const approvalId = apMatch ? apMatch[0] : null;

    // ──────────────────────────────────────────────
    // APPROVED EMAIL SEND INTENTS (C2.2 extension)
    // approval_id pattern: AP-...   send_job_id pattern: SJ-...
    // SAFETY: translate-only. Bot side is DRY-RUN only. No SMTP, no auto-send.
    // ──────────────────────────────────────────────

    const sjMatch = raw.match(/\bSJ-[A-Za-z0-9-]+\b/i);
    const sendJobId = sjMatch ? sjMatch[0] : null;

    // S1) SEND APPROVED DRY-RUN — requires AP-... AND explicit send/check/dry-run verb.
    // Checked BEFORE approve/reject/approval_status so bare "покажи AP-..." stays approval_status.
    if (approvalId && anyOf(t, [
        'проверь отправку', 'проверь письмо', 'проверь готовность',
        'dry-run отправки', 'dry-run', 'тест отправки',
    ])) {
        return ok('send_approved_dry_run',
            `/send_approved_dry_run ${approvalId}`,
            null,
            { approvalId });
    }

    // S2) SEND JOB STATUS — any phrase carrying SJ-... routes here.
    if (sendJobId) {
        return ok('send_job_status',
            `/send_job_status ${sendJobId}`,
            null,
            { sendJobId });
    }

    // S3) SEND JOBS LIST — no id needed. Before pending_approvals/lead intents.
    if (anyOf(t, [
        'задания отправки', 'send jobs', 'dry-run отправки',
        'очередь отправки', 'последние задания отправки',
    ])) {
        return ok('send_jobs', '/send_jobs');
    }

    // ──────────────────────────────────────────────
    // CONTACT ENRICHMENT INTENTS (C2.7d) — offline enrichment routing
    // Translate-only mapping to canonical /contact_enrich* slash commands that
    // drive the OFFLINE enrichment pipeline. No network, no send, no restart.
    //
    // Resolved EARLY (before the no-lead contact_registry branch) so that
    // enrichment_status wins over contact_registry ONLY when a lead id is
    // present, while bare "статус контактов" still routes to /contact_registry.
    // Channels / best_channel are also resolved here so "контактные каналы" /
    // "лучший контакт" win over the generic /contact_show (which matches the
    // bare word "контакт"). Each intent only returns when a lead is resolved;
    // otherwise it falls through to the existing routing unchanged.
    // ──────────────────────────────────────────────

    const enrichResolved = resolveLeadId(raw, workspace);

    // E1) ENRICH FROM TEXT/HTML (C2.7g) — requires an explicit "из текста"
    // marker AND trailing input AND an inline lead_id token. For
    // enrichment-from-text the lead_id does NOT need to exist in lead_resolver
    // — a brand-new lead may be seeded. The lead_id is the token immediately
    // before "из текста"; it is validated safely (latin/digits/_/-, length
    // 2–40) and uppercased. Without "из текста" + payload + valid lead we never
    // route here, so "проверь контакты ZB23" / "покажи контакты ZB23" stay
    // /contact_show ZB23. Empty text or invalid/too-short lead_id falls through.
    if (anyOf(t, [
            'обнови контакты', 'обогати контакты', 'извлеки контакты',
            'проверь контакты', 'найди контакты',
        ])) {
        const marker = raw.match(/из\s+текста/i);
        if (marker) {
            const payload = raw.slice(marker.index + marker[0].length).trim();
            const before = raw.slice(0, marker.index).trim();
            const beforeTokens = before.split(/\s+/).filter(Boolean);
            const leadToken = beforeTokens[beforeTokens.length - 1];
            const validLeadId = validateEnrichLeadId(leadToken);
            if (payload && validLeadId) {
                return ok('contact_enrich_text',
                    `/contact_enrich_text ${validLeadId} ${payload}`,
                    validLeadId,
                    { text: payload });
            }
        }
    }

    // E2) STRUCTURED CHANNELS — plural "каналы" phrasing + a resolved lead.
    // Checked before E3 (best channel uses singular "канал") and before the
    // generic /contact_show so "покажи контактные каналы ZB23" wins.
    if (enrichResolved.found && t.includes('каналы')) {
        return ok('contact_channels',
            `/contact_channels ${enrichResolved.leadId}`,
            enrichResolved.leadId,
            {});
    }

    // E3) BEST CHANNEL — "лучший канал" / "лучший контакт" / "куда писать" /
    // "как лучше связаться" + a resolved lead. Before /contact_show because
    // "лучший контакт" carries the bare word "контакт".
    if (enrichResolved.found && anyOf(t, [
        'какой лучший канал', 'лучший канал', 'лучший контакт',
        'куда писать', 'как лучше связаться',
    ])) {
        return ok('contact_best_channel',
            `/contact_best_channel ${enrichResolved.leadId}`,
            enrichResolved.leadId,
            {});
    }

    // E4) ENRICHMENT STATUS — "статус обогащения" / "статус enrichment" /
    // "когда обновлялись контакты" / "статус контактов <lead>" + a resolved
    // lead. Bare "статус контактов" (no lead) falls through to C6 below and
    // stays /contact_registry.
    if (enrichResolved.found && anyOf(t, [
        'статус обогащения', 'статус enrichment',
        'когда обновлялись контакты', 'статус контактов',
    ])) {
        return ok('contact_enrichment_status',
            `/contact_enrichment_status ${enrichResolved.leadId}`,
            enrichResolved.leadId,
            {});
    }

    // ──────────────────────────────────────────────
    // LEAD CONTACT INTENTS (C2.6b) — no-lead branch
    // Translate-only mapping to canonical /contact_* slash commands.
    // ──────────────────────────────────────────────

    // C6) CONTACT REGISTRY STATS — no lead_id needed.
    // Checked before lead intents so "статус контактов" never becomes lead_status.
    if (anyOf(t, [
        'реестр контактов', 'статус контактов', 'контактный реестр', 'сколько контактов',
    ])) {
        return ok('contact_registry', '/contact_registry');
    }


    // A2) PENDING APPROVALS — no lead_id / approval_id needed.

    // Checked before lead intents so "покажи подтверждения" never becomes lead_status.
    if (anyOf(t, [
        'что на подтверждении', 'покажи подтверждения', 'ожидающие подтверждения',
        'что ждет подтверждения', 'approval очередь', 'очередь approval',
        'очередь подтверждений',
    ])) {
        return ok('pending_approvals', '/pending_approvals');
    }

    // A3) APPROVE — requires approval_id (AP-...).
    // REJECT is checked first below to avoid "не одобряю" matching "одобряю".
    if (anyOf(t, ['отклоняю', 'reject', 'отклонить', 'не одобряю'])) {
        if (!approvalId) {
            return fail(
                'Не понял approval_id для отклонения. ' +
                'Пример: отклоняю AP-20260531-120000-ZB23-EMAIL неверный текст.',
            );
        }
        const after = raw.slice(apMatch.index + apMatch[0].length).trim();
        const reason = after || '(причина не указана)';
        return ok('reject',
            `/reject ${approvalId} ${reason}`,
            null,
            { approvalId, reason });
    }

    if (anyOf(t, ['подтверждаю', 'одобряю', 'approve', 'подтвердить'])) {
        if (!approvalId) {
            return fail(
                'Не понял approval_id для подтверждения. ' +
                'Пример: подтверждаю AP-20260531-120000-ZB23-EMAIL.',
            );
        }
        return ok('approve',
            `/approve ${approvalId}`,
            null,
            { approvalId });
    }

    // A5) APPROVAL STATUS — requires approval_id (AP-...).
    // Generic words ("покажи", "статус") only route here when an AP-... id is present,
    // so "покажи ZB23" / "статус ZB23" stay lead_status.
    if (approvalId && anyOf(t, [
        'статус подтверждения', 'что с', 'покажи', 'статус', 'открой', 'карточка',
    ])) {
        return ok('approval_status',
            `/approval_status ${approvalId}`,
            null,
            { approvalId });
    }

    // The remaining intents all require a lead_id. Resolve it once.

    const resolved = resolveLeadId(raw, workspace);
    const knownIds = resolved.knownIds || listKnownLeadIds(workspace);

    // Helper: require a lead, else clear error.
    const needLead = (intentName) => {
        if (!resolved.found) {
            return fail(
                `Не понял lead_id для «${intentName}». Пример: покажи ZB23. ` +
                `Известные лиды: ${knownIds.join(', ') || '(пусто)'}.`,
            );
        }
        return null;
    };

    // ──────────────────────────────────────────────
    // LEAD CONTACT INTENTS (C2.6b) — lead-based branch
    // Translate-only mapping to canonical /contact_* slash commands.
    // Checked BEFORE channel_hold / lead_status so contact phrases win.
    // ──────────────────────────────────────────────

    const emailMatch = raw.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    const email = emailMatch ? emailMatch[0] : null;
    const phoneMatch = raw.match(/\+?\d[\d\-\s()]{6,}\d/);
    const phone = phoneMatch ? phoneMatch[0].trim() : null;

    // C3) VERIFY EMAIL — email present AND a "подтверд/подтвержд" verb.
    // Checked BEFORE add-email so "email ... подтверждён" verifies, not adds.
    if (email && anyOf(t, ['подтверд', 'подтвержд'])) {
        const bad = needLead('подтвердить email'); if (bad) return bad;
        return ok('contact_verify_email',
            `/contact_verify_email ${resolved.leadId} ${email}`,
            resolved.leadId,
            { email });
    }

    // C2) ADD EMAIL — email present AND an email keyword (email/почт/mail).
    if (email && anyOf(t, ['email', 'e-mail', 'почт', 'mail'])) {
        const bad = needLead('добавить email'); if (bad) return bad;
        return ok('contact_add_email',
            `/contact_add_email ${resolved.leadId} ${email}`,
            resolved.leadId,
            { email });
    }

    // C4) ADD PHONE — phone present AND a phone keyword.
    if (phone && anyOf(t, ['телефон', 'тел.', 'phone', 'номер'])) {
        const bad = needLead('добавить телефон'); if (bad) return bad;
        return ok('contact_add_phone',
            `/contact_add_phone ${resolved.leadId} ${phone}`,
            resolved.leadId,
            { phone });
    }

    // C5) HOLD WHATSAPP — whatsapp keyword AND a not-found / hold marker.
    // Checked BEFORE the legacy channel_hold intent so it wins for contacts.
    if (anyOf(t, ['ватсап', 'whatsapp', 'вотсап', 'вацап']) &&
        anyOf(t, ['не найден', 'не подтвержден', 'проверить позже', 'hold', 'холд', 'отсутствует'])) {
        const bad = needLead('whatsapp hold (contact)'); if (bad) return bad;
        const after = extractNoteAfterLead(raw, resolved.leadId);
        // NOTE: JS \b word boundaries do not work with Cyrillic, so we strip
        // the known hold-markers without \b anchors.
        const stripped = norm(after)
            .replace(/(не найден[ао]?|не подтвержден[ао]?|проверить позже|отсутствует|hold|холд|not found)/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        const reason = stripped || 'not_found';

        return ok('contact_hold_whatsapp',
            `/contact_hold_whatsapp ${resolved.leadId} ${reason}`,
            resolved.leadId,
            { reason });
    }

    // C1) SHOW CONTACTS — any phrase carrying the word "контакт" + a lead.
    if (t.includes('контакт')) {
        const bad = needLead('показать контакты'); if (bad) return bad;
        return ok('contact_show',
            `/contact_show ${resolved.leadId}`,
            resolved.leadId,
            {});
    }

    // A1) PREPARE SEND (approval) — create a pending approval for an email follow-up.

    // Checked BEFORE draft_followup / log_email_sent because some phrases share
    // the words "подготовь" / "письмо" (e.g. "подготовь письмо на подтверждение").
    if (
        anyOf(t, ['подготовь отправку', 'на отправку']) ||
        anyOf(t, ['заявку на письмо', 'заявка на письмо']) ||
        anyOf(t, ['создай подтверждение', 'подтверждение письма']) ||
        anyOf(t, ['письмо на подтверждение'])
    ) {
        const bad = needLead('подготовить отправку письма'); if (bad) return bad;
        return ok('prepare_send',
            `/prepare_send ${resolved.leadId} email followup`,
            resolved.leadId,
            { channel: 'email', action: 'followup' });
    }

    // 5) LOG EMAIL SENT  (check before DRAFT because both mention "письмо")

    if (anyOf(t, [
        'залогируй письмо', 'я отправил письмо', 'отправлено', 'отправлен', 'ушло',
    ]) && anyOf(t, ['письмо', 'email'])) {
        const bad = needLead('залогировать письмо'); if (bad) return bad;
        return ok('log_email_sent',
            `/log_touch ${resolved.leadId} email followup_sent`,
            resolved.leadId,
            { channel: 'email', action: 'followup_sent' });
    }

    // 4) DRAFT FOLLOWUP
    if (anyOf(t, [
        'подготовь письмо', 'сделай follow-up', 'сделай followup',
        'подготовь followup', 'подготовь follow-up',
        'черновик письма', 'напиши письмо',
    ])) {
        const bad = needLead('подготовить письмо'); if (bad) return bad;
        return ok('draft_followup',
            `/draft_followup ${resolved.leadId} email`,
            resolved.leadId,
            { channel: 'email' });
    }

    // 6) CHANNEL HOLD (whatsapp)
    if (anyOf(t, ['ватсап', 'whatsapp', 'вотсап', 'вацап']) &&
        anyOf(t, ['не найден', 'не подтвержден', 'проверить позже', 'hold', 'холд'])) {
        const bad = needLead('канал WhatsApp hold'); if (bad) return bad;
        return ok('channel_hold',
            `/channel_hold ${resolved.leadId} whatsapp unverified`,
            resolved.leadId,
            { channel: 'whatsapp', reason: 'unverified' });
    }

    // 7) SET NEXT CALL
    if (anyOf(t, ['поставь звонок', 'позвонить', 'следующий шаг', 'поставь следующий шаг']) ||
        (t.includes('звонок') && anyOf(t, ['поставь', 'следующий']))) {
        const bad = needLead('поставить звонок'); if (bad) return bad;
        return ok('set_next',
            `/set_next ${resolved.leadId} call_next_business_day_1030`,
            resolved.leadId,
            { next_action: 'call_next_business_day_1030' });
    }

    // 8) LEAD NOTE
    if (anyOf(t, ['добавь заметку', 'запиши по', 'заметка'])) {
        const bad = needLead('добавить заметку'); if (bad) return bad;
        const note = extractNoteAfterLead(raw, resolved.leadId);
        if (!note) {
            return fail(
                `Не понял текст заметки. Пример: добавь заметку ${resolved.leadId} клиент ответил позже.`,
            );
        }
        return ok('lead_note',
            `/lead_note ${resolved.leadId} ${note}`,
            resolved.leadId,
            { note });
    }

    // 3) LEAD STATUS
    if (anyOf(t, ['покажи', 'что по', 'статус', 'карточка', 'открой'])) {
        const bad = needLead('статус лида'); if (bad) return bad;
        return ok('lead_status',
            `/lead_status ${resolved.leadId}`,
            resolved.leadId,
            {});
    }

    // Nothing matched. If we DID resolve a lead but no verb, hint lead_status.
    if (resolved.found) {
        return fail(
            `Понял lead_id ${resolved.leadId}, но не понял действие. ` +
            `Примеры: покажи ${resolved.leadId} · подготовь письмо ${resolved.leadId} · ` +
            `поставь звонок ${resolved.leadId} завтра 10:30.`,
        );
    }

    return fail(
        'Не понял команду. Напишите «помощь», чтобы увидеть список команд.',
    );
}

export default { parseRussianIntent };
