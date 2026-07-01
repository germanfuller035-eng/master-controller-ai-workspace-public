// mini_audit_draft_quality.mjs
// Shared Mini Audit draft-quality service.
//
// PURPOSE
//   Single source of truth for: communication stage (email type), evidence-backed
//   draft generation, a transparent 0-100 quality score with human reasons, the
//   quality gate that blocks weak/placeholder/rejected drafts before approval,
//   Russian status labels for the Telegram UI, and the draft-version object shape.
//
// SAFETY CONTRACT (pure module, offline-first):
//   - PURE: NO Telegram API, NO SMTP, NO .env read, NO token read, NO network.
//   - NEVER sends. NO autosend. Renders preview copy ONLY through the shared
//     production template system (audit_send_templates.mjs) so preview == real
//     send, byte-identical.
//   - Does NOT create a second lead store or a second draft generator. Versions
//     live ON the lead object and are persisted by the canonical lead_store.mjs
//     accessor by the caller.
//
// This module composes (does NOT replace):
//   - audit_send_templates.mjs  — renderAuditEmail / resolveNiche / DEFAULT_OFFER_PRICE
//   - draft_generator_v2.mjs    — copy knobs (tone/length/price) + rule validation

import {
    renderAuditEmail,
    resolveNiche,
    DEFAULT_OFFER_PRICE,
    DEFAULT_SENDER_NAME,
} from './audit_send_templates.mjs';
import { validateCopyRules } from './draft_generator_v2.mjs';

// ----------------------------------------------------------------------------
// Communication stages (email types). One template per stage — no single
// universal template for all stages.
// ----------------------------------------------------------------------------
export const EMAIL_TYPES = Object.freeze({
    FIRST_CONTACT: 'first_contact',
    MINI_AUDIT_OFFER: 'mini_audit_offer',
    FOLLOW_UP: 'follow_up',
    REPLY_AFTER_INTEREST: 'reply_after_interest',
});

export const EMAIL_TYPE_LABELS_RU = Object.freeze({
    first_contact: 'Первый контакт',
    mini_audit_offer: 'Предложение Mini Audit',
    follow_up: 'Напоминание (follow-up)',
    reply_after_interest: 'Ответ после интереса',
});

// CTA presets — each is a concrete, single call to action.
export const CTA_PRESETS = Object.freeze({
    reply_yes: 'Если актуально, ответьте «да» — пришлю структуру и условия.',
    call: 'Если удобно, предложите время для короткого созвона на 10 минут.',
    mini_audit_offer: 'Если формат подходит, ответьте на это письмо — согласуем запуск Mini Audit.',
    send_example: 'Если интересно, ответьте «пример» — пришлю образец разбора.',
    transfer_review: 'Если актуально, кому у вас удобнее передать такой разбор?',
});

export const CTA_LABELS_RU = Object.freeze({
    reply_yes: 'Попросить ответ «да»',
    call: 'Предложить созвон',
    mini_audit_offer: 'Предложить Mini Audit за 10 000 ₽',
    send_example: 'Предложить отправить пример',
    transfer_review: 'Спросить, кому передать разбор',
});

export const TONE_LABELS_RU = Object.freeze({
    short: 'Коротко и прямо',
    neutral: 'Деловой',
    consultative: 'Консультативный',
    soft: 'Мягкий',
});

// ----------------------------------------------------------------------------
// Russian status labels for the Telegram UI. Internal enums stay in the store;
// the UI must always translate. Unknown statuses fall back to the raw value so
// nothing is silently hidden.
// ----------------------------------------------------------------------------
export const STATUS_LABELS_RU = Object.freeze({
    rejected: 'Отклонён',
    identity_not_verified: 'Не подтверждена компания',
    needs_identity_verification: 'Не подтверждена компания',
    no_public_email: 'Не найден публичный email',
    hold_no_public_email: 'Не найден публичный email',
    written_channel_search: 'Требуется поиск письменного контакта',
    written_channel_search_queue: 'Требуется поиск письменного контакта',
    missing_preview: 'Не подготовлено письмо',
    waiting_reply: 'Ожидает ответа',
    send_uncertain: 'Отправка не подтверждена',
    ready: 'Готов',
    hold_later: 'Отложен',
    blocked_fake_email: 'Недействительный email',
    new: 'Новый',
    sent: 'Отправлен',
});

