// views.mjs — PURE formatters (API DTO → Telegram message) + owner authorization.
// No fs, no network, no business truth. A non-ok API result always renders a safe error.
// Renderers may return a plain string OR { text, extra } where extra carries reply_markup.

// Owner allowlist check — unauthorized users get no business data.
export function isOwner(userId, allowlist) {
    if (!userId || !Array.isArray(allowlist) || allowlist.length === 0) return false;
    return allowlist.map(String).includes(String(userId));
}

// ---------------------------------------------------------------------------
// Russian labels for internal pipeline/lead status keys. Owner never sees raw keys.
// Unknown key -> safe generic label (never the raw English key, never a JS object).
// ---------------------------------------------------------------------------
export const STATUS_LABELS_RU = {
    rejected: 'Отклонены',
    needs_identity_verification: 'Нужна проверка компании',
    hold_no_public_email: 'Не найден публичный email',
    written_channel_search_queue: 'Требуется поиск другого канала',
    hold_later: 'Отложены',
    waiting_reply: 'Ожидают ответа',
    send_uncertain: 'Результат отправки требует проверки',
    verified_ready: 'Готовы к отправке',
    draft_ready: 'Черновик готов',
    drafting: 'Готовится черновик',
    audit_ready: 'Готовы к аудиту',
    auditing: 'Идёт аудит',
    new: 'Новые',
    contacted: 'Контакт установлен',
    interested: 'Проявлен интерес',
    won: 'Сделка выиграна',
    lost: 'Сделка проиграна',
    closed: 'Закрыты',
};
export function statusLabelRu(key) {
    if (key == null) return 'Другой рабочий статус';
    return STATUS_LABELS_RU[String(key)] || 'Другой рабочий статус';
}

// ---------------------------------------------------------------------------
// Single-lead status localization (Phase 3). Distinct from STATUS_LABELS_RU,
// which uses plural bucket wording ("Ожидают ответа"). On a lead card we want
// singular owner-facing wording ("ожидает ответа"). Unknown -> safe generic.
// ---------------------------------------------------------------------------
export const LEAD_STATUS_RU = {
    waiting_reply: 'ожидает ответа',
    ready_to_send: 'готов к отправке',
    verified_ready: 'проверен и готов к обработке',
    followup_due: 'требуется follow-up',
    send_uncertain: 'результат отправки требует проверки',
    needs_identity_verification: 'нужна проверка компании',
    hold_no_public_email: 'не найден публичный email',
    written_channel_search_queue: 'требуется поиск другого канала',
    hold_later: 'отложен',
    rejected: 'отклонён',
    approval_pending: 'ожидает подтверждения',
    audit_ready: 'аудит готов',
};
export function renderLeadStatusRu(status) {
    if (status == null) return 'другой рабочий статус';
    return LEAD_STATUS_RU[String(status)] || 'другой рабочий статус';
}

// Route / next-action-hint localization (Phase 4 values). The backend
// `nextActionHint` is either 'send' or an internal eligibility category.
const LEAD_ROUTE_RU = {
    send: 'готов к отправке',
    ready_send: 'готов к отправке',
    waiting_reply: 'ожидание ответа',
    send_uncertain: 'проверка результата отправки',
    needs_email: 'поиск email',
    needs_audit: 'подготовка аудита',
    blocked: 'заблокирован',
    review: 'ручная проверка',
    none: 'отсутствуют',
    unknown: 'нет данных',
};
export function renderLeadRouteRu(route) {
    if (route == null || route === '') return null;
    return LEAD_ROUTE_RU[String(route)] || 'нет данных';
}

