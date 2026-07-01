// tools/delivery_os/lib/common.mjs
// Shared constants + helpers for Delivery OS. Dependency-free, deterministic.
import path from 'node:path';

export const DELIVERY_ROOT = process.env.DELIVERY_OS_ROOT || path.resolve(process.cwd(), 'tools/delivery_os');
export const GENERATED_ROOT = process.env.DELIVERY_OS_GENERATED || path.resolve(process.cwd(), '_generated/delivery_os');
export const DATA_DIR = path.join(DELIVERY_ROOT, 'data');
export const FIXTURE_DIR = path.join(DELIVERY_ROOT, 'fixtures');
export const REVENUE_CATALOG = path.resolve(process.cwd(), 'tools/revenue_os/data/product_catalog.json');

export const CURRENCY = 'RUB';

// ClientProject status vocabulary.
export const PROJECT_STATUS = [
  'PLANNED', 'WAITING_CLIENT_INPUT', 'READY_TO_START', 'IN_PROGRESS', 'BLOCKED',
  'IN_REVIEW', 'WAITING_CLIENT_APPROVAL', 'CHANGE_REQUEST', 'DELIVERED', 'ACCEPTED',
  'SUPPORT', 'CLOSED', 'CANCELLED',
];

// Full delivery lifecycle (project-level state machine).
export const LIFECYCLE = [
  'COMMERCIAL_APPROVED', 'PROJECT_CREATED', 'WAITING_INPUTS', 'SCOPE_FROZEN', 'READY_TO_START',
  'DELIVERY_IN_PROGRESS', 'INTERNAL_QA', 'OWNER_REVIEW', 'CLIENT_REVIEW', 'CHANGE_REQUEST',
  'DELIVERED', 'ACCEPTED', 'SUPPORT', 'CLOSED',
];

// Allowed lifecycle transitions (source -> [targets]).
export const LIFECYCLE_TRANSITIONS = {
  COMMERCIAL_APPROVED: ['PROJECT_CREATED', 'CANCELLED'],
  PROJECT_CREATED: ['WAITING_INPUTS', 'SCOPE_FROZEN', 'CANCELLED'],
  WAITING_INPUTS: ['SCOPE_FROZEN', 'BLOCKED', 'CANCELLED'],
  SCOPE_FROZEN: ['READY_TO_START', 'CANCELLED'],
  READY_TO_START: ['DELIVERY_IN_PROGRESS', 'CANCELLED'],
  DELIVERY_IN_PROGRESS: ['INTERNAL_QA', 'BLOCKED', 'CHANGE_REQUEST', 'CANCELLED'],
  INTERNAL_QA: ['OWNER_REVIEW', 'DELIVERY_IN_PROGRESS', 'CHANGE_REQUEST'],
  OWNER_REVIEW: ['CLIENT_REVIEW', 'DELIVERY_IN_PROGRESS', 'CHANGE_REQUEST'],
  CLIENT_REVIEW: ['DELIVERED', 'CHANGE_REQUEST', 'DELIVERY_IN_PROGRESS'],
  CHANGE_REQUEST: ['DELIVERY_IN_PROGRESS', 'SCOPE_FROZEN', 'CANCELLED'],
  DELIVERED: ['ACCEPTED', 'CHANGE_REQUEST', 'CLIENT_REVIEW'],
  ACCEPTED: ['SUPPORT', 'CLOSED'],
  SUPPORT: ['CLOSED'],
  CLOSED: [],
  BLOCKED: ['WAITING_INPUTS', 'DELIVERY_IN_PROGRESS', 'CANCELLED'],
  CANCELLED: [],
};

export const MILESTONE_STATUS = ['PENDING', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'SKIPPED'];
export const TASK_STATUS = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'REVIEW', 'DONE'];
export const QA_STATUS = ['NOT_RUN', 'PASS', 'FAIL', 'WARNING'];
export const SEVERITY = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
export const ACCEPTANCE_STATUS = ['PENDING', 'PASS', 'FAIL', 'WAIVED'];
export const CHANGE_DECISION = ['PENDING', 'APPROVED', 'REJECTED', 'DEFERRED', 'INCLUDED_NO_COST', 'REQUIRES_NEW_OFFER'];
export const ASSET_LABEL = ['INTERNAL_DRAFT', 'OWNER_REVIEW', 'CLIENT_READY', 'DELIVERED'];
export const CASE_STAGE = ['CANDIDATE', 'INTERNAL', 'ANONYMIZED', 'CLIENT_PERMISSION_PENDING', 'APPROVED_FOR_USE', 'PUBLISHED'];

// Product readiness (extends Revenue OS readiness with delivery-defined states).
export const READINESS = [
  'PLANNED', 'DRAFT', 'DELIVERY_DEFINED', 'READY_FOR_INTERNAL_TEST', 'READY_FOR_PILOT',
  'ACTIVE', 'PAUSED', 'DEPRECATED',
];

export const AGENTS = ['claude', 'cline', 'owner', 'client'];

// The global no-send invariant. Delivery OS never sends.
export const SEND_ALLOWED = false;

export function nowStamp(ts) { return ts || process.env.DELIVERY_OS_TS || 'UNSTAMPED'; }
export function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
export function hasFlag(name) { return process.argv.includes(name); }
