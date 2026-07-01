// tools/delivery_os/lib/dashboard.mjs
// Phase 21-22: Delivery Dashboard (execution-only) + Owner Command Center.
// Reads a set of (synthetic) project records. Does NOT duplicate the Project Portfolio.

// projects: [{project_id, name, product_id, status, owner, blocker, next_milestone, risk,
//             waiting_on, change_pending, overdue, agent_actions}]
export function buildDashboard(projects) {
  const by = (pred) => projects.filter(pred).map((p) => p.project_id);
  const sections = {
    active_projects: by((p) => p.status === 'IN_PROGRESS' || p.status === 'DELIVERY_IN_PROGRESS'),
    waiting_inputs: by((p) => p.status === 'WAITING_CLIENT_INPUT' || p.status === 'WAITING_INPUTS'),
    ready_to_start: by((p) => p.status === 'READY_TO_START'),
    blocked: by((p) => p.status === 'BLOCKED'),
    in_qa: by((p) => p.status === 'IN_REVIEW' || p.status === 'INTERNAL_QA'),
    waiting_owner: by((p) => p.status === 'OWNER_REVIEW'),
    waiting_client: by((p) => p.status === 'WAITING_CLIENT_APPROVAL' || p.status === 'CLIENT_REVIEW'),
    change_requests: by((p) => p.change_pending === true || p.status === 'CHANGE_REQUEST'),
    delivered: by((p) => p.status === 'DELIVERED'),
    acceptance_pending: by((p) => p.status === 'DELIVERED' && !p.accepted),
    support: by((p) => p.status === 'SUPPORT'),
    overdue_milestones: by((p) => p.overdue === true),
  };
  const risks = projects.flatMap((p) => (p.risk ? [{ project_id: p.project_id, risk: p.risk }] : []));
  const ownerActions = projects.filter((p) => p.owner_action).map((p) => ({ project_id: p.project_id, action: p.owner_action }));
  const claudeActions = projects.filter((p) => (p.agent_actions || {}).claude).map((p) => ({ project_id: p.project_id, action: p.agent_actions.claude }));
  const clineActions = projects.filter((p) => (p.agent_actions || {}).cline).map((p) => ({ project_id: p.project_id, action: p.agent_actions.cline }));

  return {
    schema: 'delivery_os.dashboard.v1',
    scope: 'execution-only (NOT the Project Portfolio)',
    sections, risks, owner_actions: ownerActions, claude_actions: claudeActions, cline_actions: clineActions,
    counts: Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, v.length])),
  };
}

// Phase 22: Owner Command Center — daily view answering owner questions.
export function ownerCommandCenter(projects, capacity) {
  const needsApproval = projects.filter((p) => p.owner_action || p.status === 'OWNER_REVIEW' || p.change_pending);
  const blockedByOwner = projects.filter((p) => p.blocked_by === 'owner');
  const blockedByClient = projects.filter((p) => p.blocked_by === 'client');
  const overdue = projects.filter((p) => p.overdue);
  const readyDelivery = projects.filter((p) => p.status === 'DELIVERED' || p.status === 'CLIENT_REVIEW');
  const awaitingAcceptance = projects.filter((p) => p.status === 'DELIVERED' && !p.accepted);
  const risksNeedingDecision = projects.filter((p) => p.risk_status === 'TRIGGERED');
  const changeApprovals = projects.filter((p) => p.change_pending);
  const shouldNotStart = projects.filter((p) => p.product_status === 'PLANNED' || p.product_status === 'DRAFT');

  const topRisks = projects.filter((p) => p.risk).slice(0, 3).map((p) => `${p.project_id}: ${p.risk}`);
  const nextOwnerAction = needsApproval[0] ? `${needsApproval[0].project_id}: ${needsApproval[0].owner_action || 'review'}` : 'none pending';

  return {
    schema: 'delivery_os.owner_command_center.v1',
    what_needs_my_approval: needsApproval.map((p) => p.project_id),
    blocked_by_me: blockedByOwner.map((p) => p.project_id),
    blocked_by_client: blockedByClient.map((p) => p.project_id),
    overdue: overdue.map((p) => p.project_id),
    ready_for_delivery: readyDelivery.map((p) => p.project_id),
    awaiting_acceptance: awaitingAcceptance.map((p) => p.project_id),
    risks_needing_decision: risksNeedingDecision.map((p) => p.project_id),
    change_requests_to_approve: changeApprovals.map((p) => p.project_id),
    should_not_start: shouldNotStart.map((p) => p.project_id),
    next_owner_action: nextOwnerAction,
    top_three_risks: topRisks,
    capacity_warning: capacity && capacity.overload_warning ? capacity.overload_warning : 'UNKNOWN',
    note: 'No real notifications. Owner-facing summary only.',
  };
}
