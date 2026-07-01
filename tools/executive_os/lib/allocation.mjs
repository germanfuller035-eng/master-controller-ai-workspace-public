// tools/executive_os/lib/allocation.mjs
// Phase 25-26: Resource Allocation + Decision Debt.
import { round2 } from './common.mjs';

// Phase 25: allocation across owner/Claude/Cline/contractor/budget/infra/product/delivery/maintenance.
export function allocate(input) {
  const ownerAvail = input.owner_weekly_hours ?? null;
  const demands = input.demands || {}; // {project_id: {owner_hours, ...}}
  const errors = [];
  const warnings = [];

  const ownerDemand = Object.values(demands).reduce((s, d) => s + (d.owner_hours || 0), 0);
  if (ownerAvail != null && ownerDemand > ownerAvail) warnings.push(`owner over-allocation: ${ownerDemand}h > ${ownerAvail}h`);
  const projectsWithNoResource = Object.entries(demands).filter(([, d]) => !d.owner_hours && !d.claude_hours && !d.cline_hours).map(([k]) => k);
  for (const p of projectsWithNoResource) warnings.push(`project ${p} has no allocated resources`);

  const revenueWork = Object.entries(demands).filter(([, d]) => d.category === 'revenue').reduce((s, [, d]) => s + (d.owner_hours || 0), 0);
  const infraWork = Object.entries(demands).filter(([, d]) => d.category === 'infrastructure').reduce((s, [, d]) => s + (d.owner_hours || 0), 0);
  if (infraWork > revenueWork && revenueWork >= 0 && ownerAvail) warnings.push('infrastructure work crowding out revenue work');
  const maintenance = Object.entries(demands).filter(([, d]) => d.category === 'maintenance').reduce((s, [, d]) => s + (d.owner_hours || 0), 0);
  if (maintenance === 0 && Object.keys(demands).length > 0) warnings.push('maintenance burden not budgeted');

  return {
    status: ownerAvail == null ? 'UNKNOWN_OWNER_CAPACITY' : 'COMPUTED',
    owner_available: ownerAvail ?? 'UNKNOWN',
    owner_demand: round2(ownerDemand),
    over_allocated: ownerAvail != null && ownerDemand > ownerAvail,
    too_many_active: ownerAvail != null && Object.keys(demands).length > Math.max(1, Math.floor(ownerAvail / 8)),
    projects_without_resources: projectsWithNoResource,
    warnings, errors,
    label: 'MODEL_ESTIMATE',
  };
}

// Phase 26: Decision debt.
export function decisionDebt(decisions, now) {
  const open = decisions.filter((d) => !['APPROVED', 'REJECTED', 'SUPERSEDED', 'EXPIRED'].includes(d.status));
  const overdue = open.filter((d) => d.due_at && now && Date.parse(d.due_at) < Date.parse(now));
  const stale = open.filter((d) => d.deferrals && d.deferrals >= 2);
  const blockedValue = open.reduce((s, d) => s + (d.blocked_value || 0), 0);
  const classify = (d) => {
    const u = d.urgency === 'high', i = d.impact === 'high';
    if (u && i) return 'urgent_high_impact';
    if (i && !u) return 'high_impact_not_urgent';
    if (u && !i) return 'low_impact_urgent';
    if (d.no_longer_relevant) return 'close_not_relevant';
    return 'defer';
  };
  return {
    open: open.length,
    overdue: overdue.map((d) => d.decision_id),
    stale_repeated_deferrals: stale.map((d) => d.decision_id),
    blocked_value: blockedValue,
    classification: open.reduce((o, d) => { const c = classify(d); (o[c] = o[c] || []).push(d.decision_id); return o; }, {}),
    note: 'No automatic resolution. Owner decides.',
  };
}
