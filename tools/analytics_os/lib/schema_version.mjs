// tools/analytics_os/lib/schema_version.mjs
// Schema versioning rules + cross-system contract validation (Phase 25-26). Read-only.

// Parse semantic version "MAJOR.MINOR" or "MAJOR.MINOR.PATCH".
export function parseVersion(v) {
  const parts = String(v).split('.').map(Number);
  return { major: parts[0] || 0, minor: parts[1] || 0, patch: parts[2] || 0 };
}

// Classify a version change between two schemas given their field sets.
export function classifyChange(oldFields, newFields, oldVer, newVer) {
  const removed = oldFields.filter((f) => !newFields.includes(f));
  const added = newFields.filter((f) => !oldFields.includes(f));
  const ov = parseVersion(oldVer), nv = parseVersion(newVer);
  const breaking = removed.length > 0;
  const expectedBump = breaking ? 'MAJOR' : (added.length ? 'MINOR' : 'PATCH');
  let versionOk = true;
  if (expectedBump === 'MAJOR' && nv.major <= ov.major) versionOk = false;
  if (expectedBump === 'MINOR' && (nv.major !== ov.major || nv.minor <= ov.minor)) versionOk = false;
  return {
    change_type: breaking ? 'BREAKING' : (added.length ? 'ADDITIVE' : 'NONE'),
    removed_fields: removed,
    added_fields: added,
    expected_bump: expectedBump,
    version_ok: versionOk,
    requires_review: breaking,
    deprecation_window_required: breaking,
  };
}

// Cross-system contract validation across all OS contracts.
// systems: { name: { ids:Set, statuses:Set, fields:[], formulas:{} } }
export function crossSystemValidate(systems, expectations) {
  const issues = [];
  for (const exp of expectations) {
    const sys = systems[exp.system];
    if (!sys) { issues.push({ kind: 'SYSTEM_MISSING', ref: exp.system, severity: 'HIGH' }); continue; }
    for (const field of exp.required_fields || []) if (!(sys.fields || []).includes(field)) issues.push({ kind: 'MISSING_FIELD', ref: `${exp.system}.${field}`, severity: 'HIGH' });
    for (const st of exp.required_statuses || []) if (!(sys.statuses || []).includes(st)) issues.push({ kind: 'STATUS_MISMATCH', ref: `${exp.system}.${st}`, severity: 'MEDIUM' });
    if (exp.schema_version && sys.schema_version && exp.schema_version !== sys.schema_version) issues.push({ kind: 'SCHEMA_MISMATCH', ref: exp.system, severity: 'MEDIUM' });
    if (exp.stale === true) issues.push({ kind: 'STALE_CONTRACT', ref: exp.system, severity: 'MEDIUM' });
  }
  // ID consistency: shared id field must use a single convention
  const idConventions = Object.entries(systems).filter(([, s]) => s.id_convention).map(([n, s]) => `${n}:${s.id_convention}`);
  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
  issues.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));
  return { total: issues.length, issues, id_conventions: idConventions };
}
