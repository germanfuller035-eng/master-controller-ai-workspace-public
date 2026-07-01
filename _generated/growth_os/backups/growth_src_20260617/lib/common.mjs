// tools/growth_os/lib/common.mjs
// Shared constants + helpers for Growth & Marketing OS. Dependency-free, deterministic, offline.
// Growth OS is a PLANNING/PREPARATION layer: it never sends, publishes, installs tracking,
// creates ads, reads production, or mutates canonical data. All artifacts are INTERNAL/DRAFT/TEST_ONLY.
import path from 'node:path';
import { readFileSync } from 'node:fs';

export const GROWTH_ROOT = process.env.GROWTH_OS_ROOT || path.resolve(process.cwd(), 'tools/growth_os');
export const GENERATED_ROOT = process.env.GROWTH_OS_GENERATED || path.resolve(process.cwd(), '_generated/growth_os');
export const DATA_DIR = path.join(GROWTH_ROOT, 'data');
export const FIXTURE_DIR = path.join(GROWTH_ROOT, 'fixtures');

// Canonical sources (read-only references; Growth OS is a reader, never a writer).
export const SOURCES = {
  revenue_catalog: path.resolve(process.cwd(), 'tools/revenue_os/data/product_catalog.json'),
  product_packs: path.resolve(process.cwd(), 'tools/product_os/data/product_packs.json'),
  measurement_plan: path.resolve(process.cwd(), 'tools/analytics_os/data/controlled_commercial_cycle_measurement_plan.json'),
};

// Confidence vocabulary for any quantified value (mirrors upstream OS).
export const DATA_STATUS = ['CONFIRMED', 'OWNER_TARGET', 'MODEL_ESTIMATE', 'UNKNOWN'];

// Campaign lifecycle — ACTIVE is PROHIBITED during this task.
export const CAMPAIGN_STATUS = ['IDEA', 'DRAFT', 'ASSETS_IN_PROGRESS', 'MEASUREMENT_READY', 'OWNER_REVIEW', 'READY', 'ACTIVE', 'PAUSED', 'STOPPED', 'COMPLETED'];
export const CAMPAIGN_ACTIVE_ALLOWED = false;

// Experiment status ceiling — RUNNING prohibited (delegates to Analytics OS governance).
export const EXPERIMENT_RUNNING_ALLOWED = false;

// Nurture lifecycle states.
export const NURTURE_STATES = ['new', 'engaged', 'needs_education', 'considering', 'not_now', 'opted_out', 'inactive', 'customer'];

// Channel categories.
export const CHANNEL_TYPES = ['owned', 'earned', 'inbound', 'outbound', 'paid_future'];

// Digital maturity — REUSE upstream Product/Revenue model; do not invent a new one.
export const DIGITAL_MATURITY = ['none', 'maps_only', 'directory_only', 'social_only', 'marketplace_only', 'weak_site', 'good_site_weak_funnel', 'good_site_weak_process', 'mature'];

export const SEVERITY = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

// Global invariants: Growth OS prepares, never executes.
export const SEND_ALLOWED = false;
export const PUBLISH_ALLOWED = false;
export const TRACKING_ALLOWED = false;
export const ADS_ALLOWED = false;
export const PRODUCTION_READ_ALLOWED = false;
export const CANONICAL_WRITE_ALLOWED = false;

export function nowStamp(ts) { return ts || process.env.GROWTH_OS_TS || 'UNSTAMPED'; }
export function arg(name, def) { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def; }
export function hasFlag(name) { return process.argv.includes(name); }
export function round2(n) { return Math.round(n * 100) / 100; }
export function round4(n) { return Math.round(n * 10000) / 10000; }
export function pct(n, d) { return d === 0 || d == null ? null : round4(n / d); }
export function sum(a) { return a.reduce((x, y) => x + (Number(y) || 0), 0); }
export function readJson(p) { return JSON.parse(readFileSync(p, 'utf8')); }
