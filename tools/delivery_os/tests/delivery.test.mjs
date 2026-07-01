#!/usr/bin/env node
// tools/delivery_os/tests/delivery.test.mjs
// Phase 33: Comprehensive offline test suite for Delivery OS. Deterministic. Real exit code.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from '../../revenue_os/lib/schema.mjs';
import { SCHEMAS } from '../schemas/domain.mjs';
import { validateTransition } from '../lib/lifecycle.mjs';
import { validateCreation } from '../lib/creation.mjs';
import { buildInputSet, completenessScore, validateNoEmbeddedSecrets } from '../lib/inputs.mjs';
import { planMilestones } from '../lib/milestones.mjs';
import { generateTasks } from '../lib/tasks.mjs';
import { buildKickoff } from '../lib/kickoff.mjs';
import { listPlaybooks, validatePlaybook, getPlaybook, runMiniAuditDelivery } from '../lib/playbooks.mjs';
import { scoreQA } from '../lib/qa.mjs';
import { evaluateAcceptance } from '../lib/acceptance.mjs';
import { evaluateChange } from '../lib/change.mjs';
import { buildRiskRegister, evaluateRisks } from '../lib/risk.mjs';
import { deliveryCapacity } from '../lib/capacity.mjs';
import { scoreReadiness } from '../lib/readiness.mjs';
import { simulatePilot } from '../lib/pilot.mjs';
import { evaluateCase, newCaseDraft } from '../lib/casestudy.mjs';
import { comparePlanActual } from '../lib/plan_actual.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const fx = JSON.parse(readFileSync(path.join(ROOT, 'fixtures/projects.json'), 'utf8'));
const fixture = (id) => fx.projects.find((p) => p.fixture_id === id);

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) pass++; else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };

// ---- Domain schemas ----
{
  const validProject = { project_id: 'TEST_p', deal_id: 'd', canonical_lead_id: null, product_id: 'mini_audit', name: 'n', status: 'PLANNED', priority: 'P2', owner: 'owner', project_manager: null, created_at: null, planned_start: null, actual_start: null, planned_end: null, actual_end: null, scope_version: 1, commercial_reference: 'c', client_reference: null, revision: 1, test_only: true };
  ok('schema: valid project', validate(validProject, SCHEMAS.client_project).ok);
  ok('schema: invalid status rejected', !validate({ ...validProject, status: 'NONSENSE' }, SCHEMAS.client_project).ok);
  ok('schema: missing required field rejected', !validate({ ...validProject, product_id: undefined }, SCHEMAS.client_project).ok);
}

// ---- Lifecycle ----
{
  ok('lifecycle: valid transition', validateTransition('SCOPE_FROZEN', 'READY_TO_START').ok);
  ok('lifecycle: invalid transition', !validateTransition('READY_TO_START', 'DELIVERED').ok);
  ok('lifecycle: no DELIVERED without QA', !validateTransition('CLIENT_REVIEW', 'DELIVERED', { qaPassed: false }).ok);
  ok('lifecycle: no ACCEPTED without acceptance', !validateTransition('DELIVERED', 'ACCEPTED', { acceptancePassed: false }).ok);
  ok('lifecycle: no CLOSE with critical risk', !validateTransition('ACCEPTED', 'CLOSED', { openCriticalRisk: true }).ok);
  ok('lifecycle: rollback present', validateTransition('INTERNAL_QA', 'OWNER_REVIEW').rollback_state === 'INTERNAL_QA');
}

// ---- Project creation ----
{
  ok('creation: valid TEST_ONLY', validateCreation(fixture('F01_mini_audit_success').request).ok);
  ok('creation: missing deal (non-test)', !validateCreation({ test_only: false, product_id: 'mini_audit', scope: ['s'], deliverables: ['d'], acceptance_criteria: ['a'], client_inputs: ['i'], commercial_reference: 'c', owner: 'o' }).ok);
  ok('creation: missing scope', !validateCreation({ test_only: true, deal_id: 'd', product_id: 'mini_audit', deliverables: ['d'], acceptance_criteria: ['a'], client_inputs: ['i'], commercial_reference: 'c', owner: 'o' }).ok);
  ok('creation: PLANNED product blocked', !validateCreation(fixture('F13_product_not_ready').request).ok);
  ok('creation: unapproved price (non-test) blocked', !validateCreation({ test_only: false, deal_id: 'd', canonical_lead_id: 'L1', product_id: 'mini_audit', scope: ['s'], price_approved: false, deliverables: ['d'], acceptance_criteria: ['a'], client_inputs: ['i'], commercial_reference: 'c', owner: 'o' }).ok);
}

