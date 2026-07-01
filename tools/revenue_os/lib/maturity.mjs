// tools/revenue_os/lib/maturity.mjs
// Phase 5: Digital Maturity Model. Evidence-backed classification — never classify from a single
// missing URL. Deterministic. Returns {status, confidence, manual_review, reasons[]}.

import { MATURITY } from './common.mjs';

// Each state: definition, min evidence, excluding evidence, typical problems, eligible/ineligible
// products, next diagnostic, misclassification risk.
export const MATURITY_MODEL = {
  NO_DIGITAL_PRESENCE: {
    definition: 'No verifiable owned or third-party presence found across checked channels.',
    min_evidence: ['verified identity', 'checked: website', 'checked: maps', 'checked: marketplace', 'checked: messenger', 'checked: social'],
    excluding_evidence: ['any working website', 'any maps listing', 'any marketplace store'],
    typical_problems: ['invisible to customers', 'no owned asset'],
    eligible_products: ['digital_presence_check', 'owned_presence_pack', 'start_page_sprint', 'business_website'],
    ineligible_products: ['lead_system', 'ai_front_office', 'growth_support', 'full_business_audit'],
    next_diagnostic: 'confirm absence across ALL channels before concluding',
    misclassification_risk: 'high — absence is hard to prove; require multi-channel checks',
  },
  MAPS_ONLY: {
    definition: 'Presence limited to a maps/listing service; no owned site.',
    min_evidence: ['verified maps listing', 'checked: website (none/empty)'],
    excluding_evidence: ['working owned website'],
    typical_problems: ['no owned funnel', 'limited trust signals'],
    eligible_products: ['digital_presence_check', 'owned_presence_pack', 'start_page_sprint', 'business_website'],
    ineligible_products: ['full_business_audit', 'funnel_audit'],
    next_diagnostic: 'verify whether a website exists under another domain',
    misclassification_risk: 'medium',
  },
  MARKETPLACE_ONLY: {
    definition: 'Sells only via a marketplace; no owned site/funnel.',
    min_evidence: ['verified marketplace store', 'checked: website (none)'],
    excluding_evidence: ['working owned website'],
    typical_problems: ['platform dependency', 'no owned audience'],
    eligible_products: ['digital_presence_check', 'owned_presence_pack', 'business_website'],
    ineligible_products: ['funnel_audit', 'full_business_audit'],
    next_diagnostic: 'check for any owned domain',
    misclassification_risk: 'medium',
  },
  MESSENGER_ONLY: {
    definition: 'Operates via messengers only (Telegram/WhatsApp), no site.',
    min_evidence: ['verified messenger channel', 'checked: website (none)'],
    excluding_evidence: ['working website'],
    typical_problems: ['no structured funnel', 'hard to scale'],
    eligible_products: ['digital_presence_check', 'owned_presence_pack', 'start_page_sprint'],
    ineligible_products: ['funnel_audit', 'full_business_audit'],
    next_diagnostic: 'check for owned site/landing',
    misclassification_risk: 'medium',
  },
  SOCIAL_ONLY: {
    definition: 'Presence only on social networks.',
    min_evidence: ['verified social profile', 'checked: website (none)'],
    excluding_evidence: ['working website'],
    typical_problems: ['no owned asset', 'platform risk'],
    eligible_products: ['digital_presence_check', 'owned_presence_pack', 'start_page_sprint'],
    ineligible_products: ['funnel_audit', 'full_business_audit'],
    next_diagnostic: 'check for owned site/landing',
    misclassification_risk: 'medium',
  },
  BROKEN_WEBSITE: {
    definition: 'A website exists but is broken/down/expired (verified by HTTP/DNS check).',
    min_evidence: ['verified broken-state (HTTP error / DNS fail / expired)'],
    excluding_evidence: ['page returns 200 with content'],
    typical_problems: ['lost asset', 'trust damage'],
    eligible_products: ['domain_recovery', 'digital_presence_check', 'start_page_sprint', 'business_website'],
    ineligible_products: ['funnel_audit', 'full_business_audit', 'lead_system'],
    next_diagnostic: 'confirm broken state with a live HTTP check (do not assume)',
    misclassification_risk: 'high — transient outages can mislead; recheck',
  },
  WEAK_WEBSITE: {
    definition: 'Website works but is weak (poor packaging/conversion basics).',
    min_evidence: ['verified working page', 'evidence of weak CTA/form/trust'],
    excluding_evidence: ['strong funnel evidence'],
    typical_problems: ['weak first screen', 'weak CTA/forms'],
    eligible_products: ['mini_audit', 'funnel_audit', 'landing_sprint', 'full_business_audit'],
    ineligible_products: ['domain_recovery'],
    next_diagnostic: 'run Mini Audit to surface concrete findings',
    misclassification_risk: 'medium',
  },
  GOOD_WEBSITE_WEAK_FUNNEL: {
    definition: 'Good site but conversion/funnel is weak.',
    min_evidence: ['verified working quality page', 'evidence of funnel weakness'],
    excluding_evidence: ['strong funnel metrics'],
    typical_problems: ['low conversion', 'leaky funnel'],
    eligible_products: ['funnel_audit', 'lead_system', 'growth_support'],
    ineligible_products: ['domain_recovery', 'owned_presence_pack'],
    next_diagnostic: 'Funnel Audit',
    misclassification_risk: 'medium',
  },
  GOOD_WEBSITE_WEAK_PROCESS: {
    definition: 'Good site but lead response/process is weak.',
    min_evidence: ['verified working site', 'evidence of slow/missing response process'],
    excluding_evidence: ['strong response-process evidence'],
    typical_problems: ['slow response', 'lost leads after contact'],
    eligible_products: ['process_comm_audit', 'ai_front_office'],
    ineligible_products: ['domain_recovery', 'owned_presence_pack'],
    next_diagnostic: 'Process and Communication Audit',
    misclassification_risk: 'medium',
  },
  STRONG_DIGITAL_PRESENCE: {
    definition: 'Strong presence across owned + third-party channels with working funnel.',
    min_evidence: ['verified strong site', 'evidence of working funnel'],
    excluding_evidence: ['broken pages', 'weak funnel evidence'],
    typical_problems: ['incremental optimization only'],
    eligible_products: ['growth_support', 'lead_system', 'ai_front_office'],
    ineligible_products: ['owned_presence_pack', 'domain_recovery'],
    next_diagnostic: 'deeper audit only with specific evidence of a problem',
    misclassification_risk: 'low',
  },
  UNKNOWN: {
    definition: 'Insufficient or conflicting evidence to classify.',
    min_evidence: [],
    excluding_evidence: [],
    typical_problems: ['cannot recommend confidently'],
    eligible_products: [],
    ineligible_products: [],
    next_diagnostic: 'gather more evidence (verify identity, channels, website state)',
    misclassification_risk: 'n/a',
  },
};

