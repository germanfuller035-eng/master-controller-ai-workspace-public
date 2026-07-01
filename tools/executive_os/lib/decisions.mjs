// tools/executive_os/lib/decisions.mjs
// Phase 6: Owner Decision System. Builds decision packets; scores; never auto-decides.
import { validate } from '../../revenue_os/lib/schema.mjs';
import { ExecutiveDecisionSchema } from '../schemas/domain.mjs';

const LEVEL = { low: 1, medium: 2, high: 3 };

// Score a decision: urgency, impact, cost-of-delay, reversibility, info completeness.
export function scoreDecision(d) {
  const urgency = LEVEL[d.urgency] || 1;
  const impact = LEVEL[d.impact] || 1;
  const cod = LEVEL[d.cost_of_delay] || 1;
  const irrevPenalty = d.reversibility === 'irreversible' ? 2 : (d.reversibility === 'partial' ? 1 : 0);
  const infoComplete = !!d.evidence && !!d.recommended_option;
  // Priority score: urgency*impact + cost-of-delay, minus info gap.
  const score = urgency * impact + cod - (infoComplete ? 0 : 1);
  return {
    decision_id: d.decision_id,
    score,
    urgency, impact, cost_of_delay: cod,
    reversibility_penalty: irrevPenalty,
    info_complete: infoComplete,
    recommended_next_step: infoComplete ? 'present to owner' : 'gather missing data',
    suggested_status: infoComplete ? 'READY_FOR_OWNER' : 'NEEDS_DATA',
  };
}

// Build a full decision packet (10 sections). Never sets APPROVED.
export function buildPacket(d) {
  const errors = [];
  const shape = validate(d, ExecutiveDecisionSchema, d.decision_id);
  if (!shape.ok) errors.push(...shape.errors);
  if (d.status === 'APPROVED' || d.status === 'REJECTED') errors.push('Executive OS must not pre-set owner verdict (APPROVED/REJECTED)');
  const s = scoreDecision(d);
  const packet = {
    decision_id: d.decision_id,
    question: d.title,
    why_it_matters: d.description,
    options: d.options,
    evidence: d.evidence || 'NONE — gather before owner review',
    recommendation: d.recommended_option || 'no recommendation (insufficient data)',
    consequences: { impact: d.impact, reversibility: d.reversibility },
    risk: d.cost_of_delay === 'high' ? 'high cost of delay' : 'manageable',
    required_owner_input: d.options,
    default_safe_action: d.reversibility === 'irreversible' ? 'WAIT (irreversible)' : 'defer until data complete',
    deadline: d.due_at || null,
    score: s.score,
    status: s.suggested_status,
    owner_required: true,
  };
  return { ok: errors.length === 0, errors, packet };
}

// Sort a set into a prioritized queue (highest score first, never auto-resolved).
export function buildQueue(decisions) {
  const packets = decisions.map((d) => buildPacket(d)).filter((p) => p.ok).map((p) => p.packet);
  packets.sort((a, b) => b.score - a.score);
  return {
    total: decisions.length,
    ready_for_owner: packets.filter((p) => p.status === 'READY_FOR_OWNER').length,
    needs_data: packets.filter((p) => p.status === 'NEEDS_DATA').length,
    queue: packets,
    note: 'Decisions are never auto-approved. Owner decides.',
  };
}
