// tools/executive_os/lib/common.mjs
// Shared constants + helpers for Executive OS. Dependency-free, deterministic, offline.
import path from 'node:path';

export const EXEC_ROOT = process.env.EXECUTIVE_OS_ROOT || path.resolve(process.cwd(), 'tools/executive_os');
export const GENERATED_ROOT = process.env.EXECUTIVE_OS_GENERATED || path.resolve(process.cwd(), '_generated/executive_os');
export const DATA_DIR = path.join(EXEC_ROOT, 'data');
export const FIXTURE_DIR = path.join(EXEC_ROOT, 'fixtures');
export const REVENUE_CATALOG = path.resolve(process.cwd(), 'tools/revenue_os/data/product_catalog.json');

// Status vocabulary for executive data (every value carries one).
export const DATA_STATUS = ['CONFIRMED', 'OWNER_TARGET', 'MODEL_ESTIMATE', 'OWNER_DECISION_REQUIRED', 'BLOCKED_EXTERNAL', 'UNKNOWN'];

export const OBJECTIVE_STATUS = ['DRAFT', 'OWNER_REVIEW', 'APPROVED', 'ACTIVE', 'AT_RISK', 'BLOCKED', 'ACHIEVED', 'CANCELLED'];
export const DECISION_STATUS = ['OPEN', 'NEEDS_DATA', 'READY_FOR_OWNER', 'APPROVED', 'REJECTED', 'DEFERRED', 'EXPIRED', 'SUPERSEDED'];
export const ACTION_STATUS = ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'DEFERRED'];

export const PROJECT_STATE = ['ACTIVE', 'PAUSED', 'BLOCKED', 'ACCEPTANCE', 'MAINTENANCE', 'PLANNED', 'ARCHIVED'];
export const PRODUCT_STATE = ['PLANNED', 'DRAFT', 'DELIVERY_DEFINED', 'READY_FOR_INTERNAL_TEST', 'READY_FOR_PILOT', 'ACTIVE', 'PAUSED', 'DEPRECATED'];

export const PORTFOLIO_ACTIONS = ['FOCUS_NOW', 'CONTINUE', 'PREPARE', 'WAIT', 'PAUSE', 'STOP', 'ARCHIVE', 'OWNER_DECISION_REQUIRED'];
export const SEVERITY = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

export const DECISION_CATEGORIES = ['strategy', 'product', 'price', 'sales', 'delivery', 'finance', 'capacity', 'infrastructure', 'security', 'release', 'acceptance', 'hiring_contractor', 'legal_compliance', 'pause_stop', 'investment'];

export const RELEASE_STATUS = ['IMPLEMENTED', 'TESTED', 'ARTIFACT_READY', 'DEPLOYED', 'LIVE_VERIFIED', 'OWNER_ACCEPTED', 'SOAK_PASSED', 'RELEASED', 'POST_RELEASE_ACCEPTED'];

// Global invariants: Executive OS never executes decisions, sends, or mutates production.
export const DECISION_EXECUTION_ALLOWED = false;
export const SEND_ALLOWED = false;
export const PRODUCTION_FREEZE = true;

export function nowStamp(ts) { return ts || process.env.EXECUTIVE_OS_TS || 'UNSTAMPED'; }
export function arg(name, def) { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def; }
export function hasFlag(name) { return process.argv.includes(name); }
export function round2(n) { return Math.round(n * 100) / 100; }
