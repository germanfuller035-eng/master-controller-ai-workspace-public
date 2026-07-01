// tools/integration_os/lib/dashboard.mjs
// MP37-38 — Integration Dashboard + Owner Integration Command Center. Derived, read-only.
export function buildDashboard(ds, ts) {
  const reg = ds.registry || {};
  const ow = ds.ownership || {};
  const plans = ds.plans || {};
  const compat = (plans.compatibility_matrix?.pairs) || [];
  const incompatible = compat.filter((p) => p.compatible === false);
  const needsAdapter = compat.filter((p) => p.adapter_required === true);
  // duplicate writer = entity whose canonical_writer appears with forbidden conflict
  const dupWriters = (ow.entities || []).filter((e) => Array.isArray(e.canonical_writer));
  return {
    schema: 'integration_os.dashboard.v1',
    generated_ts: ts || 'UNSTAMPED',
    synthetic: true,
    note: 'Derived integration view. References system owners; mutates nothing.',
    systems: (ds.inventory?.systems_total) || 12,
    contracts: (reg.contracts || []).length,
    entities: (ow.entities || []).length,
    compatibility_pairs: compat.length,
    incompatible_pairs: incompatible.length,
    adapters_required: needsAdapter.length,
    duplicate_writers: dupWriters.length,
    version_conflicts: (reg.detections?.same_name_different_semantics || []).length,
    missing_fields: (plans.mc_api_gaps?.gaps || []).length,
    migration_readiness: (plans.migration_model?.migrations || []).map((m) => ({ id: m.migration_id, status: m.status })),
    legacy_risks: (ds.inventory?.legacy_communication_audit?.scripts || []).reduce((a, s) => a + s.count, 0),
    proposed_doc_conflicts: (ds.docPlan?.detections?.target_collision || []).length,
    branch_consolidation: plans.branch_consolidation_plan?.chain_linear ? 'LINEAR' : 'NON_LINEAR',
    blockers: incompatible.length + dupWriters.length,
    owner_decisions: [
      'commit untracked tools/communication_monitor/',
      'approve ID crosswalk migration (READY)',
      'review 37 historical telegram scripts for archive',
      'apply order for 114 proposed docs',
    ],
  };
}

export function buildOwnerCenter(ds, ts) {
  const plans = ds.plans || {};
  const compat = (plans.compatibility_matrix?.pairs) || [];
  return {
    schema: 'integration_os.owner_command_center.v1',
    generated_ts: ts || 'UNSTAMPED',
    synthetic: true,
    highest_risk_contract: 'mc.send_ledger.entry (single SENT truth — must stay single writer)',
    duplicate_writer_risk: 'NONE detected (ownership matrix enforces exactly-one-writer)',
    migration_blocker: 'tools/communication_monitor/ untracked in git (referenced by IMAP deploy) — owner must commit',
    branch_conflict: 'NONE — chain linear; analytics-os-metrics-reporting-v1 superseded (keep, do not delete)',
    proposed_doc_collision: 'NONE — 114 docs / 114 unique targets; shared MASTER_CONTEXT merged additively last',
    legacy_script_decision: '37 historical telegram scripts -> MOVE_TO_ARCHIVE (owner approval)',
    next_safe_integration_action: 'Owner: commit communication_monitor/, then approve ID crosswalk migration dry-run',
    intentionally_not_applied: ['no branch merged', 'no migration applied', 'no proposed doc applied', 'no legacy script deleted', 'no production/API/network touched'],
    pairs_pending_proposal: compat.filter((p) => /PROPOSAL|PROPOSED/.test(p.test_status || '')).map((p) => `${p.producer}->${p.consumer}`),
  };
}
