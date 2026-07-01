// audit_engine_v2.mjs
// ============================================================
// BLOCK D-v2 — Real Audit Engine (PURE CORE)
// ------------------------------------------------------------
// Purpose:
//   Inspect a site's HTML and produce a real, deterministic audit:
//   5 checks -> issues[3] -> risk -> recommended_offer.
//   The output `issues` array is template-ready and feeds the GREEN
//   renderAuditEmail({ issues, ... }) contract unchanged.
//
// HARD SAFETY CONTRACT (PURE module):
//   - NO network, NO fetch, NO SMTP, NO Telegram, NO .env / token read.
//   - Takes HTML string in, returns a report object out.
//   - NEVER throws on bad/empty input — degrades gracefully.
//   - All network access lives in audit_fetch_adapter.mjs (separate file).
// ============================================================

import { DEFAULT_ISSUES, resolveNiche } from './audit_send_templates.mjs';

export const RECOMMENDED_OFFER = 10000;

// Priority order for picking the 3 most impactful issues.
export const CHECK_PRIORITY = [
    'first_screen',
    'path_to_lead',
    'trust',
    'cta',
    'mobile_basic',
];

// ----------------------------------------------------------------------------
// Niche-aware remediation lines per failed check. Written to match existing
// email copy style (short imperative clauses). Slots get '.' / ';' fixed later.
// ----------------------------------------------------------------------------
const REMEDIATION = {
    jbi: {
        first_screen: 'сделать первый экран понятнее: кто вы и что производите из ЖБИ',
        path_to_lead: 'добавить простой путь до заявки: форма расчёта и телефон на виду',
        trust: 'усилить доверие через производство, документы, доставку и примеры работ',
        cta: 'добавить явный призыв «рассчитать стоимость» / «оставить заявку»',
        mobile_basic: 'починить мобильную версию: сайт должен корректно открываться с телефона',
    },
    local: {
        first_screen: 'сделать первый экран понятнее: какая услуга и для кого',
        path_to_lead: 'добавить простой путь до заявки: форма и телефон на первом экране',
        trust: 'усилить доверие через кейсы, отзывы, документы и примеры работ',
        cta: 'добавить явный призыв «оставить заявку» / «связаться»',
        mobile_basic: 'починить мобильную версию: сайт должен корректно открываться с телефона',
    },
    wb_ozon: {
        first_screen: 'усилить первый экран карточки: главный оффер и выгода сразу',
        path_to_lead: 'упростить путь к покупке: понятная кнопка и условия',
        trust: 'усилить доверие: отзывы, рейтинг, ответы на возражения',
        cta: 'добавить явный призыв к действию на карточке',
        mobile_basic: 'проверить корректное отображение карточки на телефоне',
    },
};

function remediationFor(niche, check) {
    const set = REMEDIATION[niche] || REMEDIATION.local;
    return set[check] || REMEDIATION.local[check];
}

