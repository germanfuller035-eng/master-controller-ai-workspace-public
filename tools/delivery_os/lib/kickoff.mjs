// tools/delivery_os/lib/kickoff.mjs
// Phase 6: Kickoff package generator. Default INTERNAL_DRAFT. CLIENT_READY only when all gates pass.
import { readFileSync } from 'node:fs';
import { REVENUE_CATALOG } from './common.mjs';
import { buildInputSet, completenessScore } from './inputs.mjs';

let CATALOG = null;
function product(id) {
  if (!CATALOG) CATALOG = JSON.parse(readFileSync(REVENUE_CATALOG, 'utf8'));
  return CATALOG.products.find((p) => p.product_id === id) || null;
}
function isClientOfferable(s) { return s === 'ACTIVE' || s === 'READY_FOR_PILOT'; }

// input: { project, milestonePlan, price_approved, owner_approved, requested_label }
export function buildKickoff(input) {
  const project = input.project;
  const p = product(project.product_id);
  if (!p) return { ok: false, error: `unknown product ${project.product_id}` };

  const inputSet = buildInputSet(project.product_id, project.project_id);
  const completeness = completenessScore(inputSet);

  const pkg = {
    schema: 'delivery_os.kickoff.v1',
    project_id: project.project_id,
    product_id: project.product_id,
    sections: {
      project_summary: `${p.name} for ${project.name}`,
      goals: [p.target_problem],
      scope: p.scope_included,
      exclusions: p.scope_excluded,
      deliverables: p.deliverables,
      timeline: input.milestonePlan ? `${input.milestonePlan.estimated_duration_days} days (relative)` : 'relative (no exact dates without approved start)',
      milestones: input.milestonePlan ? input.milestonePlan.timeline : [],
      client_inputs: inputSet.filter((i) => i.required).map((i) => i.name),
      responsibilities: { owner: 'approvals, client comms, sensitive access', claude: 'implementation/QA', cline: 'focused fixes', client: 'inputs, approvals, acceptance' },
      communication_rules: 'All client communication owner-led and owner-approved. No autosend.',
      review_process: 'internal QA -> owner review -> client review -> acceptance',
      revision_limits: p.category === 'build' ? '2 rounds' : '1 round',
      acceptance: p.acceptance_criteria,
      risks: p.risks,
      change_request_process: 'changes beyond scope -> impact eval -> owner approval (may require new offer)',
      support_terms: p.category === 'retainer' ? 'monthly' : 'post-acceptance warranty per agreement',
    },
  };

  // Determine highest allowable label.
  const gatesPass = isClientOfferable(p.status) &&
    input.price_approved === true &&
    completeness.ready_to_start &&
    (input.milestonePlan ? input.milestonePlan.ok : false) &&
    input.owner_approved === true;

  let label = 'INTERNAL_DRAFT';
  const requested = input.requested_label || 'INTERNAL_DRAFT';
  if (requested === 'CLIENT_READY') label = gatesPass ? 'CLIENT_READY' : 'INTERNAL_DRAFT';
  else if (requested === 'OWNER_APPROVED') label = input.owner_approved ? 'OWNER_APPROVED' : 'OWNER_REVIEW';
  else if (requested === 'OWNER_REVIEW') label = 'OWNER_REVIEW';

  const blockers = [];
  if (!isClientOfferable(p.status)) blockers.push(`product_${p.status}_not_client_ready`);
  if (input.price_approved !== true) blockers.push('price_not_approved');
  if (!completeness.ready_to_start) blockers.push(`missing_inputs:${completeness.blockers_missing.join(',')}`);
  if (input.milestonePlan && !input.milestonePlan.ok) blockers.push('milestone_plan_invalid');
  if (input.owner_approved !== true) blockers.push('owner_approval_missing');

  return { ok: true, kickoff: pkg, label, send_allowed: false, input_completeness: completeness, blockers };
}
