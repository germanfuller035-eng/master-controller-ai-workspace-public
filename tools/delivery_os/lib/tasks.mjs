// tools/delivery_os/lib/tasks.mjs
// Phase 9: Task Generator. Generates tasks per milestone with agent assignment.
// Never assigns client communication to AI automatically.

// Agent assignment heuristics by task nature.
const AGENT_RULES = [
  { re: /(approv|decision|strateg|client communication|sensitive access|real credential|final review)/i, agent: 'owner' },
  { re: /(provide input|confirm fact|content approval|acceptance|client sign)/i, agent: 'client' },
  { re: /(focused fix|format|rename|local repair|small edit|file-level)/i, agent: 'cline' },
  { re: /(implement|research|generate|document|code|test|qa|analy|audit|draft|design)/i, agent: 'claude' },
];

function assignAgent(title, hint) {
  if (hint && ['claude', 'cline', 'owner', 'client'].includes(hint)) return hint;
  for (const r of AGENT_RULES) if (r.re.test(title)) return r.agent;
  return 'claude';
}

// input: { project_id, milestones:[{milestone_id, name, deliverables, tasks?:[{title,agent,estimate,...}]}] }
export function generateTasks(input) {
  const tasks = [];
  const errors = [];
  let counter = 0;
  for (const m of (input.milestones || [])) {
    const mtasks = m.tasks && m.tasks.length ? m.tasks : defaultTasksFor(m);
    for (const t of mtasks) {
      counter++;
      const agent = assignAgent(t.title, t.agent);
      const task = {
        task_id: t.task_id || `${input.project_id || 'proj'}_t${counter}`,
        project_id: input.project_id || null,
        milestone_id: m.milestone_id,
        title: t.title,
        agent,
        status: 'TODO',
        estimate_hours: t.estimate_hours ?? null,
        actual_hours: null,
        dependencies: t.dependencies || [],
        input_requirements: t.input_requirements || [],
        output: ('output' in t) ? t.output : `${t.title} output`,
        evidence: null,
        review_required: t.review_required ?? (agent === 'claude' || agent === 'cline'),
      };
      // Guard: never auto-assign client communication to AI.
      if (/client communication|message client|send to client|contact client/i.test(t.title) && (agent === 'claude' || agent === 'cline')) {
        errors.push(`task "${t.title}" reassigned to owner (no AI client communication)`);
        task.agent = 'owner';
      }
      if (!task.output) errors.push(`task ${task.task_id} missing output`);
      tasks.push(task);
    }
  }

  // Duplicate detection (same milestone + title).
  const seen = new Set();
  const duplicates = [];
  for (const t of tasks) {
    const k = `${t.milestone_id}::${t.title.toLowerCase()}`;
    if (seen.has(k)) duplicates.push(t.task_id); else seen.add(k);
  }
  // Circular task dependency.
  const cycle = detectTaskCycle(tasks);

  return {
    ok: errors.length === 0 && duplicates.length === 0 && !cycle,
    errors,
    duplicates,
    circular_dependency: cycle,
    tasks,
    by_agent: tasks.reduce((o, t) => (o[t.agent] = (o[t.agent] || 0) + 1, o), {}),
  };
}

function defaultTasksFor(m) {
  const out = [{ title: `Produce ${m.name} deliverable`, agent: 'claude', estimate_hours: 2, review_required: true, output: m.deliverables?.[0] || 'deliverable' }];
  if (m.qa_gate) out.push({ title: `QA review of ${m.name}`, agent: 'claude', estimate_hours: 1, review_required: true, output: 'qa report' });
  if (m.owner === 'owner') out.push({ title: `Owner approval of ${m.name}`, agent: 'owner', estimate_hours: 0.5, output: 'owner decision' });
  return out;
}

function detectTaskCycle(tasks) {
  const byId = Object.fromEntries(tasks.map((t) => [t.task_id, t]));
  const color = {}; tasks.forEach((t) => (color[t.task_id] = 0));
  const stack = []; let found = null;
  function dfs(id) {
    if (found) return; color[id] = 1; stack.push(id);
    for (const d of (byId[id]?.dependencies || [])) {
      if (!byId[d]) continue;
      if (color[d] === 1) { found = [...stack.slice(stack.indexOf(d)), d]; return; }
      if (color[d] === 0) dfs(d);
    }
    color[id] = 2; stack.pop();
  }
  for (const t of tasks) if (color[t.task_id] === 0) dfs(t.task_id);
  return found;
}
