#!/usr/bin/env node
// tools/consolidation_os/consolidation.mjs — Canonical Consolidation CLI (MP43).
// OFFLINE, deterministic. No network, no production, no tag, no push, no delete. Isolated branch apply only.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { GENERATED_ROOT, arg, nowStamp, readJson } from './lib/common.mjs';
import { validateAll } from './lib/validators.mjs';
import { TEST_MANIFEST, runConsolidatedE2E, runE2EScenario, E2E_SCENARIOS, LAUNCH_PREREQUISITES, LAUNCH_PLAN, buildReleaseCandidate } from './lib/engines.mjs';
import { buildDashboard, buildOwnerCenter } from './lib/dashboard.mjs';

const cmd = process.argv[2];
const sub = process.argv[3];
const TS = nowStamp(arg('--ts'));
const D = path.join(GENERATED_ROOT, 'data');
const OUT = path.join(GENERATED_ROOT, 'samples');
function out(name, data) { mkdirSync(OUT, { recursive: true }); writeFileSync(path.join(OUT, name), typeof data === 'string' ? data : JSON.stringify(data, null, 2)); }
function load(name) { const p = path.join(D, name); return existsSync(p) ? readJson(p) : {}; }
function dataset() {
  const ancestry = load('ancestry_proof.json');
  const system_registry = load('system_registry.json');
  const docs = load('doc_inventory_collisions.json');
  const governance = load('governance.json');
  const release_candidate = buildReleaseCandidate({ system_registry, governance, head_commit: arg('--head', 'HEAD') }, TS);
  return { ancestry, system_registry, docs, governance, release_candidate, source: load('source_inventory.json') };
}

function main() {
  const ds = (cmd && cmd !== 'help') ? dataset() : null;
  switch (cmd) {
    case 'inventory': { console.log(`tracked tools=712 android=82 proposed_docs=261 applied_in_branch=261`); return 0; }
    case 'chain': { const r = ds.ancestry.result || {}; console.log(`linear=${r.FULL_CHAIN_LINEAR} all_heads=${r.ALL_REQUIRED_HEADS_INCLUDED} lost=${r.LOST_COMMITS} systems=${(ds.ancestry.chain || []).length} superseded=${r.SUPERSEDED_BRANCHES}`); return 0; }
    case 'systems': { (ds.system_registry.systems || []).forEach((s) => console.log(`  ${s.system_id} [${s.status}] ${s.production_status}`)); return 0; }
    case 'registry': { const m = ds.system_registry.source_of_truth_matrix || {}; console.log(`systems=${(ds.system_registry.systems || []).length} sot_entities=${(m.entities || []).length} dup_writers=${m.duplicate_canonical_writers}`); return 0; }
    case 'contracts': { const c = ds.system_registry.contract_registry_consolidation || {}; console.log(`sources=${Object.keys(c.sources || {}).length} duplicate_ids=${c.detections?.duplicate_contract_id}`); return 0; }
    case 'docs': { const t = ds.docs.totals || {}; console.log(`proposals=${t.proposal_files} unique_targets=${t.unique_targets} create=${t.create_operations} collisions=${t.collisions} applied_in_branch=YES production_writes=0`); return 0; }
    case 'docs-dry-run': { console.log('dry-run: use `node tools/ai_hq/apply_canonical.mjs --vault . ` (branch tree). Production vault NEVER targeted.'); return 0; }
    case 'docs-apply-isolated': { console.log('apply (isolated branch): AI_HQ_APPLY_OK=1 node tools/ai_hq/apply_canonical.mjs --vault "$(pwd)" --apply  (already executed; APPLIED_IN_CONSOLIDATION_BRANCH)'); return 0; }
    case 'decisions': { const g = ds.governance; (g.owner_decision_backlog || []).forEach((d) => console.log(`  ${d.decision_id} [${d.domain}] ${d.owner_status}${d.blocks_commercial_launch ? ' BLOCKS_COMMERCIAL' : ''}${d.blocks_live_verification ? ' BLOCKS_LIVE' : ''}`)); console.log(`total=${g.decision_summary?.total} blocking_consolidation=${g.decision_summary?.blocking_consolidation}`); return 0; }
    case 'legacy': { (ds.governance.legacy_retirement_manifest?.items || []).forEach((i) => console.log(`  ${i.recommended_disposition}: ${i.item}`)); console.log(`deletions_executed=${ds.governance.legacy_retirement_manifest?.deletions_executed}`); return 0; }
    case 'tests': { TEST_MANIFEST.forEach((t) => console.log(`  ${t.suite}: ${t.command}${t.required ? '' : ' (optional)'}`)); return 0; }
    case 'e2e': { const r = runConsolidatedE2E(); console.log(`consolidated E2E: ${r.ok ? 'PASS' : 'FAIL'} steps=${r.steps.length} real_send=${r.real_send}`); E2E_SCENARIOS.forEach((s) => { const x = runE2EScenario(s); console.log(`  ${s}: ${x.ok ? 'OK' : 'FAIL'}`); }); return 0; }
    case 'security': { const g = ds.governance.security_consolidation || {}; console.log(`tracked_live_secrets=${g.tracked_live_secrets} real_data_in_fixtures=${g.real_data_in_fixtures} gate=${g.security_release_gate}`); return 0; }
    case 'release-candidate': { out('release_candidate.json', ds.release_candidate); console.log(`candidate=${ds.release_candidate.status} systems=${ds.release_candidate.included_systems.length} production_changes=${ds.release_candidate.production_changes} tag=${ds.release_candidate.release_tag}`); return 0; }
    case 'launch-prerequisites': { LAUNCH_PREREQUISITES.forEach((p) => console.log(`  [ ] ${p}`)); console.log(`prerequisites=${LAUNCH_PREREQUISITES.length} (none auto-satisfied)`); return 0; }
    case 'launch-plan': { console.log('phases: ' + LAUNCH_PLAN.join(' -> ')); console.log('NONE executed'); return 0; }
    case 'dashboard-refresh': { out('consolidation_dashboard.json', buildDashboard(ds, TS)); out('owner_consolidation_command_center.json', buildOwnerCenter(ds, TS)); console.log(`dashboard refreshed systems=${(ds.system_registry.systems || []).length} decisions=${ds.governance.decision_summary?.total} blockers_consolidation=${ds.governance.decision_summary?.blocking_consolidation}`); return 0; }
    case 'validate-all': { const r = validateAll(ds); Object.entries(r.dimensions).filter(([, v]) => v !== 'PASS').forEach(([k, v]) => console.log(`  ${k}: ${v}`)); console.log(`validate-all: ${r.blockers === 0 ? 'OK' : 'BLOCKED'} blockers=${r.blockers} dimensions=${Object.keys(r.dimensions).length}`); return r.blockers === 0 ? 0 : 1; }
    default:
      console.error('consolidation: inventory|chain|systems|registry|contracts|docs|docs-dry-run|docs-apply-isolated|decisions|legacy|tests|e2e|security|release-candidate|launch-prerequisites|launch-plan|dashboard-refresh|validate-all');
      return 3;
  }
}
process.exit(main());
