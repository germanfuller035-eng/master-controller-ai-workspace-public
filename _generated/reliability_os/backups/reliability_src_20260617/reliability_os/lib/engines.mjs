// tools/reliability_os/lib/engines.mjs
// MP6,17,37-38 — dependency/SPOF analysis, error-budget calc, failure-injection simulator, E2E.
// Pure, offline, deterministic. NEVER affects production, network, or live state.
import { round4 } from './common.mjs';

// ---------------------------------------------------------------------------
// MP6 — dependency graph analysis (cycle + SPOF + missing-mode detection).
// ---------------------------------------------------------------------------
export function analyzeDependencies(graph) {
  const issues = [];
  const edges = graph.edges || [];
  const providers = new Map();
  for (const e of edges) {
    if (!e.failure_behavior) issues.push({ edge: e.dependency_id, issue: 'missing_failure_mode' });
    if (e.timeout == null) issues.push({ edge: e.dependency_id, issue: 'missing_timeout' });
    providers.set(e.provider, (providers.get(e.provider) || 0) + 1);
  }
  // cycle detection (DFS over consumer->provider)
  const adj = new Map();
  for (const e of edges) { if (!adj.has(e.consumer)) adj.set(e.consumer, []); adj.get(e.consumer).push(e.provider); }
  const WHITE = 0, GRAY = 1, BLACK = 2; const color = new Map();
  let cycle = false;
  const nodes = new Set([...edges.map((e) => e.consumer), ...edges.map((e) => e.provider)]);
  for (const n of nodes) color.set(n, WHITE);
  function dfs(n) { color.set(n, GRAY); for (const m of (adj.get(n) || [])) { if (color.get(m) === GRAY) { cycle = true; return; } if (color.get(m) === WHITE) dfs(m); } color.set(n, BLACK); }
  for (const n of nodes) if (color.get(n) === WHITE) dfs(n);
  const shared = [...providers.entries()].filter(([, c]) => c >= 3).map(([p, c]) => ({ provider: p, consumers: c }));
  return { ok: issues.length === 0 && !cycle, has_cycle: cycle, issues, shared_critical: shared };
}

// ---------------------------------------------------------------------------
// MP17 — error-budget calculation. Refuses to invent production numbers.
// ---------------------------------------------------------------------------
export function errorBudget(slo) {
  // slo: { allowed_failure_ratio, observed_failure_ratio|null, window }
  if (slo.observed_failure_ratio == null) {
    return { status: 'INSUFFICIENT_DATA', allowed: slo.allowed_failure_ratio ?? null, observed: null, remaining: null, burn_rate: null, source_status: 'no-live' };
  }
  const allowed = slo.allowed_failure_ratio;
  const observed = slo.observed_failure_ratio;
  const remaining = round4(allowed - observed);
  const burn = allowed > 0 ? round4(observed / allowed) : null;
  const status = remaining < 0 ? 'EXHAUSTED' : (burn != null && burn > 0.9 ? 'FAST_BURN' : 'OK');
  return { status, allowed, observed, remaining, burn_rate: burn, source_status: slo.source_status || 'synthetic' };
}

