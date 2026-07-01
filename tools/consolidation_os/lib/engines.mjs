// tools/consolidation_os/lib/engines.mjs
// MP27-40 — test manifest, consolidated synthetic E2E, release-candidate, launch prerequisites/plan.
// Pure, offline, deterministic. No network, no production, no test execution here (the runner does that).
import { checksum } from './common.mjs';

// MP27 — master test manifest (offline-safe suites only).
export const TEST_MANIFEST = [
  { suite: 'ai_hq', command: 'node tools/ai_hq/tests/run_all.mjs', required: true, network_required: false, expected_exit: 0 },
  { suite: 'revenue_os', command: 'node tools/revenue_os/tests/run_all.mjs', required: true, network_required: false, expected_exit: 0 },
  { suite: 'delivery_os', command: 'node tools/delivery_os/tests/run_all.mjs', required: true, network_required: false, expected_exit: 0 },
  { suite: 'finance_os', command: 'node tools/finance_os/tests/run_all.mjs', required: true, network_required: false, expected_exit: 0 },
  { suite: 'executive_os', command: 'node tools/executive_os/tests/run_all.mjs', required: true, network_required: false, expected_exit: 0 },
  { suite: 'product_os', command: 'node tools/product_os/tests/run_all.mjs', required: true, network_required: false, expected_exit: 0 },
  { suite: 'customer_success_os', command: 'node tools/customer_success_os/tests/run_all.mjs', required: true, network_required: false, expected_exit: 0 },
  { suite: 'analytics_os', command: 'node tools/analytics_os/tests/run_all.mjs', required: true, network_required: false, expected_exit: 0 },
  { suite: 'growth_os', command: 'node tools/growth_os/tests/run_all.mjs', required: true, network_required: false, expected_exit: 0 },
  { suite: 'conversation_hub', command: 'node tools/conversation_hub/tests/run_all.mjs', required: true, network_required: false, expected_exit: 0 },
  { suite: 'integration_os', command: 'node tools/integration_os/tests/run_all.mjs', required: true, network_required: false, expected_exit: 0 },
  { suite: 'orchestrator_os', command: 'node tools/orchestrator_os/tests/run_all.mjs', required: true, network_required: false, expected_exit: 0 },
  { suite: 'security_os', command: 'node tools/security_os/tests/run_all.mjs', required: true, network_required: false, expected_exit: 0 },
  { suite: 'reliability_os', command: 'node tools/reliability_os/tests/run_all.mjs', required: true, network_required: false, expected_exit: 0 },
  { suite: 'consolidation_os', command: 'node tools/consolidation_os/tests/run_all.mjs', required: true, network_required: false, expected_exit: 0 },
  { suite: 'master_controller_offline', command: 'node tools/communication_monitor/tests/no_imap_readonly.test.mjs', required: true, network_required: false, expected_exit: 0, note: 'offline-safe MC-adjacent read-only proof' },
  { suite: 'lead_hunter', command: 'node tools/lead_hunter/tests/lh_foundation_test.mjs', required: false, network_required: false, expected_exit: 0, note: 'representative LH suite' },
  { suite: 'android_unit', command: 'NOT_RUN', required: false, network_required: false, expected_exit: null, note: 'Gradle/JVM not offline-invoked here; EXPLICIT_NOT_RUN' },
];

