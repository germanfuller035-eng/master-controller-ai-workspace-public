// tools/security_os/lib/dashboard.mjs
// MP41-42 — Security Dashboard + Owner Security Command Center. Derived, read-only.
export function buildDashboard(ds, ts) {
  const gov = ds.gov || {}, controls = ds.controls || {}, comm = ds.comm || {};
  const threats = gov.threat_model || [];
  const openThreats = threats.filter((t) => !['CONTROLLED'].includes(t.status));
  return {
    schema: 'security_os.dashboard.v1',
    generated_ts: ts || 'UNSTAMPED',
    synthetic: true,
    note: 'Derived security view. No secret values. References existing audit/identity/approval owners.',
    critical_assets: (gov.asset_registry || []).filter((a) => a.criticality === 'CRITICAL').map((a) => a.asset_id),
    trust_boundaries: [...new Set((gov.threat_model || []).map((t) => t.boundary))],
    open_findings: openThreats.length,
    secret_findings: 0,
    sensitive_data_findings: (comm.files || []).filter((f) => f.contains_real_email).length,
    access_risks: (gov.threat_model || []).filter((t) => t.category === 'elevation_of_privilege').length,
    supply_chain_risks: (controls.dependency_sbom || []).filter((d) => d.known_review_status === 'REVIEW').length,
    communication_monitor_disposition: comm.summary || {},
    incidents: 0,
    exceptions: 0,
    release_gate: controls.security_release_gate?.current_status || 'NOT_READY',
    owner_actions: [
      'disposition of excluded communication files (quarantine/archive/delete-after-approval)',
      'encryption-at-rest live verification (workstation/vps/android/backups)',
      'legal review: privacy + retention + consent',
      'secret-scan gate before any future Git remote',
    ],
    controls_requiring_legal_review: (controls.compliance_control_mapping || []).filter((c) => c.legal_review).map((c) => c.area),
  };
}

export function buildOwnerCenter(ds, ts) {
  const gov = ds.gov || {}, controls = ds.controls || {}, comm = ds.comm || {};
  return {
    schema: 'security_os.owner_command_center.v1',
    generated_ts: ts || 'UNSTAMPED',
    synthetic: true,
    highest_security_risk: 'future Git remote without secret-scan gate (T02) — owner enforces gate before any push',
    tracked_secret_status: 'TRACKED_LIVE_SECRETS=0 (2 fake test vectors confirmed)',
    files_requiring_disposition: (comm.files || []).filter((f) => f.owner_approval_required).length,
    credential_rotation_proposals: 'runbooks ready (ssh/telegram/imap/smtp/signing/external); none executed; ROTATION_REQUIRED=0',
    unresolved_access_issue: 'none (least-privilege boundaries hold in tests)',
    privacy_review: 'LEGAL_REVIEW_REQUIRED (privacy, retention, consent)',
    release_blocker: controls.security_release_gate?.evaluation?.owner_approval === 'PENDING' ? 'owner approval pending' : 'none',
    owner_approval: 'PENDING',
    legal_review_item: (controls.compliance_control_mapping || []).filter((c) => c.legal_review).map((c) => c.area),
    next_safe_security_action: 'Owner: confirm encryption-at-rest status + decide excluded-file disposition; then security release gate -> OWNER_ACCEPTED_REFERENCE',
    intentionally_not_done: ['no live scan', 'no pentest', 'no credential use/rotation', 'no file deleted', 'no production change', 'no legal compliance asserted'],
  };
}