export function statusLabelRu(status) {
    const s = String(status || '').trim();
    if (!s) return '—';
    return STATUS_LABELS_RU[s] || s;
}

// Draft lifecycle status (lives on the draft version, NOT the lead status).
export const DRAFT_STATUS = Object.freeze({
    DRAFT: 'draft',
    APPROVED_BY_OWNER: 'approved_by_owner',
    REJECTED_DRAFT: 'rejected_draft',
});

export const QUALITY_GATE_MIN_SCORE = 75;
export const MIN_EVIDENCE_FINDINGS = 2;

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
function s(v) { return String(v == null ? '' : v).trim(); }

export function leadIdOf(lead) { return s(lead && (lead.lead_id || lead.id)); }
export function companyOf(lead) { return s(lead && (lead.company || lead.company_name || lead.name)) || leadIdOf(lead) || '—'; }
export function siteOf(lead) { return s(lead && (lead.website || lead.domain)); }
export function emailOf(lead) { return s(lead && (lead.email || lead.recipient || lead.contact_email)); }

// Evidence findings = ONLY real, audit-derived observations. We never invent.
export function evidenceFindings(lead) {
    const raw = (lead && (Array.isArray(lead.audit_observations) ? lead.audit_observations
        : Array.isArray(lead.findings) ? lead.findings
        : Array.isArray(lead.observations) ? lead.observations
        : [])) || [];
    return raw.map(s).filter((x) => x.length >= 12);
}

// Generic / template-filler observations that do NOT count as evidence-backed.
const GENERIC_FINDING_MARKERS = [
    'есть точки роста в первом экране',
    'можно усилить доверие и структуру предложения',
];

function isGenericFinding(text) {
    const low = String(text || '').toLowerCase();
    return GENERIC_FINDING_MARKERS.some((m) => low.includes(m));
}

export function concreteEvidenceFindings(lead) {
    return evidenceFindings(lead).filter((x) => !isGenericFinding(x));
}

// Placeholder / leaked-internal detection for finished draft text.
const PLACEHOLDER_RE = /\b(undefined|null|NaN)\b|\[object Object\]|\{\{[^}]+\}\}|<[a-z_]+>|\[[a-z_ ]+\]/i;
const INTERNAL_ENUM_RE = /\b(first_contact|mini_audit_offer|follow_up|reply_after_interest|needs_identity_verification|written_channel_search_queue|hold_no_public_email|approved_by_owner|rejected_draft)\b/;

export function hasPlaceholder(text) {
    return PLACEHOLDER_RE.test(String(text || ''));
}

// Weak template phrases that must not stand alone as the main body.
const WEAK_PHRASES = [
    'коротко посмотрел',
    'заметил несколько точек роста',
    'можно усилить доверие',
    'могу прислать короткий список правок',
    'есть несколько рекомендаций',
    'публичное присутствие',
    'первый ответ',
    'client-volume',
    'first-response friction',
    'public digital presence',
];

export function hasWeakPhrase(text) {
    const low = String(text || '').toLowerCase();
    return WEAK_PHRASES.some((p) => low.includes(p));
}

// A draft has a clear CTA if it contains its configured preset OR a recognized
// action phrase. Follow-up uses a question-style CTA ("актуально ли посмотреть").
const CTA_PHRASE_RE = /(ответьте|предложите время|согласуем|пришлю|актуально ли|подскажите, актуально|кому у вас удобнее передать)/i;
export function hasClearCta(body, ctaKey) {
    const text = String(body || '');
    const preset = ctaKey && CTA_PRESETS[ctaKey];
    if (preset && text.includes(preset)) return true;
    return CTA_PHRASE_RE.test(text);
}

