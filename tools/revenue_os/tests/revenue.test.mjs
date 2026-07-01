#!/usr/bin/env node
// tools/revenue_os/tests/revenue.test.mjs
// Phase 28: Comprehensive offline test suite for Revenue OS. Deterministic. Real exit code.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog, recommend } from '../lib/recommend.mjs';
import { classifyMaturity } from '../lib/maturity.mjs';
import { checkClaim, checkClaims, isGuessedEmail } from '../lib/evidence.mjs';
import { checkFindingSet } from '../lib/findings.mjs';
import { resolvePrice, economics, priceGuard } from '../lib/pricing.mjs';
import { validateScope } from '../lib/scope.mjs';
import { buildOffer } from '../lib/offer.mjs';
import { generateProposal } from '../lib/proposal.mjs';
import { buildDraft } from '../lib/messaging.mjs';
import { canTransition, buildHandoff } from '../lib/deal.mjs';
import { summarize, scenario } from '../lib/economics.mjs';
import { plan } from '../lib/capacity.mjs';
import { simulate } from '../lib/funnel.mjs';
import { validateCatalog, validateOffer, validateDraft, validateRevenueEvent } from '../lib/validators.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const fx = JSON.parse(readFileSync(path.join(ROOT, 'fixtures/customer_profiles.json'), 'utf8'));
const prof = (id) => fx.profiles.find((p) => p.profile_id === id);

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { if (cond) { pass++; } else { fail++; console.log(`  FAIL  ${name}  ${detail}`); } };

loadCatalog();

// ---- Product catalog ----
{
  const v = validateCatalog();
  ok('catalog valid', v.ok, v.errors.slice(0, 3).join('; '));
  const cat = loadCatalog();
  ok('catalog no duplicate IDs', new Set(cat.products.map((p) => p.product_id)).size === cat.products.length);
  ok('every product has deliverables', cat.products.every((p) => p.deliverables.length > 0));
  ok('every product has acceptance criteria', cat.products.every((p) => p.acceptance_criteria.length > 0));
  ok('mini_audit is ACTIVE entry product', cat.products.find((p) => p.product_id === 'mini_audit').entry_product === true);
  ok('mini_audit price 10000 confirmed', resolvePrice('mini_audit').amount === 10000 && resolvePrice('mini_audit').status === 'CONFIRMED');
}

// ---- Maturity ----
{
  ok('maturity: weak site classified', classifyMaturity(prof('TEST_weak_site')).status === 'WEAK_WEBSITE');
  ok('maturity: broken site', classifyMaturity(prof('TEST_broken_site')).status === 'BROKEN_WEBSITE');
  ok('maturity: insufficient -> UNKNOWN', classifyMaturity(prof('TEST_insufficient_evidence')).status === 'UNKNOWN');
  const conflict = classifyMaturity(prof('TEST_conflicting_identity'));
  ok('maturity: conflicting -> UNKNOWN + manual review', conflict.status === 'UNKNOWN' && conflict.manual_review);
  ok('maturity: strong presence', classifyMaturity(prof('TEST_strong_presence')).status === 'STRONG_DIGITAL_PRESENCE');
}

// ---- Recommendation ----
{
  const weak = recommend(prof('TEST_weak_site'));
  ok('recommend: weak -> mini_audit primary', weak.primary_product === 'mini_audit');
  ok('recommend: weak deterministic', recommend(prof('TEST_weak_site')).primary_product === weak.primary_product);
  ok('recommend: insufficient -> no product + manual review', recommend(prof('TEST_insufficient_evidence')).primary_product === null);
  ok('recommend: opted out -> null + no contact', recommend(prof('TEST_opted_out')).primary_product === null);
  const proc = recommend(prof('TEST_good_weak_process'));
  ok('recommend: PLANNED best-fit flagged not ready', proc.blockers.some((b) => b.includes('not_client_ready')) && proc.manual_review);
  ok('recommend: capacity unavailable blocker', recommend(prof('TEST_capacity_unavailable')).blockers.includes('owner_capacity_unavailable'));
}

