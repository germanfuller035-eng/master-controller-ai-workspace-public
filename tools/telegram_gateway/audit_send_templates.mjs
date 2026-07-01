// audit_send_templates.mjs
// Production template system for outbound B2B site-audit emails.
//
// SAFETY CONTRACT (pure module):
//   - PURE: NO Telegram API, NO SMTP, NO .env read, NO token read, NO network.
//   - NEVER sends. Only renders subject + body strings from variables.
//   - Single source of truth for outbound audit copy so that the Telegram
//     preview (/audit_send_preview_to_me) and the real client send render the
//     EXACT SAME subject and body.
//
// Reusable variables (all optional, with safe defaults):
//   company       - client company name (string)
//   site          - client site / card reference (string), e.g. "zb23.ru"
//   niche         - which template to use: 'jbi' | 'local' | 'wb_ozon'
//   issues        - array of up to 3 strings; missing entries fall back to
//                   the niche default issues
//   offer_price   - price for the mini-audit, number or string, e.g. 3000
//   sender_name   - signature name (string), default 'Дмитрий'

export const DEFAULT_SENDER_NAME = 'Дмитрий';
export const DEFAULT_OFFER_PRICE = 10000;

// ----------------------------------------------------------------------------
// Default issues per niche (3 each). Used when caller does not pass issues.
// ----------------------------------------------------------------------------
export const DEFAULT_ISSUES = {
    jbi: [
        'сделать первый экран понятнее для заказчика ЖБИ;',
        'быстрее показать, какие изделия доступны и как запросить расчёт;',
        'усилить доверие через производство, доставку, документы и примеры работ.',
    ],
    local: [
        'сделать первый экран понятнее для клиента;',
        'быстрее показать услуги, цены/условия и способ оставить заявку;',
        'усилить доверие через кейсы, отзывы, документы и понятный путь до заявки.',
    ],
    wb_ozon: [
        'сделать первый экран понятнее и сильнее;',
        'лучше показать выгоды товара на фото;',
        'усилить описание, доверие и ответы на частые возражения.',
    ],
};

// Niche metadata: subject builder + body builder.
// Each builder receives the resolved vars object.
const NICHES = {
    // A) ЖБИ / бетон / стройка
    jbi: {
        subject: (v) => `Короткий разбор сайта ${v.site}`,
        body: (v) => [
            'Добрый день.',
            '',
            `Посмотрел сайт ${v.site} и вижу несколько точек, где можно усилить заявки с B2B-клиентов:`,
            '',
            `1. ${v.issues[0]}`,
            `2. ${v.issues[1]}`,
            `3. ${v.issues[2]}`,
            '',
            'Могу подготовить короткий мини-аудит: что мешает заявкам и что можно поправить в первую очередь.',
            '',
            'Формат: 1–2 страницы с конкретными правками.',
            `Стоимость: ${v.offer_price} ₽.`,
            '',
            'Если актуально — пришлю пример структуры аудита.',
            '',
            'С уважением,',
            v.sender_name,
        ].join('\n'),
    },

    // B) Универсальный локальный бизнес
    local: {
        subject: (v) => `Короткий разбор сайта ${v.site}`,
        body: (v) => [
            'Добрый день.',
            '',
            `Посмотрел сайт ${v.site}. Есть несколько мест, где можно усилить заявки:`,
            '',
            `1. ${v.issues[0]}`,
            `2. ${v.issues[1]}`,
            `3. ${v.issues[2]}`,
            '',
            'Могу подготовить мини-аудит: что сейчас мешает обращениям и что лучше поправить в первую очередь.',
            '',
            'Формат: 1–2 страницы.',
            `Стоимость: ${v.offer_price} ₽.`,
            '',
            'Если актуально — пришлю пример структуры.',
            '',
            'С уважением,',
            v.sender_name,
        ].join('\n'),
    },

    // C) WB/Ozon карточки
    wb_ozon: {
        subject: () => 'Короткий разбор карточки товара',
        body: (v) => [
            'Добрый день.',
            '',
            'Посмотрел карточку товара и вижу несколько точек, где можно усилить конверсию:',
            '',
            `1. ${v.issues[0]}`,
            `2. ${v.issues[1]}`,
            `3. ${v.issues[2]}`,
            '',
            'Могу подготовить короткий аудит карточки: что мешает продажам и что поправить в первую очередь.',
            '',
            'Формат: 1–2 страницы.',
            `Стоимость: ${v.offer_price} ₽.`,
            '',
            'Если актуально — пришлю пример структуры.',
            '',
            'С уважением,',
            v.sender_name,
        ].join('\n'),
    },
};

// Niche aliases so callers can pass loose values.
const NICHE_ALIASES = {
    jbi: 'jbi',
    'жби': 'jbi',
    concrete: 'jbi',
    'бетон': 'jbi',
    construction: 'jbi',
    'стройка': 'jbi',
    local: 'local',
    universal: 'local',
    'локальный': 'local',
    wb: 'wb_ozon',
    ozon: 'wb_ozon',
    wb_ozon: 'wb_ozon',
    'озон': 'wb_ozon',
    card: 'wb_ozon',
    'карточка': 'wb_ozon',
};

export function resolveNiche(niche) {
    if (!niche) return 'local';
    const key = String(niche).trim().toLowerCase();
    return NICHE_ALIASES[key] || (NICHES[key] ? key : 'local');
}

// ----------------------------------------------------------------------------
// resolveVars — normalize caller input into the full variable set used by the
// template builders. Missing issues fall back to niche defaults per-slot.
// ----------------------------------------------------------------------------
export function resolveVars(vars = {}) {
    const niche = resolveNiche(vars.niche);
    const defaults = DEFAULT_ISSUES[niche];

    const inIssues = Array.isArray(vars.issues) ? vars.issues : [];
    const issues = [0, 1, 2].map((i) => {
        const v = inIssues[i];
        return v != null && String(v).trim() !== '' ? String(v).trim() : defaults[i];
    });

    return {
        company: vars.company != null ? String(vars.company) : '',
        site: vars.site != null && String(vars.site).trim() !== ''
            ? String(vars.site).trim()
            : 'ваш сайт',
        niche,
        issues,
        offer_price: vars.offer_price != null && String(vars.offer_price).trim() !== ''
            ? vars.offer_price
            : DEFAULT_OFFER_PRICE,
        sender_name: vars.sender_name != null && String(vars.sender_name).trim() !== ''
            ? String(vars.sender_name).trim()
            : DEFAULT_SENDER_NAME,
    };
}

// ----------------------------------------------------------------------------
// renderAuditEmail — main entry. Returns { subject, body, niche, vars }.
// The same object is used for preview AND for the real client send so they
// stay byte-identical.
// ----------------------------------------------------------------------------
export function renderAuditEmail(vars = {}) {
    const v = resolveVars(vars);
    const tpl = NICHES[v.niche];
    return {
        subject: tpl.subject(v),
        body: tpl.body(v),
        niche: v.niche,
        vars: v,
    };
}

export default {
    DEFAULT_SENDER_NAME,
    DEFAULT_OFFER_PRICE,
    DEFAULT_ISSUES,
    resolveNiche,
    resolveVars,
    renderAuditEmail,
};
