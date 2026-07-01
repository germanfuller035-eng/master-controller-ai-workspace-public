// tools/analytics_os/lib/quality.mjs
// Data Quality framework (Phase 8). Read-only rule evaluation over synthetic datasets.
// Quality score never hides individual rule failures — both are returned.

export const QUALITY_DIMENSIONS = ['COMPLETENESS', 'VALIDITY', 'UNIQUENESS', 'CONSISTENCY', 'FRESHNESS', 'ACCURACY', 'REFERENTIAL_INTEGRITY', 'TIMELINESS', 'PROVENANCE', 'SENSITIVITY'];
export const RULE_TYPES = ['required', 'enum', 'range', 'uniqueness', 'foreign_key', 'reconciliation', 'freshness', 'checksum', 'semantic', 'transition'];
export const SEVERITY = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

// Evaluate one rule against rows. Returns { rule_id, dimension, type, severity, passed, failures:[...] }.
export function evalRule(rule, rows) {
  const failures = [];
  const r = rule;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    switch (r.type) {
      case 'required':
        if (row[r.field] === undefined || row[r.field] === null || row[r.field] === '') failures.push({ row: i, reason: `missing ${r.field}` });
        break;
      case 'enum':
        if (row[r.field] !== undefined && !r.allowed.includes(row[r.field])) failures.push({ row: i, reason: `${r.field}=${row[r.field]} not in enum` });
        break;
      case 'range':
        if (typeof row[r.field] === 'number' && (row[r.field] < r.min || row[r.field] > r.max)) failures.push({ row: i, reason: `${r.field}=${row[r.field]} out of [${r.min},${r.max}]` });
        break;
      case 'foreign_key':
        if (row[r.field] != null && !r.keys.includes(row[r.field])) failures.push({ row: i, reason: `${r.field}=${row[r.field]} has no referent` });
        break;
      default: break;
    }
  }
  // uniqueness + reconciliation operate on the whole set
  if (r.type === 'uniqueness') {
    const seen = {};
    rows.forEach((row, i) => { const k = row[r.field]; if (seen[k] !== undefined) failures.push({ row: i, reason: `duplicate ${r.field}=${k}` }); seen[k] = i; });
  }
  if (r.type === 'reconciliation') {
    const a = rows.reduce((s, row) => s + (Number(row[r.left]) || 0), 0);
    const b = r.expected;
    if (a !== b) failures.push({ row: -1, reason: `sum(${r.left})=${a} != expected ${b}` });
  }
  if (r.type === 'freshness') {
    if (r.age_periods != null && r.max_age_periods != null && r.age_periods > r.max_age_periods) failures.push({ row: -1, reason: `age ${r.age_periods} > max ${r.max_age_periods}` });
  }
  return { rule_id: r.rule_id, dimension: r.dimension, type: r.type, severity: r.severity || 'MEDIUM', passed: failures.length === 0, failure_count: failures.length, failures };
}

// Run a rule set; return per-rule results + an aggregate score that does NOT mask failures.
export function runQuality(rules, datasets) {
  const results = rules.map((rule) => evalRule(rule, datasets[rule.dataset] || []));
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const critical = results.filter((r) => !r.passed && r.severity === 'CRITICAL');
  const high = results.filter((r) => !r.passed && r.severity === 'HIGH');
  return {
    score: total ? Math.round((passed / total) * 100) / 100 : null,
    total_rules: total,
    passed,
    failed: total - passed,
    critical_failures: critical.length,
    high_failures: high.length,
    // explicit: never collapse individual failures into the score
    failing_rules: results.filter((r) => !r.passed),
    results,
  };
}
