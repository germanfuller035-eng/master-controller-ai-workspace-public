#!/usr/bin/env node
// tools/reliability_os/tests/reliability_os.test.mjs — MP52 comprehensive offline tests.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateService, validateHealthCheck, validateSlo, validateAlert, validateRunbook,
  validateMetricLabels, validateLogEvent, validateBackup, validateRpoRto, validateCapacity,
  validateReleaseGate, validateDependencyGraph, validateSafetyInvariants, validateAll,
} from '../lib/validators.mjs';
import { analyzeDependencies, errorBudget, injectFailure, runScenario, SCENARIOS, FAILURE_KINDS } from '../lib/engines.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const L = (n) => JSON.parse(readFileSync(path.join(ROOT, n), 'utf8'));
const inv = L('data/inventory.json');
const catalog = L('data/service_catalog.json');
const health = L('data/health_observability.json');
const plans = L('data/reliability_plans.json');
const release = L('data/release_deployment.json');
const FX = L('fixtures/reliability_fixtures.json');

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) pass++; else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };

// ---- Security report completeness (MP2) ----
const secReport = readFileSync(path.resolve(ROOT, '../../_generated/security_os/reports/FINAL_REPORT.md'), 'utf8');
ok('security report present + complete ending', /Self-test verified/.test(secReport.trim().split('\n').pop()));
const secControls = L('../security_os/data/controls.json');
ok('security incident_response complete', secControls.incident_response.types.length === 12);
ok('security vuln_management complete', secControls.vulnerability_management.statuses.length === 9);
ok('security compliance complete', secControls.compliance_control_mapping.length === 12);
ok('security release gate present', secControls.security_release_gate.current_status === 'READY_FOR_OWNER_REVIEW');

// ---- Inventory + service catalog + criticality (MP3-5) ----
ok('inventory rows', inv.rows.length >= 12);
ok('services valid', catalog.services.flatMap(validateService).length === 0, catalog.services.flatMap(validateService).join('; '));
ok('criticality tiers used', new Set(catalog.services.map((s) => s.criticality)).size >= 4);
ok('canonical store TIER_0', catalog.services.find((s) => s.service_id === 'canonical_store').criticality === 'TIER_0_CANONICAL');
ok('all services explicit live_verification_required', catalog.services.every((s) => s.live_verification_required !== undefined));

// ---- Dependency graph + SPOF (MP6-7) ----
{
  const r = analyzeDependencies(catalog.dependency_graph);
  ok('dependency graph no cycle', r.has_cycle === false);
  ok('dependency graph valid (no missing modes)', validateDependencyGraph(catalog.dependency_graph).length === 0, validateDependencyGraph(catalog.dependency_graph).join('; '));
  ok('SPOF detected (vps_host)', catalog.dependency_graph.detections.single_points_of_failure.some((s) => s.spof === 'vps_host'));
  ok('shared critical dependency (canonical)', r.shared_critical.some((s) => s.provider === 'canonical_store') || catalog.dependency_graph.detections.shared_critical_dependency.length >= 1);
  ok('failure domains complete', catalog.failure_domains.length >= 14);
  ok('vps_host failure = ALL_PRODUCTION', catalog.failure_domains.find((f) => f.failure_domain === 'vps_host').blast_radius === 'ALL_PRODUCTION');
}

// ---- Health standard + contracts (MP9-14) ----
ok('health semantic rule (liveness != readiness)', health.health_standard.semantic_rules.some((r) => /liveness does not prove readiness/.test(r)));
ok('health default UNKNOWN', health.health_standard.default_live_status === 'UNKNOWN');
ok('MC health checks valid', health.health_contracts.master_controller.checks.flatMap(validateHealthCheck).length === 0);
ok('MC autosend boundary check', health.health_contracts.master_controller.checks.some((c) => c.check_id === 'mc_autosend_state'));
ok('telegram one-poller check', health.health_contracts.telegram.checks.some((c) => c.check_id === 'tg_one_poller'));
ok('imap read-only check', health.health_contracts.imap.checks.some((c) => c.check_id === 'imap_read_only'));
ok('backup checksum + restore-test-age checks', health.health_contracts.backup.checks.some((c) => c.check_id === 'bk_checksum') && health.health_contracts.backup.checks.some((c) => c.check_id === 'bk_restore_test_age'));
ok('android no offline mutation check', health.health_contracts.android.checks.some((c) => c.check_id === 'and_no_offline_mutation'));