// ---- Evidence ----
{
  const factOk = checkClaim({ claim: 'no visible form on verified page', claim_type: 'FACT', category: 'forms', source_url: 'https://x.test', source_type: 'direct_observation', checked_at: '2026-06-17', evidence_excerpt: 'no form', confidence: 0.8, freshness: 'fresh' });
  ok('evidence: supported FACT passes', factOk.ok, factOk.errors.join(';'));
  const factBad = checkClaim({ claim: 'нет формы на сайте', claim_type: 'FACT', category: 'forms', source_url: null, source_type: 'assumption', checked_at: null, evidence_excerpt: null, confidence: 0.8, freshness: 'fresh' });
  ok('evidence: unsupported FACT blocked', !factBad.ok);
  const forbidden = checkClaim({ claim: 'Мы гарантируем рост продаж на 30%', claim_type: 'FACT', category: 'commercial', source_url: 'https://x.test', source_type: 'direct_observation', checked_at: '2026-06-17', evidence_excerpt: 'x', confidence: 0.9, freshness: 'fresh' });
  ok('evidence: forbidden growth/guarantee FACT blocked', !forbidden.ok);
  const stale = checkClaim({ claim: 'site observed', claim_type: 'FACT', category: 'website', source_url: 'https://x.test', source_type: 'direct_observation', checked_at: '2026-01-01', evidence_excerpt: 'x', confidence: 0.8, freshness: 'stale' });
  ok('evidence: stale flagged as warning', stale.ok && stale.warnings.some((w) => /stale/.test(w)));
  ok('evidence: guessed email detected', isGuessedEmail('info@guessed.test', []));
  ok('evidence: verified email not guessed', !isGuessedEmail('owner@x.test', [{ category: 'contact', claim_type: 'FACT', source_url: 'https://x.test', evidence_excerpt: 'owner@x.test' }]));
}

// ---- Findings ----
{
  const good = [{ finding_id: 'f1', category: 'forms', title: 'No form', severity: 'HIGH', fact: 'нет формы (verified)', evidence: [{ claim: 'no form', claim_type: 'FACT', category: 'forms', source_url: 'https://x.test', source_type: 'direct_observation', checked_at: '2026-06-17', evidence_excerpt: 'no form', confidence: 0.8, freshness: 'fresh' }], business_implication: 'fewer requests', recommended_fix: 'add form', effort: 'low', confidence: 0.8 }];
  ok('findings: valid set passes', checkFindingSet(good).ok);
  const dup = [...good, { ...good[0], finding_id: 'f2' }];
  ok('findings: duplicate detected', checkFindingSet(dup).duplicates.length === 1);
  const unsupported = [{ finding_id: 'f3', category: 'forms', title: 'X', severity: 'LOW', fact: 'maybe', evidence: [], business_implication: 'y', recommended_fix: 'z', effort: 'low', confidence: 0.5 }];
  ok('findings: unsupported blocked', !checkFindingSet(unsupported).ok);
}

// ---- Pricing ----
{
  ok('pricing: confirmed mini_audit', resolvePrice('mini_audit').status === 'CONFIRMED');
  ok('pricing: target not promoted to confirmed', resolvePrice('mini_audit_plus').status === 'OWNER_TARGET');
  ok('pricing: unknown stays unknown', resolvePrice('funnel_audit').status === 'UNKNOWN');
  ok('pricing: economics labeled estimate', economics('mini_audit').label.includes('ESTIMATE'));
  ok('pricing: guard blocks below min', !priceGuard('mini_audit', 5000).ok);
  ok('pricing: guard blocks negative', !priceGuard('mini_audit', -100).ok);
  ok('pricing: guard warns unapproved', priceGuard('mini_audit_plus', null).warnings.some((w) => /approved/.test(w)) || priceGuard('mini_audit_plus', null).errors.length > 0);
}

// ---- Scope ----
{
  ok('scope: mini_audit valid', validateScope('mini_audit').ok);
  ok('scope: all products have deliverables', loadCatalog().products.every((p) => validateScope(p.product_id).ok || validateScope(p.product_id).errors.every((e) => !/no deliverables/.test(e))));
}

// ---- Offer ----
{
  const weak = prof('TEST_weak_site');
  const o = buildOffer({ profile: weak, product_id: 'mini_audit', evidence: weak.evidence });
  ok('offer: valid mini_audit', validateOffer(o.offer).ok, validateOffer(o.offer).errors.join(';'));
  ok('offer: send_allowed false', o.offer.send_allowed === false);
  const planned = buildOffer({ profile: weak, product_id: 'ai_front_office', evidence: weak.evidence });
  ok('offer: PLANNED -> not client ready', planned.offer.not_client_ready_label === 'INTERNAL_DRAFT_NOT_CLIENT_READY');
  // missing scope/evidence mismatch
  const noEv = buildOffer({ profile: { profile_id: 'TEST_x' }, product_id: 'mini_audit', evidence: [] });
  ok('offer: missing evidence flagged', noEv.offer.blockers.includes('evidence_gate_failed') || noEv.evidence_check.total === 0);
}