// ---- Kickoff ----
{
  const c = validateCreation(fixture('F01_mini_audit_success').request);
  const plan = planMilestones({ product_id: 'mini_audit', milestones: getPlaybook('mini_audit').milestones, owner_capacity_days: 30 });
  const internal = buildKickoff({ project: c.project, milestonePlan: plan, price_approved: false, owner_approved: false });
  ok('kickoff: internal draft default', internal.label === 'INTERNAL_DRAFT');
  ok('kickoff: send_allowed false', internal.send_allowed === false);
  ok('kickoff: blockers when gates fail', internal.blockers.length > 0);
}

// ---- Milestones ----
{
  const normal = planMilestones({ product_id: 'mini_audit', milestones: getPlaybook('mini_audit').milestones, owner_capacity_days: 30 });
  ok('milestones: normal plan ok', normal.ok);
  ok('milestones: critical path present', normal.critical_path.length > 0);
  const cyc = planMilestones({ milestones: [{ milestone_id: 'a', name: 'A', deliverables: ['x'], dependencies: ['b'], owner: 'claude', est_days: 1 }, { milestone_id: 'b', name: 'B', deliverables: ['y'], dependencies: ['a'], owner: 'claude', est_days: 1 }] });
  ok('milestones: cycle detected', !cyc.ok);
  const noDeliv = planMilestones({ milestones: [{ milestone_id: 'a', name: 'A', deliverables: [], owner: 'claude', est_days: 1 }] });
  ok('milestones: missing deliverable', !noDeliv.ok);
}

// ---- Tasks ----
{
  const tg = generateTasks({ project_id: 'p', milestones: getPlaybook('mini_audit').milestones });
  ok('tasks: generated with agents', Object.keys(tg.by_agent).length > 0);
  const aiComm = generateTasks({ project_id: 'p', milestones: [{ milestone_id: 'm1', name: 'M', deliverables: ['d'], tasks: [{ title: 'client communication: email client', agent: 'claude' }] }] });
  ok('tasks: no AI client communication', aiComm.tasks.find((t) => /client communication/i.test(t.title)).agent === 'owner');
  const missingOut = generateTasks({ project_id: 'p', milestones: [{ milestone_id: 'm1', name: 'M', deliverables: ['d'], tasks: [{ title: 'do thing', agent: 'claude', output: null }] }] });
  ok('tasks: missing output flagged', !missingOut.ok);
}

// ---- Playbooks ----
{
  ok('playbooks: all valid', listPlaybooks().every((pb) => validatePlaybook(pb.product_id).ok));
  const ma = runMiniAuditDelivery({ identity_verified: true, website_verified: true, contact_verified: true, evidence: [{ c: 1 }], findings: [1, 2, 3, 4, 5].map((i) => ({ title: 't' + i })), price: 10000 });
  ok('playbooks: mini audit delivery pass', ma.ok && ma.send_allowed === false);
  const maFail = runMiniAuditDelivery({ identity_verified: false, evidence: [], findings: [], price: 5000 });
  ok('playbooks: mini audit delivery fail', !maFail.ok);
}

// ---- QA ----
{
  ok('qa: pass', scoreQA([{ check_id: 'c', category: 'completeness', requirement: 'ok', status: 'PASS', severity: 'LOW' }]).client_ready);
  const critical = scoreQA([{ check_id: 'c', category: 'evidence', requirement: 'unsupported claim', status: 'FAIL', severity: 'CRITICAL' }]);
  ok('qa: critical fail blocks client_ready', !critical.client_ready && critical.hard_blockers.length > 0);
  ok('qa: warning counted', scoreQA([{ check_id: 'c', category: 'usability', requirement: 'x', status: 'WARNING', severity: 'LOW' }]).warnings === 1);
}

// ---- Acceptance ----
{
  ok('acceptance: pass', evaluateAcceptance([{ criterion_id: 'a', description: 'd', severity: 'HIGH', required: true, status: 'PASS' }]).ok);
  ok('acceptance: missing evidence fails', !evaluateAcceptance([{ criterion_id: 'a', description: 'd', severity: 'HIGH', required: true, status: 'FAIL' }]).ok);
  ok('acceptance: valid waiver passes', evaluateAcceptance([{ criterion_id: 'a', description: 'd', severity: 'LOW', required: true, status: 'FAIL' }], [{ criterion_id: 'a', reason: 'minor', owner_approved: true }]).ok);
  ok('acceptance: critical defect cannot be waived', !evaluateAcceptance([{ criterion_id: 'a', description: 'd', severity: 'CRITICAL', required: true, status: 'FAIL' }], [{ criterion_id: 'a', reason: 'x', owner_approved: true }]).ok);
}

