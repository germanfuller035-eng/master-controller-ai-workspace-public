// tools/growth_os/schemas/domain.mjs
// Growth & Marketing OS domain model (MP3). Dependency-free shape predicates.
// All entities are INTERNAL/DRAFT/TEST_ONLY planning artifacts — never live, sent, or published.
import { CAMPAIGN_STATUS, CHANNEL_TYPES, DIGITAL_MATURITY, EXPERIMENT_RUNNING_ALLOWED } from '../lib/common.mjs';

export const ENTITIES = [
  'MarketSegment', 'IdealCustomerProfile', 'Positioning', 'MarketingChannel', 'Campaign',
  'CampaignAsset', 'ContentAsset', 'GrowthExperiment', 'ChannelEconomics', 'LeadMagnet', 'PartnerProgram',
];

export function isMarketSegment(s) {
  return !!s && typeof s.segment_id === 'string' && typeof s.name === 'string'
    && Array.isArray(s.product_fit) && (s.digital_maturity === undefined || DIGITAL_MATURITY.includes(s.digital_maturity));
}
export function isICP(i) {
  return !!i && typeof i.icp_id === 'string' && typeof i.segment_id === 'string'
    && Array.isArray(i.must_have) && Array.isArray(i.disqualifiers)
    && (Array.isArray(i.product_routes) || typeof i.product_id === 'string');
}
export function isPositioning(p) {
  return !!p && typeof p.positioning_id === 'string' && typeof p.product_id === 'string'
    && typeof p.value_proposition === 'string' && Array.isArray(p.claims) && Array.isArray(p.proof);
}
export function isChannel(c) {
  return !!c && typeof c.channel_id === 'string' && CHANNEL_TYPES.includes(c.channel_type)
    && Array.isArray(c.target_segments);
}
export function isCampaign(c) {
  return !!c && typeof c.campaign_id === 'string' && CAMPAIGN_STATUS.includes(c.status)
    && c.test_only === true && Array.isArray(c.product_ids) && Array.isArray(c.channel_ids);
}
export function isCampaignAsset(a) {
  return !!a && typeof a.asset_id === 'string' && typeof a.campaign_id === 'string'
    && a.published === false && Array.isArray(a.claims);
}
export function isContentAsset(c) {
  return !!c && typeof c.content_id === 'string' && typeof c.format === 'string'
    && c.published === false && Array.isArray(c.claims);
}
export function isGrowthExperiment(e) {
  return !!e && typeof e.experiment_id === 'string' && Array.isArray(e.variants)
    && typeof e.primary_metric === 'string' && Array.isArray(e.guardrails) && e.status !== 'RUNNING';
}
export function isChannelEconomics(e) {
  return !!e && typeof e.economics_id === 'string' && typeof e.channel_id === 'string'
    && typeof e.source_status === 'string';
}
export function isLeadMagnet(m) {
  return !!m && typeof m.lead_magnet_id === 'string' && typeof m.product_id === 'string'
    && m.published === false && Array.isArray(m.claims);
}
export function isPartnerProgram(p) {
  return !!p && typeof p.partner_program_id === 'string' && typeof p.partner_type === 'string'
    && typeof p.value_exchange === 'string';
}

export const DOMAIN = {
  entities: ENTITIES,
  invariants: {
    campaigns_test_only: true,
    assets_not_published: true,
    experiments_not_running: !EXPERIMENT_RUNNING_ALLOWED,
  },
  note: 'Growth OS prepares demand-generation artifacts. Leads belong to Master Controller; catalog/price to Revenue OS; readiness/claims to Product OS; metrics/experiments governance to Analytics OS; send to Conversation Hub.',
};
