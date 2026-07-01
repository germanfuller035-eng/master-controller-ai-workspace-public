// tools/mater_controller_api/src/commercial/product_presentation.mjs
// Owner-facing product presentation localization (RU). Read-only. Maps machine-readable product
// codes / English catalog fields to Russian owner-facing labels WITHOUT changing the canonical
// catalog (machine codes & enums stay English for the engine). The Android UI consumes *_ru fields.
import { catalog, product as productById } from '../../../commercial_core/lib/product_catalog_runtime.mjs';

// Canonical RU copy for known products. For Mini Audit the owner-facing wording is fixed by spec.
const RU = {
    mini_audit: {
        product_name_ru: 'Мини-аудит сайта и пути клиента до заявки',
        description_ru: 'Платный входной продукт: короткий аудит сайта и пути клиента до заявки. 5–7 ключевых выводов + быстрый план исправлений + следующий шаг.',
        scope_ru: [
            'Аудит сайта и пути клиента до заявки',
            '5–7 ключевых выводов с доказательствами',
            'Короткий план исправлений',
            'Рекомендация следующего шага',
        ],
        exclusions_ru: [
            'Без глубокого технического SEO-аудита',
            'Без доработки сайта',
            'Без рекламных кампаний',
        ],
        required_inputs_ru: [
            'Проверенный URL страницы',
            'Подтверждённая идентичность компании',
            'Подтверждённый контактный путь',
        ],
        outputs_ru: [
            '5–7 ключевых выводов',
            'Короткий план исправлений',
            'Рекомендация следующего шага',
            'Документ для клиента (PDF или структурированная заметка)',
        ],
        acceptance_criteria_ru: [
            '5–7 выводов, каждый подтверждён доказательством',
            'Без повторяющихся выводов',
            'Практические рекомендации',
            'Цена — 10 000 ₽',
            'Есть подтверждение получателя',
            'Нет выдуманных данных',
        ],
    },
};

// English acceptance-criteria phrases → RU (fallback per-item localization for any product).
const CRITERIA_RU = {
    '5-7 findings each evidence-backed': '5–7 выводов, каждый подтверждён доказательством',
    'no duplicate findings': 'Без повторяющихся выводов',
    'actionable recommendations': 'Практические рекомендации',
    'price = 10000 rub': 'Цена — 10 000 ₽',
    'recipient evidence present': 'Есть подтверждение получателя',
    'no guessed data': 'Нет выдуманных данных',
};
const DELIVERABLE_RU = {
    '5-7 key findings': '5–7 ключевых выводов',
    'short fix plan': 'Короткий план исправлений',
    'next step recommendation': 'Рекомендация следующего шага',
    'client-facing pdf or structured note': 'Документ для клиента (PDF или структурированная заметка)',
};
const INPUT_RU = {
    'verified page url': 'Проверенный URL страницы',
    'verified identity': 'Подтверждённая идентичность компании',
    'verified contact path': 'Подтверждённый контактный путь',
};
const norm = (s) => String(s || '').trim().toLowerCase();
const mapList = (arr, table) => (Array.isArray(arr) ? arr.map((x) => table[norm(x)] || x) : []);

// Build a fully-localized presentation DTO for a product code.
export function productPresentation(code) {
    const p = productById(code);
    if (!p) return null;
    const ru = RU[code] || {};
    return {
        product_code: code,
        product_name_ru: ru.product_name_ru || p.client_name || p.name || code,
        description_ru: ru.description_ru || null,
        scope_ru: ru.scope_ru || [],
        exclusions_ru: ru.exclusions_ru || [],
        required_inputs_ru: ru.required_inputs_ru || mapList(p.evidence_required, INPUT_RU),
        outputs_ru: ru.outputs_ru || mapList(p.deliverables, DELIVERABLE_RU),
        acceptance_criteria_ru: ru.acceptance_criteria_ru || mapList(p.acceptance_criteria, CRITERIA_RU),
        price: p.price?.amount ?? null,
        currency: p.currency || 'RUB',
        // raw machine fields kept for diagnostics (English ok — not owner-facing labels)
        raw_status: p.implementation_readiness || null,
    };
}

export function allPresentations() {
    return { items: catalog().map((p) => productPresentation(p.product_id)).filter(Boolean) };
}

export default { productPresentation, allPresentations };
