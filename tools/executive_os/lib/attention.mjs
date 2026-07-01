// tools/executive_os/lib/attention.mjs
// Phase 13: Owner Attention Budget. UNKNOWN when owner capacity not confirmed (no invention).
import { round2 } from './common.mjs';

// input: { weekly_hours, decision_count, review_load_hours, project_load_hours, context_switch_pct, urgent_issues }
export function attentionBudget(input) {
  const weekly = (typeof input.weekly_hours === 'number') ? input.weekly_hours : null;
  if (weekly == null) {
    return {
      status: 'UNKNOWN',
      reason: 'owner weekly hours not confirmed',
      decision_packet: { decision_id: 'd_weekly_capacity', status: 'NEEDS_DATA', question: 'How many hours/week can you dedicate?' },
      recommended_max_active_projects: 'UNKNOWN',
      note: 'No invention. Confirm capacity to compute.',
    };
  }
  const switchCost = input.context_switch_pct ?? 0.15;
  const effective = round2(weekly * (1 - switchCost));
  const decisionLoad = round2((input.decision_count ?? 0) * 0.25); // 15 min/decision
  const reviewLoad = input.review_load_hours ?? 0;
  const projectLoad = input.project_load_hours ?? 0;
  const urgent = (input.urgent_issues ?? 0) * 1; // 1h each
  const totalDemand = round2(decisionLoad + reviewLoad + projectLoad + urgent);
  const overloadRisk = totalDemand > effective ? 'HIGH' : (totalDemand > effective * 0.85 ? 'MEDIUM' : 'LOW');
  const maxProjects = projectLoad ? Math.max(1, Math.floor(effective / Math.max(1, projectLoad / Math.max(1, input.active_projects ?? 1)))) : 'UNKNOWN';

  return {
    status: 'COMPUTED',
    effective_weekly_hours: effective,
    owner_decision_load: decisionLoad,
    owner_review_load: reviewLoad,
    owner_execution_load: projectLoad,
    total_demand: totalDemand,
    overload_risk: overloadRisk,
    recommended_max_active_projects: maxProjects,
    decisions_to_defer: overloadRisk === 'HIGH' ? 'defer low-impact decisions' : 'none',
    tasks_to_delegate: overloadRisk !== 'LOW' ? ['delegate implementation to Claude', 'delegate focused fixes to Cline'] : [],
    label: 'MODEL_ESTIMATE',
  };
}