// ----------------------------------------------------------------------------
// Lightweight HTML signal detection. Regex over raw HTML (no DOM dependency).
// Each function returns true when the positive signal is present.
// ----------------------------------------------------------------------------
function hasFirstScreen(html) {
    // a non-trivial <h1> ... </h1>
    const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
    if (h1) {
        const text = h1[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        if (text.length >= 8) return true;
    }
    // or a clear offer phrase near the top of the document
    const head = html.slice(0, 4000).toLowerCase();
    return /(производство|изготовление|продажа|услуги|доставка|купить|заказать)/.test(head)
        && /<title[^>]*>[\s\S]{8,}?<\/title>/i.test(html);
}

function hasPathToLead(html) {
    const lower = html.toLowerCase();
    if (/<form[\s>]/.test(lower)) return true;
    if (/href\s*=\s*["']tel:/.test(lower)) return true;
    return /(оставить заявку|заказать звонок|заказать расчёт|заказать расчет|оставьте заявку|обратный звонок)/.test(lower);
}

function hasTrust(html) {
    const lower = html.toLowerCase();
    return /(сертификат|документ|гост|реквизит|инн|отзыв|пример работ|наши работы|производств|гарант|лиценз)/.test(lower);
}

function hasCta(html) {
    const lower = html.toLowerCase();
    // action verb inside a button/link, or as a standalone CTA phrase
    return /(рассчитать|оставить заявку|оставьте заявку|заказать|связаться|получить расчёт|получить расчет|купить|в корзину)/.test(lower);
}

function hasMobileBasic(html) {
    return /<meta[^>]+name\s*=\s*["']viewport["']/i.test(html);
}

const DETECTORS = {
    first_screen: hasFirstScreen,
    path_to_lead: hasPathToLead,
    trust: hasTrust,
    cta: hasCta,
    mobile_basic: hasMobileBasic,
};

const OK_NOTES = {
    first_screen: 'первый экран читается',
    path_to_lead: 'путь до заявки есть',
    trust: 'есть элементы доверия',
    cta: 'есть призыв к действию',
    mobile_basic: 'есть мобильная адаптация (viewport)',
};

const FAIL_NOTES = {
    first_screen: 'первый экран не доносит оффер',
    path_to_lead: 'нет явного пути до заявки',
    trust: 'мало элементов доверия',
    cta: 'нет явного призыва к действию',
    mobile_basic: 'нет мета viewport — возможны проблемы на телефоне',
};

// ----------------------------------------------------------------------------
// Make a template-ready issues[3] from failed checks (by priority), topped up
// from DEFAULT_ISSUES[niche] if fewer than 3 checks failed.
// Slots 0,1 end with ';' and slot 2 ends with '.' to match existing copy.
// ----------------------------------------------------------------------------
function buildIssues(niche, checks) {
    const failed = CHECK_PRIORITY.filter((k) => !checks[k].ok);
    const lines = failed.map((k) => remediationFor(niche, k));

    // top up from niche defaults (strip their trailing punctuation first)
    const defaults = (DEFAULT_ISSUES[niche] || DEFAULT_ISSUES.local).map((s) =>
        String(s).replace(/[;.]\s*$/, '')
    );
    let di = 0;
    while (lines.length < 3 && di < defaults.length) {
        const cand = defaults[di++];
        if (!lines.includes(cand)) lines.push(cand);
    }
    // absolute fallback (should never trigger)
    while (lines.length < 3) lines.push('усилить ключевые блоки сайта');

    const top3 = lines.slice(0, 3);
    return top3.map((line, i) => (i < 2 ? `${line};` : `${line}.`));
}

function riskFromFailed(failedCount) {
    if (failedCount >= 3) return 'high';
    if (failedCount === 2) return 'medium';
    return 'low';
}

// ----------------------------------------------------------------------------
// runSiteAudit — PURE. Takes { html, site, niche } -> report object.
//   - empty/whitespace html -> degraded fallback using DEFAULT_ISSUES[niche].
// ----------------------------------------------------------------------------
export function runSiteAudit(input = {}) {
    const niche = resolveNiche(input.niche);
    const site =
        input.site != null && String(input.site).trim() !== ''
            ? String(input.site).trim()
            : 'ваш сайт';
    const html = typeof input.html === 'string' ? input.html : '';

    // Degraded path: no usable HTML -> fall back to niche defaults, risk medium.
    if (html.trim().length < 30) {
        const issues = (DEFAULT_ISSUES[niche] || DEFAULT_ISSUES.local).slice(0, 3);
        return {
            site,
            niche,
            degraded: true,
            checks: Object.fromEntries(
                CHECK_PRIORITY.map((k) => [k, { ok: false, note: 'сайт недоступен для анализа' }])
            ),
            issues,
            risk: 'medium',
            recommended_offer: RECOMMENDED_OFFER,
        };
    }

    const checks = {};
    let failedCount = 0;
    for (const k of CHECK_PRIORITY) {
        const ok = !!DETECTORS[k](html);
        if (!ok) failedCount++;
        checks[k] = { ok, note: ok ? OK_NOTES[k] : FAIL_NOTES[k] };
    }

    const issues = buildIssues(niche, checks);
    return {
        site,
        niche,
        degraded: false,
        checks,
        issues,
        risk: riskFromFailed(failedCount),
        recommended_offer: RECOMMENDED_OFFER,
    };
}

export default {
    RECOMMENDED_OFFER,
    CHECK_PRIORITY,
    runSiteAudit,
};
