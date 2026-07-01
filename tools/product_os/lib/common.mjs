// tools/product_os/lib/common.mjs
// Shared constants + helpers for Product OS. Dependency-free, deterministic, offline.
import path from 'node:path';

export const PRODUCT_ROOT = process.env.PRODUCT_OS_ROOT || path.resolve(process.cwd(), 'tools/product_os');
export const GENERATED_ROOT = process.env.PRODUCT_OS_GENERATED || path.resolve(process.cwd(), '_generated/product_os');
export const DATA_DIR = path.join(PRODUCT_ROOT, 'data');
export const FIXTURE_DIR = path.join(PRODUCT_ROOT, 'fixtures');
export const REVENUE_CATALOG = path.resolve(process.cwd(), 'tools/revenue_os/data/product_catalog.json');
export const DELIVERY_PLAYBOOKS = path.resolve(process.cwd(), 'tools/delivery_os/data/playbooks.json');
export const DELIVERY_ADV_PLAYBOOKS = path.resolve(process.cwd(), 'tools/delivery_os/data/advanced_playbooks.json');

// Product readiness states (shared with Delivery OS readiness vocabulary).
export const PRODUCT_STATUS = ['PLANNED', 'DRAFT', 'DELIVERY_DEFINED', 'READY_FOR_INTERNAL_TEST', 'READY_FOR_PILOT', 'ACTIVE', 'PAUSED', 'DEPRECATED'];
export const STATUS_ORDER = { PLANNED: 0, DRAFT: 1, DELIVERY_DEFINED: 2, READY_FOR_INTERNAL_TEST: 3, READY_FOR_PILOT: 4, ACTIVE: 5, PAUSED: -1, DEPRECATED: -2 };

export const CLAIM_TYPES = ['FACT', 'INFERENCE', 'HYPOTHESIS', 'ASPIRATIONAL', 'PROHIBITED'];
export const ASSET_STATUS = ['INTERNAL_DRAFT', 'INTERNAL_REVIEW', 'OWNER_APPROVED', 'CLIENT_DEMO_READY'];
export const PILOT_STATUS = ['PLANNED', 'READY', 'RUNNING', 'FAILED', 'PASSED_WITH_NOTES', 'PASSED', 'CANCELLED'];
export const READINESS_SCORE = ['COMPLETE', 'PARTIAL', 'MISSING', 'BLOCKED', 'NOT_APPLICABLE'];
export const DUP_ACTIONS = ['KEEP', 'MERGE', 'SPLIT', 'RENAME', 'REPOSITION', 'PAUSE', 'DEPRECATE', 'OWNER_DECISION_REQUIRED'];

// 22 readiness dimensions (shared).
export const READINESS_DIMENSIONS = [
  'definition', 'icp', 'problem', 'outcome', 'deliverables', 'scope', 'exclusions', 'price',
  'delivery_playbook', 'inputs', 'milestones', 'qa', 'acceptance', 'risks', 'capacity', 'economics',
  'demo', 'internal_pilot', 'sales_assets', 'delivery_assets', 'case_evidence', 'owner_approval',
];

// Global invariants: Product OS never changes canonical status, never publishes, never sends.
export const CANONICAL_STATUS_CHANGE_ALLOWED = false;
export const PUBLISH_ALLOWED = false;
export const SEND_ALLOWED = false;
export const REAL_PILOT_ALLOWED = false;

export function nowStamp(ts) { return ts || process.env.PRODUCT_OS_TS || 'UNSTAMPED'; }
export function arg(name, def) { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def; }
export function hasFlag(name) { return process.argv.includes(name); }
export function round2(n) { return Math.round(n * 100) / 100; }
