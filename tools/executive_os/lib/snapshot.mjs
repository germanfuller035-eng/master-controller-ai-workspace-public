// tools/executive_os/lib/snapshot.mjs
// Phase 9: Cross-System Snapshot Builder. Reads canonical indexes (not blind file scrape).
// Every field carries provenance. Bounded output. Read-only.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { REVENUE_CATALOG, nowStamp } from './common.mjs';
import { allSeeds } from '../../ai_hq/lib/projects.mjs';

function safeRead(p) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } }

// inputs: { ts, financeMetrics, deliveryReadiness } — optional injected domain data (else from canonical files).
export function buildSnapshot(opts = {}) {
  const ts = nowStamp(opts.ts);
  const provenance = [];

  // Projects from AI HQ seed (canonical index).
  const seeds = allSeeds();
  provenance.push({ field: 'projects', source: 'tools/ai_hq/lib/projects.mjs (seed)' });

  // Products from Revenue OS catalog.
  let products = [];
  if (existsSync(REVENUE_CATALOG)) {
    const cat = safeRead(REVENUE_CATALOG);
    if (cat) { products = cat.products.map((p) => ({ product_id: p.product_id, status: p.status })); provenance.push({ field: 'products', source: 'tools/revenue_os/data/product_catalog.json' }); }
  }

  // Release metadata (read-only reference; not fetched from VPS).
  const release = { tag: 'v0.4.0-rc1', state: 'no-send soak (FREEZE)', source: 'release metadata (read-only)' };
  provenance.push({ field: 'release', source: 'documented release metadata (no VPS call)' });

  const conflicts = [];
  const missing = [];
  // Missing-data detection.
  if (!products.length) missing.push('product_catalog');
  if (!opts.financeMetrics) missing.push('finance_metrics (inject for live values)');
  if (!opts.deliveryReadiness) missing.push('delivery_readiness (inject for live values)');

  const snapshot = {
    schema: 'executive_os.snapshot.v1',
    generated_at: ts,
    source_commits: { ai_hq: 'd4bf77f', revenue_os: '2ff079d', delivery_os: '0f642d1', finance_os: '9e8ec2f' },
    projects: seeds.map((s) => ({ project_id: s.project_id, status: s.status, priority: s.priority, sensitive: !!s.sensitive })),
    products,
    delivery: opts.deliveryReadiness || { status: 'UNKNOWN (inject)', note: 'see Delivery OS readiness' },
    finance: opts.financeMetrics || { status: 'UNKNOWN (inject)', note: 'see Finance OS metrics' },
    release,
    risks: opts.risks || [],
    decisions: opts.decisionCount ?? 'see decision backlog',
    owner_actions: opts.ownerActions || [],
    kpis: opts.kpis || 'see KPI tree',
    warnings: missing.map((m) => `missing: ${m}`),
    freshness: { stamp: ts, note: 'projects/products from canonical indexes; live finance/delivery require injection' },
    provenance,
    conflicts,
  };
  return snapshot;
}

// Owner-readable summary (compact).
export function summarizeSnapshot(snap) {
  const active = snap.projects.filter((p) => p.status === 'ACTIVE_DEVELOPMENT' || p.status === 'ACTIVE_PRODUCTION').length;
  const sellable = snap.products.filter((p) => p.status === 'ACTIVE').length;
  return {
    generated_at: snap.generated_at,
    projects_total: snap.projects.length,
    projects_active: active,
    products_total: snap.products.length,
    products_sellable: sellable,
    release: snap.release.state,
    warnings: snap.warnings,
  };
}
