#!/usr/bin/env node
// tools/reliability_os/reliability.mjs — Reliability / Observability CLI (MP49).
// OFFLINE, deterministic. No network, no process launch, no scheduling, no production mutation.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { GENERATED_ROOT, FIXTURE_DIR, arg, nowStamp, loadData } from './lib/common.mjs';
import { validateAll } from './lib/validators.mjs';
import { analyzeDependencies, errorBudget, injectFailure, runScenario, SCENARIOS, FAILURE_KINDS } from './lib/engines.mjs';
import { buildDashboard, buildOwnerCenter } from './lib/dashboard.mjs';

const cmd = process.argv[2];
const sub = process.argv[3];
const TS = nowStamp(arg('--ts'));
const OUT = path.join(GENERATED_ROOT, 'samples');
function out(name, data) { mkdirSync(OUT, { recursive: true }); const f = path.join(OUT, name); writeFileSync(f, typeof data === 'string' ? data : JSON.stringify(data, null, 2)); return f; }
function fixtures() { return JSON.parse(readFileSync(path.join(FIXTURE_DIR, 'reliability_fixtures.json'), 'utf8')); }
function dataset() { return { inv: loadData('inventory.json'), catalog: loadData('service_catalog.json'), health: loadData('health_observability.json'), plans: loadData('reliability_plans.json'), release: loadData('release_deployment.json'), fixtures: fixtures() }; }

