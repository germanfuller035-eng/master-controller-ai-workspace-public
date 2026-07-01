#!/usr/bin/env node
// tools/orchestrator_os/tests/orchestrator.test.mjs — MP43 comprehensive offline tests.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateTask, validatePlan, validateAgent, validateCapability, validateBudget, validateCheckpoint, validateVerification, validateDeadLetter, validateLease, validateArtifact, validateRiskCeiling, validateApprovalGate, validateProductionBoundary, validateTokenAccounting, validateSafetyInvariants, validateAll } from '../lib/validators.mjs';
import { analyzeDag, canRun, antiLoop, buildPlan, selectAgent, routeModel, evaluateBudget, evaluateLease, makeCheckpoint, validateResume, evaluateRetry } from '../lib/engines.mjs';
import { runScenario, SCENARIOS, simulateRun } from '../lib/simulator.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const L = (n) => JSON.parse(readFileSync(path.join(ROOT, n), 'utf8'));
const FX = L('fixtures/orchestrator_fixtures.json');
const fx = (id) => FX.scenarios.find((s) => s.id.startsWith(id));
const agents = L('data/agent_profiles.json');
const policies = L('data/policies.json');
const inventory = L('data/inventory.json');

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) pass++; else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };

// ---- Communication monitor reproducibility (MP2) ----
const cm = readFileSync(path.resolve(ROOT, '../communication_monitor/yandex_mail_imap_read.mjs'), 'utf8');
ok('cm: source tracked', cm.length > 0);
ok('cm: no IMAP execution markers (readonly)', /readonly_mailbox:\s*true/.test(cm) && /mark_seen_enabled:\s*false/.test(cm));
ok('cm: no flag mutation', !/\baddFlags\b|\bsetFlags\b/.test(cm));
ok('cm: no send', !/sendMail|createTransport/.test(cm));
ok('cm: hard safety guard', /SAFETY contract violation/.test(cm));

// ---- Task schema + status + risk (MP5-7) ----
ok('task: valid', validateTask(fx('fx01').task).length === 0, validateTask(fx('fx01').task).join('; '));
ok('task: isolated code valid', validateTask(fx('fx02').task).length === 0);
ok('task: missing done_definition fails', validateTask(fx('fx05').task).some((e) => /done_definition/.test(e)));
ok('risk ceiling: R5 must be owner-gated', validateRiskCeiling({ task_id: 'x', risk_level: 'R5_PRODUCTION_MUTATION', execution_mode: 'LOCAL_WRITE' }).length === 1);
ok('risk ceiling: R5 owner-gated ok', validateRiskCeiling({ task_id: 'x', risk_level: 'R5_PRODUCTION_MUTATION', execution_mode: 'OWNER_GATED' }).length === 0);
ok('risk ceiling: R2 ok', validateRiskCeiling(fx('fx02').task).length === 0);

// ---- Capability policy + agent profiles (MP8) ----
ok('agents: all valid', agents.agents.flatMap(validateAgent).length === 0, agents.agents.flatMap(validateAgent).join('; '));
ok('capabilities: all valid', policies.capability_registry.flatMap(validateCapability).length === 0);
ok('capability: mutate_canonical human-only', policies.capability_registry.find((c) => c.capability_id === 'mutate_canonical').allowed_agents.every((a) => a === 'HUMAN_OWNER'));
ok('capability: send human-only', policies.capability_registry.find((c) => c.capability_id === 'send_message').allowed_agents.every((a) => a === 'HUMAN_OWNER'));
ok('agent: claude prohibits deploy/send', agents.agents.find((a) => a.agent_id === 'claude_code_default').prohibited_capabilities.includes('deploy'));

