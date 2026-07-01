#!/usr/bin/env node
// tools/customer_success_os/success.mjs
// Phase 47: Customer Success OS CLI. Offline, deterministic, no production mutation, no send, no publish.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { CS_ROOT, GENERATED_ROOT, FIXTURE_DIR, arg, nowStamp } from './lib/common.mjs';
import { buildOnboarding, buildSuccessPlan, assessAdoption } from './lib/success.mjs';
import { computeHealth, buildRisks } from './lib/health.mjs';
import { buildHandoff } from './lib/handoff.mjs';
import { triage, classifyBoundary, slaModel } from './lib/support.mjs';
import { buildIncident } from './lib/incidents.mjs';
import { interpretSatisfaction, valueReview } from './lib/feedback.mjs';
import { renewalAssessment, expansionAssessment, classifyChurn, customerProfitability } from './lib/lifecycle_commercial.mjs';
import { evaluatePermission } from './lib/permissions.mjs';
import { buildPortfolio, dashboard, ownerCommandCenter } from './lib/portfolio.mjs';
import { validateAll } from './lib/validators.mjs';

const cmd = process.argv[2];
const TS = nowStamp(arg('--ts'));
const OUT = path.join(GENERATED_ROOT, 'samples');
function out(name, data) { mkdirSync(OUT, { recursive: true }); const f = path.join(OUT, name); writeFileSync(f, typeof data === 'string' ? data : JSON.stringify(data, null, 2)); return f; }
function customers() { return JSON.parse(readFileSync(path.join(FIXTURE_DIR, 'customers.json'), 'utf8')).customers; }
function cust(id) { return customers().find((c) => c.customer_ref_id === id); }