function main() {
  const ds = (cmd && cmd !== 'help') ? dataset() : null;
  switch (cmd) {
    case 'inventory': { console.log(`rows=${ds.inv.rows.length} services=${ds.inv.counts.systemd_services} timers=${ds.inv.counts.systemd_timers}`); return 0; }
    case 'services': { ds.catalog.services.forEach((s) => console.log(`  ${s.service_id} [${s.criticality}] owner=${s.owner} live_verify=${s.live_verification_required}`)); return 0; }
    case 'service': { const s = ds.catalog.services.find((x) => x.service_id === sub); if (!s) { console.error('not found'); return 2; } console.log(JSON.stringify(s, null, 2)); return 0; }
    case 'dependencies': { const r = analyzeDependencies(ds.catalog.dependency_graph); console.log(`edges=${ds.catalog.dependency_graph.edges.length} cycle=${r.has_cycle} issues=${r.issues.length} shared_critical=${r.shared_critical.length}`); (ds.catalog.dependency_graph.detections.single_points_of_failure || []).forEach((s) => console.log(`  SPOF: ${s.spof}`)); return 0; }
    case 'health': { console.log('health check types: ' + ds.health.health_standard.check_types.join(', ')); console.log('ALL live health status = UNKNOWN (no live checks)'); return 0; }
    case 'slis': { ds.plans.sli_catalog.forEach((s) => console.log(`  ${s.sli_id} (${s.service_id}) ${s.unit}`)); return 0; }
    case 'slos': { ds.plans.slo_proposals.forEach((s) => console.log(`  ${s.slo_id} target=${s.target} status=${s.status}`)); return 0; }
    case 'error-budgets': { const eb = errorBudget({ allowed_failure_ratio: 0.01, observed_failure_ratio: null }); console.log(`example: ${eb.status} (observed=${eb.observed}, source=${eb.source_status})`); return 0; }
    case 'logs': { console.log(`log fields=${ds.health.logging_standard.fields.length} prohibited=${ds.health.logging_standard.prohibited.length} levels=${ds.health.logging_standard.levels.join(',')}`); return 0; }
    case 'metrics': { console.log(`metric types=${ds.health.metric_standard.types.join(',')}`); console.log(`forbidden labels=${ds.health.metric_standard.cardinality_forbidden_labels.length} allowed=${ds.health.metric_standard.cardinality_allowed_labels.length}`); return 0; }
    case 'alerts': { ds.health.alert_rules.forEach((a) => console.log(`  ${a.alert_id} [${a.severity}] ${a.category} auto_action=${a.auto_action}`)); return 0; }
    case 'incidents': { console.log(`reliability lifecycle: ${ds.plans.reliability_incident_lifecycle.join(' -> ')}`); console.log('synthetic only; 0 open'); return 0; }
    case 'runbooks': { ds.plans.runbooks.forEach((r) => console.log(`  ${r.runbook_id}: ${r.title}${r.hard_blocker ? ' [HARD_BLOCKER]' : ''}`)); return 0; }
    case 'backups': { ds.plans.backup_inventory.forEach((b) => console.log(`  ${b.backup_asset} enc=${b.encryption_status} restore_test=${b.restore_test}`)); return 0; }
    case 'restore': { console.log('restore test must verify: ' + ds.plans.restore_test_standard.must_verify.join(', ')); console.log('production restore NOT executed'); return 0; }
    case 'recovery': { ds.plans.disaster_recovery.forEach((d) => console.log(`  ${d.scenario} priority=${d.recovery_priority}`)); return 0; }
    case 'rpo-rto': { ds.plans.rpo_rto.forEach((r) => console.log(`  ${r.asset} rpo=${r.proposed_rpo} rto=${r.proposed_rto} status=${r.status}`)); return 0; }
    case 'capacity': { ds.plans.capacity.profiles.forEach((c) => console.log(`  ${c.resource}: ${c.status}`)); return 0; }
    case 'simulate': { const id = (sub || 'A').toUpperCase(); const r = runScenario(id); out(`sim_${id}.json`, r); console.log(`simulate ${r.scenario} ${r.name}: ${r.ok ? 'OK' : 'FAIL'} production_affected=${r.production_affected}${r.hard_blocker ? ' [HARD_BLOCKER]' : ''}`); return r.ok ? 0 : 1; }
    case 'release-gate': { const g = ds.release.release_readiness_gate; console.log(`release gate: ${g.current_status}`); (g.blocked_to_owner_review_by || []).forEach((b) => console.log(`  blocked: ${b}`)); return 0; }
    case 'deployment-plan': { console.log('deployment phases: ' + ds.release.deployment_contract.phases.join(' -> ')); console.log('owner approval REQUIRED; not executed'); return 0; }
    case 'rollback-plan': { console.log('rollback must define: ' + ds.release.rollback_standard.must_define.join(', ')); console.log('hard rule: ' + ds.release.rollback_standard.hard_rule); return 0; }
    case 'production-verification': { console.log('FUTURE checks (not executed): ' + ds.release.production_verification_plan.checks.join(', ')); console.log(`executed=${ds.release.production_verification_plan.executed}`); return 0; }
    case 'dashboard-refresh': { const d = buildDashboard(ds, TS); const c = buildOwnerCenter(ds, TS); out('reliability_dashboard.json', d); out('owner_reliability_command_center.json', c); console.log(`dashboard refreshed services=${d.service_catalog} spof=${d.single_points_of_failure.length} alerts=${d.alerts} release=${d.release_readiness} live_verify=${d.live_verification_required.length}`); return 0; }
    case 'validate-all': { const r = validateAll(ds); Object.entries(r.dimensions).filter(([, v]) => v !== 'PASS').forEach(([k, v]) => console.log(`  ${k}: ${v}`)); console.log(`validate-all: ${r.blockers === 0 ? 'OK' : 'BLOCKED'} blockers=${r.blockers} dimensions=${Object.keys(r.dimensions).length}`); return r.blockers === 0 ? 0 : 1; }
    default:
      console.error('reliability: inventory|services|service <id>|dependencies|health|slis|slos|error-budgets|logs|metrics|alerts|incidents|runbooks|backups|restore|recovery|rpo-rto|capacity|simulate <A-R>|release-gate|deployment-plan|rollback-plan|production-verification|dashboard-refresh|validate-all');
      return 3;
  }
}
process.exit(main());