// ---- SLI/SLO/error budget (MP15-17) ----
ok('SLI catalog present', plans.sli_catalog.length >= 10);
ok('SLOs valid', plans.slo_proposals.flatMap(validateSlo).length === 0, plans.slo_proposals.flatMap(validateSlo).join('; '));
ok('no SLO claims live without validation', plans.slo_proposals.every((s) => s.status !== 'LIVE_VALIDATED'));
ok('error budget insufficient data when no actuals', errorBudget({ allowed_failure_ratio: 0.01, observed_failure_ratio: null }).status === 'INSUFFICIENT_DATA');
ok('error budget exhausted detected', errorBudget({ allowed_failure_ratio: 0.01, observed_failure_ratio: 0.05 }).status === 'EXHAUSTED');
ok('error budget fast burn', errorBudget({ allowed_failure_ratio: 0.01, observed_failure_ratio: 0.0095 }).status === 'FAST_BURN');

// ---- Logging + correlation + metric + cardinality (MP18-22) ----
ok('log standard prohibits secrets', health.logging_standard.prohibited.includes('secrets'));
ok('log event validator blocks token field', validateLogEvent({ level: 'INFO', token: 'x' }).length >= 1);
ok('log event valid clean', validateLogEvent({ level: 'INFO', service: 'api', request_id: 'r' }).length === 0);
ok('correlation: no personal id rule', health.correlation_standard.rules.some((r) => /no personal identifier/.test(r)));
ok('metric forbidden label blocked', validateMetricLabels(['canonical_lead_id']).length === 1);
ok('metric allowed label ok', validateMetricLabels(['service', 'status']).length === 0);

// ---- Observability events + alerts + fatigue (MP23-25) ----
ok('observability events (no emitter)', health.observability_events.length >= 18 && /no emitter/i.test(health.observability_note));
ok('alerts valid', health.alert_rules.flatMap(validateAlert).length === 0, health.alert_rules.flatMap(validateAlert).join('; '));
ok('alerts default no auto-action', health.alert_rules.every((a) => a.auto_action === false));
ok('unexpected_send is P0 hard blocker', health.alert_rules.find((a) => a.alert_id === 'a_unexpected_send').hard_blocker === true);
ok('alert fatigue do-not-wake list', health.alert_fatigue_controls.do_not_wake_owner.includes('INFO'));
ok('alert channel not selected', /NONE_SELECTED/.test(health.alert_fatigue_controls.external_channel));

// ---- Incident reconciliation + runbooks (MP26-28) ----
ok('incident domains separated', Object.keys(plans.incident_reconciliation.domains).length >= 5);
ok('reliability lifecycle distinct', plans.reliability_incident_lifecycle.includes('ROOT_CAUSE_ANALYSIS'));
ok('runbooks >= 25', plans.runbooks.length >= 25, `count=${plans.runbooks.length}`);
ok('all runbooks valid', plans.runbooks.flatMap(validateRunbook).length === 0, plans.runbooks.flatMap(validateRunbook).join('; '));
ok('unexpected-send runbook hard blocker + security handoff', plans.runbooks.find((r) => r.runbook_id === 'rb_unexpected_send').hard_blocker === true);
ok('runbooks separate safe/dangerous/owner-gated', plans.runbooks.every((r) => 'safe_diagnostics' in r && r.owner_gate === true));