// ---------------------------------------------------------------------------
// Centralized Russian Next-Action reason renderer. Raw English reason never reaches owner.
// ---------------------------------------------------------------------------
const FOLLOWUP_DUE_RU = 'Доставка письма подтверждена. Прошло более 48 часов — пора проверить ответ и подготовить follow-up.';
const REASON_RU = {
    // --- canonical reason_code allowlist (Phase 2 spec) ---
    followup_due_delivery_confirmed_48h: FOLLOWUP_DUE_RU,
    waiting_for_reply: 'Письмо отправлено, ответа пока нет. Ожидаем реакцию адресата.',
    reply_requires_response: 'Получен ответ — требуется ваша реакция и подготовка ответа.',
    interested_reply: 'Получен заинтересованный ответ — подготовьте следующий шаг.',
    unmatched_reply: 'Получен ответ, который не удалось сопоставить с лидом — нужна ручная проверка.',
    audit_needs_review: 'Аудит готов к проверке перед подготовкой письма.',
    audit_evidence_insufficient: 'Недостаточно доказательств для аудита — нужно собрать больше данных.',
    draft_awaiting_approval: 'Черновик письма готов и ждёт вашего утверждения (отправка остаётся заблокированной).',
    draft_blocked: 'Черновик заблокирован — устраните причину перед утверждением.',
    send_uncertain: 'Результат предыдущей отправки неясен — требуется проверка перед повтором.',
    identity_verification_required: 'Нужно подтвердить личность/компанию лида.',
    no_public_email: 'Публичный email не найден — требуется поиск другого канала.',
    channel_search_required: 'Идёт поиск подходящего канала связи.',
    product_routing_review: 'Нужно выбрать подходящий продукт для лида.',
    dead_letter_review: 'Задача попала в dead-letter — требуется ручной разбор.',
    scheduler_paused: 'Планировщик приостановлен — действий по расписанию нет.',
    manual_review: 'Требуется ручная проверка перед следующим шагом.',
    no_available_action: 'Приоритетных действий сейчас нет.',
    // --- legacy reason_code aliases (kept for backward compatibility) ---
    followup_due: FOLLOWUP_DUE_RU,
    waiting_reply: 'Письмо отправлено, ответа пока нет. Ожидаем реакцию адресата.',
    audit_review: 'Аудит готов к проверке перед подготовкой письма.',
    insufficient_audit_evidence: 'Недостаточно доказательств для аудита — нужно собрать больше данных.',
    draft_approval: 'Черновик письма готов и ждёт вашего утверждения (отправка остаётся заблокированной).',
    blocked_draft: 'Черновик заблокирован — устраните причину перед утверждением.',
    uncertain_send: 'Результат предыдущей отправки неясен — требуется проверка перед повтором.',
    identity_verification: 'Нужно подтвердить личность/компанию лида.',
    channel_search: 'Идёт поиск подходящего канала связи.',
    product_routing: 'Нужно выбрать подходящий продукт для лида.',
    dead_letter: 'Задача попала в dead-letter — требуется ручной разбор.',
    review: 'Требуется проверка перед следующим шагом.',
};

// Stable next-action "kind" enum produced by the backend operator-mode
// (getMiniAuditOperatorState → nextAction.kind). This is the authoritative
// structured field for the live API DTO ({ kind, reason, lead }); the free-text
// `reason` is raw English and must NEVER reach the owner.
const KIND_RU = {
    followup: FOLLOWUP_DUE_RU,
    ready_send: 'Лид готов к отправке: письмо и аудит подготовлены, отправка ожидает подтверждения.',
    prepare_email: 'Аудит готов, но письмо ещё не подготовлено — нужно собрать черновик.',
    repair_preview: 'Не хватает превью аудита — требуется восстановить материалы перед письмом.',
    verify_email: 'Рабочий email не найден — требуется проверка контакта лида.',
    verify_proof: 'Результат предыдущей отправки не подтверждён — нужно проверить доставку.',
    none: 'Приоритетных действий сейчас нет.',
};
function reasonKey(s) { return (s == null ? '' : String(s)).trim().toLowerCase().replace(/[\s-]+/g, '_'); }
export function renderNextActionReason(action) {
    const a = action || {};
    // 1) stable reason_code / action_type (explicit codes win).
    const code = reasonKey(a.reasonCode || a.action || a.code || a.reason_key);
    if (code && REASON_RU[code]) return REASON_RU[code];
    // 2) stable structured `kind` enum from the live next-action DTO.
    const kind = reasonKey(a.kind);
    if (kind && KIND_RU[kind]) return KIND_RU[kind];
    // 3) exact allowlisted legacy reason text (NO fuzzy parsing of free text).
    const rk = reasonKey(a.reason);
    if (rk && REASON_RU[rk]) return REASON_RU[rk];
    // 4) safe fallback (never a raw English reason, never undefined).
    return 'Требуется проверить следующее действие.';
}

// Render any failed API result safely (never success wording).
export function renderError(res) {
    const map = {
        CREDENTIAL_INVALID: '🔒 Доступ к API отклонён (credential).',
        SCOPE_DENIED: '🔒 Недостаточно прав.',
        UNAUTHORIZED: '🔒 Требуется подключение устройства.',
        NOT_FOUND: '❔ Лид не найден или уже изменён. Обновите список.',
        REVISION_CONFLICT: '⚠️ Данные изменились. Обновите и повторите.',
        MAINTENANCE_LOCKED: '🛠 Бэкенд в обслуживании.',
        RATE_LIMITED: '⏳ Слишком часто, попробуйте позже.',
        BACKEND_UNAVAILABLE: '🔌 Сервер временно недоступен. Повторите позже.',
        TIMEOUT: '⌛ Таймаут запроса к API.',
        NETWORK_UNAVAILABLE: '🔌 Нет связи с API.',
        MALFORMED_RESPONSE: '⚠️ Некорректный ответ API.',
        VALIDATION_ERROR: '⚠️ Запрос отклонён валидацией.',
    };
    return map[res.code] || `⚠️ Ошибка API (${res.code || res.status || 'unknown'}).`;
}

