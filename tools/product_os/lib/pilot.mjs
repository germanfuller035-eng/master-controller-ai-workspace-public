// tools/product_os/lib/pilot.mjs
// Phase 19-20: Internal Pilot Engine. Synthetic, deterministic. No promotion, no real client.
import { product, playbook } from './catalog.mjs';

export const PILOT_STATUS = ['PLANNED', 'READY', 'RUNNING', 'FAILED', 'PASSED_WITH_NOTES', 'PASSED', 'CANCELLED'];

// scenario: 'happy' | 'missing_input' | 'scope_change' | 'qa_failure' | 'acceptance_failure' |
//           'capacity_issue' | 'pricing_issue' | 'critical_risk'
export function runPilot(productId, scenario = 'happy') {
  const p = product(productId);
  if (!p) return { ok: false, error: `unknown product ${productId}` };
  const pb = playbook(productId);
  const steps = [];
  const note = (k, v) => steps.push({ step: k, result: v });

  // 1. Scenario + 2. inputs.
  const inputsOk = scenario !== 'missing_input';
  note('inputs_validated', inputsOk);
  // 3. scope freeze.
  note('scope_frozen', scenario !== 'scope_change');
  // 4-5. plan + tasks (needs playbook).
  const planOk = !!pb;
  note('plan_generated', planOk);
  note('tasks_generated', planOk);
  // 6. deliverables.
  const deliverables = (p.deliverables || []).slice(0, 5);
  note('deliverables_generated', deliverables.length > 0);
  // 7. QA.
  const qa = scenario === 'qa_failure' ? 'FAIL' : (deliverables.length ? 'PASS' : 'NOT_RUN');
  note('qa', qa);
  // 8. acceptance.
  const acceptance = scenario === 'acceptance_failure' ? 'FAIL' : (qa === 'PASS' ? 'PASS' : 'NOT_RUN');
  note('acceptance', acceptance);
  // 9. effort.
  const plannedHours = p.estimated_hours ?? null;
  const actualHours = plannedHours != null ? (scenario === 'scope_change' ? plannedHours * 1.5 : plannedHours) : null;
  note('effort', { planned: plannedHours, actual: actualHours });
  // 10. risks.
  const risks = scenario === 'critical_risk' ? ['critical risk triggered'] : (p.risks || []);
  // 11. lessons.
  const lessons = scenario === 'happy' ? ['clean synthetic pilot'] : [`scenario ${scenario} produced an issue (expected)`];

  // Blockers.
  const blockers = [];
  if (!inputsOk) blockers.push('inputs_incomplete');
  if (!planOk) blockers.push('no_playbook');
  if (scenario === 'scope_change') blockers.push('scope_changed_mid_pilot');
  if (qa === 'FAIL') blockers.push('qa_failed');
  if (acceptance === 'FAIL') blockers.push('acceptance_failed');
  if (scenario === 'capacity_issue') blockers.push('capacity_unknown');
  if (scenario === 'pricing_issue') blockers.push('price_unapproved');
  if (scenario === 'critical_risk') blockers.push('critical_risk');

  let status;
  if (blockers.length === 0) status = 'PASSED';
  else if (qa === 'FAIL' || acceptance === 'FAIL' || blockers.includes('critical_risk') || blockers.includes('inputs_incomplete') || blockers.includes('no_playbook')) status = 'FAILED';
  else status = 'PASSED_WITH_NOTES';

  return {
    ok: true,
    pilot: {
      pilot_id: `pilot_${productId}_${scenario}`, product_id: productId, scenario, status,
      inputs: p.evidence_required || [], planned_outputs: p.deliverables || [], actual_outputs: deliverables,
      planned_hours: plannedHours, actual_hours: actualHours,
      qa_result: qa, acceptance_result: acceptance, risks, lessons,
      recommendation: status === 'PASSED' ? 'eligible for READY_FOR_PILOT review (owner)' : (status === 'PASSED_WITH_NOTES' ? 'address notes before pilot' : 'not ready'),
      blockers, test_only: true,
    },
    steps,
    note: 'Synthetic pilot. No product promotion. No real client.',
  };
}
