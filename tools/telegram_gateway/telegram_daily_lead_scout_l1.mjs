// telegram_daily_lead_scout_l1.mjs
// V1 Daily 100 Lead Scout — L1 (report-only).
//
// SAFETY CONTRACT (offline build, no live restart):
//   - PURE module: NO Telegram API, NO PowerShell, NO token read, NO .env read.
//   - L1 = report-only: NEVER imports, NEVER writes canonical leads, NEVER
//     writes lead_contacts, NEVER sends, NEVER autosends.
//   - The ONLY allowed write target is:
//       13_sales/daily_lead_factory/output/scout_reports/**
//     and that write is NOT performed in build/test (offline). The module only
//     builds the report object + suggested output path.
//   - NO live network scraping in build/test. If no live provider is wired via
//     opts.provider, returns L1_REPORT_ONLY_PROVIDER_NOT_CONFIGURED.
//   - import_allowed=false and send_allowed=false on every report row until
//     explicit approval (not part of this build).

export const OWNER_REFUSAL =
    'Команда Lead Scout доступна только владельцу. Доступ отклонён.';

export const L1_PROVIDER_NOT_CONFIGURED = 'L1_REPORT_ONLY_PROVIDER_NOT_CONFIGURED';

export const SCOUT_OUTPUT_DIR = '13_sales/daily_lead_factory/output/scout_reports';

// ----------------------------------------------------------------------------
// Command classification
// ----------------------------------------------------------------------------
export function classifyScoutCommand(rawText) {
    if (rawText == null) return null;
    const t = String(rawText).trim().toLowerCase();
    if (!t) return null;

    if (t === '/lead_scout') return 'scout';
    if (t === '/lead_scout_100') return 'scout100';
    if (t === '/daily100') return 'scout100';

    const PHRASES_100 = ['найди 100 лидов', 'парсинг лидов', 'ежедневный парсинг'];
    if (PHRASES_100.includes(t)) return 'scout100';

    const PHRASES_SCOUT = [
        'запусти поиск лидов',
        'когда парсим 100 лидов',
    ];
    if (PHRASES_SCOUT.includes(t)) return 'scout';

    return null;
}

// ----------------------------------------------------------------------------
// Report row schema normalizer — enforces import_allowed/send_allowed = false.
// ----------------------------------------------------------------------------
export function normalizeRow(row = {}) {
    return {
        company: row.company || '',
        website: row.website || '',
        niche: row.niche || '',
        region: row.region || '',
        contact_found: row.contact_found === true ? 'yes' : 'no',
        email: row.email || '',
        phone: row.phone || '',
        site_form: row.site_form || '',
        reason_fit: row.reason_fit || '',
        score: typeof row.score === 'number' ? row.score : 0,
        risk: row.risk || 'unknown',
        suggested_next_action: row.suggested_next_action || 'manual_review',
        import_allowed: false, // until approval
        send_allowed: false, // until approval
    };
}

// ----------------------------------------------------------------------------
// Build a report-only result. NEVER writes. If no provider -> safe message.
// ----------------------------------------------------------------------------
export function buildScoutReport(action = 'scout100', opts = {}) {
    const target = action === 'scout100' ? 100 : 25;

    // Live provider is required for real scraping. Offline build/test never
    // supplies it, so we return the safe report-only signal.
    const provider = opts.provider;
    const hasProvider = provider && typeof provider.fetchLeads === 'function';

    // Fixtures may be injected for offline tests to exercise formatting.
    const fixtureRows = Array.isArray(opts.rows) ? opts.rows : null;

    if (!hasProvider && !fixtureRows) {
        return {
            ok: false,
            mode: 'report-only',
            code: L1_PROVIDER_NOT_CONFIGURED,
            target,
            output_dir: SCOUT_OUTPUT_DIR,
            rows: [],
            import_performed: false,
            send_performed: false,
            canonical_write: false,
        };
    }

    const rawRows = fixtureRows || [];
    const rows = rawRows.map(normalizeRow);

    return {
        ok: true,
        mode: 'report-only',
        code: 'OK',
        target,
        found: rows.length,
        output_dir: SCOUT_OUTPUT_DIR,
        suggested_output_file: `${SCOUT_OUTPUT_DIR}/scout_report_${opts.dateStamp || 'YYYY-MM-DD'}.json`,
        rows,
        import_performed: false,
        send_performed: false,
        canonical_write: false,
        note: 'L1 report-only. Импорт и отправка запрещены до approval.',
    };
}

export function formatScoutReport(report) {
    if (!report) return 'Lead Scout: нет результата.';
    if (!report.ok && report.code === L1_PROVIDER_NOT_CONFIGURED) {
        return [
            '🔎 Daily 100 Lead Scout — L1 (report-only)',
            '',
            `Режим: report-only (цель ${report.target} лидов)`,
            `Статус: ${L1_PROVIDER_NOT_CONFIGURED}`,
            '',
            'Live-провайдер парсинга не настроен. В offline-режиме реальный',
            'парсинг не запускается. Импорт/отправка/canonical write — запрещены.',
            `Разрешённая папка вывода: ${report.output_dir}`,
        ].join('\n');
    }
    const lines = [];
    lines.push('🔎 Daily 100 Lead Scout — L1 (report-only)');
    lines.push('');
    lines.push(`Режим: report-only (цель ${report.target}, найдено ${report.found})`);
    lines.push(`Вывод: ${report.suggested_output_file}`);
    lines.push('import_allowed: false | send_allowed: false (до approval)');
    lines.push('');
    report.rows.slice(0, 5).forEach((r, i) => {
        lines.push(`${i + 1}. ${r.company || '(нет имени)'} / ${r.website || 'нет сайта'} — ${r.niche}, ${r.region}`);
        lines.push(`   contact: ${r.contact_found} | score: ${r.score} | risk: ${r.risk} | next: ${r.suggested_next_action}`);
    });
    if (report.rows.length > 5) lines.push(`...и ещё ${report.rows.length - 5}`);
    lines.push('');
    lines.push('Импорт и отправка запрещены до отдельного approval Дмитрия.');
    return lines.join('\n');
}

export function handleScoutCommand(action, opts = {}) {
    if (!action) return null;
    const report = buildScoutReport(action, opts);
    return { report, text: formatScoutReport(report) };
}

export default {
    OWNER_REFUSAL,
    L1_PROVIDER_NOT_CONFIGURED,
    SCOUT_OUTPUT_DIR,
    classifyScoutCommand,
    normalizeRow,
    buildScoutReport,
    formatScoutReport,
    handleScoutCommand,
};
