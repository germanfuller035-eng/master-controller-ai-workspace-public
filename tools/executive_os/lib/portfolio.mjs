// tools/executive_os/lib/portfolio.mjs
// Phase 10-11: Portfolio Prioritization Engine + Stop/Go/Pause Gate. Transparent weighted scoring.

// Configurable weights (visible, not hidden).
export const DEFAULT_WEIGHTS = {
  strategic_value: 2.0, revenue_value: 2.5, time_to_value: 1.5, readiness: 1.5,
  owner_effort: -1.0, delivery_capacity: 1.0, financial_risk: -1.5, technical_risk: -1.0,
  dependency_risk: -1.0, automation_leverage: 1.0, reversibility: 0.5, maintenance_burden: -0.5,
  data_quality: 0.5, owner_urgency: 1.5,
};

// item: { project_id, scores:{criterion:0..10}, status, readiness, capacity_available, owner }
export function prioritize(items, weights = DEFAULT_WEIGHTS) {
  const ranked = items.map((it) => {
    const s = it.scores || {};
    let score = 0;
    const contributions = {};
    for (const [k, w] of Object.entries(weights)) {
      const v = s[k] ?? 0;
      const c = v * w;
      contributions[k] = Math.round(c * 100) / 100;
      score += c;
    }
    const reasonCodes = [];
    if ((s.revenue_value ?? 0) >= 7) reasonCodes.push('high_revenue');
    if ((s.readiness ?? 0) <= 3) reasonCodes.push('low_readiness');
    if (it.capacity_available === false) reasonCodes.push('no_capacity');
    if ((s.financial_risk ?? 0) >= 7) reasonCodes.push('high_financial_risk');
    if (!it.owner) reasonCodes.push('no_owner');

    let action = 'CONTINUE';
    if (!it.owner) action = 'OWNER_DECISION_REQUIRED';
    else if (it.capacity_available === false) action = 'WAIT';
    else if ((s.readiness ?? 0) <= 2 && (s.revenue_value ?? 0) < 4) action = 'PAUSE';
    else if ((s.revenue_value ?? 0) >= 7 && (s.readiness ?? 0) >= 6 && it.capacity_available !== false) action = 'FOCUS_NOW';
    else if ((s.readiness ?? 0) <= 4) action = 'PREPARE';

    return {
      project_id: it.project_id,
      score: Math.round(score * 100) / 100,
      recommended_action: action,
      reason_codes: reasonCodes,
      critical_dependencies: it.dependencies || [],
      owner_decision: action === 'OWNER_DECISION_REQUIRED',
      contributions,
    };
  });
  ranked.sort((a, b) => b.score - a.score);
  ranked.forEach((r, i) => { r.rank = i + 1; });
  return { weights, ranked, note: 'Weights configurable + visible. Recommendations only.' };
}

// Stop/Go/Pause gate for a single project.
export function gate(project) {
  const goReqs = {
    defined_outcome: !!project.outcome,
    owner: !!project.owner,
    capacity: project.capacity_available === true,
    dependencies_clear: !(project.blocked_dependencies && project.blocked_dependencies.length),
    source_of_truth: !!project.source_of_truth,
    risk_acceptable: project.risk !== 'unacceptable',
    no_duplicate: project.duplicate !== true,
    expected_value: !!project.expected_value,
    done_definition: !!project.done_definition,
  };
  const goOk = Object.values(goReqs).every(Boolean);

  const pauseReasons = [];
  if (project.capacity_available === false) pauseReasons.push('owner_capacity_absent');
  if (project.external_dependency) pauseReasons.push('external_dependency');
  if (project.product_ready === false) pauseReasons.push('product_not_ready');
  if (project.finances_known === false) pauseReasons.push('finances_unknown');
  if (project.production_freeze) pauseReasons.push('production_freeze');
  if (project.missing_approval) pauseReasons.push('missing_approval');

  const stopReasons = [];
  if (project.duplicate) stopReasons.push('duplicate_architecture');
  if (project.expected_value === 0 || project.no_value) stopReasons.push('no_value');
  if (!project.owner) stopReasons.push('no_owner');
  if (project.repeated_failure) stopReasons.push('repeated_failure');
  if (project.risk === 'unacceptable') stopReasons.push('unacceptable_risk');
  if (project.superseded) stopReasons.push('superseded');
  if (project.high_maintenance_no_benefit) stopReasons.push('high_maintenance_no_benefit');

  let decision = 'GO';
  if (stopReasons.length) decision = 'STOP_RECOMMENDED';
  else if (pauseReasons.length || !goOk) decision = 'PAUSE';

  return {
    decision,
    go_requirements: goReqs,
    go_ready: goOk,
    pause_reasons: pauseReasons,
    stop_reasons: stopReasons,
    note: 'No automatic archive/delete. STOP is a recommendation requiring owner decision.',
  };
}