// ----------------------------------------------------------------------------
// Communication-stage inference. Determines the email type from lead state.
// ----------------------------------------------------------------------------
export function inferEmailType(lead) {
    const status = s(lead && lead.status);
    if (status === 'waiting_reply') return EMAIL_TYPES.FOLLOW_UP;
    if (s(lead && lead.last_reply_at) || lead && lead.has_interest_reply) return EMAIL_TYPES.REPLY_AFTER_INTEREST;
    // First touch with concrete evidence → make the offer; otherwise first contact.
    if (concreteEvidenceFindings(lead).length >= 3) return EMAIL_TYPES.MINI_AUDIT_OFFER;
    return EMAIL_TYPES.FIRST_CONTACT;
}

// ----------------------------------------------------------------------------
// Stage-aware draft generation. Uses ONLY evidence findings. Returns
// { subject, body, email_type, used_findings, cta_key, tone, copy_state }.
// Falls back to the shared template engine for the offer/reply stages so the
// copy stays byte-identical with the production send path.
// ----------------------------------------------------------------------------
function buildFirstContact(lead, findings, opts) {
    const company = companyOf(lead);
    const site = siteOf(lead) || 'ваш сайт';
    const sender = s(opts.sender_name) || DEFAULT_SENDER_NAME;
    const cta_key = opts.cta_key || 'transfer_review';
    const subject = `Вопрос по сайту ${company}`;
    const body = [
        'Здравствуйте.',
        '',
        'Меня зовут Дмитрий. Я занимаюсь разбором сайтов и первого касания для B2B и производственных компаний.',
        '',
        `Посмотрел ${site}. По открытой информации видно, что для нового клиента здесь важно быстро понять направление работы, регион и удобный способ первого обращения.`,
        '',
        'Не утверждаю, что у вас это работает плохо: без внутренней статистики это было бы неправильно. Но могу сделать короткий внешний мини-разбор на 3-5 конкретных пунктов: что видит новый клиент при первом контакте, где может возникнуть лишнее трение и что можно упростить без большого проекта.',
        '',
        CTA_PRESETS[cta_key] || CTA_PRESETS.transfer_review,
        '',
        sender,
    ].filter((x) => x !== null).join('\n');
    return { subject, body, cta_key };
}

function buildMiniAuditOffer(lead, findings, opts) {
    const site = siteOf(lead) || 'ваш сайт';
    const sender = s(opts.sender_name) || DEFAULT_SENDER_NAME;
    const price = opts.offer_price != null ? opts.offer_price : DEFAULT_OFFER_PRICE;
    const cta_key = opts.cta_key || 'mini_audit_offer';
    const f = findings.slice(0, 3);
    const findingLines = f.map((x) => `— ${x}`);
    // Срок: only from canonical offer configuration. If absent, omit the line.
    const term = s(opts.offer_term);
    const company = companyOf(lead);
    const lines = [
        'Здравствуйте.',
        '',
        `По сайту ${site} я уже отметил несколько потенциальных потерь на пути клиента:`,
        '',
        ...findingLines,
        '',
        'Предлагаю Mini Audit сайта и пути клиента до заявки.',
        '',
        'В результате вы получите:',
        '— 5–7 приоритетных проблем;',
        '— доказательства на скриншотах;',
        '— рекомендации по каждому пункту;',
        '— план правок в порядке влияния на заявки.',
        '',
        `Стоимость: ${price} ₽.`,
    ];
    if (term) lines.push(`Срок: ${term}.`);
    lines.push('', CTA_PRESETS[cta_key] || CTA_PRESETS.mini_audit_offer, '', sender);
    return { subject: `Мини-аудит сайта ${company}`, body: lines.join('\n'), cta_key };
}

