// draft_generator_v2.mjs
// Block 4 — Draft Generator v2. Strong, niche-aware outbound copy with tone /
// length / price modifiers.
//
// SAFETY CONTRACT (pure module, offline-first):
//   - PURE: NO Telegram API, NO SMTP, NO .env read, NO token read, NO network.
//   - NEVER sends. NO autosend. NO write to 13_sales during build/test.
//   - Renders preview copy ONLY, through the shared production template system
//     (audit_send_templates.mjs) so preview == real send, byte-identical.
//   - Real-contact gate / approval buttons stay owned by the draft center; this
//     module only transforms draft "knobs" (niche, tone, length, offer_price)
//     and re-renders.
//
// Commands (Block 4):
//   /draft_regenerate          -> re-render current draft (e.g. after audit issues changed)
//   /draft_shorter             -> length = 'short'
//   /draft_stronger            -> tone = 'strong'
//   /draft_soft                -> tone = 'soft'
//   /draft_price <number>      -> offer_price = <number>
//
// Copywriting rules enforced/validated:
//   - exactly 3 concrete issues;
//   - default price 10 000 ₽;
//   - short CTA;
//   - NO "Ранее писал" in a first touch;
//   - NO pressure / deadlines.

import {
    renderAuditEmail,
    resolveNiche,
    DEFAULT_OFFER_PRICE,
} from './audit_send_templates.mjs';

// Phrases that must NEVER appear in a first-touch outbound email.
export const FORBIDDEN_FIRST_TOUCH = [
    'ранее писал',
    'ранее уже писал',
    'писал вам ранее',
    'напоминаю о письме',
    'повторно пишу',
    'public digital presence',
    'first-response friction',
    'client-volume',
    'публичное присутствие',
    'первый ответ',
    'нашли у вас проблему',
    'точно есть проблема',
    'вы теряете',
];

// Pressure / deadline phrases that violate the "no pressure" rule.
export const FORBIDDEN_PRESSURE = [
    'срочно',
    'только сегодня',
    'только сейчас',
    'успейте',
    'последний шанс',
    'осталось мало',
    'не упустите',
    'горящ',
    'дедлайн',
];

// ----------------------------------------------------------------------------
// Command classification
// ----------------------------------------------------------------------------
export function classifyDraftModifier(rawText) {
    if (rawText == null) return null;
    const t = String(rawText).trim().toLowerCase();
    if (!t) return null;

    if (t === '/draft_regenerate' || t === 'перегенерировать' || t === 'пересоздать письмо') {
        return { action: 'regenerate' };
    }
    if (t === '/draft_shorter' || t === 'короче') {
        return { action: 'set_length', length: 'short' };
    }
    if (t === '/draft_stronger' || t === 'сильнее' || t === 'жёстче' || t === 'жестче') {
        return { action: 'set_tone', tone: 'strong' };
    }
    if (t === '/draft_soft' || t === 'мягче' || t === 'помягче') {
        return { action: 'set_tone', tone: 'soft' };
    }

    const m = t.match(/^\/draft_price\s+(\d[\d\s]*)$/i);
    if (m) {
        const price = parseInt(m[1].replace(/\s+/g, ''), 10);
        if (Number.isFinite(price) && price > 0) {
            return { action: 'set_price', offer_price: price };
        }
        return { action: 'set_price', offer_price: DEFAULT_OFFER_PRICE };
    }
    // RU phrase: "цена 10000"
    const mr = t.match(/^цена\s+(\d[\d\s]*)$/i);
    if (mr) {
        const price = parseInt(mr[1].replace(/\s+/g, ''), 10);
        if (Number.isFinite(price) && price > 0) {
            return { action: 'set_price', offer_price: price };
        }
    }

    return null;
}

// ----------------------------------------------------------------------------
// Knob state — the minimal set of variables that drive rendering. Stored on the
// draft object as draft.copy_state so modifiers are composable across commands.
// ----------------------------------------------------------------------------
export function defaultCopyState(seed = {}) {
    return {
        niche: resolveNiche(seed.niche),
        tone: seed.tone || 'neutral',
        length: seed.length || 'normal',
        offer_price: seed.offer_price != null ? seed.offer_price : DEFAULT_OFFER_PRICE,
        issues: Array.isArray(seed.issues) ? seed.issues.slice(0, 3) : undefined,
        site: seed.site,
        company: seed.company,
        sender_name: seed.sender_name,
    };
}

