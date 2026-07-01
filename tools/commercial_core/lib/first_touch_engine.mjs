// tools/commercial_core/lib/first_touch_engine.mjs
// First Touch Strategist core: deterministic Hook Engine + message composer + quality scorer +
// uniqueness + compliance classifier. PURE (no network, no LLM, no fs, no send). The API layer wires
// canonical lead/audit/contact/commercial-truth into these functions and persists artifacts via the
// single canonical writer. Every artifact stays no-send.
import crypto from 'node:crypto';

export const ARTIFACT_TYPE = 'FIRST_TOUCH';
export const SCHEMA_VERSION = 'first_touch_v1';

export const HOOK_TYPES = [
    'REQUEST_PATH_FRICTION', 'FORM_FRICTION', 'UNCLEAR_RESPONSE_TIME', 'WEAK_PRIMARY_CTA',
    'CATALOG_TO_REQUEST_GAP', 'MOBILE_CONVERSION_FRICTION', 'TRUST_GAP', 'WEAK_VALUE_PROPOSITION',
    'CONTACT_DISCOVERY_FRICTION', 'LOCAL_PRESENCE_GAP', 'MISSING_PROOF', 'OUTDATED_CONTENT',
    'NO_WEBSITE', 'WEAK_WEBSITE', 'SEARCH_VISIBILITY_GAP',
];

// Positive facts that may be evidence signals but MUST NOT be a primary hook.
const FORBIDDEN_PRIMARY = [/есть контакт/i, /есть каталог/i, /есть форм/i, /есть телефон/i, /сайт работает/i, /компания существует/i];

// Generic spammy phrases rejected by default.
const GENERIC_PHRASES = [
    /хотим предложить сотрудничеств/i, /молодая динамично развивающаяся/i, /увеличим ваши продажи/i,
    /нашли несколько точек роста/i, /уникальное предложение/i, /выгодные услови/i, /лидер рынка/i,
    /гарантированный результат/i, /коммерческое предложение во вложении/i, /уделите 15 минут/i,
    /публичное присутствие/i, /первый ответ/i,
];

const FIRST_TOUCH_REQUIRED = [
    { id: 'human_intro', re: /меня зовут дмитрий/i },
    { id: 'what_i_do', re: /разбор|разбираю/i },
    { id: 'first_touch_context', re: /первого касания|первое касание/i },
    { id: 'visible_site_context', re: /посмотрел сайт|посмотрел страницу|посмотрел вашу страницу\/сайт/i },
    { id: 'caveat_no_certainty', re: /не утверждаю|не делаю вывод/i },
    { id: 'mini_review_3_5_points', re: /3[-–]5/ },
    { id: 'low_pressure_transfer_cta', re: /кому у вас удобнее передать/i },
];

const FORBIDDEN_FIRST_TOUCH_CLAIMS = [
    { id: 'abstract_public_presence', re: /public digital presence|публичное присутствие/i },
    { id: 'abstract_first_response', re: /first-response friction|первый ответ/i },
    { id: 'client_volume_claim', re: /client-volume|объ[её]м клиент/i },
    { id: 'roi_claim', re: /\bROI\b|окупаемост|payback/i },
    { id: 'conversion_claim', re: /\bconversion\b|конверс/i },
    { id: 'traffic_claim', re: /\btraffic\b|трафик/i },
    { id: 'growth_claim', re: /\bgrowth\b|рост продаж|увеличим продажи/i },
    { id: 'fake_certainty', re: /нашли у вас проблему|точно есть проблема|вы теряете|\d+\s*%/i },
    { id: 'price_or_payment', re: /\d[\d\s]*₽|\d+\s*руб|payment request|оплат/i },
    { id: 'contract_pressure', re: /договор|выставить\s+сч[её]т|оплатить|оплата|запуск mini audit|согласуем запуск/i },
];

