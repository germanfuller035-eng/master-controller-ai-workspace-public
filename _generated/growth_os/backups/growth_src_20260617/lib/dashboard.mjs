// tools/growth_os/lib/dashboard.mjs
// Growth Dashboard (MP30) + Owner Growth Command Center (MP31). Read-only, deterministic.
// References Revenue/Product/Analytics — does NOT duplicate their dashboards.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR, SOURCES } from './common.mjs';
import { readinessMap } from './validators.mjs';
import { runQA } from './qa.mjs';

function load(name) { return JSON.parse(readFileSync(path.join(DATA_DIR, name), 'utf8')); }

export function buildDashboard(ts = 'UNSTAMPED') {
  const rmap = readinessMap(JSON.parse(readFileSync(SOURCES.revenue_catalog, 'utf8')));
  const segments = load('segments.json').segments;
  const icps = load('icp_catalog.json').icps;
  const channels = load('channels.json').channels;
  const campaigns = load('campaigns.json').campaigns;
  const content = load('content_plan.json').calendar;
  const seo = load('seo_plan.json').clusters;
  const magnets = load('lead_magnets.json').lead_magnets;
  const prs = load('partner_referral_social.json');
  const experiments = load('experiment_backlog.json').experiments;

  const marketableProducts = Object.entries(rmap).filter(([, v]) => v.marketable).map(([k]) => k);
  const readyCampaigns = campaigns.filter((c) => c.status === 'READY');
  const nearReady = campaigns.filter((c) => c.status === 'MEASUREMENT_READY' || c.status === 'OWNER_REVIEW');

  return {
    generated_ts: ts,
    synthetic: true,
    note: 'References Revenue/Product/Analytics; does not duplicate their dashboards.',
    target_segments: segments.map((s) => ({ id: s.segment_id, status: s.status })),
    icp_readiness: icps.map((i) => ({ id: i.icp_id, product: i.product_id, ready_to_market: i.READY_TO_MARKET })),
    product_market_readiness: { marketable: marketableProducts, total_products: Object.keys(rmap).length },
    channel_readiness: channels.map((c) => ({ id: c.channel_id, type: c.channel_type, readiness: c.readiness })),
    campaign_readiness: { ready: readyCampaigns.length, near_ready: nearReady.length, active: campaigns.filter((c) => c.status === 'ACTIVE').length, total: campaigns.length },
    content_backlog: content.length,
    seo_plan: { clusters: seo.length, volumes: 'EXTERNAL_DATA_REQUIRED' },
    lead_magnets: magnets.length,
    partnerships: prs.partner_programs.length,
    referrals: prs.referral_policy.status,
    social_proof: prs.social_proof.length,
    experiment_backlog: { total: experiments.length, ready: experiments.filter((e) => e.status === 'READY').length, running: experiments.filter((e) => e.status === 'RUNNING').length },
    blockers: collectBlockers(campaigns, icps, rmap),
    qa: (() => { const r = runQA(); return { ok: r.ok, blockers: r.total_blockers }; })(),
  };
}

function collectBlockers(campaigns, icps, rmap) {
  const b = [];
  for (const c of campaigns) if (c.blocked_reason) b.push({ campaign: c.campaign_id, reason: c.blocked_reason });
  for (const i of icps) if (i.READY_TO_MARKET === false && rmap[i.product_id]) b.push({ icp: i.icp_id, reason: `product ${i.product_id} ${rmap[i.product_id].state}, approved=${rmap[i.product_id].approved}` });
  return b;
}

export function buildOwnerCenter(ts = 'UNSTAMPED') {
  const d = buildDashboard(ts);
  const campaigns = load('campaigns.json').campaigns;
  const closest = campaigns.find((c) => c.status === 'MEASUREMENT_READY') || campaigns.find((c) => c.status === 'READY');
  return {
    generated_ts: ts,
    priority_segment: 'seg_weak_site',
    priority_product: 'mini_audit',
    campaign_closest_to_ready: closest ? closest.campaign_id : null,
    missing_owner_decisions: ['confirm owner capacity for inbound campaign', 'approve prices for DRAFT products to unlock their campaigns'],
    missing_price: Object.entries(readinessMap(JSON.parse(readFileSync(SOURCES.revenue_catalog, 'utf8')))).filter(([, v]) => !v.approved).map(([k]) => k),
    capacity_blocker: 'owner_capacity_confirmed = UNKNOWN (Executive OS upstream)',
    claim_approval: 'mini_audit claims supported; others gated by product readiness',
    asset_approval: 'all assets DRAFT/not published',
    next_safe_growth_action: 'Finalize mini_audit inbound campaign assets + confirm owner capacity (no launch).',
    intentionally_not_launched: ['all campaigns (ACTIVE prohibited)', 'outbound (no send)', 'content (not published)', 'landings (not published)', 'experiments (not RUNNING)', 'controlled cycle (not executed)'],
  };
}