export function renderPing(health) {
    const d = health.data || {};
    return `🤖 Master Controller (API-only)\nAPI: ${d.status || '?'} · ${d.displayName || ''}\nАвтоотправка: заблокирована`;
}

// Human-readable health. NO raw status keys; pipeline rendered with Russian labels.
export function renderHealth(status) {
    const d = status.data || {};
    const q = d.queue || {}; const p = d.pipeline || {};
    const completed = q.COMPLETED ?? q.completed ?? 0;
    const lines = [
        '🩺 Состояние системы',
        '',
        `Канонический writer: ${d.canonicalWriter ? 'работает' : 'нет'}`,
        `Автоотправка: ${/block/i.test(d.autosend || 'BLOCKED') ? 'заблокирована' : (d.autosend || 'заблокирована')}`,
        `Живая отправка: ${d.sendAllowedLive ? 'включена' : 'выключена'}`,
        `Очередь задач: выполнено ${completed}`,
        `Ошибок в dead-letter: ${d.deadLetter ?? 0}`,
        `Ревизия хранилища: ${d.storeRevision ?? '—'}`,
    ];
    const pKeys = Object.keys(p);
    if (pKeys.length) {
        lines.push('', 'Лиды по рабочим состояниям:');
        for (const k of pKeys) lines.push(`• ${statusLabelRu(k)}: ${p[k]}`);
    }
    return lines.join('\n');
}

export function renderToday(status) {
    const d = status.data || {};
    const total = d.total ?? 0;
    return [
        '📅 Сегодня',
        `Готовы к отправке: ${d.readySend ?? 0}`,
        `Ожидают ответа: ${d.waitingReply ?? 0}`,
        `Follow-up к отправке: ${d.followupDue ?? 0}`,
        `Неопределённые отправки: ${d.sendUncertain ?? 0}`,
        `Активных лидов в работе: ${total}`,
        `(оперативный счётчик рабочих лидов; полная база может быть больше — это лиды в активных стадиях)`,
        'Автоотправка заблокирована.',
    ].join('\n');
}

// Owner-facing lead card. Russian labels only; NO raw internal keys, NO raw
// enums, NO null/undefined/"—" placeholders. Technical fields (scores,
// revision) are shown ONLY when they carry a real value; otherwise the whole
// line is omitted. Route is hidden when it merely duplicates the status.
export function renderLeadCard(lead) {
    const d = lead.data || {};
    const has = (v) => v !== null && v !== undefined && v !== '' &&
        !(typeof v === 'string' && /^(null|undefined|—|none|unknown)$/i.test(v.trim()));

    const lines = [`🏢 ${d.company || d.leadId || 'Лид'}`, ''];
    if (has(d.leadId)) lines.push(`ID: ${d.leadId}`);
    if (has(d.status)) lines.push(`Статус: ${renderLeadStatusRu(d.status)}`);

    // Route: localize the hint; hide when it resolves to the same meaning as status.
    const routeRu = renderLeadRouteRu(d.nextActionHint);
    const statusRu = has(d.status) ? renderLeadStatusRu(d.status) : null;
    if (routeRu && routeRu !== statusRu) lines.push(`Маршрут: ${routeRu}`);

    // Contact block (only real values).
    const contact = [];
    if (has(d.website)) contact.push(`Сайт: ${d.website}`);
    if (has(d.email)) contact.push(`Email: ${d.email}`);
    if (contact.length) { lines.push(''); lines.push(...contact); }

    // Blockers: empty/none -> "отсутствуют" (never raw enum, never "—").
    const blockers = Array.isArray(d.blockingReasons) ? d.blockingReasons
        : (Array.isArray(d.blockers) ? d.blockers : []);
    const realBlockers = blockers.filter((b) => has(b) && b !== 'ALREADY_WAITING_REPLY');
    lines.push(`Блокеры: ${realBlockers.length ? realBlockers.join(', ') : 'отсутствуют'}`);

    // Scores / revision: shown ONLY when a real numeric/non-empty value exists.
    const tech = [];
    if (has(d.candidate_score)) tech.push(`Предварительная оценка: ${d.candidate_score}`);
    if (has(d.score)) tech.push(`Каноническая оценка: ${d.score}`);
    if (has(d.revision)) tech.push(`Ревизия: ${d.revision}`);
    if (tech.length) { lines.push(''); lines.push(...tech); }

    return lines.join('\n');
}