// Map an audit observation (evidence text) to a hook type + business impact (no invented numbers).
function deriveHook(obs, lead, productId) {
    const t = String(obs.evidence_text || obs.title || '').toLowerCase();
    let hook_type = 'WEAK_WEBSITE', business_impact = 'новому посетителю может быть сложнее понять следующий шаг';
    if (/заявк|форм|обращени|расчёт|расчет/.test(t)) { hook_type = 'REQUEST_PATH_FRICTION'; business_impact = 'часть посетителей может отложить обращение из-за неясного пути до заявки'; }
    else if (/каталог|товар|продукц/.test(t)) { hook_type = 'CATALOG_TO_REQUEST_GAP'; business_impact = 'путь от каталога до заявки требует от клиента лишнего решения'; }
    else if (/контакт|email|почта|телефон|связ/.test(t)) { hook_type = 'CONTACT_DISCOVERY_FRICTION'; business_impact = 'клиенту сложнее быстро найти нужный способ связи'; }
    else if (/мобиль|телефон.?верс|адаптив/.test(t)) { hook_type = 'MOBILE_CONVERSION_FRICTION'; business_impact = 'на телефоне путь до обращения может быть менее удобным'; }
    else if (/довер|отзыв|кейс|сертифик|гаранти/.test(t)) { hook_type = 'TRUST_GAP'; business_impact = 'новому посетителю не хватает подтверждения доверия'; }
    else if (/срок|время|ответ|реакц/.test(t)) { hook_type = 'UNCLEAR_RESPONSE_TIME'; business_impact = 'клиенту неясно, когда будет получен ответ или расчёт'; }
    return { hook_type, business_impact };
}

// Score a hook candidate (deterministic). Returns {score, breakdown, gate_pass, reasons}.
export function scoreHook(candidate) {
    const c = candidate; const r = [];
    const evidenceStrength = (c.evidence_url && c.evidence_text) ? (c.is_inferred ? 18 : 25) : 0;
    if (!evidenceStrength) r.push('no_evidence');
    const businessRelevance = c.business_impact && !/\d+\s*%|\bв два раза\b|теряете/.test(c.business_impact) ? 18 : (c.business_impact ? 8 : 0);
    if (/\d+\s*%|теряете|в два раза/.test(String(c.business_impact))) r.push('invented_impact');
    const specificity = c.company_specific ? 14 : 6;
    const replyPotential = 13; const curiosity = 8; const productRel = c.product_relevant ? 10 : 4;
    let risk = 0;
    if (FORBIDDEN_PRIMARY.some((re) => re.test(String(c.title || c.evidence_text || '')))) { risk -= 25; r.push('forbidden_primary_hook'); }
    if (c.unsupported_claims > 0) { risk -= 25; r.push('unsupported_claims'); }
    if (c.guessed_data > 0) { risk -= 25; r.push('guessed_data'); }
    const score = evidenceStrength + businessRelevance + specificity + replyPotential + curiosity + productRel + risk;
    const evidencePct = evidenceStrength / 25;
    const gate_pass = score >= 75 && evidencePct >= 0.9 && (c.unsupported_claims || 0) === 0 && (c.guessed_data || 0) === 0
        && !FORBIDDEN_PRIMARY.some((re) => re.test(String(c.title || c.evidence_text || '')));
    return { score, breakdown: { evidenceStrength, businessRelevance, specificity, replyPotential, curiosity, productRel, risk }, evidence_pct: evidencePct, gate_pass, reasons: r };
}

// Choose the best hook from audit findings (deterministic tie-break by score then finding_id).
export function selectHook(findings, lead, productId) {
    const candidates = (findings || []).map((f) => {
        const d = deriveHook(f, lead, productId);
        const cand = {
            hook_type: d.hook_type, title: f.title, finding_id: f.finding_id,
            evidence_url: f.evidence_url, evidence_text: f.evidence_text, observed_at: f.observed_at,
            business_impact: d.business_impact, impact_confidence: f.confidence ?? 0.6,
            is_inferred: f.is_inferred === true, company_specific: true, product_relevant: true,
            unsupported_claims: 0, guessed_data: 0,
        };
        cand.scored = scoreHook(cand);
        return cand;
    }).filter((c) => c.evidence_url && c.evidence_text);
    candidates.sort((a, b) => (b.scored.score - a.scored.score) || String(a.finding_id).localeCompare(String(b.finding_id)));
    const primary = candidates[0] || null;
    const supporting = candidates[1] || null;
    return { primary, supporting, candidates };
}