// ---- Proposal ----
{
  const weak = prof('TEST_weak_site');
  const o = buildOffer({ profile: weak, product_id: 'mini_audit', evidence: weak.evidence });
  const internal = generateProposal(o, { requested_label: 'INTERNAL_REVIEW' });
  ok('proposal: internal review default', internal.approval_state === 'INTERNAL_REVIEW');
  const planned = buildOffer({ profile: weak, product_id: 'ai_front_office', evidence: weak.evidence });
  const plannedProp = generateProposal(planned, { requested_label: 'CLIENT_READY' });
  ok('proposal: planned cannot be client ready', plannedProp.approval_state !== 'CLIENT_READY');
  ok('proposal: send_allowed false in json', internal.json.send_allowed === false);
}

// ---- Messaging ----
{
  const weak = prof('TEST_weak_site');
  const d = buildDraft({ draft_type: 'first_contact', channel: 'email', profile: weak, evidence: weak.evidence });
  ok('messaging: draft send_allowed false', d.draft.send_allowed === false);
  const optout = buildDraft({ draft_type: 'follow_up', channel: 'email', profile: prof('TEST_opted_out'), evidence: prof('TEST_opted_out').evidence });
  ok('messaging: opt-out follow-up blocked', !optout.ok && optout.errors.some((e) => /opt/.test(e)));
  const guessed = buildDraft({ draft_type: 'first_contact', channel: 'email', profile: prof('TEST_guessed_email'), recipient: 'info@guessed.test', evidence: prof('TEST_guessed_email').evidence });
  ok('messaging: guessed recipient blocked', !guessed.ok && guessed.errors.some((e) => /guessed/.test(e)));
  ok('messaging: validateDraft catches send_allowed', !validateDraft({ draft: { send_allowed: true } }).ok);
}

// ---- Deal / handoff ----
{
  ok('deal: legal transition', canTransition('DISCOVERED', 'QUALIFIED').ok);
  ok('deal: illegal transition blocked', !canTransition('DISCOVERED', 'WON').ok);
  ok('deal: WON terminal', !canTransition('WON', 'NEGOTIATION').ok);
  ok('handoff: requires test_only', !buildHandoff({ deal_id: 'D', stage: 'WON', product_id: 'mini_audit', test_only: false }, {}).ok);
  ok('handoff: test WON ok + scope frozen', buildHandoff({ deal_id: 'D', stage: 'WON', product_id: 'mini_audit', value: 10000, test_only: true }, {}).handoff.scope_frozen === true);
  ok('handoff: non-WON rejected', !buildHandoff({ deal_id: 'D', stage: 'QUALIFIED', product_id: 'mini_audit', test_only: true }, {}).ok);
}

// ---- Economics ----
{
  const s = summarize([{ type: 'paid', amount: 10000, confirmed: true, test_only: true }, { type: 'target', amount: 500000, confirmed: false, test_only: true }, { type: 'forecast', amount: 200000, confirmed: false, test_only: true }]);
  ok('economics: actual = confirmed+paid only', s.actual_revenue === 10000);
  ok('economics: target/forecast not actual', s.not_actual.target === 500000 && s.not_actual.forecast === 200000);
  ok('economics: revenue event forecast-confirmed blocked', !validateRevenueEvent({ type: 'forecast', amount: 100, currency: 'RUB', confirmed: true }).ok);
  ok('economics: zero-price ok', validateRevenueEvent({ type: 'confirmed', amount: 0, currency: 'RUB', confirmed: true }).ok);
  ok('economics: negative blocked', !validateRevenueEvent({ type: 'paid', amount: -5, currency: 'RUB', confirmed: true }).ok);
  const sc = scenario({ name: 't', product_price: 10000, expected_volume: 10, capacity_limit: 5 });
  ok('economics: capacity-limited <= modeled', sc.capacity_limited_revenue <= sc.modeled_revenue);
}

// ---- Capacity ----
{
  ok('capacity: unknown owner hours -> UNKNOWN', plan({ product_delivery_hours: 4 }).status === 'UNKNOWN');
  const c = plan({ owner_weekly_hours: 20, product_delivery_hours: 4, ai_automation_pct: 0.5, active_projects: 2 });
  ok('capacity: computed when hours known', c.status === 'COMPUTED' && typeof c.max_monthly_volume === 'number');
}

// ---- Funnel ----
{
  const f = simulate({ stage_counts: { candidates: 1000 }, product_price: 10000, target_won: 5 });
  ok('funnel: deterministic', simulate({ stage_counts: { candidates: 1000 }, product_price: 10000, target_won: 5 }).expected_deals === f.expected_deals);
  ok('funnel: bottleneck identified', !!f.bottleneck);
  ok('funnel: forecast not guarantee', f.label.includes('not guarantee'));
  const noReply = simulate({ stage_counts: { candidates: 1000 }, conversions: { replied: 0 }, product_price: 10000 });
  ok('funnel: no replies -> 0 deals', noReply.expected_deals === 0);
  ok('funnel: required candidates for target', f.required_candidates_for_target > 0);
}

console.log(`\n[revenue.test] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
