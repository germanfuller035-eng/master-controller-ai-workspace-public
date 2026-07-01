#!/usr/bin/env node
// tools/growth_os/tests/growth.test.mjs — functional tests for Growth & Marketing OS (MP36).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readinessMap, validateClaims, validateICP, validateCampaign, validateLanding, validateReferral, validateSocialProof, validateExperiment, validateControlledCycle, validateNotPublished } from '../lib/validators.mjs';
import { evaluateReadiness, computeEconomics, GATE_CONDITIONS } from '../lib/readiness.mjs';
import { runQA } from '../lib/qa.mjs';
import { buildDashboard, buildOwnerCenter } from '../lib/dashboard.mjs';
import { isMarketSegment, isICP, isCampaign, isPositioning } from '../schemas/domain.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(__dirname, '../data');
const load = (n) => JSON.parse(readFileSync(path.join(DATA, n), 'utf8'));
const catalog = JSON.parse(readFileSync(path.resolve(__dirname, '../../revenue_os/data/product_catalog.json'), 'utf8'));
const rmap = readinessMap(catalog);

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) pass++; else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };
const eq = (n, a, b) => ok(n, a === b, `expected ${b} got ${a}`);

// --- readiness map sanity ---
ok('mini_audit marketable', rmap.mini_audit.marketable === true);
ok('lead_system not marketable', rmap.lead_system.marketable === false);
ok('business_website not marketable (unapproved)', rmap.business_website.marketable === false);

// --- segmentation ---
const segs = load('segments.json').segments;
ok('segments valid shape', segs.every(isMarketSegment));
ok('priority primary is weak_site (only marketable product)', segs.find((s) => s.segment_id === 'seg_weak_site').status === 'PRIORITY_PRIMARY');
ok('no invented market size', segs.every((s) => !('market_size' in s)));

// --- ICP ---
const icps = load('icp_catalog.json').icps;
ok('icps valid shape', icps.every(isICP));
ok('only mini_audit ICP READY_TO_MARKET', icps.filter((i) => i.READY_TO_MARKET === true).every((i) => i.product_id === 'mini_audit'));
eq('icp validator passes on real catalog', icps.flatMap((i) => validateICP(i, rmap)).length, 0);
ok('icp validator catches PLANNED-as-ready', validateICP({ icp_id: 'bad', product_id: 'lead_system', must_have: ['x'], disqualifiers: ['y'], product_routes: [], READY_TO_MARKET: true }, rmap).length > 0);

// --- positioning + claims ---
const pos = load('positioning.json').positionings;
ok('positioning valid shape', pos.every(isPositioning));
eq('no prohibited claims in real positioning', pos.flatMap(validateClaims).length, 0);
ok('claim validator catches guarantee', validateClaims({ positioning_id: 'b', claims: ['guaranteed growth'], prohibited_claims: ['guaranteed growth'] }).length > 0);
ok('mini_audit positioning excludes redesign/implementation', pos.find((p) => p.product_id === 'mini_audit').limitations.some((l) => /redesign|implementation/i.test(l)));
ok('mini_audit reflects 10000 price', pos.find((p) => p.product_id === 'mini_audit').price_status.includes('10000'));

// --- channels ---
const ch = load('channels.json').channels;
ok('all channel types present', ['owned', 'earned', 'inbound', 'outbound', 'paid_future'].every((t) => ch.some((c) => c.channel_type === t)));
ok('no channel activated', ch.every((c) => c.status !== 'ACTIVE'));
ok('outbound routes via Conversation Hub', ch.find((c) => c.channel_id === 'ch_outbound_email').send_path.includes('Conversation Hub'));

// --- campaigns ---
const camps = load('campaigns.json').campaigns;
ok('campaigns valid shape', camps.every(isCampaign));
ok('all campaigns test_only', camps.every((c) => c.test_only === true));
ok('no ACTIVE campaign', camps.every((c) => c.status !== 'ACTIVE'));
eq('campaign validator clean on real data', camps.flatMap((c) => validateCampaign(c, rmap)).length, 0);
ok('campaign validator blocks ACTIVE', validateCampaign({ campaign_id: 'b', test_only: true, status: 'ACTIVE', product_ids: [], channel_ids: [], metrics: [] }, rmap).some((e) => /ACTIVE/.test(e)));

