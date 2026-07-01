// tools/reliability_os/lib/dashboard.mjs
// MP47-48 — Reliability Dashboard + Owner Reliability Command Center. Derived, read-only.
export function buildDashboard(ds, ts) {
  const cat = ds.catalog || {}, health = ds.health || {}, plans = ds.plans || {}, rel = ds.release || {};
  const services = cat.services || [];
  return {
    schema: 'reliability_os.dashboard.v1',
    generated_ts: ts || 'UNSTAMPED',
    synthetic: true,
    note: 'Derived reliability view. All live health = UNKNOWN (no live checks). References Analytics/Security/Executive owners.',
    service_catalog: services.length,
    health_status: 'ALL_LIVE=UNKNOWN (offline; synthetic only)',
    critical_services: services.filter((s) => ['TIER_0_CANONICAL', 'TIER_1_CRITICAL'].includes(s.criticality)).map((s) => s.service_id),
    single_points_of_failure: (cat.dependency_graph?.detections?.single_points_of_failure || []).map((s) => s.spof),
    slo_proposals: (plans.slo_proposals || []).length,
    error_budgets: 'INSUFFICIENT_DATA (no live actuals)',
    alerts: (health.alert_rules || []).length,
    incidents: 0,
    queue_worker_scheduler: 'contracts defined; live UNKNOWN',
    communication_services: ['telegram (one-poller)', 'imap (read-only)'],
    backups: (plans.backup_inventory || []).length,
    restore: 'synthetic restore standard; production restore NOT executed',
    rpo_rto: (plans.rpo_rto || []).map((r) => ({ asset: r.asset, status: r.status })),
    capacity: (plans.capacity?.profiles || []).map((c) => ({ resource: c.resource, status: c.status })),
    release_readiness: rel.release_readiness_gate?.current_status || 'NOT_READY',
    owner_actions: [
      'select alert delivery channel (none chosen)',
      'approve SLO targets + RPO/RTO',
      'confirm owner/delivery/support capacity (UNKNOWN)',
      'authorize future live production verification',
    ],
    live_verification_required: services.filter((s) => s.live_verification_required).map((s) => s.service_id),
  };
}

export function buildOwnerCenter(ds, ts) {
  const cat = ds.catalog || {}, rel = ds.release || {}, plans = ds.plans || {};
  return {
    schema: 'reliability_os.owner_command_center.v1',
    generated_ts: ts || 'UNSTAMPED',
    synthetic: true,
    highest_reliability_risk: 'single VPS host SPOF (all production services) — DR + backups mitigate; owner accepts residual risk',
    service_requiring_live_verification: (cat.services || []).filter((s) => s.live_verification_required).length,
    stale_component: 'none observed (no live data); freshness contracts defined',
    backup_restore_blocker: 'production backup/restore NOT live-verified; encryption + off-site = owner decision',
    capacity_blocker: 'owner/delivery/support capacity UNKNOWN',
    open_incident: 'none (synthetic only)',
    release_blocker: rel.release_readiness_gate?.blocked_to_owner_review_by || [],
    owner_decision: ['alert channel', 'SLO/RPO/RTO approval', 'capacity', 'authorize live verification'],
    next_safe_action: 'Owner: approve SLO/RPO/RTO + select alert channel; then authorize the (offline-prepared) production verification plan',
    intentionally_not_done: ['no monitoring installed', 'no live health checks', 'no backup/restore executed', 'no load/chaos test', 'no service restart', 'no alert sent', 'no scheduled task', 'no proposed doc applied'],
  };
}
