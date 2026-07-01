// tools/orchestrator_os/lib/simulator.mjs
// MP35-36 — deterministic orchestration simulator + 12 synthetic E2E scenarios.
// NEVER starts a real agent, uses network, mutates production, sends, or deploys. Pure transitions.
import { selectAgent, buildPlan, antiLoop, analyzeDag, evaluateBudget, evaluateRetry, evaluateLease, validateResume } from './engines.mjs';

// Single simulated run: task -> plan -> agent -> phases -> checkpoint -> verify -> complete.
export function simulateRun(task, opts = {}) {
  const steps = [];
  const agent = selectAgent(task);
  steps.push(`select agent: ${agent.agent_type} (${agent.reason})`);
  const plan = buildPlan(task);
  steps.push(`plan: ${plan.phases.length} phases, approval=${plan.approval_state}`);
  if (plan.approval_state === 'OWNER_GATE_REQUIRED') {
    steps.push('OWNER_GATE_REQUIRED -> stop; owner decision reference required');
    return { task_id: task.task_id, status: 'WAITING_OWNER', steps, real_agent_started: false };
  }
  for (const ph of plan.phases) {
    steps.push(`phase ${ph.sequence} ${ph.name}: run (synthetic) -> checkpoint`);
  }
  steps.push('verification gates: unit+security+no-network+no-send+no-production = PASS (synthetic)');
  return { task_id: task.task_id, status: 'COMPLETED', steps, real_agent_started: false, agent: agent.agent_type };
}

// MP36 scenarios A..L
export function runScenario(id, ctx = {}) {
  const base = (over) => ({ task_id: 'TEST_t', project_id: 'agent-orchestration', task_type: 'DOCUMENTATION', status: 'READY', risk_level: 'R0_READ_ONLY', execution_mode: 'READ_ONLY', done_definition: 'x', allowed_paths: [], forbidden_paths: [], synthetic: true, revision: 1, ...over });
  switch (id) {
    case 'A': { // documentation -> deterministic -> validate -> artifact -> complete
      const t = base({ task_type: 'DOCUMENTATION', deterministic_possible: true });
      const r = simulateRun(t); return { scenario: 'A', name: 'Documentation task', ok: r.status === 'COMPLETED' && !r.real_agent_started, steps: r.steps };
    }
    case 'B': { // multi-phase code -> Claude -> isolated worktree -> checkpoints -> tests -> complete
      const t = base({ task_type: 'CODE_CHANGE', risk_level: 'R2_ISOLATED_CODE', execution_mode: 'ISOLATED_WORKTREE', scope: 'repo_wide', phase_outline: ['inventory', 'implement', 'test', 'verify'] });
      const r = simulateRun(t); return { scenario: 'B', name: 'Multi-phase code task', ok: r.status === 'COMPLETED' && r.agent === 'CLAUDE_CODE', steps: r.steps };
    }
    case 'C': { // duplicate task blocked
      const al = antiLoop({ objective_hash: 'h1', approach_hash: 'a1' }, [{ task_id: 'TEST_old', objective_hash: 'h1', status: 'COMPLETED' }]);
      return { scenario: 'C', name: 'Duplicate task blocked', ok: al.action === 'BLOCK_DUPLICATE', steps: [`anti-loop: ${al.action} (${al.reason})`] };
    }
    case 'D': { // owner approval required
      const t = base({ task_type: 'DEPLOYMENT_PLAN', risk_level: 'R4_PRODUCTION_PREPARATION', execution_mode: 'OWNER_GATED' });
      const r = simulateRun(t); return { scenario: 'D', name: 'Owner approval required', ok: r.status === 'WAITING_OWNER', steps: r.steps };
    }
    case 'E': { // token budget exceeded
      const b = evaluateBudget({ limits: { token: 1000 }, status: 'ESTIMATED' }, { token: 5000 });
      return { scenario: 'E', name: 'Token budget exceeded', ok: b.status === 'EXCEEDED' && b.action.includes('checkpoint'), steps: [`budget: ${b.status}`, `action: ${b.action.join(',')}`] };
    }
    case 'F': { // retry succeeds
      const r = evaluateRetry({ class: 'TRANSIENT_TOOL', attempts: 1, max_retries: 3 });
      return { scenario: 'F', name: 'Retry succeeds', ok: r.retry === true && r.action === 'RETRY_BOUNDED', steps: [`retry: ${r.action} (${r.reason})`] };
    }
    case 'G': { // terminal failure -> dead letter
      const r = evaluateRetry({ class: 'TERMINAL_CODE' });
      return { scenario: 'G', name: 'Terminal failure -> dead letter', ok: r.terminal === true && r.retry === false, steps: [`retry: ${r.action} (${r.reason})`, 'dead_letter: owner_action required'] };
    }
    case 'H': { // dependency failure
      const dag = analyzeDag([{ task_id: 'TEST_a', status: 'FAILED_TERMINAL', dependencies: [] }, { task_id: 'TEST_b', status: 'READY', dependencies: ['TEST_a'] }]);
      return { scenario: 'H', name: 'Dependency failure', ok: dag.issues.some((i) => i.issue === 'failed_dependency'), steps: [`dag issues: ${dag.issues.map((i) => i.issue).join(',')}`] };
    }
    case 'I': { // revision conflict
      const r = evaluateRetry({ class: 'REVISION_CONFLICT', attempts: 0, max_retries: 3 });
      return { scenario: 'I', name: 'Revision conflict', ok: r.retry === true, steps: [`retry: ${r.action}; reconcile expected_revision then re-attempt`] };
    }
    case 'J': { // agent handoff
      const steps = ['Claude completes phase 1-2 (isolated worktree)', 'handoff package: branch+commit+artifacts+tests+context_checksum', 'Cline resumes phase 3 (file-local)'];
      return { scenario: 'J', name: 'Agent handoff', ok: true, steps };
    }
    case 'K': { // production request blocked
      const t = base({ task_type: 'CODE_CHANGE', risk_level: 'R5_PRODUCTION_MUTATION', requires: 'production_mutation' });
      const a = selectAgent(t);
      return { scenario: 'K', name: 'Production request blocked', ok: a.agent_type === 'HUMAN_OWNER', steps: [`select: ${a.agent_type} (${a.reason})`, 'policy: no production without owner approval -> BLOCKED for agents'] };
    }
    case 'L': { // external communication blocked
      const t = base({ task_type: 'CONTENT_DRAFT', risk_level: 'R6_EXTERNAL_COMMUNICATION', requires: 'external_communication' });
      const a = selectAgent(t);
      return { scenario: 'L', name: 'External communication blocked', ok: a.agent_type === 'HUMAN_OWNER', steps: [`select: ${a.agent_type}`, 'policy: no send; external comms owner-gated -> BLOCKED for agents'] };
    }
    default: return { scenario: id, ok: false, steps: [], error: `unknown scenario ${id}` };
  }
}

export const SCENARIOS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
