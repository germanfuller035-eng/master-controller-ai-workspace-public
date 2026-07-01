// audit_run.mjs
// ============================================================
// BLOCK D-v2 — Audit Run Orchestrator
// ------------------------------------------------------------
// Ties the NETWORK boundary (audit_fetch_adapter) to the PURE engine
// (audit_engine_v2) and produces a Telegram-ready report + the 3 issues
// that Block E (templates) can reuse so preview/live stay identical.
//
// SAFETY:
//   - NO SMTP, NO Telegram send, NO autosend. Read-only.
//   - Network only via fetchSiteHtml(). Tests inject opts.html to stay offline.
//   - Degrades gracefully: if fetch fails, engine still returns 3 issues.
// ============================================================

import { fetchSiteHtml, normalizeUrl } from './audit_fetch_adapter.mjs';
import { runSiteAudit, RECOMMENDED_OFFER } from './audit_engine_v2.mjs';

// classifyAuditRun('/audit_run zb23.ru') -> { action:'audit_run', site } | null
export function classifyAuditRun(rawText) {
    if (rawText == null) return null;
    const t = String(rawText).trim();
    if (!t) return null;
    let m = t.match(/^\/audit_run\s+(top\s*1|top1)$/i);
    if (m) return { action: 'audit_run', target: 'top1', site: null };
    m = t.match(/^\/audit_run\s+(\S+)$/i);
    if (m) return { action: 'audit_run', target: null, site: m[1] };
    if (/^\/audit_run$/i.test(t)) return { action: 'audit_run', target: 'top1', site: null };
    return null;
}

// runAudit({ site, html?, niche? }) -> audit report (engine shape) + meta.
// If html is injected (tests), no network. Otherwise fetch once.
export async function runAudit(opts = {}) {
    const site = opts.site || null;
    let html = typeof opts.html === 'string' ? opts.html : null;
    let fetch_status = 'injected';
    let fetch_error = null;

    if (html == null) {
        const res = await fetchSiteHtml({ site });
        html = res.html || '';
        fetch_status = res.ok ? 'ok' : 'failed';
        fetch_error = res.error || null;
    }

    const report = runSiteAudit({ html, site: site || 'ваш сайт', niche: opts.niche });
    return {
        ...report,
        fetch_status,
        fetch_error,
        normalized_url: normalizeUrl(site),
    };
}

export function formatAuditReport(report) {
    if (!report) return 'Audit: ошибка анализа.';
    const lines = [];
    lines.push(`🔎 Экспресс-аудит: ${report.site}`);
    if (report.fetch_status === 'failed') {
        lines.push(`(сайт недоступен: ${report.fetch_error} — выводы по типовым проблемам ниши)`);
    } else if (report.degraded) {
        lines.push('(данные ограничены — выводы по типовым проблемам ниши)');
    }
    lines.push(`риск: ${report.risk}`);
    lines.push('');
    lines.push('3 проблемы:');
    report.issues.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
    lines.push('');
    lines.push(`Рекомендуемый разбор: ${report.recommended_offer} ₽`);
    lines.push('');
    lines.push('Это анализ, НЕ отправка. Письмо клиенту — только через /sales_next + ✅.');
    return lines.join('\n');
}

// Full command handler: classify → run → format. Returns { ok, text, report }.
export async function handleAuditRun(rawText, opts = {}) {
    const parsed = classifyAuditRun(rawText);
    if (!parsed) return null;
    // top1 site resolution is delegated to caller (opts.site) to avoid coupling.
    const site = parsed.site || opts.site || null;
    if (!site) {
        return {
            ok: false,
            text: 'Audit: укажите сайт — /audit_run example.ru (или подготовьте top1 лид).',
        };
    }
    const report = await runAudit({ site, html: opts.html, niche: opts.niche });
    return { ok: true, text: formatAuditReport(report), report };
}

export default {
    RECOMMENDED_OFFER,
    classifyAuditRun,
    runAudit,
    formatAuditReport,
    handleAuditRun,
};