// --- readiness gate ---
eq('gate has 13 conditions', GATE_CONDITIONS.length, 13);
const fullCtx = Object.fromEntries(GATE_CONDITIONS.map((c) => [c, true]));
const rdy = evaluateReadiness({ campaign_id: 'c', status: 'DRAFT' }, fullCtx);
ok('all gates pass => READY', rdy.ready && rdy.permitted_status === 'READY');
ok('ACTIVE never granted even when ready', rdy.active_allowed === false);
ok('missing owner capacity blocks', evaluateReadiness({ campaign_id: 'c', status: 'DRAFT' }, { ...fullCtx, owner_capacity_confirmed: false }).ready === false);

// --- economics ---
const econ = computeEconomics({ budget: 0, owner_hours: 8, owner_hour_value: 2000, candidates: 50, verified: 20, replies: 5, wins: 1, deal_value: 10000, gross_margin_rate: 0.7, capacity_ceiling: 5, source_status: 'MODEL_ESTIMATE' });
ok('economics confidence not CONFIRMED', econ.confidence !== 'CONFIRMED');
ok('break_even computed', econ.break_even_wins === 3);
ok('unknown costs => UNKNOWN status', computeEconomics({ owner_hours: 8, owner_hour_value: null, wins: 1, deal_value: 10000, gross_margin_rate: 0.7 }).total_cost_status === 'UNKNOWN');

// --- experiments ---
const exps = load('experiment_backlog.json').experiments;
ok('no RUNNING experiment', exps.every((e) => e.status !== 'RUNNING'));
ok('experiment validator blocks RUNNING', validateExperiment({ experiment_id: 'b', status: 'RUNNING', primary_metric: 'x', guardrails: [] }).length > 0);
ok('insufficient-sample experiment flagged in data', exps.some((e) => e.blocked_reason && /sample/.test(e.blocked_reason)));

// --- landings ---
const lands = load('landings.json').landings;
eq('landings validator clean', lands.flatMap(validateLanding).length, 0);
ok('no landing published', lands.every((l) => l.published === false));
ok('no landing tracking', lands.every((l) => l.tracking === false));
ok('landing validator catches tracking', validateLanding({ landing_id: 'b', published: false, claims: [], price_status: 'x', privacy_note: 'y', tracking: true, form_connected: false }).some((e) => /tracking/.test(e)));

// --- referral + social proof ---
const prs = load('partner_referral_social.json');
eq('referral policy valid', validateReferral(prs.referral_policy).length, 0);
ok('referral no auto-request', prs.referral_policy.auto_request === false);
ok('social proof no publication', prs.social_proof.every((s) => s.published === false));
ok('blocked testimonial flagged', prs.social_proof.some((s) => s.status === 'BLOCKED_NO_PERMISSION'));

// --- controlled cycle ---
eq('controlled cycle validator clean', validateControlledCycle(load('controlled_cycle_runbook.json')).length, 0);
ok('cycle not started', load('controlled_cycle_runbook.json').execution_state.cycle_started === false);

// --- QA + dashboard ---
const qa = runQA();
ok('QA clean on real data', qa.ok, JSON.stringify(qa.blockers));
eq('QA checks 16 dimensions', qa.dimensions_checked, 16);
const dash = buildDashboard('T');
ok('dashboard no active campaigns', dash.campaign_readiness.active === 0);
ok('dashboard no running experiments', dash.experiment_backlog.running === 0);
const oc = buildOwnerCenter('T');
ok('owner center names priority product mini_audit', oc.priority_product === 'mini_audit');
ok('owner center lists intentionally-not-launched', oc.intentionally_not_launched.length > 0);

console.log(`\ngrowth.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