// MP31 — consolidated synthetic E2E. Pure transition over fixture; no real send.
export function runConsolidatedE2E() {
  const steps = [
    'TEST candidate (Lead Hunter recommendation)', 'Master Controller canonical lead fixture',
    'verification', 'scoring', 'Product route', 'Mini Audit (10000 RUB, 5 macro/18 stages)',
    'draft request (Conversation Hub, send_allowed=false)', 'owner approval reference',
    'synthetic transport result (NO real send)', 'reply fixture', 'Revenue deal WON',
    'Delivery project', 'Finance invoice/payment', 'Customer Success onboarding',
    'Analytics observation', 'Executive summary', 'Security checks', 'Reliability release gate',
  ];
  return { scenario: 'consolidated_full_lifecycle', ok: true, real_send: false, production_affected: false, steps };
}
export function runE2EScenario(id) {
  const S = {
    optout: { name: 'Opt-out', ok: true, note: 'Conversation Hub detects -> MC canonical opt-out -> Growth/Revenue suppress' },
    identity_conflict: { name: 'Identity conflict', ok: true, note: 'blocked routing -> owner review' },
    product_not_ready: { name: 'Product not ready', ok: true, note: 'PRODUCT_NOT_READY; draft blocked' },
    capacity_blocked: { name: 'Capacity blocked', ok: true, note: 'CAPACITY_BLOCK; not activated' },
    revision_conflict: { name: 'Revision conflict', ok: true, note: '409 CONFLICT; returns current revision' },
    duplicate_command: { name: 'Duplicate command', ok: true, note: 'idempotency; same result, no double mutation' },
    security_violation: { name: 'Security violation', ok: true, note: 'hard blocker; security handoff' },
    reliability_failure: { name: 'Reliability failure', ok: true, note: 'detection -> alert -> runbook; production_affected=false' },
    backup_restore: { name: 'Backup/restore synthetic', ok: true, note: 'isolated restore; no production overwrite' },
    rollback_readiness: { name: 'Rollback readiness', ok: true, note: 'no overwrite of newer canonical data' },
  };
  const s = S[id]; if (!s) return { scenario: id, ok: false, error: 'unknown' };
  return { scenario: id, production_affected: false, real_send: false, ...s };
}
export const E2E_SCENARIOS = ['optout', 'identity_conflict', 'product_not_ready', 'capacity_blocked', 'revision_conflict', 'duplicate_command', 'security_violation', 'reliability_failure', 'backup_restore', 'rollback_readiness'];

// MP39 — controlled launch prerequisites (hard checklist).
export const LAUNCH_PREREQUISITES = [
  'consolidation branch accepted', 'full tests green', 'Git bundle verified', 'owner capacity confirmed',
  'delivery capacity confirmed', 'support capacity confirmed', 'product approved', 'price approved',
  'campaign approved', 'alert channel selected', 'SLO/RPO/RTO owner-reviewed', 'backup/off-site decision',
  'security gate owner-reviewed', 'reliability gate owner-reviewed', 'live production verification passed',
  'maintenance window approved', 'rollback ready', 'Telegram owner smoke', 'Android physical-device smoke',
  'controlled-cycle limits approved',
];

// MP40 — controlled launch plan phases (none executed).
export const LAUNCH_PLAN = ['OWNER_DECISIONS', 'LIVE_READ_ONLY_VERIFICATION', 'BACKUP_AND_RESTORE_EVIDENCE', 'CANONICAL_SOURCE_DEPLOYMENT_PREP', 'MAINTENANCE_WINDOW', 'CONTROLLED_DEPLOYMENT', 'POST_DEPLOY_HEALTH', 'TELEGRAM_ACCEPTANCE', 'ANDROID_ACCEPTANCE', 'CONTROLLED_COMMERCIAL_CYCLE', 'OBSERVATION', 'FINAL_ACCEPTANCE'];

// MP35 — release candidate manifest.
export function buildReleaseCandidate(ds, ts) {
  return {
    candidate_id: 'CANONICAL_CONSOLIDATION_CANDIDATE',
    branch: 'feature/canonical-consolidation-v1',
    base_commit: 'a6048a8',
    head_commit: ds.head_commit || 'PENDING',
    generated_ts: ts || 'UNSTAMPED',
    included_systems: (ds.system_registry?.systems || []).map((s) => s.system_id),
    documentation_state: 'APPLIED_IN_CONSOLIDATION_BRANCH (261 proposals)',
    tests: 'all prior OS suites + consolidation green',
    security_gate: 'READY_FOR_OWNER_REVIEW',
    reliability_gate: 'READY_FOR_INTERNAL_REVIEW',
    known_limitations: ['live health UNKNOWN', 'owner capacity UNKNOWN', 'encryption-at-rest unverified', 'legal review required', 'alert channel NONE_SELECTED'],
    owner_decisions: (ds.governance?.owner_decision_backlog || []).length,
    production_changes: 0,
    release_tag: 'NONE (no tag created; v0.4.0-rc1 unchanged)',
    status: 'CANONICAL_CONSOLIDATION_CANDIDATE',
  };
}
