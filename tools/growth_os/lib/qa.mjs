// tools/growth_os/lib/qa.mjs
// Marketing QA (MP28) — aggregates validators across all Growth artifacts into one report.
// Read-only. Hard blockers surface individually; the score never hides a blocker.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR, SOURCES } from './common.mjs';
import {
  readinessMap, validateClaims, validateICP, validateCampaign, validateNotPublished,
  validateLanding, validateReferral, validateSocialProof, validateExperiment, validateControlledCycle,
  validateMessageArchitecture,
} from './validators.mjs';

function load(name) { return JSON.parse(readFileSync(path.join(DATA_DIR, name), 'utf8')); }
function loadSource(p) { return JSON.parse(readFileSync(p, 'utf8')); }

export function runQA() {
  const rmap = readinessMap(loadSource(SOURCES.revenue_catalog));
  const blockers = [];
  const add = (area, errs) => errs.forEach((e) => blockers.push({ area, error: e }));

  for (const p of load('positioning.json').positionings) add('positioning/claim', validateClaims(p));
  for (const i of load('icp_catalog.json').icps) add('icp', validateICP(i, rmap));
  for (const c of load('campaigns.json').campaigns) add('campaign', validateCampaign(c, rmap));
  add('message_architecture', validateMessageArchitecture(load('message_architecture.json')));
  for (const l of load('landings.json').landings) add('landing', validateLanding(l));
  for (const m of load('lead_magnets.json').lead_magnets) add('lead_magnet', validateNotPublished(m, 'lead_magnet_id'));
  for (const c of load('content_plan.json').calendar) add('content', validateNotPublished({ ...c, published: false }, 'topic'));
  const prs = load('partner_referral_social.json');
  add('referral', validateReferral(prs.referral_policy));
  for (const sp of prs.social_proof) add('social_proof', validateSocialProof(sp));
  for (const e of load('experiment_backlog.json').experiments) add('experiment', validateExperiment(e));
  add('controlled_cycle', validateControlledCycle(load('controlled_cycle_runbook.json')));

  const dims = ['segment_fit', 'product_fit', 'claim_support', 'evidence', 'price', 'scope', 'channel_suitability', 'permission', 'privacy', 'capacity', 'measurement', 'brand_consistency', 'cta', 'opt_out', 'no_send', 'first_touch_quality'];
  return { ok: blockers.length === 0, total_blockers: blockers.length, dimensions_checked: dims.length, blockers };
}