// Apply a classified modifier to a copy_state, returning a NEW state object.
export function applyModifierToState(state, modifier) {
    const next = { ...defaultCopyState(state) };
    if (!modifier) return next;
    switch (modifier.action) {
        case 'set_length':
            next.length = modifier.length;
            break;
        case 'set_tone':
            next.tone = modifier.tone;
            break;
        case 'set_price':
            next.offer_price = modifier.offer_price;
            break;
        case 'regenerate':
            // no knob change; caller may refresh issues from audit before render
            break;
        default:
            break;
    }
    return next;
}

// ----------------------------------------------------------------------------
// Render copy from a copy_state via the shared template system.
// Returns { subject, body, niche, vars, copy_state }.
// ----------------------------------------------------------------------------
export function renderFromState(state) {
    const s = defaultCopyState(state);
    const rendered = renderAuditEmail({
        company: s.company,
        site: s.site,
        niche: s.niche,
        issues: s.issues,
        offer_price: s.offer_price,
        sender_name: s.sender_name,
        tone: s.tone,
        length: s.length,
    });
    return { ...rendered, copy_state: { ...s, niche: rendered.niche } };
}

// ----------------------------------------------------------------------------
// Rule validation — used by tests and (optionally) as a guard before send.
// Returns { ok, violations: [] }.
// ----------------------------------------------------------------------------
export function validateCopyRules(rendered) {
    const violations = [];
    const body = String(rendered && rendered.body ? rendered.body : '');
    const low = body.toLowerCase();

    for (const phrase of FORBIDDEN_FIRST_TOUCH) {
        if (low.includes(phrase)) violations.push(`FORBIDDEN_FIRST_TOUCH:${phrase}`);
    }
    for (const phrase of FORBIDDEN_PRESSURE) {
        if (low.includes(phrase)) violations.push(`FORBIDDEN_PRESSURE:${phrase}`);
    }

    // exactly 3 numbered issues
    const hasOne = /(^|\n)1\.\s+\S/.test(body);
    const hasTwo = /(^|\n)2\.\s+\S/.test(body);
    const hasThree = /(^|\n)3\.\s+\S/.test(body);
    const hasFour = /(^|\n)4\.\s+\S/.test(body);
    if (!(hasOne && hasTwo && hasThree) || hasFour) {
        violations.push('ISSUE_COUNT_NOT_3');
    }

    // price present
    if (!/₽/.test(body)) violations.push('PRICE_MISSING');

    return { ok: violations.length === 0, violations };
}

// ----------------------------------------------------------------------------
// High-level apply: take an existing draft (with optional copy_state) + a raw
// command, mutate the draft's copy_state, re-render subject/body, and return
// the updated draft. PURE w.r.t. side-effects: returns a new draft object; the
// caller (draft center / bot) persists it in the runtime store and rebuilds
// buttons. Recipient / gate fields are preserved untouched.
// ----------------------------------------------------------------------------
export function applyModifierToDraft(draft, modifier, opts = {}) {
    if (!draft) return { ok: false, code: 'NO_DRAFT' };
    if (!modifier) return { ok: false, code: 'UNKNOWN_MODIFIER' };

    // Seed copy_state from the draft (or from opts for first-time).
    const seed = draft.copy_state || {
        niche: opts.niche,
        site: draft.website,
        company: draft.company,
        issues: opts.issues,
        offer_price: opts.offer_price,
        sender_name: opts.sender_name,
        tone: opts.tone,
        length: opts.length,
    };

    let nextState = applyModifierToState(seed, modifier);

    // /draft_regenerate may pull fresh issues from the audit engine if provided.
    if (modifier.action === 'regenerate' && Array.isArray(opts.issues) && opts.issues.length) {
        nextState.issues = opts.issues.slice(0, 3);
    }

    const rendered = renderFromState(nextState);
    const updated = {
        ...draft,
        subject: rendered.subject,
        body: rendered.body,
        niche: rendered.niche,
        offer_price: rendered.copy_state.offer_price,
        copy_state: rendered.copy_state,
    };
    return { ok: true, draft: updated, rendered };
}

export default {
    FORBIDDEN_FIRST_TOUCH,
    FORBIDDEN_PRESSURE,
    classifyDraftModifier,
    defaultCopyState,
    applyModifierToState,
    renderFromState,
    validateCopyRules,
    applyModifierToDraft,
};