function main() {
  switch (cmd) {
    case 'customers': { customers().forEach((c) => console.log(`${c.customer_ref_id.padEnd(12)} ${c.status.padEnd(18)} health=${c.health || 'UNKNOWN'} (${c.scenario})`)); return 0; }
    case 'customer': { const c = cust(process.argv[3]); if (!c) { console.error('not found'); return 2; } console.log(JSON.stringify(c, null, 2)); return 0; }
    case 'lifecycle': { const c = cust(process.argv[3]); console.log(`${process.argv[3]}: status=${c ? c.status : 'UNKNOWN'}`); return 0; }
    case 'onboarding': { const c = cust(process.argv[3]); const r = buildOnboarding(process.argv[3], c ? c.product_ids[0] : 'mini_audit'); out(`onboarding_${process.argv[3]}.json`, r.onboarding); console.log(`onboarding ${process.argv[3]}: ${r.onboarding.status} spec_only=${r.onboarding.specification_only}`); return 0; }
    case 'plan': { const c = cust(process.argv[3]); const r = buildSuccessPlan({ customer_ref_id: process.argv[3], product_id: c ? c.product_ids[0] : 'mini_audit' }); out(`plan_${process.argv[3]}.json`, r.plan); console.log(`plan ${process.argv[3]}: no_value_risk=${r.plan.no_value_risk}`); return 0; }
    case 'adoption': { const c = cust(process.argv[3]); const r = assessAdoption({ customer_ref_id: process.argv[3], product_id: c ? c.product_ids[0] : 'mini_audit', observed: {} }); console.log(`adoption ${process.argv[3]}: ${r.adoption_level}%`); return 0; }
    case 'health': { const c = cust(process.argv[3]); const r = computeHealth({ dimensions: c && c.health === 'HEALTHY' ? { adoption: 'good', outcome_progress: 'good', engagement: 'good', payment_status: 'good', support_load: 'good', open_risks: 'good', product_fit: 'good', delivery_satisfaction: 'good', owner_capacity: 'good', customer_dependency: 'good' } : {}, unresolved_critical_incident: c && c.open_critical_support }); out(`health_${process.argv[3]}.json`, r); console.log(`health ${process.argv[3]}: ${r.status} confidence=${r.confidence}`); return 0; }
    case 'risks': { const r = buildRisks(process.argv[3], [{ category: 'no_adoption', probability: 'medium', impact: 'high' }]); console.log(`risks ${process.argv[3]}: ${r.length} (top severity ${r[0].severity})`); return 0; }
    case 'support': { console.log('support categories: how_to/defect/.../security/privacy. Use triage <ticket>.'); return 0; }
    case 'triage': { const c = cust(arg('--customer') || 'TEST_cs06'); const r = triage({ support_request_id: process.argv[3] || 'T1', customer_ref_id: c ? c.customer_ref_id : null, product_id: c ? c.product_ids[0] : 'business_website', category: arg('--category') || 'defect', description: arg('--desc') || 'form not working' }); out(`triage_${process.argv[3] || 'T1'}.json`, r); console.log(`triage: severity=${r.severity} kind=${r.kind} escalation=${r.escalation} auto_resolve_blocked=${r.auto_resolve_blocked}`); return 0; }
    case 'incident': { const r = buildIncident({ incident_id: process.argv[3] || 'I1', severity: 'SEV1_CRITICAL', impact: 'service down' }); out(`incident_${process.argv[3] || 'I1'}.json`, r); console.log(`incident ${r.incident_id}: ${r.status} comms send=${r.customer_communication_draft.send_allowed}`); return 0; }
    case 'knowledge': { console.log('KB types: getting_started/faq/how_to/troubleshooting/known_issue/... (INTERNAL_DRAFT default, no publish)'); return 0; }
    case 'feedback': { const r = interpretSatisfaction([]); console.log(`feedback ${process.argv[3]}: ${r.interpretation}`); return 0; }
    case 'value-review': { const r = valueReview({ outcomes: [], adoption_level: null }); out(`value_${process.argv[3]}.json`, r); console.log(`value-review ${process.argv[3]}: ${r.verdict}`); return 0; }
    case 'renewal': { const c = cust(process.argv[3]); const r = renewalAssessment({ product_id: c ? c.product_ids[0] : 'growth_support', support_period_ending: true, unresolved_critical_incident: c && c.open_critical_support, payment_status: c ? c.payment : 'paid', communication_permission: !(c && c.opted_out), health: c ? c.health : 'HEALTHY' }); out(`renewal_${process.argv[3]}.json`, r); console.log(`renewal ${process.argv[3]}: ${r.recommended_action} blockers=[${(r.blockers || []).join(',')}]`); return 0; }
    case 'expansion': { const c = cust(process.argv[3]); const r = expansionAssessment({ opted_out: c && c.opted_out, customer_need_evidence: c && c.expansion_eligible, current_product_adopted: true, candidate_ready: c && c.scenario !== 'expansion_blocked_readiness', financially_viable: true, candidate_product: 'full_business_audit' }); out(`expansion_${process.argv[3]}.json`, r); console.log(`expansion ${process.argv[3]}: eligible=${r.eligible} blockers=[${r.blockers.join(',')}]`); return 0; }
    case 'churn': { const c = cust(process.argv[3]); const reason = c && c.scenario === 'churn_product_mismatch' ? 'product_mismatch' : 'budget'; const r = classifyChurn({ churn_id: 'CH_' + process.argv[3], customer_ref_id: process.argv[3], reason, source: 'exit interview' }); out(`churn_${process.argv[3]}.json`, r); console.log(`churn ${process.argv[3]}: ${reason} preventable=${r.churn.preventable}`); return 0; }
    case 'profitability': { const r = customerProfitability({ customer_ref_id: process.argv[3], revenue: 10000, support_cost: 3000, cost_status: 'modeled' }); console.log(`profitability ${process.argv[3]}: margin=${r.margin} confidence=${r.confidence}`); return 0; }
    case 'permissions': { const c = cust(process.argv[3]); const r = evaluatePermission({ permission_type: 'public_case', status: c && c.case_permission === 'GRANTED' ? 'GRANTED' : 'NOT_REQUESTED', evidence: c && c.case_permission === 'GRANTED' ? 'signed' : null }); console.log(`permissions ${process.argv[3]}: effective=${r.effective}`); return 0; }
    case 'portfolio': { const r = buildPortfolio(customers()); out('portfolio.json', r); console.log(`portfolio: ${r.total} customers`); return 0; }
    case 'dashboard-refresh': { const r = dashboard(customers()); out('cs_dashboard.json', r); console.log(`dashboard: at_risk=${r.at_risk.length} critical=${r.critical.length} renewals=${r.renewals.length}`); const occ = ownerCommandCenter(customers()); out('owner_command_center.json', occ); return 0; }
    case 'validate-all': { const r = validateAll(); console.log(`validate-all ok=${r.ok}`); for (const [k, v] of Object.entries(r.results)) console.log(`  ${k}: ok=${v.ok} ${v.errors ? 'errors=' + v.errors.length : ''}`); return r.ok ? 0 : 1; }
    default:
      console.log('success commands: customers | customer <id> | lifecycle <id> | onboarding <id> | plan <id> | adoption <id> |');
      console.log('  health <id> | risks <id> | support | triage <ticket> --category C --desc D | incident <id> | knowledge |');
      console.log('  feedback <id> | value-review <id> | renewal <id> | expansion <id> | churn <id> | profitability <id> |');
      console.log('  permissions <id> | portfolio | dashboard-refresh | validate-all');
      return cmd ? 3 : 0;
  }
}
process.exit(main());
