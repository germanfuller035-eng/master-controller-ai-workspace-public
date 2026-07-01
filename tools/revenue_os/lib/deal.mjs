// tools/revenue_os/lib/deal.mjs
// Phase 16: Deal lifecycle + Project Handoff contract. No live CRM. TEST_ONLY fixtures.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { REVENUE_ROOT, DEAL_STAGES, DEAL_TRANSITIONS } from './common.mjs';

let CATALOG = null;
function product(id) {
  if (!CATALOG) CATALOG = JSON.parse(readFileSync(path.join(REVENUE_ROOT, 'data/product_catalog.json'), 'utf8'));
  return CATALOG.products.find((p) => p.product_id === id) || null;
}

// Stage metadata: owner, entry/exit criteria, required approvals, metrics.
export const STAGE_META = {
  DISCOVERED: { owner: 'lead_hunter', entry: 'candidate verified', exit: 'qualified or rejected', approvals: [], metric: 'candidates' },
  QUALIFIED: { owner: 'revenue_os', entry: 'ICP + evidence sufficient', exit: 'product recommended', approvals: [], metric: 'qualified' },
  PRODUCT_RECOMMENDED: { owner: 'revenue_os', entry: 'recommendation produced', exit: 'offer drafted', approvals: [], metric: 'recommended' },
  OFFER_DRAFTED: { owner: 'revenue_os', entry: 'offer built (internal)', exit: 'owner approves', approvals: ['owner'], metric: 'offers_drafted' },
  OWNER_APPROVED: { owner: 'owner', entry: 'owner approved offer + price', exit: 'client contacted', approvals: ['owner'], metric: 'approved' },
  CLIENT_CONTACTED: { owner: 'master_controller', entry: 'approved + send via MC API', exit: 'reply or timeout', approvals: ['owner'], metric: 'contacted' },
  REPLIED: { owner: 'master_controller', entry: 'client replied', exit: 'call/proposal/negotiation', approvals: [], metric: 'replies' },
  DISCOVERY_CALL: { owner: 'owner', entry: 'call scheduled', exit: 'proposal or negotiation', approvals: [], metric: 'calls' },
  PROPOSAL_SENT: { owner: 'master_controller', entry: 'proposal owner-approved + sent via MC', exit: 'negotiation/won/lost', approvals: ['owner'], metric: 'proposals' },
  NEGOTIATION: { owner: 'owner', entry: 'terms under discussion', exit: 'won/lost', approvals: ['owner'], metric: 'negotiations' },
  WON: { owner: 'owner', entry: 'deal agreed + payment terms', exit: 'project handoff', approvals: ['owner'], metric: 'won' },
  LOST: { owner: 'owner', entry: 'declined/no fit', exit: 'closed', approvals: [], metric: 'lost' },
  PAUSED: { owner: 'owner', entry: 'temporarily paused', exit: 'resume', approvals: [], metric: 'paused' },
  OPTED_OUT: { owner: 'master_controller', entry: 'client opted out', exit: 'closed (no contact)', approvals: [], metric: 'opted_out' },
};

export function canTransition(from, to) {
  if (!DEAL_STAGES.includes(from)) return { ok: false, error: `unknown stage ${from}` };
  if (!DEAL_STAGES.includes(to)) return { ok: false, error: `unknown stage ${to}` };
  const allowed = DEAL_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) return { ok: false, error: `illegal transition ${from} -> ${to}`, allowed };
  return { ok: true };
}

// Build a project handoff contract from a WON deal. test_only enforced.
export function buildHandoff(deal, offer) {
  if (deal.stage !== 'WON') return { ok: false, error: 'handoff requires deal in WON stage' };
  if (!deal.test_only) return { ok: false, error: 'refusing handoff: deal not marked test_only (no real deals in this task)' };
  const p = product(deal.product_id);
  if (!p) return { ok: false, error: `unknown product ${deal.product_id}` };

  const handoff = {
    handoff_id: `handoff_${deal.deal_id}`,
    deal_id: deal.deal_id,
    product_id: deal.product_id,
    scope: p.scope_included,           // frozen
    deliverables: p.deliverables,       // frozen
    acceptance_criteria: p.acceptance_criteria,
    timeline: p.delivery_days || 'owner-confirmed',
    inputs_required: p.evidence_required.concat(p.dependencies || []),
    dependencies: p.dependencies || [],
    risk_register: p.risks,
    communication_plan: 'owner-led; client updates at milestones via approved channel only',
    payment_terms: deal.value != null ? `${deal.value} RUB (terms recorded at WON)` : 'owner-defined',
    test_only: true,
    project_registry_action: 'create project entry in AI HQ Project Registry (after soak, owner-applied)',
    scope_frozen: true,
    context_pack_action: 'generate project context pack via AI HQ',
  };
  return { ok: true, handoff };
}