// ---- Backup / RPO-RTO / restore (MP29-32) ----
ok('backup inventory complete', plans.backup_inventory.length >= 10);
ok('backups valid', plans.backup_inventory.flatMap(validateBackup).length === 0);
ok('canonical backup highest priority', plans.backup_inventory.some((b) => b.backup_asset === 'canonical_data'));
ok('rpo/rto valid', plans.rpo_rto.flatMap(validateRpoRto).length === 0, plans.rpo_rto.flatMap(validateRpoRto).join('; '));
ok('rpo/rto not invented as approved', plans.rpo_rto.filter((r) => r.status === 'OWNER_APPROVED').every((r) => r.owner_approval));
ok('restore standard verifies no production overwrite', plans.restore_test_standard.must_verify.includes('no accidental production overwrite'));

// ---- DR + continuity + capacity (MP33-36) ----
ok('DR scenarios >= 12', plans.disaster_recovery.length >= 12);
ok('DR vps_loss priority 1', plans.disaster_recovery.find((d) => d.scenario === 'vps_loss').recovery_priority === 1);
ok('continuity no auto activation', /no automatic continuity activation/.test(plans.business_continuity.rule));
ok('continuity owner-unavailable = no autonomous commercial', plans.business_continuity.minimum_viable_operation.some((m) => /no autonomous commercial/.test(m.mvo)));
ok('capacity valid', plans.capacity.profiles.flatMap(validateCapacity).length === 0);
ok('capacity disk preserves backup space', /preserve backup/.test(plans.capacity.profiles.find((c) => c.resource === 'disk').critical));
ok('owner capacity UNKNOWN', plans.capacity.profiles.find((c) => c.resource === 'owner_review_capacity').status === 'UNKNOWN');

// ---- Failure simulator + E2E (MP37-38) ----
for (const k of FAILURE_KINDS) ok(`failure inject: ${k}`, injectFailure(k).detected === true && injectFailure(k).production_affected === false);
for (const s of SCENARIOS) ok(`e2e scenario ${s}`, runScenario(s).ok === true && runScenario(s).production_affected === false);
ok('e2e O unexpected-send hard blocker', runScenario('O').hard_blocker === true);
ok('e2e R canonical corruption hard blocker', runScenario('R').hard_blocker === true);
ok('e2e K restore-fail no production touched', /no production touched/.test(JSON.stringify(runScenario('K').steps)));

// ---- Release / deployment / rollback / soak / production verification (MP39-45) ----
ok('release gate valid', validateReleaseGate(release.release_readiness_gate).length === 0, validateReleaseGate(release.release_readiness_gate).join('; '));
ok('release gate blocked from owner-review for live launch', release.release_readiness_gate.blocked_to_owner_review_by.length >= 1);
ok('release gate hard blockers include unverified backup/restore', release.release_readiness_gate.hard_blockers.includes('backup_unverified') && release.release_readiness_gate.hard_blockers.includes('restore_unverified'));
ok('deployment requires owner approval', /owner approval/i.test(release.deployment_contract.rule));
ok('rollback no overwrite newer canonical', /no rollback can overwrite newer canonical data blindly/.test(release.rollback_standard.hard_rule));
ok('soak explicit send-count definition', /outbound_send_ledger/.test(release.soak_standard.send_count_definition));
ok('soak prevents partial-pass', release.soak_standard.prevent.some((p) => /partial observation final PASS/.test(p)));
ok('production verification not executed', release.production_verification_plan.executed === false);

// ---- Observability contracts (MP46) ----
ok('observability contracts reference owners', /derived metrics/.test(release.observability_contracts.analytics_os[0]) && /security incidents/.test(release.observability_contracts.security_os[0]));

// ---- Aggregate + safety ----
ok('safety invariants locked', validateSafetyInvariants().length === 0);
ok('validate-all 0 blockers', validateAll({ inv, catalog, health, plans, release, fixtures: FX }).blockers === 0);

console.log(`\nreliability_os.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