// Classify from an evidence object. Evidence keys are booleans/strings with provenance.
// profile.evidence = [{category, claim_type, ...}], plus convenience signal fields.
export function classifyMaturity(profile) {
  const reasons = [];
  const ev = profile.website_evidence || {};
  // Count verified channel checks for confidence.
  const checks = ev.checked_channels || [];
  const hasWebsite = ev.website_working === true;
  const websiteBroken = ev.website_broken === true;
  const channels = ev.present_channels || []; // e.g. ['maps','marketplace','messenger','social']

  // Require minimum evidence; otherwise UNKNOWN.
  const declared = profile.digital_maturity;
  if (!declared || declared === 'UNKNOWN') {
    return decideFromSignals({ hasWebsite, websiteBroken, channels, checks, ev, reasons });
  }
  if (!MATURITY.includes(declared)) {
    reasons.push(`declared maturity '${declared}' not in model -> UNKNOWN`);
    return { status: 'UNKNOWN', confidence: 0, manual_review: true, reasons };
  }

  // Validate declared against excluding evidence.
  const model = MATURITY_MODEL[declared];
  if (declared.startsWith('NO_DIGITAL') && (hasWebsite || channels.length > 0)) {
    reasons.push('declared NO_DIGITAL_PRESENCE but presence evidence exists -> conflict -> UNKNOWN');
    return { status: 'UNKNOWN', confidence: 0.2, manual_review: true, reasons };
  }
  if (declared === 'BROKEN_WEBSITE' && hasWebsite && !websiteBroken) {
    reasons.push('declared BROKEN_WEBSITE but page works -> conflict -> UNKNOWN');
    return { status: 'UNKNOWN', confidence: 0.2, manual_review: true, reasons };
  }

  // Confidence from evidence volume.
  let confidence = 0.4 + Math.min(0.5, (checks.length * 0.1) + (profile.evidence?.length || 0) * 0.05);
  if (declared === 'NO_DIGITAL_PRESENCE' && checks.length < 4) {
    reasons.push('NO_DIGITAL_PRESENCE requires >=4 channel checks; insufficient -> manual review');
    return { status: declared, confidence: Math.min(confidence, 0.4), manual_review: true, reasons };
  }
  reasons.push(`declared ${declared} consistent with evidence (${checks.length} channel checks)`);
  return { status: declared, confidence: Math.min(0.95, confidence), manual_review: confidence < 0.5, reasons };
}

function decideFromSignals({ hasWebsite, websiteBroken, channels, checks, ev, reasons }) {
  if (websiteBroken) { reasons.push('verified broken website'); return mk('BROKEN_WEBSITE', 0.7, false, reasons); }
  if (hasWebsite) {
    if (ev.funnel_weak === true) { reasons.push('working site + weak funnel evidence'); return mk('GOOD_WEBSITE_WEAK_FUNNEL', 0.6, false, reasons); }
    if (ev.process_weak === true) { reasons.push('working site + weak process evidence'); return mk('GOOD_WEBSITE_WEAK_PROCESS', 0.6, false, reasons); }
    if (ev.website_weak === true) { reasons.push('working but weak site'); return mk('WEAK_WEBSITE', 0.6, false, reasons); }
    if (ev.strong === true) { reasons.push('strong presence evidence'); return mk('STRONG_DIGITAL_PRESENCE', 0.6, false, reasons); }
    reasons.push('site works but quality signals missing -> manual review');
    return mk('WEAK_WEBSITE', 0.45, true, reasons);
  }
  if (channels.length === 1) {
    const map = { maps: 'MAPS_ONLY', marketplace: 'MARKETPLACE_ONLY', messenger: 'MESSENGER_ONLY', social: 'SOCIAL_ONLY' };
    const s = map[channels[0]] || 'UNKNOWN';
    reasons.push(`single channel: ${channels[0]}`);
    return mk(s, 0.55, false, reasons);
  }
  if (channels.length === 0 && checks.length >= 4) {
    reasons.push('no presence across >=4 checked channels');
    return mk('NO_DIGITAL_PRESENCE', 0.6, false, reasons);
  }
  reasons.push('insufficient evidence to classify');
  return mk('UNKNOWN', 0.1, true, reasons);
}

function mk(status, confidence, manual_review, reasons) {
  return { status, confidence, manual_review, reasons };
}
