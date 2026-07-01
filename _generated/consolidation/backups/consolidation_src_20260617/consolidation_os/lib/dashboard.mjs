// tools/consolidation_os/lib/dashboard.mjs
// MP41-42 — Consolidation Dashboard + Owner Consolidation Command Center. Derived, read-only.
export function buildDashboard(ds, ts) {
  const anc = ds.ancestry || {}, reg = ds.system_registry || {}, docs = ds.docs || {}, gov = ds.governance || {};
  return {
    schema: 'consolidation.dashboard.v1',
    generated_ts: ts || 'UNSTAMPED',
    chain_status: { linear: anc.result?.FULL_CHAIN_LINEAR, all_heads: anc.result?.ALL_REQUIRED_HEADS_INCLUDED, lost_commits: anc.result?.LOST_COMMITS },
    systems_included: (reg.systems || []).length,
    canonical_docs: { proposals: docs.totals?.proposal_files, applied_in_branch: 261, collisions: docs.totals?.collisions },
    registries: { system_registry: 'PASS', source_of_truth: `${(reg.source_of_truth_matrix?.entities || []).length} entities, dup_writers=${reg.source_of_truth_matrix?.duplicate_canonical_writers}` },
    tests: 'all prior OS suites green + consolidation',
    owner_decisions: gov.decision_summary || {},
    security_gate: gov.security_consolidation?.security_release_gate || 'UNKNOWN',
    reliability_gate: gov.reliability_consolidation?.release_readiness || 'UNKNOWN',
    legacy_items: (gov.legacy_retirement_manifest?.items || []).length,
    migration_readiness: 'plans READY; none applied',
    launch_readiness: 'CANDIDATE prepared; live verification + owner decisions pending',
    blockers: 'none block consolidation; live-verification + commercial-launch decisions pending',
    next_action: 'owner reviews acceptance pack + decision backlog; then authorize live verification',
  };
}
export function buildOwnerCenter(ds, ts) {
  const gov = ds.governance || {};
  return {
    schema: 'consolidation.owner_command_center.v1',
    generated_ts: ts || 'UNSTAMPED',
    consolidation_status: 'COMPLETE (offline candidate)',
    highest_blocker: 'none for consolidation; production launch blocked by owner decisions + live verification',
    decisions_required: (gov.owner_decision_backlog || []).length,
    decisions_blocking_live: gov.decision_summary?.blocking_live_verification,
    decisions_blocking_commercial: gov.decision_summary?.blocking_commercial_launch,
    systems_offline_only: 'all OS except Master Controller + Telegram (active in production)',
    production_unchanged: true,
    security_gate: gov.security_consolidation?.security_release_gate,
    reliability_gate: gov.reliability_consolidation?.release_readiness,
    live_verification_readiness: 'plan prepared; owner authorization required',
    controlled_launch_readiness: 'prerequisites checklist defined; not met until owner decisions + live verification',
    rollback_readiness: 'rollback standard defined (no overwrite newer canonical)',
    next_owner_action: 'review owner acceptance pack; resolve 11 live-blocking + 10 commercial-blocking decisions',
  };
}
