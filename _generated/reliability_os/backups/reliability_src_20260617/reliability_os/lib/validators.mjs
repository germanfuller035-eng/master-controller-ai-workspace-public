// tools/reliability_os/lib/validators.mjs
// MP51 — validators across the reliability model + safety boundary. Pure, offline.
import {
  CRITICALITY, HEALTH_STATUS, CHECK_TYPES, SLO_STATUS, DEP_TYPES, ALERT_SEVERITY, ALERT_CATEGORIES,
  RPO_RTO_STATUS, CAPACITY_STATUS, RELEASE_GATE_STATUS, FORBIDDEN_LABELS, LOG_LEVELS,
  NETWORK_ALLOWED, LIVE_HEALTH_ALLOWED, PRODUCTION_READ_ALLOWED, PRODUCTION_MUTATION_ALLOWED,
  SERVICE_RESTART_ALLOWED, DEPLOY_ALLOWED, MONITORING_INSTALL_ALLOWED, BACKGROUND_PROCESS_ALLOWED,
  SCHEDULED_TASK_ALLOWED, LIVE_BACKUP_ALLOWED, PRODUCTION_RESTORE_ALLOWED, LIVE_LOAD_TEST_ALLOWED,
  LIVE_CHAOS_TEST_ALLOWED, ALERT_SEND_ALLOWED, MERGE_ALLOWED, FILE_DELETE_ALLOWED, DOC_APPLY_ALLOWED,
} from './common.mjs';
import { analyzeDependencies } from './engines.mjs';

const inSet = (s, v) => s.includes(v);

export function validateService(s) {
  const e = [];
  if (!s.service_id) e.push('service_id required');
  if (!s.owner) e.push(`${s.service_id}: owner required`);
  if (!inSet(CRITICALITY, s.criticality)) e.push(`${s.service_id}: bad criticality ${s.criticality}`);
  if (s.live_verification_required === undefined) e.push(`${s.service_id}: live_verification_required must be explicit`);
  return e;
}
export function validateHealthCheck(c) {
  const e = [];
  if (!c.check_id) e.push('check_id required');
  if (!inSet(CHECK_TYPES, c.type)) e.push(`${c.check_id}: bad check type ${c.type}`);
  if (c.live_required === undefined) e.push(`${c.check_id}: live_required must be explicit`);
  return e;
}
export function validateSlo(s) {
  const e = [];
  if (!s.slo_id) e.push('slo_id required');
  if (!inSet(SLO_STATUS, s.status) && !/OWNER_APPROVAL_REQUIRED/.test(s.status)) e.push(`${s.slo_id}: bad status ${s.status}`);
  if (s.status === 'LIVE_VALIDATED' && !s.evidence) e.push(`${s.slo_id}: LIVE_VALIDATED requires evidence`);
  // no synthetic SLO claimed as production-compliant
  if (/compliant|met/i.test(JSON.stringify(s)) && s.live_validation_required !== false) e.push(`${s.slo_id}: cannot claim compliance without live validation`);
  return e;
}
export function validateAlert(a) {
  const e = [];
  if (!a.alert_id) e.push('alert_id required');
  if (!inSet(ALERT_SEVERITY, a.severity)) e.push(`${a.alert_id}: bad severity ${a.severity}`);
  if (!inSet(ALERT_CATEGORIES, a.category)) e.push(`${a.alert_id}: bad category ${a.category}`);
  if (!a.dedupe_key) e.push(`${a.alert_id}: dedupe_key required`);
  if (!a.runbook) e.push(`${a.alert_id}: runbook required`);
  if (a.auto_action !== false) e.push(`${a.alert_id}: auto_action must default false`);
  return e;
}
export function validateRunbook(r) {
  const e = [];
  if (!r.runbook_id) e.push('runbook_id required');
  if (!r.trigger) e.push(`${r.runbook_id}: trigger required`);
  if (!('safe_diagnostics' in r)) e.push(`${r.runbook_id}: safe_diagnostics required`);
  if (r.owner_gate !== true) e.push(`${r.runbook_id}: owner_gate must be true`);
  return e;
}
export function validateMetricLabels(labels) {
  const e = [];
  for (const l of labels || []) if (FORBIDDEN_LABELS.includes(l)) e.push(`forbidden high-cardinality label: ${l}`);
  return e;
}
export function validateLogEvent(ev) {
  const e = [];
  const FORBIDDEN = ['secret', 'token', 'password', 'authorization', 'private_key', 'raw_body', 'attachment_body'];
  for (const k of Object.keys(ev || {})) if (FORBIDDEN.some((f) => k.toLowerCase().includes(f))) e.push(`forbidden log field: ${k}`);
  if (ev.level && !LOG_LEVELS.includes(ev.level)) e.push(`bad log level: ${ev.level}`);
  return e;
}
export function validateBackup(b) {
  const e = [];
  if (!b.backup_asset) e.push('backup_asset required');
  if (!b.integrity) e.push(`${b.backup_asset}: integrity method required`);
  // backup safety not claimed without restore test
  if (/safe|guaranteed/i.test(JSON.stringify(b)) && !b.restore_test) e.push(`${b.backup_asset}: cannot claim safe without restore test`);
  return e;
}
export function validateRpoRto(r) {
  const e = [];
  if (!inSet(RPO_RTO_STATUS, r.status)) e.push(`${r.asset}: bad RPO/RTO status ${r.status}`);
  if (r.status === 'OWNER_APPROVED' && r.owner_approval !== 'REQUIRED' && r.owner_approval !== 'APPROVED') e.push(`${r.asset}: approved needs owner_approval`);
  return e;
}
export function validateCapacity(c) {
  const e = [];
  if (!inSet(CAPACITY_STATUS, c.status)) e.push(`${c.capacity_id}: bad capacity status ${c.status}`);
  if (c.status === 'CONFIRMED' && !c.measurement_source) e.push(`${c.capacity_id}: CONFIRMED needs measurement_source`);
  return e;
}
export function validateReleaseGate(g) {
  const e = [];
  if (!inSet(RELEASE_GATE_STATUS, g.current_status)) e.push(`bad release gate status ${g.current_status}`);
  // cannot be OWNER_ACCEPTED without owner approval
  if (g.current_status === 'OWNER_ACCEPTED_REFERENCE' && g.evaluation?.owner_approval !== 'ACCEPTED') e.push('owner accept requires owner_approval=ACCEPTED');
  // live launch gate requires known production health
  if (g.current_status === 'READY_FOR_OWNER_REVIEW' && g.evaluation?.production_health === 'UNKNOWN' && !(g.blocked_to_owner_review_by || []).length) e.push('cannot be owner-review-ready for live launch with unknown production health');
  return e;
}
export function validateDependencyGraph(graph) {
  const r = analyzeDependencies(graph);
  const e = [];
  if (r.has_cycle) e.push('dependency cycle detected');
  for (const i of r.issues) e.push(`${i.edge}: ${i.issue}`);
  return e;
}

