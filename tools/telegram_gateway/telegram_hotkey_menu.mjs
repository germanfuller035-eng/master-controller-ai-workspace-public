// telegram_hotkey_menu.mjs
// ============================================================
// T1 — Telegram Hotkey Menu (SAFE, READ-ONLY)
// ------------------------------------------------------------
// Purpose:
//   Provide a convenient reply-keyboard menu + safe hints for Dmitry,
//   so that future system control happens via Telegram instead of
//   manual PowerShell commands.
//
// SAFETY CONTRACT (T1):
//   - This module ONLY produces text + a reply keyboard layout.
//   - It NEVER sends Telegram messages itself (no Telegram API calls).
//   - It NEVER runs PowerShell / shell commands.
//   - It NEVER writes to the approval queue.
//   - It NEVER reads tokens / credentials.
//   - It NEVER triggers lead import, real import, autosend or client contact.
//   - It does NOT unfreeze the D3C freeze.
//   - It is a pure function layer: input text -> { handled, text, reply_markup }.
//
// On T2, real buttons (health/today/проверка) will be wired up under
// controlled change. T1 is intentionally hint-only.
// ============================================================

// ---- Hotkey button labels (exact, including emoji) ----
export const HOTKEY_LABELS = {
    MENU:       '🏠 Меню',
    HEALTH:     '🩺 Health',
    CHECK:      '🧪 Проверка',
    MINI_AUDIT: '💰 Mini Audit',
    QUEUE:      '📋 Очередь',
    FREEZE:     '🧊 Freeze',
    TODAY:      '📊 Сегодня',
    HELP:       '❓ Help',
};

// All 8 hotkey labels as a flat list (for tests / validation).
export const HOTKEY_LABEL_LIST = Object.values(HOTKEY_LABELS);

// Text commands that open the main menu.
const MENU_COMMANDS = new Set(['/menu', 'меню', 'главное меню']);
// Help commands.
const HELP_COMMANDS = new Set(['/help']);

// ---- Reply keyboard layout (4 rows x 2 buttons) ----
export function buildMenuKeyboard() {
    return {
        keyboard: [
            [{ text: HOTKEY_LABELS.MENU },       { text: HOTKEY_LABELS.HEALTH }],
            [{ text: HOTKEY_LABELS.CHECK },      { text: HOTKEY_LABELS.MINI_AUDIT }],
            [{ text: HOTKEY_LABELS.QUEUE },      { text: HOTKEY_LABELS.FREEZE }],
            [{ text: HOTKEY_LABELS.TODAY },      { text: HOTKEY_LABELS.HELP }],
        ],
        resize_keyboard: true,
        is_persistent: true,
    };
}

// ---- Static safe response texts ----

const MAIN_MENU_TEXT = [
    '🏠 *Главное меню — Telegram Master Controller*',
    '',
    'Управление системой ведётся через Telegram (T1: меню и безопасные подсказки).',
    '',
    'Кнопки:',
    '🏠 Меню — это меню',
    '🩺 Health — статус системы (команда /health)',
    '🧪 Проверка — как запустить regression',
    '💰 Mini Audit — режим и правила отправки',
    '📋 Очередь — статус approval queue',
    '🧊 Freeze — статус заморозки lead import',
    '📊 Сегодня — сводка дня (команда /today)',
    '❓ Help — список безопасных команд',
    '',
    'Опасные действия (отправка, импорт, очередь) требуют отдельного approval Дмитрия.',
].join('\n');

const HELP_TEXT = [
    '❓ *Help — безопасные команды*',
    '',
    'Безопасные команды (read-only / статус):',
    '• /menu — открыть меню',
    '• /help — эта справка',
    '• /health — статус системы',
    '• /today — сводка дня',
    '• /ping — проверка связи',
    '',
    '⚠️ Опасные действия требуют approval Дмитрия:',
    '• отправка клиентам (autosend) — заблокировано',
    '• реальный импорт лидов — заблокировано',
    '• запись в approval queue — заблокировано',
    '• commit / lead_import_prepare write — заблокировано',
    '',
    'T1 — только меню и подсказки. Ничего не отправляется и не пишется.',
].join('\n');

const HEALTH_HINT_TEXT =
    'Health доступен командой /health. На T2 будет подключена кнопка health.';

const TODAY_HINT_TEXT =
    'Сегодня доступно командой /today. На T2 будет подключена кнопка today.';

const CHECK_HINT_TEXT = [
    '🧪 *Проверка (regression)*',
    '',
    'Проверка через Telegram будет включена на T2. Сейчас безопасная команда на ПК:',
    'powershell -NoProfile -ExecutionPolicy Bypass -File .\\tools\\telegram_gateway\\regression_telegram_gateway.ps1 run',
].join('\n');

const MINI_AUDIT_TEXT = [
    '💰 *Mini Audit — режим*',
    '',
    '• режим: Telegram-controlled only',
    '• ручная отправка запрещена',
    '• autosend blocked',
    '• lead import frozen',
    '',
    'Следующий шаг после T1/T2: Mini Audit Draft Cockpit → Preview → Approval → Send через бота.',
].join('\n');

const QUEUE_TEXT = [
    '📋 *Очередь (approval queue)*',
    '',
    '• approval queue: read-only in T1',
    '• queue write blocked',
    '• commit blocked unless separate Dmitry approval',
].join('\n');

const FREEZE_TEXT = [
    '🧊 *Freeze status*',
    '',
    '• D3C freeze ACTIVE',
    '• /lead_import_prepare frozen',
    '• queue write blocked',
    '• real import blocked',
    '• client contact blocked',
    '• autosend blocked',
].join('\n');

// ---- Core dispatcher ----
// Returns null if `text` is NOT a menu/hotkey trigger (so the bot
// continues normal routing). Otherwise returns:
//   { handled: true, text: <string>, reply_markup?: <keyboard> }
//
// Pure function: no side effects, no I/O.
export function handleHotkeyMenu(rawText) {
    if (typeof rawText !== 'string') return null;
    const text = rawText.trim();
    if (!text) return null;
    const lower = text.toLowerCase();

    // ---- Menu open commands (show keyboard) ----
    if (MENU_COMMANDS.has(lower) || text === HOTKEY_LABELS.MENU) {
        return { handled: true, text: MAIN_MENU_TEXT, reply_markup: buildMenuKeyboard() };
    }

    // ---- Help ----
    if (HELP_COMMANDS.has(lower) || text === HOTKEY_LABELS.HELP) {
        return { handled: true, text: HELP_TEXT };
    }

    // ---- Hotkey labels (exact match) ----
    switch (text) {
        case HOTKEY_LABELS.HEALTH:
            return { handled: true, text: HEALTH_HINT_TEXT };
        case HOTKEY_LABELS.TODAY:
            return { handled: true, text: TODAY_HINT_TEXT };
        case HOTKEY_LABELS.CHECK:
            return { handled: true, text: CHECK_HINT_TEXT };
        case HOTKEY_LABELS.MINI_AUDIT:
            return { handled: true, text: MINI_AUDIT_TEXT };
        case HOTKEY_LABELS.QUEUE:
            return { handled: true, text: QUEUE_TEXT };
        case HOTKEY_LABELS.FREEZE:
            return { handled: true, text: FREEZE_TEXT };
        default:
            return null;
    }
}

// Convenience predicate (does this text belong to the menu layer?).
export function isMenuTrigger(rawText) {
    return handleHotkeyMenu(rawText) !== null;
}

export default { handleHotkeyMenu, isMenuTrigger, buildMenuKeyboard, HOTKEY_LABELS, HOTKEY_LABEL_LIST };
