// telegram_mini_audit_cockpit.mjs
// V1 Mini Audit Cockpit — SAFE, read-only TOP-lead cockpit for Telegram control.
//
// SAFETY CONTRACT (offline build, no live restart):
//   - PURE module: NO Telegram API, NO PowerShell, NO token read, NO .env read.
//   - READ-ONLY: never writes 13_sales JSON, never writes canonical leads,
//     never writes lead_contacts, never writes approval_queue.
//   - NO send, NO autosend, NO import. Manual sending disabled by process.
//   - The bot performs the owner gate + reply send; this module only classifies
//     commands and formats text.
//
// Recognizes ONLY the audit cockpit commands/phrases below. Returns null for
// everything else (so /ping, /health, /today, /lead_import_prepare are NOT
// touched). All audit commands are owner-only — enforced by the bot.

export const OWNER_REFUSAL =
    'Команда Mini Audit доступна только владельцу. Доступ отклонён.';

// Embedded canonical TOP leads (read-only fallback). These mirror the known
// Mini Audit 10K pipeline leads. The cockpit NEVER mutates this data and NEVER
// writes it back to 13_sales. Used when no external dataset is injected.
const EMBEDDED_TOP_LEADS = [
    {
        lead_id: '002',
        rank: 1,
        company: 'ЖЕЛЕЗОБЕТОН',
        website: 'zb23.ru',
        niche: 'ЖБИ / производство железобетона',
        region: 'Краснодарский край',
        score: 92,
        risk: 'low',
        status: 'top1',
    },
    {
        lead_id: '001',
        rank: 2,
        company: 'КЖБИ',
        website: '',
        niche: 'Комбинат ЖБИ',
        region: 'РФ',
        score: 81,
        risk: 'medium',
        status: 'top3',
    },
    {
        lead_id: '003',
        rank: 3,
        company: 'ГБИ Ресурс',
        website: '',
        niche: 'ЖБИ / поставка',
        region: 'РФ',
        score: 78,
        risk: 'medium',
        status: 'top3',
    },
];

// ----------------------------------------------------------------------------
// Command classification — RAW text in, intent out (or null).
// ----------------------------------------------------------------------------
export function classifyAuditCommand(rawText) {
    if (rawText == null) return null;
    const t = String(rawText).trim().toLowerCase();
    if (!t) return null;

    // Slash commands (exact)
    if (t === '/audit') return 'cockpit';
    if (t === '/audit_top') return 'top';
    if (t === '/audit_leads') return 'leads';
    if (t === '/audit_status') return 'status';

    // Hotkey label
    if (t === '💰 mini audit') return 'cockpit';

    // RU text / voice phrases
    const TOP_PHRASES = ['топ лиды', 'покажи топ лидов', 'топ лидов'];
    if (TOP_PHRASES.includes(t)) return 'top';

    const LEAD_PHRASES = ['что по лидам', 'покажи лиды'];
    if (LEAD_PHRASES.includes(t)) return 'leads';

    const COCKPIT_PHRASES = [
        'что по мини аудиту',
        'деньги',
        'продажи',
        'mini audit',
        'мини аудит',
    ];
    if (COCKPIT_PHRASES.includes(t)) return 'cockpit';

    return null;
}

// ----------------------------------------------------------------------------
// Data access — read-only. Accepts an optional injected dataset (for tests /
// future real data). NEVER writes anywhere.
// ----------------------------------------------------------------------------
export function getTopLeads(opts = {}) {
    const dataset = Array.isArray(opts.leads) ? opts.leads : EMBEDDED_TOP_LEADS;
    if (!dataset.length) {
        return { ok: false, code: 'NOT_FOUND', leads: [] };
    }
    const sorted = [...dataset].sort((a, b) => (a.rank || 99) - (b.rank || 99));
    return { ok: true, code: 'OK', leads: sorted };
}

export function findTop1(opts = {}) {
    const res = getTopLeads(opts);
    if (!res.ok) return null;
    return res.leads.find((l) => l.rank === 1) || res.leads[0] || null;
}

// ----------------------------------------------------------------------------
// Formatting
// ----------------------------------------------------------------------------
const STATUS_BLOCK = [
    'Режим: Telegram-controlled only',
    'Ручная отправка: запрещена (disabled by process)',
    'Autosend: BLOCKED',
    'Lead import: FROZEN (D3C)',
    'Next action: draft → preview → approval → send (через бота)',
].join('\n');

export function formatCockpit(opts = {}) {
    const res = getTopLeads(opts);
    if (!res.ok) {
        return formatNotFound();
    }
    const top1 = res.leads.find((l) => l.rank === 1) || res.leads[0];
    const lines = [];
    lines.push('💰 Mini Audit 10K — Cockpit');
    lines.push('');
    lines.push(`TOP-1: №${top1.lead_id} ${top1.company} / ${top1.website || 'сайт не указан'} (score ${top1.score})`);
    lines.push('');
    lines.push('TOP-3:');
    res.leads.slice(0, 3).forEach((l) => {
        lines.push(`  ${l.rank}. №${l.lead_id} ${l.company}${l.website ? ' / ' + l.website : ''} — score ${l.score}, risk ${l.risk}`);
    });
    lines.push('');
    lines.push(STATUS_BLOCK);
    lines.push('');
    lines.push('Команды: /audit_top  /audit_leads  /audit_status  /audit_draft top1');
    return lines.join('\n');
}

export function formatTop(opts = {}) {
    const res = getTopLeads(opts);
    if (!res.ok) return formatNotFound();
    const lines = ['💰 Mini Audit — TOP-лиды', ''];
    res.leads.slice(0, 3).forEach((l) => {
        lines.push(`${l.rank}. №${l.lead_id} ${l.company}${l.website ? ' / ' + l.website : ''}`);
        lines.push(`   ниша: ${l.niche} | регион: ${l.region}`);
        lines.push(`   score: ${l.score} | risk: ${l.risk} | статус: ${l.status}`);
    });
    lines.push('');
    lines.push('Подготовить письмо: /audit_draft top1');
    return lines.join('\n');
}

export function formatLeads(opts = {}) {
    const res = getTopLeads(opts);
    if (!res.ok) return formatNotFound();
    const lines = ['💰 Mini Audit — лиды (read-only)', ''];
    res.leads.forEach((l) => {
        lines.push(`№${l.lead_id} ${l.company}${l.website ? ' / ' + l.website : ''} — TOP-${l.rank}, score ${l.score}`);
    });
    lines.push('');
    lines.push('Источник: только read-only. 13_sales JSON не изменяется.');
    return lines.join('\n');
}

export function formatStatus() {
    return ['💰 Mini Audit — статус', '', STATUS_BLOCK].join('\n');
}

export function formatNotFound() {
    return [
        'Mini Audit: NOT_FOUND',
        '',
        'Не найдено TOP-лидов в текущих данных.',
        'Нужны данные лидов в 13_sales / 09_dashboards (canonical leads / dashboard),',
        'либо передать набор лидов через fixtures для offline-теста.',
    ].join('\n');
}

// One-call dispatch helper used by the bot route.
export function handleAuditCommand(action, opts = {}) {
    switch (action) {
        case 'cockpit':
            return formatCockpit(opts);
        case 'top':
            return formatTop(opts);
        case 'leads':
            return formatLeads(opts);
        case 'status':
            return formatStatus();
        default:
            return null;
    }
}

export default {
    OWNER_REFUSAL,
    classifyAuditCommand,
    getTopLeads,
    findTop1,
    formatCockpit,
    formatTop,
    formatLeads,
    formatStatus,
    formatNotFound,
    handleAuditCommand,
};
