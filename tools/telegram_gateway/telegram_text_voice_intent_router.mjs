// telegram_text_voice_intent_router.mjs
// ============================================================
// T1B — Telegram Text / Voice Intent Router (SAFE, READ-ONLY)
// ------------------------------------------------------------
// Purpose:
//   Give the Telegram Master Controller a *basic* understanding of free-form
//   text commands (and already-transcribed voice commands treated as text),
//   so Dmitry can speak/type natural phrases instead of only slash-commands
//   and hotkey buttons.
//
// SCOPE CONTRACT (T1B):
//   - T1B does NOT add any audio transcription engine.
//   - Voice is handled ONLY if an existing layer already produced text.
//   - This module is a PURE function layer: input text -> { handled, intent, text }.
//   - It NEVER sends Telegram messages itself (no Telegram API calls).
//   - It NEVER runs shell processes or external commands (no subprocess use).
//   - It NEVER writes to the approval queue (queue write blocked).
//   - It NEVER reads tokens, credentials, environment files or AI_SECRETS.
//   - It NEVER triggers lead import, real import, autosend or client contact.
//   - It does NOT unfreeze the D3C freeze.
//   - It NEVER intercepts slash commands (text starting with '/'), so
//     /ping, /health, /today and /lead_import_prepare are untouched.
//
// Recognized intents:
//   menu | health | today | regression_info | mini_audit | queue |
//   freeze | help | lead_100_info | unknown
//
// On T2, real execution (health/today/regression run from Telegram) will be
// wired up under controlled change. T1B is intentionally understanding-only.
// ============================================================

// ---- Intent constants ----
export const INTENTS = {
    MENU:            'menu',
    HEALTH:          'health',
    TODAY:           'today',
    REGRESSION_INFO: 'regression_info',
    MINI_AUDIT:      'mini_audit',
    QUEUE:           'queue',
    FREEZE:          'freeze',
    HELP:            'help',
    LEAD_100_INFO:   'lead_100_info',
    UNKNOWN:         'unknown',
};

// ---- Phrase tables (normalized, lowercase, ё->е) ----
// Order of evaluation is defined by INTENT_ORDER below so that more specific
// intents (e.g. lead_100_info) win over more generic ones (e.g. mini_audit).
const PHRASES = {
    menu: [
        'меню',
        'главное меню',
        'покажи меню',
        'открой меню',
        'что можно делать',
    ],
    health: [
        'здоровье',
        'проверь здоровье',
        'что с ботом',
        'бот живой',
        'система живая',
        'статус бота',
    ],
    today: [
        'сегодня',
        'что сегодня',
        'план на сегодня',
        'задачи на сегодня',
    ],
    regression_info: [
        'проверка',
        'проверь систему',
        'прогони проверку',
        'регрессия',
        'smoke',
        'r4',
        'все зеленое',
    ],
    lead_100_info: [
        '100 лидов',
        'парсинг лидов',
        'ежедневный парсинг',
        'найти 100 лидов',
        'когда парсим лиды',
        'запусти поиск лидов',
    ],
    mini_audit: [
        'мини аудит',
        'mini audit',
        'что по мини аудиту',
        'покажи лиды',
        'топ лиды',
        'что по лидам',
        'деньги',
        'продажи',
    ],
    queue: [
        'очередь',
        'approval',
        'апрув',
        'что в очереди',
        'покажи очередь',
    ],
    freeze: [
        'freeze',
        'заморозка',
        'что заморожено',
        'что заблокировано',
        'можно ли импорт',
        'можно ли отправлять',
    ],
    help: [
        'помощь',
        'help',
        'команды',
        'что ты умеешь',
    ],
};

// Evaluation order: specific -> generic. lead_100_info BEFORE mini_audit.
const INTENT_ORDER = [
    'menu',
    'health',
    'today',
    'lead_100_info',
    'mini_audit',
    'regression_info',
    'queue',
    'freeze',
    'help',
];

// ---- Static safe response texts ----
const MENU_TEXT =
    '🏠 Главное меню доступно. Откройте /menu, чтобы увидеть кнопки и безопасные подсказки.';

const HEALTH_TEXT =
    'Health доступен командой /health. На T2 будет подключён запуск health/status из Telegram.';

const TODAY_TEXT =
    'Сегодня доступно командой /today. На T2 будет подключена кнопка today.';

