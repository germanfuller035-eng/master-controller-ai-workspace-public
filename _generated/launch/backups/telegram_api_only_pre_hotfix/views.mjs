// views.mjs — PURE formatters (API DTO → Telegram message text) + owner authorization.
// No fs, no network, no business truth. A non-ok API result always renders a safe error,
// never a success-looking message.

// Owner allowlist check — unauthorized users get no business data.
export function isOwner(userId, allowlist) {
    if (!userId || !Array.isArray(allowlist) || allowlist.length === 0) return false;
    return allowlist.map(String).includes(String(userId));
}

// Render any failed API result safely (never success wording).
export function renderError(res) {
    const map = {
        CREDENTIAL_INVALID: '🔒 Доступ к API отклонён (credential).',
        SCOPE_DENIED: '🔒 Недостаточно прав.',
        NOT_FOUND: '❔ Объект больше не существует.',
        REVISION_CONFLICT: '⚠️ Данные изменились. Обновите и повторите.',
        MAINTENANCE_LOCKED: '🛠 Бэкенд в обслуживании.',
        RATE_LIMITED: '⏳ Слишком часто, попробуйте позже.',
        BACKEND_UNAVAILABLE: '🔌 Бэкенд недоступен.',
        TIMEOUT: '⌛ Таймаут запроса к API.',
        NETWORK_UNAVAILABLE: '🔌 Нет связи с API.',
        MALFORMED_RESPONSE: '⚠️ Некорректный ответ API.',
        VALIDATION_ERROR: '⚠️ Запрос отклонён валидацией.',
    };
    return map[res.code] || `⚠️ Ошибка API (${res.code || res.status || 'unknown'}).`;
}

export function renderPing(health) {
    const d = health.data || {};
    return `🤖 Master Controller (API-only)\nAPI: ${d.status || '?'} · ${d.displayName || ''}\nAutosend: BLOCKED`;
}
export function renderHealth(status) {
    const d = status.data || {};
    const q = d.queue || {}; const p = d.pipeline || {};
    const qline = Object.keys(q).length ? Object.entries(q).map(([k, v]) => `${k}:${v}`).join(', ') : 'пусто';
    const pline = Object.keys(p).length ? Object.entries(p).map(([k, v]) => `${k}:${v}`).join(', ') : 'пусто';
    return [
        '🩺 Состояние системы',
        `Канонический writer: ${d.canonicalWriter ? 'да' : 'нет'}`,
        `Автоотправка: ${d.autosend || 'BLOCKED'}`,
        `Живая отправка: ${d.sendAllowedLive ? 'ВКЛ' : 'ВЫКЛ'}`,
        `Очередь задач: ${qline}`,
        `Пайплайн лидов: ${pline}`,
        `Dead-letter: ${d.deadLetter ?? 0}`,
        `Ревизия хранилища: ${d.storeRevision ?? '—'}`,
    ].join('\n');
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
export function renderLeadCard(lead) {
    const d = lead.data || {};
    return [
        `🏢 ${d.company || d.leadId}`,
        `lead_id: ${d.leadId || '—'}`,
        `статус: ${d.status || '—'} · маршрут: ${d.nextActionHint || '—'}`,
        `candidate_score_v2: ${d.candidate_score ?? '—'} · canonical_score_v1: ${d.score ?? '—'}`,
        `сайт: ${d.website || '—'} (${d.website_status || d.websiteTier || '—'})`,
        `email: ${d.email || '—'} (${d.email_status || '—'})`,
        `revision: ${d.revision ?? '—'}`,
    ].join('\n');
}
export function renderAutomation(status) {
    const d = status.data || {};
    const q = d.queue || {}; const p = d.pipeline || {};
    return [
        '⚙️ Автоматизация',
        `Планировщик: ${d.canonicalWriter ? 'включён' : '—'} · Автоотправка: ${d.autosend || 'BLOCKED'}`,
        `Очередь: ${Object.entries(q).map(([k, v]) => `${k}:${v}`).join(', ') || 'пусто'}`,
        `Пайплайн: ${Object.entries(p).map(([k, v]) => `${k}:${v}`).join(', ') || 'пусто'}`,
        `Dead-letter: ${d.deadLetter ?? 0}`,
        'Живая отправка: ВЫКЛ',
    ].join('\n');
}
// Next action — includes canonical lead id + an "open" hint when a lead is present.
export function renderNextAction(res) {
    if (!res.ok) return renderError(res);
    const a = res.data || {};
    const lead = a.lead || {};
    const id = lead.leadId || lead.lead_id || null;
    const lines = [`🎯 Следующее действие`, a.reason || 'Нет приоритетных действий.'];
    if (id) {
        lines.push(`Лид: ${lead.company || id}`, `lead_id: ${id}`, `Открыть лид: /lead ${id}`);
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
    // even on ok, we never assert "delivered" while live send is off
    return '✅ Действие выполнено. Отправка остаётся заблокированной — письмо не отправлено.';
}

// Lead selector — when /lead has no id, show recent leads as tappable /lead <id> lines.
export function renderLeadSelector(listRes) {
    if (!listRes.ok) return renderError(listRes);
    const items = listRes.data?.items || [];
    if (!items.length) return 'Лидов в этом статусе нет. Используйте /today для обзора.';
    const lines = ['📋 Выберите лид (отправьте команду):', ''];
    for (const l of items.slice(0, 10)) {
        const id = l.lead_id || l.leadId; const co = l.company || id;
        lines.push(`• ${co} — /lead ${id}`);
    }
    return lines.join('\n');
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
