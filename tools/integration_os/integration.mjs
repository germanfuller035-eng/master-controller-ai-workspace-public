#!/usr/bin/env node
// tools/integration_os/integration.mjs — Integration Architecture & Data Contracts CLI (MP39).
// OFFLINE, deterministic, no network, no production, no branch merge, no deletion. Clear exit codes.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { GENERATED_ROOT, DATA_DIR, FIXTURE_DIR, arg, nowStamp, loadData, SYSTEMS } from './lib/common.mjs';
import { validateAll } from './lib/validators.mjs';
import { runScenario, classifyFailure } from './lib/e2e.mjs';
import { buildDashboard, buildOwnerCenter } from './lib/dashboard.mjs';

const cmd = process.argv[2];
const sub = process.argv[3];
const TS = nowStamp(arg('--ts'));
const OUT = path.join(GENERATED_ROOT, 'samples');
function out(name, data) { mkdirSync(OUT, { recursive: true }); const f = path.join(OUT, name); writeFileSync(f, typeof data === 'string' ? data : JSON.stringify(data, null, 2)); return f; }
function fixtures() { return JSON.parse(readFileSync(path.join(FIXTURE_DIR, 'integration_fixtures.json'), 'utf8')); }
function dataset() {
  return {
    inventory: loadData('system_inventory.json'),
    registry: loadData('contract_registry.json'),
    ownership: loadData('ownership_matrix.json'),
    standards: loadData('standards.json'),
    status: loadData('status_vocabulary.json'),
    events: loadData('event_registry.json'),
    plans: loadData('reconciliation_and_plans.json'),
    docPlan: loadData('proposed_doc_consolidation_plan.json'),
  };
}

function main() {
  const ds = (cmd && cmd !== 'help') ? dataset() : null;
  switch (cmd) {
    case 'inventory': { console.log(`systems=${ds.inventory.systems_total} rows=${ds.inventory.rows.length} legacy_oneoffs=${ds.inventory.counts.legacy_underscore_oneoffs_in_telegram_gateway} mc_endpoints=${ds.inventory.counts.mc_endpoints_inventoried}`); return 0; }
    case 'systems': { SYSTEMS.forEach((s) => console.log(`  ${s.id} [${s.role}] canonical_writer=${s.writes_canonical}`)); console.log(`systems=${SYSTEMS.length}`); return 0; }
    case 'contracts': { ds.registry.contracts.forEach((c) => console.log(`  ${c.contract_id} [${c.contract_type}] owner=${c.owner} ${c.read_write_mode}`)); return 0; }
    case 'contract': { const c = ds.registry.contracts.find((x) => x.contract_id === sub); if (!c) { console.error('not found'); return 2; } console.log(JSON.stringify(c, null, 2)); return 0; }
    case 'ownership': { ds.ownership.entities.forEach((e) => console.log(`  ${e.entity} -> writer=${e.canonical_writer} id=${e.primary_id}`)); return 0; }
    case 'ids': { ds.standards.id_standard.ids.forEach((i) => console.log(`  ${i}`)); console.log(`requirements=${ds.standards.id_standard.requirements.length}`); return 0; }
    case 'statuses': { ds.status.statuses.forEach((s) => console.log(`  ${s.source_system}:${s.source_status} [${s.canonical_domain}] -> ${s.executive_summary_status}`)); return 0; }
    case 'enums': { const t = ds.standards.error_taxonomy.codes.length; const c = ds.standards.data_classification.classes.length; console.log(`shared enums: confidence(8), error_codes(${t}), data_class(${c}), channel(7), direction(4)`); return 0; }
    case 'events': { ds.events.events.forEach((e) => console.log(`  ${e.event_type} [${e.kind}] ${e.producer} -> ${(e.consumers || []).join(',')}`)); return 0; }
    case 'api-gaps': { const g = ds.plans.mc_api_gaps; console.log(`endpoints=${g.endpoints_inventoried} proposed_additions=${g.proposed_additions.length} gaps=${g.gaps.length}`); g.gaps.forEach((x) => console.log(`  GAP[${x.severity}] ${x.gap}`)); return 0; }
    case 'compatibility': { const p = ds.plans.compatibility_matrix.pairs; p.forEach((x) => console.log(`  ${x.producer}->${x.consumer}: ${x.compatible ? 'OK' : 'INCOMPAT'} ${x.adapter_required ? '(adapter)' : ''} [${x.test_status}]`)); return 0; }
    case 'migrations': { ds.plans.migration_model.migrations.forEach((m) => console.log(`  ${m.migration_id} ${m.status} approval=${m.owner_approval}`)); console.log(`max_status=${ds.plans.migration_model.max_status_this_task}`); return 0; }
    case 'branches': { const b = ds.plans.branch_consolidation_plan; console.log(`chain_linear=${b.chain_linear} head=${b.current_head} merge_executed=${b.merge_executed}`); console.log(`obsolete: ${b.obsolete_parallel_branch.branch} (${b.obsolete_parallel_branch.status})`); return 0; }
    case 'proposed-docs': { const p = ds.docPlan; console.log(`proposed_docs=${p.totals.proposed_docs} unique_targets=${p.totals.unique_targets} projects=${p.totals.projects} applied=${p.ordered_apply_plan.canonical_docs_applied}`); return 0; }
    case 'legacy': { ds.plans.legacy_retirement_plan.items.forEach((i) => console.log(`  ${i.disposition}: ${i.target}`)); console.log(`deletions_executed=${ds.plans.legacy_retirement_plan.deletions_executed}`); return 0; }
    case 'e2e': { const id = arg('--scenario', sub) || 'A'; const r = runScenario(id, fixtures(), ds.ownership); out(`e2e_${id}.json`, r); console.log(`E2E ${r.scenario} ${r.name}: ${r.ok ? 'PASS' : 'FAIL'} steps=${r.steps.length}${r.error_code ? ' err=' + r.error_code : ''}`); return r.ok ? 0 : 1; }
    case 'security': { const r = validateAll({ ...ds }); const sec = r.dimensions.safety_invariants; console.log(`security: ${sec}`); return sec === 'PASS' ? 0 : 1; }
    case 'dashboard-refresh': { const dash = buildDashboard(ds, TS); const center = buildOwnerCenter(ds, TS); out('integration_dashboard.json', dash); out('owner_integration_command_center.json', center); console.log(`dashboard refreshed systems=${dash.systems} contracts=${dash.contracts} entities=${dash.entities} blockers=${dash.blockers}`); return 0; }
    case 'validate-all': { const r = validateAll({ ...ds }); Object.entries(r.dimensions).filter(([, v]) => v !== 'PASS').forEach(([k, v]) => console.log(`  ${k}: ${v}`)); console.log(`validate-all: ${r.blockers === 0 ? 'OK' : 'BLOCKED'} blockers=${r.blockers} dimensions=${Object.keys(r.dimensions).length}`); return r.blockers === 0 ? 0 : 1; }
    default:
      console.error('Integration CLI: inventory|systems|contracts|contract <id>|ownership|ids|statuses|enums|events|api-gaps|compatibility|migrations|branches|proposed-docs|legacy|e2e --scenario <A-H>|security|dashboard-refresh|validate-all');
      return 3;
  }
}
process.exit(main());
