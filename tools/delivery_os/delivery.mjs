#!/usr/bin/env node
// tools/delivery_os/delivery.mjs
// Phase 30: Delivery OS CLI. Offline, deterministic, no send, no production mutation.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { DELIVERY_ROOT, GENERATED_ROOT, FIXTURE_DIR, arg, nowStamp } from './lib/common.mjs';
import { validateCreation } from './lib/creation.mjs';
import { validateTransition } from './lib/lifecycle.mjs';
import { buildInputSet, completenessScore } from './lib/inputs.mjs';
import { planMilestones } from './lib/milestones.mjs';
import { generateTasks } from './lib/tasks.mjs';
import { buildKickoff } from './lib/kickoff.mjs';
import { listPlaybooks, validatePlaybook, getPlaybook, runMiniAuditDelivery } from './lib/playbooks.mjs';
import { buildQAChecklist, scoreQA } from './lib/qa.mjs';
import { evaluateAcceptance } from './lib/acceptance.mjs';
import { evaluateChange } from './lib/change.mjs';
import { buildRiskRegister, evaluateRisks } from './lib/risk.mjs';
import { deliveryCapacity } from './lib/capacity.mjs';
import { scoreReadiness } from './lib/readiness.mjs';
import { simulatePilot } from './lib/pilot.mjs';
import { buildDashboard, ownerCommandCenter } from './lib/dashboard.mjs';
import { newCaseDraft, evaluateCase } from './lib/casestudy.mjs';
import { validateAll } from './lib/validators.mjs';

const cmd = process.argv[2];
const TS = nowStamp(arg('--ts'));
const OUT = path.join(GENERATED_ROOT, 'samples');

function out(name, data) { mkdirSync(OUT, { recursive: true }); const f = path.join(OUT, name); writeFileSync(f, typeof data === 'string' ? data : JSON.stringify(data, null, 2)); return f; }
function fixture(id) {
  const f = path.join(FIXTURE_DIR, 'projects.json');
  if (!existsSync(f)) return null;
  return JSON.parse(readFileSync(f, 'utf8')).projects.find((p) => p.fixture_id === id) || null;
}
function pbMilestones(productId) { const pb = getPlaybook(productId); return pb && pb.milestones ? pb.milestones : []; }