// Compose subject variants (<=55 chars, no clickbait/RE/CAPS/emoji).
export function composeSubjects(company, hook) {
    const seg = hook?.hook_type === 'REQUEST_PATH_FRICTION' ? 'пути до заявки'
        : hook?.hook_type === 'CATALOG_TO_REQUEST_GAP' ? 'каталогу и заявке'
            : hook?.hook_type === 'TRUST_GAP' ? 'доверию на сайте' : 'сайту';
    const raw = [
        { id: 'subj_a', text: `Наблюдение по ${seg}`.slice(0, 55), kind: 'observation' },
        { id: 'subj_b', text: `Вопрос по сайту ${company}`.slice(0, 55), kind: 'neutral_question' },
        { id: 'subj_c', text: `Короткий разбор сайта ${company}`.slice(0, 55), kind: 'site_mention' },
    ];
    return raw.map((s) => ({ ...s, score: scoreSubject(s.text), risk_flags: subjectRisks(s.text), reason: s.kind }));
}
function subjectRisks(t) {
    const f = [];
    if (/^(re|fwd):/i.test(t)) f.push('false_thread');
    if (t === t.toUpperCase() && /[А-ЯA-Z]{4,}/.test(t)) f.push('caps');
    if (/[\u{1F300}-\u{1FAFF}☀-➿]/u.test(t)) f.push('emoji');
    if (/беспла|срочно|акция|!!!/i.test(t)) f.push('spam_risk');
    if (t.length > 55) f.push('too_long');
    return f;
}
function scoreSubject(t) {
    let s = 100; if (t.length > 55) s -= 30; if (subjectRisks(t).length) s -= 20 * subjectRisks(t).length; return Math.max(0, s);
}

