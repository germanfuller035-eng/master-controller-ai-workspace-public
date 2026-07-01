// score.mjs — deterministic score_v2 (0..100). PURE, versioned, explainable, null-safe.
// Components per spec: market fit 0-30, digital pain 0-30, contactability 0-20,
// identity confidence 0-15, data freshness 0-5. No LLM, no randomness.
import { emailIsContactable } from './classify.mjs';

export const SCORE_VERSION = 'score_v2';

// config-driven weights (documented; magic numbers live here, versioned with SCORE_VERSION)
export const SCORE_CONFIG = Object.freeze({
    market_fit_max: 30, digital_pain_max: 30, contactability_max: 20,
    identity_max: 15, freshness_max: 5,
    ready_for_audit_min: 55, reject_below: 20,
});

function clamp(v, max) { return Math.max(0, Math.min(max, v)); }

export function scoreV2(lead, now = new Date()) {
    const cfg = SCORE_CONFIG;
    const c = {};

    // market fit: niche/region match (0-30)
    let mf = 0;
    if (lead.region_match) mf += 12;
    if (lead.niche_match) mf += 12;
    if (lead.industry) mf += 6;
    c.market_fit = clamp(mf, cfg.market_fit_max);

    // demonstrated digital pain: weaker site = MORE opportunity (0-30)
    const painByTier = { NO_SITE: 26, DOMAIN_UNRESOLVED: 30, SITE_UNREACHABLE: 28, BROKEN_SITE: 30, WEAK_SITE: 22, ADEQUATE_SITE: 8, STRONG_SITE: 2 };
    c.digital_pain = clamp(painByTier[lead.website_tier] ?? 0, cfg.digital_pain_max);

    // contactability (0-20): confirmed email > phone-only > none
    let ct = 0;
    if (emailIsContactable(lead.email_status)) ct += 14;
    else if (lead.email_status === 'CONTACT_FORM_ONLY') ct += 7;
    if ((lead.phones || []).length) ct += 6;
    c.contactability = clamp(ct, cfg.contactability_max);

    // identity confidence (0-15)
    const idByStatus = { IDENTITY_VERIFIED: 15, IDENTITY_PARTIAL: 8, IDENTITY_UNKNOWN: 2, IDENTITY_CONFLICT: 0 };
    c.identity = clamp(idByStatus[lead.identity_status] ?? 0, cfg.identity_max);

    // data freshness (0-5): how recently evidence was fetched
    let fr = 0;
    const fetched = lead.latest_evidence_at ? Date.parse(lead.latest_evidence_at) : null;
    if (fetched) { const days = (now.getTime() - fetched) / 86400000; fr = days <= 7 ? 5 : days <= 30 ? 3 : days <= 90 ? 1 : 0; }
    c.freshness = clamp(fr, cfg.freshness_max);

    const overall = Object.values(c).reduce((a, b) => a + b, 0);

    // risk blockers (do not silently downgrade — surface them)
    const blockers = [];
    if (lead.opt_out) blockers.push('OPT_OUT');
    if (lead.email_status === 'GUESSED') blockers.push('GUESSED_EMAIL');
    if (lead.identity_status === 'IDENTITY_CONFLICT') blockers.push('IDENTITY_CONFLICT');

    let result;
    if (blockers.length) result = 'REJECT';
    else if (overall < cfg.reject_below) result = 'REJECT';
    else if (overall >= cfg.ready_for_audit_min) result = 'QUALIFIED';
    else result = 'MANUAL_REVIEW';

    const positive = Object.entries(c).filter(([, v]) => v > 0).map(([k]) => k);
    return {
        score_version: SCORE_VERSION, score_components: c, overall_priority_score: overall,
        positive_signals: positive, negative_signals: blockers, blockers, result,
        explanation: `market_fit=${c.market_fit} digital_pain=${c.digital_pain} contactability=${c.contactability} identity=${c.identity} freshness=${c.freshness} → ${overall}/100 (${result})`,
        calculated_at: now.toISOString(),
    };
}