function main() {
  switch (cmd) {
    case 'products': {
      // delivery products = products with a playbook
      for (const pb of listPlaybooks()) console.log(`${pb.product_id.padEnd(24)} readiness=${pb.readiness}`);
      return 0;
    }
    case 'readiness': {
      const id = process.argv[3];
      if (id) { const r = scoreReadiness(id, {}); console.log(`${id}: score=${r.readiness_score} recommended=${r.recommended_status} (auto_promote=${r.auto_promote})`); return r.ok ? 0 : 2; }
      for (const pb of listPlaybooks()) { const r = scoreReadiness(pb.product_id, {}); console.log(`${pb.product_id.padEnd(24)} score=${r.readiness_score} -> ${r.recommended_status}`); }
      return 0;
    }
    case 'create-project': {
      const fx = fixture(arg('--fixture'));
      if (!fx) { console.error('fixture not found'); return 2; }
      const r = validateCreation(fx.request);
      const f = out(`project_${fx.fixture_id}.json`, r);
      console.log(`create-project ${fx.fixture_id}: ok=${r.ok} ${r.errors.length ? 'errors=' + r.errors.join(';') : 'project=' + r.project.project_id}`);
      return r.ok ? 0 : 1;
    }
    case 'validate-project': {
      const data = JSON.parse(readFileSync(process.argv[3], 'utf8'));
      const r = validateCreation(data.request || data);
      console.log(`validate-project: ok=${r.ok} errors=${r.errors.length}`);
      r.errors.forEach((e) => console.log('  ' + e));
      return r.ok ? 0 : 1;
    }
    case 'kickoff': {
      const fx = fixture(process.argv[3] || arg('--fixture'));
      if (!fx) { console.error('fixture not found'); return 2; }
      const created = validateCreation(fx.request);
      if (!created.ok) { console.error('project invalid: ' + created.errors[0]); return 1; }
      const plan = planMilestones({ product_id: fx.request.product_id, milestones: pbMilestones(fx.request.product_id), owner_capacity_days: 30 });
      const k = buildKickoff({ project: created.project, milestonePlan: plan, price_approved: fx.price_approved, owner_approved: fx.owner_approved, requested_label: arg('--label') || 'INTERNAL_DRAFT' });
      const f = out(`kickoff_${fx.fixture_id}.json`, k);
      console.log(`kickoff ${fx.fixture_id}: label=${k.label} send_allowed=${k.send_allowed} blockers=${k.blockers.join(',') || 'none'}`);
      return 0;
    }
    case 'inputs': {
      const fx = fixture(process.argv[3] || arg('--fixture'));
      if (!fx) { console.error('fixture not found'); return 2; }
      const set = buildInputSet(fx.request.product_id, fx.fixture_id);
      const cs = completenessScore(set);
      console.log(`inputs ${fx.fixture_id}: required=${cs.required_total} ready=${cs.ready_to_start} blockers=${cs.blockers_missing.join(',') || 'none'}`);
      return 0;
    }
    case 'plan': {
      const fx = fixture(process.argv[3] || arg('--fixture'));
      if (!fx) { console.error('fixture not found'); return 2; }
      const plan = planMilestones({ product_id: fx.request.product_id, milestones: pbMilestones(fx.request.product_id), owner_capacity_days: 30 });
      out(`plan_${fx.fixture_id}.json`, plan);
      console.log(`plan ${fx.fixture_id}: ok=${plan.ok} critical_path=${plan.critical_path.join('->')} days=${plan.estimated_duration_days}`);
      return plan.ok ? 0 : 1;
    }
    case 'tasks': {
      const fx = fixture(process.argv[3] || arg('--fixture'));
      if (!fx) { console.error('fixture not found'); return 2; }
      const tg = generateTasks({ project_id: fx.fixture_id, milestones: pbMilestones(fx.request.product_id) });
      console.log(`tasks ${fx.fixture_id}: ok=${tg.ok} by_agent=${JSON.stringify(tg.by_agent)}`);
      return tg.ok ? 0 : 1;
    }
    case 'qa': {
      const pid = process.argv[3] || 'mini_audit';
      const pb = getPlaybook(pid);
      const checks = buildQAChecklist(`${pid}_deliverable`, pb && pb.qa ? pb.qa : null).map((c) => ({ ...c, status: 'PASS' }));
      const s = scoreQA(checks);
      console.log(`qa ${pid}: score=${s.quality_score} client_ready=${s.client_ready} blockers=${s.hard_blockers.length}`);
      return 0;
    }
    case 'acceptance': {
      const pid = process.argv[3] || 'mini_audit';
      const pb = getPlaybook(pid);
      const criteria = (pb.acceptance || ['delivered']).map((d, i) => ({ criterion_id: `${pid}_ac${i}`, description: d, severity: 'HIGH', required: true, status: 'PASS' }));
      const a = evaluateAcceptance(criteria);
      console.log(`acceptance ${pid}: status=${a.status} required=${a.required_total} passing=${a.required_passing}`);
      return a.ok ? 0 : 1;
    }
    case 'change-request': {
      const r = evaluateChange({ project_id: process.argv[3] || 'p1', description: arg('--desc') || 'minor tweak', reason: 'client', product_id: arg('--product') || 'mini_audit' });
      console.log(`change-request: suggested=${r.suggested_decision} approved=${r.approved_by_owner} flags=${r.scope_creep_flags.join(',') || 'none'}`);
      return 0;
    }
    case 'risks': {
      const pid = process.argv[3] || 'business_website';
      const risks = buildRiskRegister(pid, `proj_${pid}`);
      const e = evaluateRisks(risks);
      out(`risks_${pid}.json`, { risks, evaluation: e });
      console.log(`risks ${pid}: total=${e.total} high_high=${e.high_high.length} blocks_closure=${e.blocks_closure}`);
      return 0;
    }
    case 'capacity': {
      const file = process.argv[3];
      const input = file && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { active_projects: [] };
      const r = deliveryCapacity(input);
      console.log(`capacity: status=${r.status} ${r.status === 'COMPUTED' ? 'util=' + r.utilization_pct + '% overload=' + r.overload_warning : 'reason=' + r.reason}`);
      return 0;
    }
    case 'close': {
      const fx = fixture(process.argv[3] || arg('--fixture'));
      if (!fx) { console.error('fixture not found'); return 2; }
      const t = validateTransition('ACCEPTED', 'CLOSED', { openCriticalRisk: fx.open_critical_risk === true });
      console.log(`close ${fx.fixture_id}: ok=${t.ok} ${t.errors.join(';')}`);
      return t.ok ? 0 : 1;
    }
    case 'case-study': {
      const pid = arg('--product') || 'mini_audit';
      const c = newCaseDraft(arg('--project') || 'TEST_p1', pid);
      const e = evaluateCase(c);
      console.log(`case-study: stage=${c.stage} publishable=${e.publishable} ok=${e.ok}`);
      return 0;
    }
    case 'simulate': {
      const pid = process.argv[3] || 'mini_audit';
      const scenario = arg('--scenario') || 'success';
      const r = simulatePilot(pid, scenario);
      const f = out(`pilot_${pid}_${scenario}.json`, r);
      console.log(`simulate ${pid}/${scenario}: outcome=${r.outcome} blockers=[${r.blockers.join(',')}] send_allowed=${r.send_allowed}`);
      return 0;
    }
    case 'dashboard-refresh': {
      const fxFile = path.join(FIXTURE_DIR, 'projects.json');
      const projects = existsSync(fxFile) ? JSON.parse(readFileSync(fxFile, 'utf8')).projects.map((p) => ({ project_id: p.fixture_id, name: p.name, status: p.status || 'PLANNED', owner: 'owner', product_status: 'ACTIVE' })) : [];
      const d = buildDashboard(projects);
      const f = out('delivery_dashboard.json', d);
      console.log(`dashboard refreshed: ${JSON.stringify(d.counts)} -> ${f}`);
      return 0;
    }
    case 'validate-all': {
      const r = validateAll();
      console.log(`validate-all ok=${r.ok}`);
      for (const [k, v] of Object.entries(r.results)) console.log(`  ${k}: ok=${v.ok} ${v.errors ? 'errors=' + v.errors.length : ''}`);
      return r.ok ? 0 : 1;
    }
    default:
      console.log('delivery commands: products | readiness [id] | create-project --fixture <id> | validate-project <file> |');
      console.log('  kickoff <fixture> | inputs <fixture> | plan <fixture> | tasks <fixture> | qa <product> |');
      console.log('  acceptance <product> | change-request <project> --product X | risks <product> | capacity <file> |');
      console.log('  close <fixture> | case-study --product X | simulate <product> --scenario S | dashboard-refresh | validate-all');
      return cmd ? 3 : 0;
  }
}
process.exit(main());
