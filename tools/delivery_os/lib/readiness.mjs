// tools/delivery_os/lib/readiness.mjs
// Phase 25: Product Readiness Gate. Scores delivery readiness; recommends status. Never auto-promotes.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { REVENUE_CATALOG, DELIVERY_ROOT } from './common.mjs';
import { getPlaybook, validatePlaybook } from './playbooks.mjs';

let CATALOG = null;
function product(id) {
  if (!CATALOG) CATALOG = JSON.parse(readFileSync(REVENUE_CATALOG, 'utf8'));
  return CATALOG.products.find((p) => p.product_id === id) || null;
}

export const READINESS_DIMENSIONS = [
  'product_definition', 'pricing', 'scope', 'deliverables', 'playbook', 'inputs', 'milestones',
  'qa', 'acceptance', 'risks', 'capacity', 'templates', 'case_evidence', 'owner_approval',
];

// evidence flags can be supplied (e.g. pilot done, lessons captured, actual effort measured, owner approved).
export function scoreReadiness(productId, flags = {}) {
  const p = product(productId);
  if (!p) return { ok: false, error: `unknown product ${productId}` };
  const pb = getPlaybook(productId);
  const pbValid = pb ? validatePlaybook(productId).ok : false;

  const dims = {
    product_definition: !!p.description && !!p.target_problem,
    pricing: p.price.status === 'CONFIRMED' || p.price.status === 'OWNER_TARGET',
    scope: (p.scope_included || []).length > 0,
    deliverables: (p.deliverables || []).length > 0,
    playbook: pbValid,
    inputs: !!pb && (!!pb.client_inputs || !!pb.milestones),
    milestones: !!pb && (pb.milestones || []).length > 0,
    qa: !!pb && (!!pb.qa || !!pb.acceptance_tests),
    acceptance: (p.acceptance_criteria || []).length > 0,
    risks: (p.risks || []).length > 0,
    capacity: flags.capacity_known === true,
    templates: flags.templates_ready === true || pbValid,
    case_evidence: flags.case_evidence === true,
    owner_approval: flags.owner_approved === true,
  };
  const passed = Object.values(dims).filter(Boolean).length;
  const score = Math.round((passed / READINESS_DIMENSIONS.length) * 100);

  // Recommendation rules (NEVER auto-promote; recommendation only).
  const pilotReqs = ['product_definition', 'pricing', 'playbook', 'scope', 'qa', 'acceptance', 'templates'];
  const pilotReady = pilotReqs.every((d) => dims[d]) && flags.synthetic_test === true && flags.owner_approved === true;
  const activeReady = pilotReady && flags.successful_pilot === true && flags.lessons_captured === true &&
    flags.actual_effort_measured === true && flags.delivery_risk_understood === true && flags.owner_approved === true;

  let recommended = p.status;
  if (activeReady) recommended = 'ACTIVE';
  else if (pilotReady) recommended = 'READY_FOR_PILOT';
  else if (dims.playbook && dims.scope && dims.deliverables) recommended = 'DELIVERY_DEFINED';
  else if (dims.product_definition) recommended = 'DRAFT';
  else recommended = 'PLANNED';

  return {
    ok: true,
    product_id: productId,
    current_status: p.status,
    readiness_score: score,
    dimensions: dims,
    missing: Object.entries(dims).filter(([, v]) => !v).map(([k]) => k),
    recommended_status: recommended,
    auto_promote: false,
    note: 'Recommendation only. Owner must approve any promotion. READY_FOR_PILOT/ACTIVE require owner approval + (for ACTIVE) successful pilot + lessons + measured effort.',
  };
}
