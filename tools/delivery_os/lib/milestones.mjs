// tools/delivery_os/lib/milestones.mjs
// Phase 8: Milestone Planner. Deterministic. Relative timelines (no exact client dates without
// approved start). Detects cycles, impossible order, missing deliverable/QA/acceptance, overload.

// product playbook provides milestone templates; here we plan + validate.
// input: { product_id, milestones:[{name, deliverables, dependencies, owner, qa_gate, acceptance_gate, est_days}],
//          owner_capacity_days, ai_automation_level }
export function planMilestones(input) {
  const ms = (input.milestones || []).map((m, i) => ({ ...m, milestone_id: m.milestone_id || `m${i + 1}`, sequence: i + 1 }));
  const errors = [];
  const warnings = [];

  // Build dependency graph + detect cycles.
  const byId = Object.fromEntries(ms.map((m) => [m.milestone_id, m]));
  const cycle = detectCycle(ms, byId);
  if (cycle) errors.push(`circular dependency: ${cycle.join(' -> ')}`);

  // Missing-dependency detection.
  for (const m of ms) {
    for (const d of (m.dependencies || [])) {
      if (!byId[d]) errors.push(`milestone ${m.milestone_id} depends on missing ${d}`);
    }
  }

  // Each milestone must have a deliverable; final delivery needs QA + acceptance.
  for (const m of ms) {
    if (!m.deliverables || m.deliverables.length === 0) errors.push(`milestone ${m.milestone_id} (${m.name}) has no deliverable`);
  }
  const last = ms[ms.length - 1];
  if (last && !last.acceptance_gate) warnings.push('final milestone has no acceptance gate');
  const anyQa = ms.some((m) => m.qa_gate);
  if (!anyQa) warnings.push('no QA gate in plan');

  // Critical path (longest dependency chain by est_days) — only if acyclic.
  let criticalPath = [];
  let totalDays = 0;
  if (!cycle) {
    const { path, days } = longestPath(ms, byId);
    criticalPath = path; totalDays = days;
  }

  // Owner overload: sum owner-owned milestone days vs capacity.
  const ownerDays = ms.filter((m) => m.owner === 'owner').reduce((s, m) => s + (m.est_days || 0), 0);
  if (input.owner_capacity_days != null && ownerDays > input.owner_capacity_days) {
    warnings.push(`owner overload: ${ownerDays} owner-days > capacity ${input.owner_capacity_days}`);
  }

  // Relative timeline labels.
  const timeline = ms.map((m) => ({
    milestone_id: m.milestone_id,
    name: m.name,
    relative: relativeLabel(m, byId),
    owner: m.owner,
    deliverables: m.deliverables,
    qa_gate: !!m.qa_gate,
    acceptance_gate: !!m.acceptance_gate,
  }));

  return {
    ok: errors.length === 0,
    errors, warnings,
    milestone_sequence: ms.map((m) => m.milestone_id),
    critical_path: criticalPath,
    estimated_duration_days: totalDays,
    timeline,
    owner_checkpoints: ms.filter((m) => m.owner === 'owner').map((m) => m.milestone_id),
    client_checkpoints: ms.filter((m) => m.owner === 'client').map((m) => m.milestone_id),
    note: 'Relative timeline only. No exact client dates without approved start date.',
  };
}

function detectCycle(ms, byId) {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = {};
  ms.forEach((m) => (color[m.milestone_id] = WHITE));
  const stack = [];
  let found = null;
  function dfs(id) {
    if (found) return;
    color[id] = GRAY; stack.push(id);
    for (const d of (byId[id]?.dependencies || [])) {
      if (!byId[d]) continue;
      if (color[d] === GRAY) { found = [...stack.slice(stack.indexOf(d)), d]; return; }
      if (color[d] === WHITE) dfs(d);
    }
    color[id] = BLACK; stack.pop();
  }
  for (const m of ms) if (color[m.milestone_id] === WHITE) dfs(m.milestone_id);
  return found;
}

function longestPath(ms, byId) {
  const memo = {};
  function dist(id) {
    if (memo[id]) return memo[id];
    const m = byId[id];
    const deps = (m.dependencies || []).filter((d) => byId[d]);
    let best = { days: m.est_days || 0, path: [id] };
    for (const d of deps) {
      const sub = dist(d);
      if (sub.days + (m.est_days || 0) > best.days) best = { days: sub.days + (m.est_days || 0), path: [...sub.path, id] };
    }
    memo[id] = best; return best;
  }
  let overall = { days: 0, path: [] };
  for (const m of ms) { const r = dist(m.milestone_id); if (r.days > overall.days) overall = r; }
  return overall;
}

function relativeLabel(m, byId) {
  if (!m.dependencies || m.dependencies.length === 0) return 'Day 0';
  if (m.owner === 'client') return 'after client input';
  if (m.owner === 'owner') return 'after owner approval';
  return `after ${m.dependencies.join(', ')}`;
}