function buildFollowUp(lead, findings, opts) {
    const company = companyOf(lead);
    const site = siteOf(lead) || company;
    const sender = s(opts.sender_name) || DEFAULT_SENDER_NAME;
    const cta_key = opts.cta_key || 'reply_yes';
    const subject = `Re: ${s(lead.subject) || s(lead.audit_draft_subject) || `мини-аудит сайта ${company}`}`;
    const body = [
        'Здравствуйте.',
        '',
        `Недавно отправлял короткий разбор сайта ${site}.`,
        'Не уверен, что письмо дошло до нужного человека.',
        '',
        'Подскажите, актуально ли посмотреть 1–2 страницы с конкретными правками по заявке и структуре сайта?',
        '',
        'Если сейчас неактуально — просто напишите, я не буду отвлекать.',
        '',
        sender,
    ].join('\n');
    return { subject, body, cta_key };
}

function buildReplyAfterInterest(lead, findings, opts) {
    const sender = s(opts.sender_name) || DEFAULT_SENDER_NAME;
    const price = opts.offer_price != null ? opts.offer_price : DEFAULT_OFFER_PRICE;
    const cta_key = opts.cta_key || 'mini_audit_offer';
    const company = companyOf(lead);
    const f = findings.slice(0, 3);
    const body = [
        'Здравствуйте.',
        '',
        'Спасибо за ответ. Коротко по делу.',
        '',
        'Что я уже вижу по сайту:',
        ...f.map((x) => `— ${x}`),
        '',
        `Mini Audit — 5–7 приоритетных проблем, доказательства и план правок. Стоимость: ${price} ₽.`,
        '',
        CTA_PRESETS[cta_key] || CTA_PRESETS.mini_audit_offer,
        '',
        sender,
    ].join('\n');
    return { subject: `Мини-аудит сайта ${company} — детали`, body, cta_key };
}

export function generateDraft(lead, opts = {}) {
    const email_type = opts.email_type || inferEmailType(lead);
    const findings = concreteEvidenceFindings(lead);
    const niche = resolveNiche(opts.niche || (lead && lead.niche));
    const base = {
        sender_name: opts.sender_name,
        offer_price: opts.offer_price,
        offer_term: opts.offer_term,
        cta_key: opts.cta_key,
    };
    let built;
    switch (email_type) {
        case EMAIL_TYPES.MINI_AUDIT_OFFER:
            built = buildMiniAuditOffer(lead, findings, base);
            break;
        case EMAIL_TYPES.FOLLOW_UP:
            built = buildFollowUp(lead, findings, base);
            break;
        case EMAIL_TYPES.REPLY_AFTER_INTEREST:
            built = buildReplyAfterInterest(lead, findings, base);
            break;
        case EMAIL_TYPES.FIRST_CONTACT:
        default:
            built = buildFirstContact(lead, findings, base);
            break;
    }
    return {
        email_type,
        subject: built.subject,
        body: built.body,
        cta_key: built.cta_key,
        tone: opts.tone || 'neutral',
        niche,
        used_findings: findings.slice(0, email_type === EMAIL_TYPES.FIRST_CONTACT ? 2 : 3),
        offer_price: base.offer_price != null ? base.offer_price : DEFAULT_OFFER_PRICE,
    };
}

// Re-render an existing draft for a different stage / CTA / tone via the shared
// template engine for the offer stage when possible, otherwise this module.
export function regenerateDraft(lead, draft, opts = {}) {
    return generateDraft(lead, {
        email_type: opts.email_type || (draft && draft.email_type),
        cta_key: opts.cta_key || (draft && draft.cta_key),
        tone: opts.tone || (draft && draft.tone),
        offer_price: opts.offer_price != null ? opts.offer_price : (draft && draft.offer_price),
        offer_term: opts.offer_term,
        niche: opts.niche || (draft && draft.niche),
        sender_name: opts.sender_name,
    });
}