// Compose body variants (70-120 words, exactly 1 CTA, <=1 question, 0 links/price/tracking).
export function composeBodies(company, hook, supporting) {
    const segment = segmentLine(hook);
    const a = `Здравствуйте.\n\nМеня зовут Дмитрий. Я занимаюсь разбором сайтов и первого касания для B2B и производственных компаний.\n\nПосмотрел сайт ${company}. По открытой информации видно, что ${segment}.\n\nНе утверждаю, что у вас это работает плохо: без внутренней статистики это было бы неправильно. Но могу сделать короткий внешний мини-разбор на 3-5 конкретных пунктов: что видит новый клиент при первом контакте, где может возникнуть лишнее трение и что можно упростить без большого проекта.\n\nЕсли актуально, кому у вас удобнее передать такой разбор?`;
    const b = `Здравствуйте.\n\nМеня зовут Дмитрий. Я разбираю сайты и первое касание глазами B2B-клиента, который впервые выбирает поставщика.\n\nПосмотрел сайт ${company}. В таких компаниях обычно важно, чтобы человек без лишних шагов понял направление работы, регион и способ запросить расчет или консультацию.\n\nЯ не делаю вывод, что у вас есть проблема: снаружи это нельзя утверждать. Могу подготовить небольшой внешний разбор на 3-5 пунктов: что видно при первом контакте, где может появиться трение и какие простые правки стоит проверить вручную.\n\nЕсли актуально, кому у вас удобнее передать такой разбор?`;
    return [
        { id: 'body_a', text: a, kind: 'problem_consequence_permission' },
        { id: 'body_b', text: b, kind: 'observation_curiosity_permission' },
    ].map((v) => ({ ...v, metrics: bodyMetrics(v.text) }));
}
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
function segmentLine(hook) {
    const ht = hook?.hook_type || '';
    if (ht === 'CATALOG_TO_REQUEST_GAP' || ht === 'REQUEST_PATH_FRICTION') {
        return 'для нового клиента важно быстро понять, что можно заказать, по какому региону вы работаете и как удобнее запросить расчет или консультацию';
    }
    if (ht === 'CONTACT_DISCOVERY_FRICTION' || ht === 'UNCLEAR_RESPONSE_TIME') {
        return 'для нового клиента важно быстро понять, кто ответит на запрос и куда удобнее передать обращение';
    }
    if (ht === 'TRUST_GAP') {
        return 'для нового клиента важно быстро понять профиль компании, подтверждения доверия и безопасный следующий шаг';
    }
    return 'для нового клиента важно быстро понять направление работы, регион и удобный способ первого обращения';
}
function bodyMetrics(t) {
    const words = (t.trim().match(/\S+/g) || []).length;
    const questions = (t.match(/\?/g) || []).length;
    const exclaims = (t.match(/!/g) || []).length;
    const links = (t.match(/https?:\/\//g) || []).length;
    const price = /\d[\d\s]*₽|\d+\s*руб|10\s*000/i.test(t);
    const cta = (t.match(/прислать|пришлю|отправить ответным|кому у вас удобнее передать|передать такой разбор/gi) || []).length;
    return { word_count: words, questions, exclaims, links, has_price: price, cta_count: Math.min(cta, 1) || (cta > 0 ? 1 : (questions > 0 ? 1 : 0)) };
}

export function bodySafetyRisks(text) {
    const t = String(text || '');
    const risks = [];
    for (const req of FIRST_TOUCH_REQUIRED) if (!req.re.test(t)) risks.push(`missing_${req.id}`);
    for (const bad of FORBIDDEN_FIRST_TOUCH_CLAIMS) if (bad.re.test(t)) risks.push(`forbidden_${bad.id}`);
    return risks;
}

// Deterministic similarity (word-shingle Jaccard) between two texts.
export function similarity(a, b) {
    const sh = (t) => { const w = String(t).toLowerCase().replace(/[^\wа-я\s]/gi, ' ').split(/\s+/).filter(Boolean); const s = new Set(); for (let i = 0; i < w.length - 1; i++) s.add(w[i] + ' ' + w[i + 1]); return s; };
    const A = sh(a), B = sh(b); if (!A.size || !B.size) return 0;
    let inter = 0; for (const x of A) if (B.has(x)) inter++;
    return inter / (A.size + B.size - inter);
}

// Quality scorer (0-100) with auto-fail conditions and the production gate.
export function scoreQuality({ hook, hookScore, body, contactEvidenced, priorCommercialSend, priorOptOut, maxSimilarity }) {
    const m = body.metrics; const fail = [];
    const bodyRisks = bodySafetyRisks(body.text);
    if ((hook?.unsupported_claims || 0) > 0) fail.push('unsupported_claim');
    if ((hook?.guessed_data || 0) > 0) fail.push('guessed_data');
    if (!hook?.evidence_url) fail.push('missing_evidence_url');
    if (priorCommercialSend) fail.push('prior_commercial_send');
    if (priorOptOut) fail.push('prior_opt_out');
    if (!contactEvidenced) fail.push('contact_not_evidenced');
    fail.push(...bodyRisks);
    let penalty = 0;
    if (m.cta_count !== 1) penalty -= 15;
    if (m.word_count < 70 || m.word_count > 120) penalty -= 10;
    if (m.has_price) penalty -= 5;
    if (m.links > 0) penalty -= 5;
    if (m.questions > 1) penalty -= 5;
    if (m.exclaims > 0) penalty -= 5;
    if ((maxSimilarity || 0) >= 0.75) penalty -= 15;
    if (GENERIC_PHRASES.some((re) => re.test(body.text))) penalty -= 10;
    if (bodyRisks.length) penalty -= 25;
    const evidence = hook?.evidence_url ? 20 : 0;
    const hookStrength = Math.min(20, Math.round((hookScore || 0) / 5));
    const businessRel = hook?.business_impact ? 15 : 0;
    const personalization = 15; const clarity = 10; const ctaQ = m.cta_count === 1 ? 10 : 0;
    const humanTone = m.exclaims === 0 ? 5 : 0; const deliverability = (m.links === 0 && !m.has_price) ? 5 : 0;
    const total = Math.max(0, Math.min(100, evidence + hookStrength + businessRel + personalization + clarity + ctaQ + humanTone + deliverability + penalty));
    const gate_result = fail.length === 0 && total >= 85 && evidence >= 20 && (hookScore || 0) >= 80
        && m.cta_count === 1 && m.word_count >= 70 && m.word_count <= 120 && contactEvidenced ? 'PASS' : 'FAIL';
    return {
        total_score: total, evidence_score: evidence, hook_score: hookScore || 0, business_relevance_score: businessRel,
        personalization_score: personalization, clarity_score: clarity, cta_score: ctaQ, human_tone_score: humanTone,
        deliverability_score: deliverability, risk_penalty: penalty, gate_result, failure_reasons: fail,
    };
}

export function contentHash(obj) {
    return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 32);
}

export default { ARTIFACT_TYPE, SCHEMA_VERSION, HOOK_TYPES, selectHook, scoreHook, composeSubjects, composeBodies, similarity, scoreQuality, contentHash };