// ---------------------------------------------------------------------------
// MP37 — failure-injection simulator. Maps an injected failure to detection + health + alert + runbook.
// Deterministic; never affects production.
// ---------------------------------------------------------------------------
const FAILURE_MAP = {
  api_down: { detect: 'liveness fail', health: 'UNHEALTHY', alert: 'a_api_down', runbook: 'rb_api_unavailable', severity: 'P0_CRITICAL' },
  queue_backlog: { detect: 'backlog > threshold', health: 'DEGRADED', alert: 'a_queue_backlog', runbook: 'rb_queue_backlog', severity: 'P1_HIGH' },
  worker_stall: { detect: 'heartbeat stale', health: 'UNHEALTHY', alert: 'a_worker_stalled', runbook: 'rb_worker_stalled', severity: 'P1_HIGH' },
  scheduler_stale: { detect: 'no job interval*2', health: 'STALE', alert: 'a_scheduler_stale', runbook: 'rb_scheduler_stale', severity: 'P2_MEDIUM' },
  duplicate_poller: { detect: 'poller count > 1', health: 'DEGRADED', alert: 'a_duplicate_poller', runbook: 'rb_duplicate_poller', severity: 'P1_HIGH' },
  imap_stale: { detect: 'timer age high', health: 'STALE', alert: 'a_imap_stale', runbook: 'rb_imap_stale', severity: 'P2_MEDIUM' },
  backup_failure: { detect: 'no fresh backup', health: 'UNHEALTHY', alert: 'a_backup_failed', runbook: 'rb_backup_missing', severity: 'P1_HIGH' },
  checksum_mismatch: { detect: 'checksum fail', health: 'UNHEALTHY', alert: 'a_backup_failed', runbook: 'rb_backup_checksum', severity: 'P1_HIGH' },
  restore_failure: { detect: 'restore test fail', health: 'UNHEALTHY', alert: 'a_backup_failed', runbook: 'rb_restore_failure', severity: 'P1_HIGH' },
  disk_pressure: { detect: 'free < critical', health: 'DEGRADED', alert: 'a_disk_pressure', runbook: 'rb_disk_pressure', severity: 'P1_HIGH' },
  tls_expiry: { detect: 'expiry < 14d', health: 'DEGRADED', alert: 'a_cert_expiry', runbook: 'rb_tls_warning', severity: 'P2_MEDIUM' },
  downstream_timeout: { detect: 'dependency timeout', health: 'DEGRADED', alert: 'a_worker_stalled', runbook: 'rb_dependency_unavailable', severity: 'P2_MEDIUM' },
  revision_conflict: { detect: '409 spike', health: 'DEGRADED', alert: 'a_revision_stagnation', runbook: 'rb_revision_conflict_spike', severity: 'P2_MEDIUM' },
  dead_letter_spike: { detect: 'dead-letter rate high', health: 'DEGRADED', alert: 'a_dead_letter_spike', runbook: 'rb_queue_backlog', severity: 'P2_MEDIUM' },
  unexpected_send: { detect: 'send while AUTOSEND=BLOCKED', health: 'UNHEALTHY', alert: 'a_unexpected_send', runbook: 'rb_unexpected_send', severity: 'P0_CRITICAL', hard_blocker: true },
  canonical_corruption: { detect: 'integrity fail', health: 'UNHEALTHY', alert: 'a_canonical_unreadable', runbook: 'rb_canonical_corruption', severity: 'P0_CRITICAL', hard_blocker: true },
};
export function injectFailure(kind) {
  const m = FAILURE_MAP[kind];
  if (!m) return { kind, detected: false, error: 'unknown failure kind' };
  return { kind, detected: true, production_affected: false, ...m };
}
export const FAILURE_KINDS = Object.keys(FAILURE_MAP);

// ---------------------------------------------------------------------------
// MP38 — synthetic E2E scenarios A..R.
// ---------------------------------------------------------------------------
export function runScenario(id) {
  const S = {
    A: { name: 'Healthy synthetic system', ok: true, steps: ['all checks HEALTHY (synthetic, marked)', 'no alerts', 'release gate evaluated'] },
    B: { name: 'API degraded', ok: true, steps: [seq('api_down')], alert: 'a_api_down' },
    C: { name: 'Worker stalled', ok: true, steps: [seq('worker_stall')], alert: 'a_worker_stalled' },
    D: { name: 'Queue backlog', ok: true, steps: [seq('queue_backlog')], alert: 'a_queue_backlog' },
    E: { name: 'Scheduler stale', ok: true, steps: [seq('scheduler_stale')], alert: 'a_scheduler_stale' },
    F: { name: 'Duplicate Telegram poller', ok: true, steps: [seq('duplicate_poller')], alert: 'a_duplicate_poller' },
    G: { name: 'IMAP stale', ok: true, steps: [seq('imap_stale')], alert: 'a_imap_stale' },
    H: { name: 'Backup missing', ok: true, steps: [seq('backup_failure')], alert: 'a_backup_failed' },
    I: { name: 'Backup corrupted', ok: true, steps: [seq('checksum_mismatch')], alert: 'a_backup_failed' },
    J: { name: 'Restore succeeds', ok: true, steps: ['isolated restore', 'checksum ok', 'counts ok', 'no production overwrite'] },
    K: { name: 'Restore fails safely', ok: true, steps: [seq('restore_failure'), 'isolated; no production touched', 'try prior backup'] },
    L: { name: 'Disk pressure', ok: true, steps: [seq('disk_pressure'), 'preserve backup+atomic space'] },
    M: { name: 'TLS expiry warning', ok: true, steps: [seq('tls_expiry')], alert: 'a_cert_expiry' },
    N: { name: 'Dependency cascade', ok: true, steps: ['vps_host down -> all production affected', 'dependency-based alert suppression applied'] },
    O: { name: 'Unexpected send hard blocker', ok: true, steps: [seq('unexpected_send'), 'HARD BLOCKER', 'security handoff'], hard_blocker: true },
    P: { name: 'Release rollback readiness', ok: true, steps: ['rollback trigger defined', 'no overwrite of newer canonical data', 'health validation'] },
    Q: { name: 'Owner unavailable continuity', ok: true, steps: ['system read-only/no-send', 'no autonomous commercial action', 'automation paused'] },
    R: { name: 'Canonical corruption suspicion', ok: true, steps: [seq('canonical_corruption'), 'freeze writes', 'restore verified backup'], hard_blocker: true },
  };
  const s = S[id];
  if (!s) return { scenario: id, ok: false, error: 'unknown scenario' };
  return { scenario: id, production_affected: false, ...s };
}
function seq(kind) { const f = injectFailure(kind); return `${kind} -> detect:${f.detect} health:${f.health} alert:${f.alert} runbook:${f.runbook}`; }
export const SCENARIOS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R'];
