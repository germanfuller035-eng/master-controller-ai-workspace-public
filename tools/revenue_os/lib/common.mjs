// tools/revenue_os/lib/common.mjs
// Shared constants + helpers for Revenue OS Command Center. Dependency-free, deterministic.

import path from 'node:path';

export const REVENUE_ROOT = process.env.REVENUE_OS_ROOT || path.resolve(process.cwd(), 'tools/revenue_os');
export const GENERATED_ROOT = process.env.REVENUE_OS_GENERATED || path.resolve(process.cwd(), '_generated/revenue_os');
export const DATA_DIR = path.join(REVENUE_ROOT, 'data');
export const SCHEMA_DIR = path.join(REVENUE_ROOT, 'schemas');
export const FIXTURE_DIR = path.join(REVENUE_ROOT, 'fixtures');

export const CURRENCY = 'RUB';

// Unified product readiness vocabulary.
export const PRODUCT_STATUS = ['ACTIVE', 'READY_FOR_PILOT', 'DRAFT', 'PLANNED', 'DEPRECATED'];

// A product is client-offerable only if ACTIVE or READY_FOR_PILOT.
export function isClientOfferable(status) {
  return status === 'ACTIVE' || status === 'READY_FOR_PILOT';
}

// Digital maturity states.
export const MATURITY = [
  'NO_DIGITAL_PRESENCE', 'MAPS_ONLY', 'MARKETPLACE_ONLY', 'MESSENGER_ONLY', 'SOCIAL_ONLY',
  'BROKEN_WEBSITE', 'WEAK_WEBSITE', 'GOOD_WEBSITE_WEAK_FUNNEL', 'GOOD_WEBSITE_WEAK_PROCESS',
  'STRONG_DIGITAL_PRESENCE', 'UNKNOWN',
];

// Price value status.
export const PRICE_STATUS = ['CONFIRMED', 'OWNER_TARGET', 'HISTORICAL_QUOTE', 'ESTIMATE', 'UNKNOWN'];
export const PRICE_TYPE = ['free', 'fixed', 'from', 'range', 'hourly', 'monthly', 'milestone', 'custom_quote'];

// Evidence claim types.
export const CLAIM_TYPE = ['FACT', 'INFERENCE', 'HYPOTHESIS'];
export const SEVERITY = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

// Proposal / asset approval labels.
export const APPROVAL_STATE = ['DRAFT', 'INTERNAL_REVIEW', 'OWNER_APPROVED', 'CLIENT_READY'];
export const ASSET_STATUS = ['DRAFT_INTERNAL', 'INTERNAL_REVIEW', 'OWNER_APPROVED', 'CLIENT_READY', 'DEPRECATED'];

// Deal lifecycle stages.
export const DEAL_STAGES = [
  'DISCOVERED', 'QUALIFIED', 'PRODUCT_RECOMMENDED', 'OFFER_DRAFTED', 'OWNER_APPROVED',
  'CLIENT_CONTACTED', 'REPLIED', 'DISCOVERY_CALL', 'PROPOSAL_SENT', 'NEGOTIATION',
  'WON', 'LOST', 'PAUSED', 'OPTED_OUT',
];

// Allowed deal transitions (entry -> allowed next).
export const DEAL_TRANSITIONS = {
  DISCOVERED: ['QUALIFIED', 'LOST', 'PAUSED', 'OPTED_OUT'],
  QUALIFIED: ['PRODUCT_RECOMMENDED', 'LOST', 'PAUSED', 'OPTED_OUT'],
  PRODUCT_RECOMMENDED: ['OFFER_DRAFTED', 'LOST', 'PAUSED', 'OPTED_OUT'],
  OFFER_DRAFTED: ['OWNER_APPROVED', 'PAUSED', 'LOST', 'OPTED_OUT'],
  OWNER_APPROVED: ['CLIENT_CONTACTED', 'PAUSED', 'LOST', 'OPTED_OUT'],
  CLIENT_CONTACTED: ['REPLIED', 'LOST', 'PAUSED', 'OPTED_OUT'],
  REPLIED: ['DISCOVERY_CALL', 'PROPOSAL_SENT', 'NEGOTIATION', 'LOST', 'PAUSED', 'OPTED_OUT'],
  DISCOVERY_CALL: ['PROPOSAL_SENT', 'NEGOTIATION', 'LOST', 'PAUSED', 'OPTED_OUT'],
  PROPOSAL_SENT: ['NEGOTIATION', 'WON', 'LOST', 'PAUSED', 'OPTED_OUT'],
  NEGOTIATION: ['WON', 'LOST', 'PAUSED', 'OPTED_OUT'],
  WON: [],
  LOST: [],
  PAUSED: ['QUALIFIED', 'PRODUCT_RECOMMENDED', 'OFFER_DRAFTED', 'LOST', 'OPTED_OUT'],
  OPTED_OUT: [],
};

// The global no-send invariant. Tools must never set this true.
export const SEND_ALLOWED = false;

export function nowStamp(ts) {
  return ts || process.env.REVENUE_OS_TS || 'UNSTAMPED';
}

export function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
export function hasFlag(name) { return process.argv.includes(name); }