export function renderAutomation(status) {
    const d = status.data || {};
    const q = d.queue || {};
    const completed = q.COMPLETED ?? q.completed ?? 0;
    return [
        '⚙️ Автоматизация',
        `Планировщик: ${d.canonicalWriter ? 'включён' : '—'} · Автоотправка: ${/block/i.test(d.autosend || 'BLOCKED') ? 'заблокирована' : (d.autosend || 'заблокирована')}`,
        `Очередь задач: выполнено ${completed}`,
        `Dead-letter: ${d.deadLetter ?? 0}`,
        'Живая отправка: выключена',
    ].join('\n');
}

// Inline keyboard helper for "open lead" — real Telegram inline button, callback by canonical id.
export function openLeadKeyboard(id) {
    return { reply_markup: { inline_keyboard: [[{ text: '📂 Открыть лид', callback_data: `lead:${id}` }]] } };
}

// Next action — REAL inline button + Russian reason + secondary command fallback.
// Returns { text, extra } so the caller attaches reply_markup.
export function renderNextAction(res) {
    if (!res.ok) return renderError(res);
    const a = res.data || {};
    const lead = a.lead || {};
    const id = lead.leadId || lead.lead_id || null;
    const lines = ['🎯 Следующее действие', renderNextActionReason(a)];
    if (id) {
        lines.push('', `Лид: ${lead.company || id}`, `lead_id: ${id}`, `Команда: /lead ${id}`);
        return { text: lines.join('\n'), extra: openLeadKeyboard(id) };
    }
    return lines.join('\n');
}

// Approval result — NEVER claims delivery; reflects no-send gate.
export function renderApprovalResult(res) {
    if (!res.ok) return renderError(res);
    const d = res.data || {};
    if (d.sent === false || d.code === 'SEND_BLOCKED' || d.code === 'MATER_DRY_RUN' || d.result?.code === 'MATER_DRY_RUN') {
        return '✅ Approval зафиксирован. Отправка ЗАБЛОКИРОВАНА (SEND_ALLOWED_LIVE=OFF). Письмо НЕ отправлено.';
    }
    return '✅ Действие выполнено. Отправка остаётся заблокированной — письмо не отправлено.';
}

// Lead selector — real inline "open" buttons per lead + explicit filter label.
// Returns { text, extra }. When empty, offers other queues instead of a dead end.
export function renderLeadSelector(listRes, opts = {}) {
    if (!listRes.ok) return renderError(listRes);
    const items = listRes.data?.items || [];
    const filterKey = opts.statusFilter || listRes.data?.status || 'verified_ready';
    const filterLabel = statusLabelRu(filterKey);
    if (!items.length) {
        return {
            text: `Лидов со статусом «${filterLabel}» нет. Откройте другую очередь:`,
            extra: { reply_markup: { inline_keyboard: [
                [{ text: '📋 Активные лиды', callback_data: 'leads:active' }],
                [{ text: '📅 Обзор «Сегодня»', callback_data: 'cmd:today' }],
            ] } },
        };
    }
    const lines = [`📋 Показаны лиды со статусом: «${filterLabel}»`, 'Нажмите кнопку, чтобы открыть:'];
    const kb = [];
    for (const l of items.slice(0, 10)) {
        const id = l.lead_id || l.leadId; const co = l.company || id;
        lines.push(`• ${co} — ${statusLabelRu(l.status || filterKey)} — ${id}`);
        kb.push([{ text: `📂 ${co}`.slice(0, 60), callback_data: `lead:${id}` }]);
    }
    if (items.length > 10) kb.push([{ text: '➡️ Следующая страница', callback_data: 'leads:next' }]);
    return { text: lines.join('\n'), extra: { reply_markup: { inline_keyboard: kb } } };
}

// Main menu — every entry maps to a routed command.
export const MENU_TEXT = [
    '🏠 Меню Master Controller',
    '📊 Сегодня — /today',
    '🎯 Следующее действие — /next',
    '⚙️ Автоматизация — /automation',
    '🩺 Состояние — /health',
    '📋 Лиды — /leads',
    'ℹ️ Помощь — /help',
    '',
    'Отправка ЗАБЛОКИРОВАНА.',
].join('\n');