// ---- Agent selection + model routing (MP9-10) ----
ok('select: repo-wide code -> Claude', selectAgent({ task_type: 'CODE_CHANGE', scope: 'repo_wide', risk_level: 'R2_ISOLATED_CODE' }).agent_type === 'CLAUDE_CODE');
ok('select: file-local -> Cline', selectAgent({ task_type: 'CODE_CHANGE', scope: 'file_local', risk_level: 'R2_ISOLATED_CODE' }).agent_type === 'CLINE');
ok('select: deterministic doc -> Node', selectAgent({ task_type: 'DOCUMENTATION', deterministic_possible: true, risk_level: 'R0_READ_ONLY' }).agent_type === 'DETERMINISTIC_NODE');
ok('select: production -> Human', selectAgent({ task_type: 'CODE_CHANGE', risk_level: 'R5_PRODUCTION_MUTATION' }).agent_type === 'HUMAN_OWNER');
ok('route: critical blocks local model', routeModel({ risk_level: 'R5_PRODUCTION_MUTATION' }).allow_local_model === false);
ok('route: no real model calls (all local_model false)', ['R0_READ_ONLY', 'R2_ISOLATED_CODE'].every((r) => routeModel({ risk_level: r }).allow_local_model === false));

// ---- Context contract + task contract (MP11-12) ----
ok('context contract: reuses AI HQ builder', /context_pack_builder/.test(policies.context_pack_contract.reuses));
ok('context contract: secret exclusion required', policies.context_pack_contract.required.includes('secret_exclusion'));
ok('task contract: 17 sections', policies.task_contract_standard.required_sections.length === 17);

// ---- Dependency DAG (MP13) ----
ok('dag: cycle detected', analyzeDag(fx('fx21').tasks).has_cycle === true);
ok('dag: failed dependency detected', analyzeDag(fx('fx22').tasks).issues.some((i) => i.issue === 'failed_dependency'));
ok('dag: missing dependency', analyzeDag([{ task_id: 'a', status: 'READY', dependencies: ['ghost'] }]).issues.some((i) => i.issue === 'missing_dependency'));
ok('canRun: blocked by incomplete dep', canRun({ dependencies: ['a'] }, [{ task_id: 'a', status: 'READY' }]).runnable === false);
ok('canRun: ok when dep complete', canRun({ dependencies: ['a'] }, [{ task_id: 'a', status: 'COMPLETED' }]).runnable === true);

// ---- Anti-loop (MP14) ----
ok('antiloop: duplicate blocked', antiLoop(fx('fx03').candidate, fx('fx03').history).action === 'BLOCK_DUPLICATE');
ok('antiloop: supersede', antiLoop(fx('fx04').candidate, fx('fx04').history).action === 'SUPERSEDE');
ok('antiloop: repeated failure -> new evidence', antiLoop({ objective_hash: 'h', approach_hash: 'a' }, [{ objective_hash: 'h', approach_hash: 'a', status: 'FAILED_RETRYABLE' }, { objective_hash: 'h', approach_hash: 'a', status: 'FAILED_RETRYABLE' }]).action === 'REQUIRE_NEW_EVIDENCE');
ok('antiloop: novel continue', antiLoop({ objective_hash: 'new' }, []).action === 'CONTINUE');

// ---- Plan builder (MP15) ----
{
  const p = buildPlan(fx('fx02').task);
  ok('plan: phases generated', validatePlan(p).length === 0 && p.phases.length >= 1);
  ok('plan: checkpoints per phase', p.checkpoints.length === p.phases.length);
  ok('plan: continuation auto-continue', p.phases.every((ph) => ph.continuation_condition === 'AUTO_CONTINUE_IF_SAFE'));
  const pOwner = buildPlan({ task_id: 'x', risk_level: 'R5_PRODUCTION_MUTATION', execution_mode: 'OWNER_GATED' });
  ok('plan: high risk -> owner gate', pOwner.approval_state === 'OWNER_GATE_REQUIRED');
}

// ---- Approval gates (MP16) ----
ok('approval: no self-approval', validateApprovalGate({ granted: true, granted_by: 'agent' }).length >= 1);
ok('approval: granted needs reference', validateApprovalGate({ granted: true }).some((e) => /decision_reference/.test(e)));
ok('approval: pending ok', validateApprovalGate({ granted: false }).length === 0);