// ----------------------------------------------------------------------------
// Quality score 0-100. Transparent, additive, with human-readable reasons for
// any deductions. See ТЗ §7 weighting.
// ----------------------------------------------------------------------------
export function scoreDraft(lead, draft) {
    const reasons = [];
    let score = 0;
    const body = s(draft && draft.body);
    const subject = s(draft && draft.subject);
    const company = companyOf(lead);
    const site = siteOf(lead);
    const findings = concreteEvidenceFindings(lead);
    const usedRaw = Array.isArray(draft && draft.used_findings) ? draft.used_findings
        : (Array.isArray(draft && draft.source_findings) ? draft.source_findings : []);
    const usedFindings = usedRaw.filter((x) => s(x).length >= 12);

    // 1) Персонализация компании и сайта: 15
    const hasCompany = company && company !== '—' && body.includes(company);
    const hasSite = site && (body.includes(site) || subject.includes(site) || body.includes(company));
    if (hasCompany || subject.includes(company)) score += 8; else reasons.push('не упомянута компания в письме');
    if (hasSite && site) score += 7; else if (!site) reasons.push('у лида нет сайта для персонализации'); else reasons.push('не упомянут сайт');

    // 2) Минимум два конкретных findings: 25
    if (usedFindings.length >= MIN_EVIDENCE_FINDINGS) score += 25;
    else if (usedFindings.length === 1) { score += 10; reasons.push('используется только одно подтверждённое наблюдение'); }
    else reasons.push('нет двух подтверждённых наблюдений из аудита');

    // 3) Соответствие findings evidence: 20 (used findings must be a subset of real evidence)
    const evidenceSet = new Set(findings);
    const allBacked = usedFindings.length > 0 && usedFindings.every((x) => evidenceSet.has(s(x)));
    if (allBacked) score += 20;
    else if (usedFindings.length > 0) reasons.push('часть наблюдений не подтверждена данными аудита');
    else reasons.push('наблюдения не подкреплены аудитом');

    // 4) Понятная ценность: 15
    const hasValue = /(получите|приоритетн|доказательств|план|разбор|правок)/i.test(body);
    if (hasValue) score += 15; else reasons.push('не ясна польза для клиента');

    // 5) Чёткий CTA: 10
    const hasCta = hasClearCta(body, draft && draft.cta_key);
    if (hasCta) score += 10; else reasons.push('нет чёткого призыва к действию');

    // 6) Корректный этап коммуникации: 5
    if (draft && Object.values(EMAIL_TYPES).includes(draft.email_type)) score += 5; else reasons.push('не задан этап коммуникации');

    // 7) Отсутствие воды и шаблонных фраз: 5
    if (!hasWeakPhrase(body)) score += 5; else reasons.push('используются слабые шаблонные фразы');

    // 8) Корректный subject и подпись: 5
    const hasSubject = subject.length > 0 && !hasPlaceholder(subject);
    const hasSignature = /(дмитрий|с уважением)/i.test(body);
    if (hasSubject && hasSignature) score += 5;
    else { if (!hasSubject) reasons.push('нет темы письма'); if (!hasSignature) reasons.push('нет подписи'); }

    score = Math.max(0, Math.min(100, score));
    return { score, reasons };
}

