// tools/analytics_os/lib/common.mjs
// Shared constants + helpers for Analytics OS. Dependency-free, deterministic, offline.
// READ-ONLY layer: never writes canonical data, never sends, never mutates production.
import path from 'node:path';

export const ANALYTICS_ROOT = process.env.ANALYTICS_OS_ROOT || path.resolve(process.cwd(), 'tools/analytics_os');
export const GENERATED_ROOT = process.env.ANALYTICS_OS_GENERATED || path.resolve(process.cwd(), '_generated/analytics_os');
export const DATA_DIR = path.join(ANALYTICS_ROOT, 'data');
export const FIXTURE_DIR = path.join(ANALYTICS_ROOT, 'fixtures');

// Canonical source files (read-only references; Analytics OS is a reader, never a writer).
export const SOURCES = {
  finance_kpis: path.resolve(process.cwd(), 'tools/finance_os/data/kpi_definitions.json'),
  exec_kpi_tree: path.resolve(process.cwd(), 'tools/executive_os/data/kpi_tree.json'),
  sot_matrix: path.resolve(process.cwd(), 'tools/executive_os/data/source_of_truth_matrix.json'),
  revenue_catalog: path.resolve(process.cwd(), 'tools/revenue_os/data/product_catalog.json'),
};

// Data confidence vocabulary — every emitted metric carries one (mirrors upstream OS vocab).
export const DATA_STATUS = ['CONFIRMED', 'OWNER_TARGET', 'MODEL_ESTIMATE', 'OWNER_DECISION_REQUIRED', 'BLOCKED_EXTERNAL', 'UNKNOWN'];

// Trend direction + period vocabulary.
export const TREND_DIRECTION = ['UP', 'DOWN', 'FLAT', 'INSUFFICIENT_DATA'];
export const PERIOD = ['daily', 'weekly', 'monthly', 'quarterly', 'per_project', 'per_release'];
export const SEVERITY = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

// Anomaly classification.
export const ANOMALY_KIND = ['THRESHOLD_BREACH', 'TREND_REVERSAL', 'SPIKE', 'DROP', 'STALE_DATA', 'MISSING_DATA'];

// Global invariants: Analytics OS only derives and reports. It never writes canonical data,
// creates dashboards/funnels, enables tracking, sends, or mutates production.
export const CANONICAL_WRITE_ALLOWED = false;
export const SEND_ALLOWED = false;
export const TRACKING_ALLOWED = false;
export const NEW_DASHBOARD_ALLOWED = false;
export const PRODUCTION_FREEZE = true;

export function nowStamp(ts) { return ts || process.env.ANALYTICS_OS_TS || 'UNSTAMPED'; }
export function arg(name, def) { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def; }
export function hasFlag(name) { return process.argv.includes(name); }
export function round2(n) { return Math.round(n * 100) / 100; }
export function round4(n) { return Math.round(n * 10000) / 10000; }
export function pct(n, d) { return d === 0 || d == null ? null : round4(n / d); }
export function sum(arr) { return arr.reduce((a, b) => a + (Number(b) || 0), 0); }
export function avg(arr) { return arr.length === 0 ? null : round2(sum(arr) / arr.length); }
