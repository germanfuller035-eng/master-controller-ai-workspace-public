// tools/customer_success_os/lib/common.mjs
// Shared constants + helpers for Customer Success OS. Dependency-free, deterministic, offline.
import path from 'node:path';

export const CS_ROOT = process.env.CS_OS_ROOT || path.resolve(process.cwd(), 'tools/customer_success_os');
export const GENERATED_ROOT = process.env.CS_OS_GENERATED || path.resolve(process.cwd(), '_generated/customer_success_os');
export const DATA_DIR = path.join(CS_ROOT, 'data');
export const FIXTURE_DIR = path.join(CS_ROOT, 'fixtures');
export const REVENUE_CATALOG = path.resolve(process.cwd(), 'tools/revenue_os/data/product_catalog.json');
export const DELIVERY_PLAYBOOKS = path.resolve(process.cwd(), 'tools/delivery_os/data/playbooks.json');

// Customer success lifecycle states.
export const LIFECYCLE = [
  'HANDOFF_PENDING', 'ONBOARDING', 'ACTIVATION', 'ADOPTION', 'VALUE_REVIEW',
  'HEALTHY', 'AT_RISK', 'SUPPORT_REQUIRED', 'RENEWAL_REVIEW', 'EXPANSION_REVIEW',
  'PAUSED', 'CHURNED', 'CLOSED',
];
// Allowed transitions (source -> [targets]).
export const TRANSITIONS = {
  HANDOFF_PENDING: ['ONBOARDING', 'PAUSED', 'CLOSED'],
  ONBOARDING: ['ACTIVATION', 'AT_RISK', 'PAUSED'],
  ACTIVATION: ['ADOPTION', 'AT_RISK', 'SUPPORT_REQUIRED'],
  ADOPTION: ['VALUE_REVIEW', 'AT_RISK', 'SUPPORT_REQUIRED'],
  VALUE_REVIEW: ['HEALTHY', 'AT_RISK', 'RENEWAL_REVIEW', 'EXPANSION_REVIEW'],
  HEALTHY: ['VALUE_REVIEW', 'AT_RISK', 'RENEWAL_REVIEW', 'EXPANSION_REVIEW', 'SUPPORT_REQUIRED'],
  AT_RISK: ['SUPPORT_REQUIRED', 'HEALTHY', 'CHURNED', 'PAUSED', 'VALUE_REVIEW'],
  SUPPORT_REQUIRED: ['AT_RISK', 'HEALTHY', 'ADOPTION', 'CHURNED'],
  RENEWAL_REVIEW: ['HEALTHY', 'PAUSED', 'CHURNED', 'CLOSED'],
  EXPANSION_REVIEW: ['HEALTHY', 'PAUSED'],
  PAUSED: ['ONBOARDING', 'HEALTHY', 'CHURNED', 'CLOSED'],
  CHURNED: ['CLOSED'],
  CLOSED: [],
};

export const SUPPORT_STATUS = ['NEW', 'TRIAGED', 'WAITING_OWNER', 'WAITING_CUSTOMER', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'DUPLICATE', 'OUT_OF_SCOPE', 'CHANGE_REQUEST_REQUIRED'];
export const SEVERITY = ['SEV1_CRITICAL', 'SEV2_HIGH', 'SEV3_MEDIUM', 'SEV4_LOW', 'QUESTION'];
export const SUPPORT_BOUNDARY = ['INCLUDED_SUPPORT', 'WARRANTY', 'DEFECT', 'CUSTOMER_ERROR', 'TRAINING', 'CHANGE_REQUEST', 'NEW_PROJECT', 'OUT_OF_SCOPE', 'UNKNOWN'];
export const HEALTH_STATE = ['HEALTHY', 'WATCH', 'AT_RISK', 'CRITICAL', 'UNKNOWN'];
export const INCIDENT_STATUS = ['DETECTED', 'TRIAGED', 'MITIGATING', 'MONITORING', 'RESOLVED', 'POSTMORTEM', 'CLOSED'];
export const RENEWAL_ACTIONS = ['RENEW', 'RENEW_WITH_CHANGES', 'REVIEW_FIRST', 'DO_NOT_RENEW', 'PAUSE', 'OWNER_DECISION_REQUIRED', 'NOT_APPLICABLE'];
export const PORTFOLIO_ACTIONS = ['MAINTAIN', 'SUPPORT', 'REVIEW', 'RECOVER', 'RENEW', 'EXPAND', 'PAUSE', 'CLOSE', 'OWNER_DECISION_REQUIRED'];
export const ADOPTION_STATUS = ['CONFIRMED', 'CUSTOMER_REPORTED', 'SYSTEM_OBSERVED', 'MODEL_ESTIMATE', 'UNKNOWN'];
export const OUTCOME_STATUS = ['PROPOSED', 'BASELINE_MISSING', 'MEASURING', 'PARTIALLY_ACHIEVED', 'ACHIEVED', 'NOT_ACHIEVED', 'NOT_MEASURABLE', 'CUSTOMER_NOT_IMPLEMENTED'];
export const PERMISSION_TYPES = ['testimonial', 'logo', 'public_case', 'anonymized_case', 'referral_request', 'contact_permission', 'marketing_communication'];
export const PERMISSION_STATUS = ['NOT_REQUESTED', 'REQUESTED', 'GRANTED', 'DENIED', 'EXPIRED', 'REVOKED'];

// Global invariants: never send, never publish, never change canonical status, no real customers.
export const SEND_ALLOWED = false;
export const PUBLISH_ALLOWED = false;
export const CANONICAL_STATUS_CHANGE_ALLOWED = false;
export const REAL_CUSTOMER_ALLOWED = false;

export function nowStamp(ts) { return ts || process.env.CS_OS_TS || 'UNSTAMPED'; }
export function arg(name, def) { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def; }
export function round2(n) { return Math.round(n * 100) / 100; }