// ---- Budget (MP17) ----
ok('budget: exceeded detected', evaluateBudget(fx('fx15').budget, fx('fx15').usage).status === 'EXCEEDED');
ok('budget: breach action checkpoints', evaluateBudget(fx('fx15').budget, fx('fx15').usage).action.includes('checkpoint'));
ok('budget: no fabricated confirmed cost', validateBudget({ budget_id: 'b', status: 'ESTIMATED', confirmed_cost: 5 }).length >= 1);
ok('token acct: confirmed needs CONFIRMED status', validateTokenAccounting({ confirmed_cost: 1, status: 'ESTIMATED' }).length >= 1);

// ---- Lease (MP18) ----
ok('lease: conflict blocks', evaluateLease(fx('fx23').lease, fx('fx23').now, fx('fx23').existing).grant === false);
ok('lease: expired recoverable', evaluateLease(fx('fx24').lease, fx('fx24').now, fx('fx24').existing).grant === true);

// ---- Checkpoint / resume (MP19) ----
ok('resume: clean resumable', validateResume(fx('fx25').checkpoint, fx('fx25').current).resumable === true);
ok('resume: source changed blocks', validateResume(fx('fx26').checkpoint, fx('fx26').current).resumable === false);
{ const c = makeCheckpoint({ run_id: 'r' }, { phase_id: 'p1' }, { completed_work: ['a'], next_safe_action: 'go' }); ok('checkpoint: valid', validateCheckpoint(c).length === 0); }

// ---- Retry + dead letter (MP20-21) ----
ok('retry: transient retryable', evaluateRetry(fx('fx17').failure).retry === true);
ok('retry: repeated identical -> change strategy', evaluateRetry(fx('fx18').failure).action === 'CHANGE_STRATEGY');
ok('retry: terminal not retried', evaluateRetry(fx('fx19').failure).retry === false);
ok('retry: policy block no retry', evaluateRetry({ class: 'POLICY_BLOCK' }).retry === false);
ok('retry: owner required -> gate', evaluateRetry({ class: 'OWNER_REQUIRED' }).action === 'OWNER_GATE');
ok('dead letter: valid w/ owner action', validateDeadLetter(fx('fx20').dead_letter).length === 0);

// ---- Verification (MP24) ----
ok('verification: claim not sufficient (needs command)', validateVerification({ verification_id: 'v', gate: 'unit', status: 'PASS' }).some((e) => /command/.test(e)));
ok('verification: valid with evidence', validateVerification(fx('fx27').verification).length === 0);

// ---- Artifacts (MP23) ----
ok('artifact: not canonical', validateArtifact({ artifact_id: 'a', hash: 'h', canonical: true }).length >= 1);
ok('artifact: valid', validateArtifact({ artifact_id: 'a', hash: 'sha256:x' }).length === 0);

// ---- Production boundary (MP31) ----
ok('boundary: valid', validateProductionBoundary(fx('fx33').boundary).length === 0);
ok('boundary: no shared queue', validateProductionBoundary({ agent_orchestration: [], shared_writable_queue: true }).length >= 1);
ok('boundary: orchestration not production scope', validateProductionBoundary({ agent_orchestration: ['canonical_mutations'] }).length >= 1);

// ---- Simulator + E2E (MP35-36) ----
for (const s of SCENARIOS) ok(`e2e: scenario ${s}`, runScenario(s).ok === true, JSON.stringify(runScenario(s).steps));
ok('e2e: no real agent started (A)', simulateRun(fx('fx34').task).real_agent_started === false);
ok('e2e: K production blocked -> human', runScenario('K').ok === true);
ok('e2e: L external comm blocked -> human', runScenario('L').ok === true);

// ---- Integration contracts (MP37) ----
const ints = policies.integration_contracts;
for (const sys of ['ai_hq', 'executive_os', 'delivery_os', 'analytics_os', 'conversation_hub', 'integration_registry', 'master_controller']) ok(`integration: ${sys}`, !!ints[sys]);
ok('integration: MC boundary only', ints.master_controller.includes('production_queue_boundary_only'));

// ---- Aggregate ----
ok('safety invariants locked', validateSafetyInvariants().length === 0);
ok('validate-all: 0 blockers', validateAll({ inventory, policies, agents, fixtures: FX }).blockers === 0);

console.log(`\norchestrator.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