export function validateSafetyInvariants() {
  const e = [];
  const must = {
    NETWORK_ALLOWED, LIVE_HEALTH_ALLOWED, PRODUCTION_READ_ALLOWED, PRODUCTION_MUTATION_ALLOWED,
    SERVICE_RESTART_ALLOWED, DEPLOY_ALLOWED, MONITORING_INSTALL_ALLOWED, BACKGROUND_PROCESS_ALLOWED,
    SCHEDULED_TASK_ALLOWED, LIVE_BACKUP_ALLOWED, PRODUCTION_RESTORE_ALLOWED, LIVE_LOAD_TEST_ALLOWED,
    LIVE_CHAOS_TEST_ALLOWED, ALERT_SEND_ALLOWED, MERGE_ALLOWED, FILE_DELETE_ALLOWED, DOC_APPLY_ALLOWED,
  };
  for (const [k, v] of Object.entries(must)) if (v !== false) e.push(`${k} must be false`);
  return e;
}

export function validateAll(ds) {
  const dims = {}; let blockers = 0;
  const add = (n, errs) => { dims[n] = errs.length === 0 ? 'PASS' : `FAIL(${errs.length})`; blockers += errs.length; };
  add('safety_invariants', validateSafetyInvariants());
  add('services', (ds.catalog?.services || []).flatMap(validateService));
  add('dependency_graph', validateDependencyGraph(ds.catalog?.dependency_graph || { edges: [] }));
  add('health_checks', Object.values(ds.health?.health_contracts || {}).flatMap((c) => (c.checks || []).flatMap(validateHealthCheck)));
  add('slos', (ds.plans?.slo_proposals || []).flatMap(validateSlo));
  add('alerts', (ds.health?.alert_rules || []).flatMap(validateAlert));
  add('runbooks', (ds.plans?.runbooks || []).flatMap(validateRunbook));
  add('backups', (ds.plans?.backup_inventory || []).flatMap(validateBackup));
  add('rpo_rto', (ds.plans?.rpo_rto || []).flatMap(validateRpoRto));
  add('capacity', (ds.plans?.capacity?.profiles || []).flatMap(validateCapacity));
  add('release_gate', validateReleaseGate(ds.release?.release_readiness_gate || {}));
  return { blockers, dimensions: dims };
}
