// tools/executive_os/lib/exceptions.mjs
// Phase 16: Exception engine. Detects cross-system exceptions. No external notifications.
import { SEVERITY } from './common.mjs';

export const EXCEPTION_TYPES = [
  'source_stale', 'dashboard_stale', 'kpi_missing', 'decision_overdue', 'project_blocked',
  'product_not_ready', 'margin_unknown', 'negative_cash_forecast', 'capacity_unknown', 'owner_overloaded',
  'release_acceptance_incomplete', 'duplicate_system_detected', 'secret_finding', 'backup_failure',
  'unclassified_test_failure', 'production_health_failure',
];

// ctx: aggregated signals from domains.
export function detectExceptions(ctx) {
  const ex = [];
  const add = (type, severity, description, evidence, owner_action) => ex.push({ exception_id: `exc_${type}_${ex.length + 1}`, category: type, severity, source_system: ctx.source || 'executive', description, evidence: evidence || null, owner_action: owner_action || null, status: 'OPEN' });

  if (ctx.capacity_unknown) add('capacity_unknown', 'HIGH', 'Owner weekly capacity not confirmed', 'attention budget', 'confirm capacity');
  if (ctx.negative_cash_forecast) add('negative_cash_forecast', 'CRITICAL', 'Negative cash point in forecast', 'Finance OS cashflow', 'review cashflow');
  if (ctx.owner_overloaded) add('owner_overloaded', 'HIGH', 'Owner attention demand exceeds capacity', 'attention budget', 'defer/delegate');
  for (const p of (ctx.products_not_ready || [])) add('product_not_ready', 'MEDIUM', `Product ${p} not sellable`, 'Revenue OS', 'do not sell');
  for (const d of (ctx.overdue_decisions || [])) add('decision_overdue', 'HIGH', `Decision ${d} overdue`, 'decision queue', 'resolve');
  if (ctx.release_acceptance_incomplete) add('release_acceptance_incomplete', 'HIGH', 'Release not owner-accepted', 'release governance', 'owner acceptance');
  for (const s of (ctx.stale_sources || [])) add('source_stale', 'MEDIUM', `Stale source ${s}`, 'freshness', 'refresh');
  if (ctx.duplicate_system) add('duplicate_system_detected', 'HIGH', `Duplicate system: ${ctx.duplicate_system}`, 'SoT matrix', 'consolidate');
  if (ctx.secret_finding) add('secret_finding', 'CRITICAL', 'Secret-like content detected', 'secret scan', 'owner remediation');
  if (ctx.backup_failure) add('backup_failure', 'CRITICAL', 'Backup verification failed', 'backup verify', 'fix backup');
  for (const k of (ctx.missing_kpis || [])) add('kpi_missing', 'LOW', `KPI ${k} missing`, 'KPI tree', 'gather data');

  return {
    total: ex.length,
    by_severity: SEVERITY.reduce((o, s) => (o[s] = ex.filter((e) => e.severity === s).length, o), {}),
    critical: ex.filter((e) => e.severity === 'CRITICAL'),
    exceptions: ex,
    note: 'No external notifications. Owner reviews.',
  };
}