const REGRESSION_INFO_TEXT =
    'Проверка через Telegram будет подключена на T2. Сейчас безопасная команда на ПК: powershell -NoProfile -ExecutionPolicy Bypass -File .\\tools\\telegram_gateway\\regression_telegram_gateway.ps1 run';

const MINI_AUDIT_TEXT =
    'Mini Audit 10K: режим Telegram-controlled only. Ручная отправка запрещена. Autosend blocked. Lead import frozen. Следующий этап: O1 Draft Cockpit → Preview → Approval → Send через бота.';

const QUEUE_TEXT =
    'Approval queue: read-only на T1B. Queue write blocked. Commit blocked до отдельного approval Дмитрия.';

const FREEZE_TEXT =
    'D3C freeze ACTIVE. /lead_import_prepare frozen. Queue write blocked. Real import blocked. Client contact blocked. Autosend blocked.';

const LEAD_100_INFO_TEXT =
    'Ежедневный парсинг 100 лидов будет подключён этапом L1 Daily 100 Lead Scout. Режим: report-only → Telegram preview → approval. Сейчас импорт и отправка заблокированы.';

const HELP_TEXT = [
    '❓ Безопасные команды:',
    '• /menu — открыть меню и кнопки',
    '• /help — эта справка',
    '• /health — статус системы',
    '• /today — сводка дня',
    '• /ping — проверка связи',
    '',
    'Свободные фразы я тоже понимаю: «меню», «что с ботом», «проверь систему»,',
    '«что по лидам», «что заморожено», «найти 100 лидов».',
    '',
    'Опасные действия требуют отдельного approval Дмитрия.',
].join('\n');

const RESPONSES = {
    menu:            MENU_TEXT,
    health:          HEALTH_TEXT,
    today:           TODAY_TEXT,
    regression_info: REGRESSION_INFO_TEXT,
    mini_audit:      MINI_AUDIT_TEXT,
    queue:           QUEUE_TEXT,
    freeze:          FREEZE_TEXT,
    lead_100_info:   LEAD_100_INFO_TEXT,
    help:            HELP_TEXT,
};

// ---- Normalization ----
// lower-case, ё->е, drop punctuation, collapse whitespace.
function normalize(raw) {
    return String(raw)
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[^\p{L}\p{N}\s.\\:_-]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// ---- Intent classifier ----
// Pure function: text -> intent string (one of INTENTS).
// Returns 'unknown' if nothing matches. Slash commands always -> 'unknown'
// so the caller's normal slash routing is never intercepted.
export function classifyIntent(rawText) {
    if (typeof rawText !== 'string') return INTENTS.UNKNOWN;
    const trimmed = rawText.trim();
    if (!trimmed) return INTENTS.UNKNOWN;
    // NEVER intercept slash commands (/ping, /health, /today, /lead_import_prepare, ...)
    if (trimmed.startsWith('/')) return INTENTS.UNKNOWN;

    const norm = normalize(trimmed);
    if (!norm) return INTENTS.UNKNOWN;

    for (const intent of INTENT_ORDER) {
        const phrases = PHRASES[intent];
        for (const phrase of phrases) {
            if (norm === phrase || norm.includes(phrase)) {
                return intent;
            }
        }
    }
    return INTENTS.UNKNOWN;
}

// ---- Response lookup ----
export function getIntentResponse(intent) {
    return RESPONSES[intent] || null;
}

// ---- Core dispatcher ----
// Returns null when text is NOT a recognized free-form intent (caller keeps
// normal routing / existing fallback). Otherwise returns:
//   { handled: true, intent: <string>, text: <string>, delegateToMenu?: true }
// For 'menu' we set delegateToMenu so the bot can reuse the T1 hotkey menu
// response (keyboard) without duplicating it here.
// Pure function: no side effects, no I/O, no Telegram calls.
export function handleTextVoiceIntent(rawText) {
    const intent = classifyIntent(rawText);
    if (intent === INTENTS.UNKNOWN) return null;

    if (intent === INTENTS.MENU) {
        return { handled: true, intent, text: MENU_TEXT, delegateToMenu: true };
    }
    return { handled: true, intent, text: getIntentResponse(intent) };
}

// Convenience predicate.
export function isTextVoiceIntent(rawText) {
    return classifyIntent(rawText) !== INTENTS.UNKNOWN;
}

export default {
    INTENTS,
    classifyIntent,
    getIntentResponse,
    handleTextVoiceIntent,
    isTextVoiceIntent,
};