// ---- Change requests ----
{
  ok('change: no impact within scope', evaluateChange({ project_id: 'p', description: 'tiny copy fix', reason: 'x', product_id: 'mini_audit' }).suggested_decision === 'PENDING');
  ok('change: new integration -> new offer', evaluateChange({ project_id: 'p', description: 'add CRM integration', reason: 'x', product_id: 'mini_audit' }).suggested_decision === 'REQUIRES_NEW_OFFER');
  ok('change: never auto-approved', evaluateChange({ project_id: 'p', description: 'anything', reason: 'x', product_id: 'mini_audit' }).approved_by_owner === false);
}

// ---- Risk ----
{
  const risks = buildRiskRegister('business_website', 'p');
  ok('risk: register built', risks.length > 0);
  risks[0].probability = 'high'; risks[0].impact = 'high';
  ok('risk: high/high blocks closure', evaluateRisks(risks).blocks_closure);
  const noMit = [{ risk_id: 'r', mitigation: '', status: 'OPEN', probability: 'low', impact: 'low' }];
  ok('risk: missing mitigation flagged', !evaluateRisks(noMit).ok);
}

// ---- Readiness ----
{
  ok('readiness: mini_audit not auto-promoted', scoreReadiness('mini_audit', {}).auto_promote === false);
  ok('readiness: planned product low', ['PLANNED', 'DRAFT', 'DELIVERY_DEFINED'].includes(scoreReadiness('ai_front_office', {}).recommended_status));
  const pilot = scoreReadiness('mini_audit', { capacity_known: true, templates_ready: true, synthetic_test: true, owner_approved: true });
  ok('readiness: pilot-ready with flags', pilot.recommended_status === 'READY_FOR_PILOT');
  const active = scoreReadiness('mini_audit', { capacity_known: true, templates_ready: true, synthetic_test: true, owner_approved: true, successful_pilot: true, lessons_captured: true, actual_effort_measured: true, delivery_risk_understood: true });
  ok('readiness: ACTIVE needs full evidence', active.recommended_status === 'ACTIVE');
}

// ---- Simulation ----
{
  ok('sim: mini_audit success', simulatePilot('mini_audit', 'success').outcome === 'DELIVERED_ACCEPTED');
  ok('sim: mini_audit qa failure blocked', simulatePilot('mini_audit', 'failure_qa').outcome === 'BLOCKED');
  ok('sim: business_website success', simulatePilot('business_website', 'success').outcome === 'DELIVERED_ACCEPTED');
  ok('sim: lead_system planned blocked at creation', simulatePilot('lead_system', 'success').blockers.includes('creation_blocked'));
  ok('sim: ai_front_office planned blocked', simulatePilot('ai_front_office', 'success').blockers.includes('creation_blocked'));
  ok('sim: all pilots no-send', ['mini_audit', 'business_website', 'landing_sprint'].every((p) => simulatePilot(p, 'success').send_allowed === false));
}

// ---- Case study ----
{
  const c = newCaseDraft('p', 'mini_audit'); c.publishable = true; c.client_permission = true; c.metrics = [{ name: 'x', value: 1, source: 'invented' }];
  ok('case: invented metric blocked', !evaluateCase(c).ok);
  const c2 = newCaseDraft('p', 'mini_audit'); c2.publishable = true; c2.client_permission = false;
  ok('case: publish without permission blocked', !evaluateCase(c2).ok);
  const c3 = newCaseDraft('p', 'mini_audit');
  ok('case: candidate draft ok', evaluateCase(c3).ok);
}

// ---- Plan vs actual ----
{
  const pa = comparePlanActual({ planned: { owner_hours: 2, duration_days: 1, margin: 5000 }, actual: { owner_hours: 4, duration_days: 2, margin: 3000 }, variance_notes: [{ metric: 'owner_hours', reason: 'underestimation' }] });
  ok('plan/actual: overruns detected', pa.overruns.includes('owner_hours'));
  ok('plan/actual: margin erosion detected', pa.margin_erosion === true);
  ok('plan/actual: invalid reason flagged', comparePlanActual({ planned: {}, actual: {}, variance_notes: [{ metric: 'x', reason: 'aliens' }] }).invalid_reasons.length === 1);
}

// ---- Inputs / no embedded secrets ----
{
  const set = buildInputSet('business_website', 'p');
  ok('inputs: credential refs not embedded', validateNoEmbeddedSecrets(set).ok);
  const bad = [{ name: 'domain_access', sensitive: true, value: 'realpassword123' }];
  ok('inputs: embedded secret caught', !validateNoEmbeddedSecrets(bad).ok);
}

console.log(`\n[delivery.test] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
