// telegram_command_normalizer.mjs
// FIXED 2026-05-25: Russian aliases now use correct UTF-8 strings
// Fixes: garbled encoding in CANONICAL_MAP and ALIAS_MAP

export const CANONICAL_MAP = {
    '/ping':              ['/ping', 'ping', 'пинг', 'проверка', 'проверка связи', 'бот живой', 'ты живой'],
    '/health':            ['/health', 'health', 'здоровье', 'диагностика', 'что с системой', 'что с системой?',
                           'статус системы', 'система', 'как система', 'что работает'],
    '/status':            ['/status', 'status', 'статус'],
    '/today':             ['/today', '/daily', 'сегодня', 'что сегодня', 'на сегодня', 'план на сегодня',
                           'сводка', 'сводка за сегодня'],
    '/tasks':             ['задачи', 'мои задачи', 'что делать', 'что дальше', 'пора заработать',
                           'дай задачи', 'следующий шаг', 'план действий'],
    '/lead_status':       ['/lead_status', '/leadstatus', '/lead status', 'лиды', 'статус лидов',
                           'что по лидам', 'сколько лидов', 'real leads'],
    '/lead_template':     ['/lead_template', '/leadtemplate', '/lead template', 'шаблон лида',
                           'как добавить лид', 'дай шаблон лида'],
    '/lead_add':          ['/lead_add', '/leadadd', '/add_lead', '/addlead', 'добавить лид'],
    '/lead_list':         ['/lead_list', '/leadlist', 'список лидов', 'покажи лиды', 'последние лиды'],
    '/lead_run_pipeline': ['/lead_run_pipeline', '/leadrunpipeline', '/run_leads', 'запусти лиды',
                           'прогони лиды', 'запусти pipeline', 'прогнать pipeline'],
    '/mail':              ['/mail', '/mail status', '/mail_status', 'почта', 'статус почты', 'что с почтой'],
    '/mail inbox':        ['/mail inbox', 'входящие', 'покажи входящие'],
    '/mail drafts':       ['/mail drafts', 'черновики', 'покажи черновики'],
    '/approval list':     ['/approval list', 'approvals', 'апрувы', 'согласования', 'что ждёт подтверждения'],
    '/newleads':          ['/newleads', 'новые лиды', 'покажи новые лиды'],
    '/import_status':     ['/import_status', 'импорт статус', 'статус импорта'],
    '/help':              ['/help', 'help', 'помощь', 'команды', 'что умеешь'],
};

// Build reverse lookup once at module load
const REVERSE_MAP = new Map();
for (const [canonical, aliases] of Object.entries(CANONICAL_MAP)) {
    for (const alias of aliases) {
        REVERSE_MAP.set(alias.trim().toLowerCase(), canonical);
    }
}

/** Normalize raw text: trim, collapse spaces */
export function normalizeCommandText(text) {
    if (typeof text !== 'string') return '';
    return text.replace(/\s+/g, ' ').trim();
}

/** Remove bot username suffix: "/ping@MyBot" -> "/ping" */
export function stripBotUsername(text) {
    return text.replace(/@\w+$/, '').trim();
}

/** Match text against all known aliases (case-insensitive) */
export function mapToCanonicalCommand(text) {
    if (!text) return null;
    const cleaned = stripBotUsername(normalizeCommandText(text));
    const lower = cleaned.toLowerCase();
    // Direct key lookup
    if (REVERSE_MAP.has(lower)) return REVERSE_MAP.get(lower);
    // Prefix match for slash commands with payload (e.g. "/leadadd Иван Петров | ...")
    for (const [alias, canonical] of REVERSE_MAP.entries()) {
        if (alias.startsWith('/') && lower.startsWith(alias + ' ')) return canonical;
    }
    return null;
}

/** Detect if text is a slash command alias */
export function detectSlashAlias(text) {
    const canonical = mapToCanonicalCommand(text);
    return canonical;
}

/** Detect Russian free-text intent */
export function detectRussianIntent(text) {
    return mapToCanonicalCommand(text);
}

/** Build fallback help for unrecognized commands */
export function buildFallbackHelp(originalText) {
    const preview = originalText ? `"${originalText.substring(0, 40)}"` : '(пустая строка)';
    return [
        `Команда не распознана: ${preview}`,
        '',
        'Главные команды:',
        '🧪 /ping — проверка связи',
        '🩺 /health — статус системы',
        '📊 /today — сводка за сегодня',
        '📌 /lead_template — шаблон добавления лида',
        '➕ /lead_add — добавить лид',
        '📊 /lead_status — статус лидов',
        '📋 /lead_list — список лидов',
        '▶️ /lead_run_pipeline — запуск pipeline',
        '📮 /mail status — статус почты',
        '🧾 /approval list — согласования',
        '',
        'Текстом:',
        '"задачи" | "пора заработать" | "лиды" | "что с системой" | "что сегодня"',
        '',
        '🔒 Auto-send: BLOCKED',
    ].join('\n');
}

export default { CANONICAL_MAP, mapToCanonicalCommand, detectSlashAlias, detectRussianIntent,
    normalizeCommandText, stripBotUsername, buildFallbackHelp };
