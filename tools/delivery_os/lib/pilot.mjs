// tools/delivery_os/lib/pilot.mjs
// Phase 26: Internal Pilot Simulator. Synthetic end-to-end delivery, including failure scenarios.
// No production projects. Uses TEST_ONLY synthetic data only.
import { validateCreation } from './creation.mjs';
import { buildInputSet, completenessScore } from './inputs.mjs';
import { getPlaybook } from './playbooks.mjs';
import { planMilestones } from './milestones.mjs';
import { generateTasks } from './tasks.mjs';
import { buildRiskRegister, evaluateRisks } from './risk.mjs';
import { evaluateChange } from './change.mjs';
import { scoreQA } from './qa.mjs';
import { evaluateAcceptance } from './acceptance.mjs';

// scenario: 'success' | 'failure'
export function simulatePilot(productId, scenario = 'success') {
  const steps = [];
  const note = (k, v) => steps.push({ step: k, result: v });

  // 1. Creation (TEST_ONLY).
  const creation = validateCreation({
    test_only: true, deal_id: `TEST_deal_${productId}`, product_id: productId,
    scope: ['synthetic scope'], price_approved: scenario !== 'failure_price',
    deliverables: ['d1'], acceptance_criteria: ['a1'], client_inputs: ['company_information'],
    commercial_reference: 'TEST_offer', owner: 'owner',
  });
  note('creation', creation.ok ? 'ok' : `blocked: ${creation.errors[0]}`);

  const projectId = `TEST_${productId}`;
  const pb = getPlaybook(productId);

  // 2. Inputs (failure scenario: missing required input).
  const inputs = buildInputSet(productId, projectId);
  if (scenario === 'success' || scenario === 'failure_qa') inputs.forEach((i) => { if (i.required) { i.status = 'VALIDATED'; i.validated = true; } });
  const comp = completenessScore(inputs);
  note('inputs', `ready_to_start=${comp.ready_to_start} score=${comp.score}`);

  // 3. Milestones + tasks.
  let plan = null, tasks = null;
  if (pb && pb.milestones) {
    plan = planMilestones({ product_id: productId, milestones: pb.milestones, owner_capacity_days: 30 });
    tasks = generateTasks({ project_id: projectId, milestones: pb.milestones });
    note('milestones', `ok=${plan.ok} critical_path=${plan.critical_path.join('->')}`);
    note('tasks', `ok=${tasks.ok} by_agent=${JSON.stringify(tasks.by_agent)}`);
  } else {
    note('milestones', 'architecture-spec playbook (no milestone plan)');
  }

  // 4. Risks.
  const risks = buildRiskRegister(productId, projectId);
  const riskEval = evaluateRisks(risks);
  note('risks', `total=${riskEval.total} blocks_closure=${riskEval.blocks_closure}`);

  // 5. Change request (one per pilot).
  const change = evaluateChange({ project_id: projectId, description: scenario === 'failure_scope' ? 'add new CRM integration' : 'minor copy tweak', reason: 'client', product_id: productId });
  note('change_request', `suggested=${change.suggested_decision} approved=${change.approved_by_owner}`);

  // 6. QA (failure scenario: critical fail).
  const qaChecks = scenario === 'failure_qa'
    ? [{ check_id: 'q1', category: 'evidence', requirement: 'missing evidence', status: 'FAIL', severity: 'CRITICAL' }]
    : [{ check_id: 'q1', category: 'completeness', requirement: 'all deliverables present', status: 'PASS', severity: 'HIGH' }];
  const qa = scoreQA(qaChecks);
  note('qa', `client_ready=${qa.client_ready} score=${qa.quality_score}`);

  // 7. Acceptance.
  const accCriteria = scenario === 'failure_qa'
    ? [{ criterion_id: 'ac1', description: 'core', severity: 'CRITICAL', required: true, status: 'FAIL' }]
    : [{ criterion_id: 'ac1', description: 'core', severity: 'HIGH', required: true, status: 'PASS' }];
  const acceptance = evaluateAcceptance(accCriteria);
  note('acceptance', `status=${acceptance.status}`);

  // 8. Closure determination. A pilot is fully clean only if every gate passed.
  const creationOk = creation.ok;
  const changeClean = scenario !== 'failure_scope' ? true : change.suggested_decision !== 'REQUIRES_NEW_OFFER';
  const canClose = creationOk && comp.ready_to_start && qa.client_ready && acceptance.ok && !riskEval.blocks_closure && changeClean;
  note('closure', canClose ? 'CLOSED (synthetic)' : 'NOT_CLOSEABLE');

  const blockers = [];
  if (!creationOk) blockers.push('creation_blocked');
  if (!comp.ready_to_start) blockers.push('inputs_incomplete');
  if (!qa.client_ready) blockers.push('qa_failed');
  if (!acceptance.ok) blockers.push('acceptance_failed');
  if (riskEval.blocks_closure) blockers.push('open_critical_risk');
  if (!changeClean) blockers.push('change_requires_new_offer');

  return {
    product_id: productId,
    scenario,
    steps,
    outcome: canClose ? 'DELIVERED_ACCEPTED' : 'BLOCKED',
    blockers,
    // A PLANNED product blocked at creation is the readiness gate working as intended.
    expected_gate: (!creationOk && /PLANNED/.test(creation.errors.join(''))) ? 'product_planned_not_deliverable (gate OK)' : null,
    send_allowed: false,
    test_only: true,
    lessons: scenario !== 'success' ? [`scenario ${scenario} produced a blocker (expected)`] : ['clean synthetic pilot'],
  };
}