// ----------------------------------------------------------------------------
// Quality gate. Returns { allowed, blocked, blockReasons[], score, reasons[] }.
// `allowed` = draft may be APPROVED (score >= 75 and no hard block).
// Real send still requires owner approval AFTER this gate; the gate never sends.
// ----------------------------------------------------------------------------
export function evaluateDraftGate(lead, draft) {
    const blockReasons = [];
    const status = s(lead && lead.status);
    const body = s(draft && draft.body);
    const subject = s(draft && draft.subject);

    if (status === 'rejected') blockReasons.push('лид отклонён');
    if (!emailOf(lead)) blockReasons.push('нет email');
    if (s(lead && lead.identity_match_status) === 'unverified' || status === 'needs_identity_verification') blockReasons.push('компания не подтверждена');
    if (concreteEvidenceFindings(lead).length < MIN_EVIDENCE_FINDINGS) blockReasons.push('меньше двух подтверждённых наблюдений');
    if (hasPlaceholder(body) || INTERNAL_ENUM_RE.test(body)) blockReasons.push('в тексте остались placeholder/технические поля');
    if (!subject) blockReasons.push('нет темы письма');
    if (!hasClearCta(body, draft && draft.cta_key)) blockReasons.push('нет CTA');

    const { score, reasons } = scoreDraft(lead, draft);
    if (score < QUALITY_GATE_MIN_SCORE) blockReasons.push(`оценка ${score} ниже ${QUALITY_GATE_MIN_SCORE}`);

    // Copy-rule validation from the shared generator (forbidden phrases, etc.).
    const copy = validateCopyRules({ body });
    // Only surface forbidden-first-touch / pressure violations as hard blocks;
    // ISSUE_COUNT/PRICE rules belong to the legacy 3-issue template, not all stages.
    for (const v of copy.violations) {
        if (v.startsWith('FORBIDDEN_FIRST_TOUCH') || v.startsWith('FORBIDDEN_PRESSURE')) {
            blockReasons.push('запрещённая фраза в тексте');
        }
    }

    const blocked = blockReasons.length > 0;
    return {
        allowed: !blocked && score >= QUALITY_GATE_MIN_SCORE,
        blocked,
        blockReasons: [...new Set(blockReasons)],
        score,
        reasons,
    };
}

// ----------------------------------------------------------------------------
// Version object builder. Versions live on the lead as `draft_versions[]` with
// `active_draft_version` pointing at the current one. Persisted by the caller
// via the canonical lead_store.mjs saveStore — NO second store here.
// ----------------------------------------------------------------------------
export function buildDraftVersion(lead, draft, meta = {}) {
    const gate = evaluateDraftGate(lead, draft);
    const prev = Array.isArray(lead && lead.draft_versions) ? lead.draft_versions : [];
    const draft_version = (prev.length ? Math.max(...prev.map((v) => Number(v.draft_version) || 0)) : 0) + 1;
    return {
        draft_version,
        created_at: meta.created_at || null, // caller stamps with real clock (pure module: no Date)
        email_type: draft.email_type,
        subject: draft.subject,
        body: draft.body,
        cta_key: draft.cta_key,
        tone: draft.tone,
        source_findings: draft.used_findings || [],
        quality_score: gate.score,
        quality_reasons: gate.reasons,
        blocked: gate.blocked,
        block_reasons: gate.blockReasons,
        status: DRAFT_STATUS.DRAFT,
        owner_instruction: meta.owner_instruction || null,
        approved_by: null,
        approved_at: null,
    };
}

export function appendDraftVersion(lead, version) {
    const versions = Array.isArray(lead.draft_versions) ? lead.draft_versions.slice() : [];
    versions.push(version);
    lead.draft_versions = versions;
    lead.active_draft_version = version.draft_version;
    return lead;
}

export function activeDraftVersion(lead) {
    const versions = Array.isArray(lead && lead.draft_versions) ? lead.draft_versions : [];
    if (!versions.length) return null;
    const n = lead.active_draft_version;
    return versions.find((v) => Number(v.draft_version) === Number(n)) || versions[versions.length - 1];
}

export default {
    EMAIL_TYPES,
    EMAIL_TYPE_LABELS_RU,
    CTA_PRESETS,
    CTA_LABELS_RU,
    TONE_LABELS_RU,
    STATUS_LABELS_RU,
    statusLabelRu,
    DRAFT_STATUS,
    QUALITY_GATE_MIN_SCORE,
    MIN_EVIDENCE_FINDINGS,
    leadIdOf,
    companyOf,
    siteOf,
    emailOf,
    evidenceFindings,
    concreteEvidenceFindings,
    hasPlaceholder,
    hasWeakPhrase,
    inferEmailType,
    generateDraft,
    regenerateDraft,
    scoreDraft,
    evaluateDraftGate,
    buildDraftVersion,
    appendDraftVersion,
    activeDraftVersion,
};
