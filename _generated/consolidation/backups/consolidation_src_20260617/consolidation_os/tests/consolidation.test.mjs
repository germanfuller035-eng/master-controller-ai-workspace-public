#!/usr/bin/env node
// tools/consolidation_os/tests/consolidation.test.mjs — MP46 comprehensive offline tests.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateAncestry, validateSystemRegistry, validateSourceOfTruth, validateDocCollisions,
  validateDecisions, validateProductReconciliation, validateReleaseCandidate, validateSafetyInvariants, validateAll,
} from '../lib/validators.mjs';
import { TEST_MANIFEST, runConsolidatedE2E, runE2EScenario, E2E_SCENARIOS, LAUNCH_PREREQUISITES, LAUNCH_PLAN, buildReleaseCandidate } from '../lib/engines.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GEN = path.resolve(ROOT, '../../_generated/consolidation/data');
const L = (n) => JSON.parse(readFileSync(path.join(GEN, n), 'utf8'));
const ancestry = L('ancestry_proof.json');
const system_registry = L('system_registry.json');
const docs = L('doc_inventory_collisions.json');
const governance = L('governance.json');
const FX = JSON.parse(readFileSync(path.join(ROOT, 'fixtures/consolidation_fixtures.json'), 'utf8'));
const fx = (id) => FX.scenarios.find((s) => s.id.startsWith(id));

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) pass++; else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };

// ---- Ancestry (MP2) ----
ok('ancestry valid', validateAncestry(ancestry).length === 0, validateAncestry(ancestry).join('; '));
ok('chain linear', ancestry.result.FULL_CHAIN_LINEAR === 'YES');
ok('all heads included', ancestry.result.ALL_REQUIRED_HEADS_INCLUDED === 'YES');
ok('lost commits 0', ancestry.result.LOST_COMMITS === 0);
ok('14 OS in chain', ancestry.chain.length === 14);
ok('release tag in chain', ancestry.release_tag.is_ancestor_of_head === true && ancestry.release_tag.moved === false);
ok('superseded branch retained', ancestry.parallel_superseded_branches[0].disposition.includes('RETAINED'));
ok('ancestry: bad fixture rejected', validateAncestry(fx('f02_missing_ancestor').ancestry).length >= 1);
ok('ancestry: lost commit rejected', validateAncestry(fx('f03_lost_commit').ancestry).length >= 1);

// ---- System registry + SoT (MP5-7) ----
ok('system registry valid', validateSystemRegistry(system_registry).length === 0, validateSystemRegistry(system_registry).join('; '));
ok('20 systems', system_registry.systems.length === 20);
ok('SoT valid', validateSourceOfTruth(system_registry).length === 0);
ok('0 duplicate canonical writers', system_registry.source_of_truth_matrix.duplicate_canonical_writers === 0);
ok('lead writer = master_controller', system_registry.source_of_truth_matrix.entities.find((e) => e.entity === 'lead').canonical_writer === 'master_controller');
ok('send_ledger writer = master_controller', system_registry.source_of_truth_matrix.entities.find((e) => e.entity === 'send_ledger_entry').canonical_writer === 'master_controller');
ok('dup project id rejected', validateSystemRegistry(fx('f05_duplicate_project_id').system_registry).length >= 1);
ok('dup writer rejected', validateSourceOfTruth(fx('f06_duplicate_canonical_writer').system_registry).length >= 1);
ok('ACTIVE_IN_PRODUCTION only with evidence', system_registry.systems.filter((s) => s.status === 'ACTIVE_IN_PRODUCTION').every((s) => /production|active|released/i.test(s.production_status)));

// ---- Contract registry (MP8) ----
ok('contract consolidation 0 dup ids', system_registry.contract_registry_consolidation.detections.duplicate_contract_id === 0);
ok('contract: no write without owner', system_registry.contract_registry_consolidation.detections.write_command_without_owner === 0);

// ---- Doc collisions (MP9-10) ----
ok('doc collisions valid', validateDocCollisions(docs).length === 0);
ok('261 proposals/261 targets', docs.totals.proposal_files === 261 && docs.totals.unique_targets === 261);
ok('0 collisions', docs.totals.collisions === 0);
ok('0 exact duplicates', docs.totals.exact_duplicate_content === 0);
ok('doc exact-dup fixture rejected', validateDocCollisions(fx('f07_doc_exact_duplicate').docs).length >= 1);
ok('doc collision fixture rejected', validateDocCollisions(fx('f08_doc_semantic_conflict').docs).length >= 1);

// ---- Apply manifest (MP11-12) ----
const applyManifest = L('apply_manifest.json');
ok('docs applied in branch', applyManifest.status === 'APPLIED_IN_CONSOLIDATION_BRANCH');
ok('0 production canonical writes', applyManifest.production_canonical_writes === 0);
ok('production vault untouched', applyManifest.production_vault_untouched === true);
ok('no second apply engine', /no second engine/.test(applyManifest.engine));

// ---- Decisions (MP16) ----
ok('decisions valid', validateDecisions(governance).length === 0, validateDecisions(governance).join('; '));
ok('27 owner decisions', governance.owner_decision_backlog.length === 27);
ok('0 block consolidation', governance.decision_summary.blocking_consolidation === 0);
ok('11 block live verification', governance.decision_summary.blocking_live_verification === 11);
ok('10 block commercial launch', governance.decision_summary.blocking_commercial_launch === 10);
ok('consolidation does not resolve decisions', governance.owner_decision_backlog.every((d) => d.owner_status !== 'RESOLVED'));

// ---- Product / capacity reconciliation (MP17,19) ----
ok('product reconciliation valid', validateProductReconciliation(governance).length === 0);
ok('mini audit price preserved', governance.product_reconciliation.mini_audit.price === '10000 RUB CONFIRMED');
ok('mini audit 5 macro / 18 stages', governance.product_reconciliation.mini_audit.macro_phases === 5 && governance.product_reconciliation.mini_audit.detailed_stages === 18);
ok('readiness separate from status', /separate/.test(governance.product_reconciliation.rule));
ok('capacities UNKNOWN block launch', governance.capacity_reconciliation.unknown_capacities.length >= 5 && /block/.test(governance.capacity_reconciliation.rule));

// ---- Security / reliability consolidation (MP20-21) ----
ok('tracked live secrets 0', governance.security_consolidation.tracked_live_secrets === 0);
ok('real data in fixtures 0', governance.security_consolidation.real_data_in_fixtures === 0);
ok('security gate ready-for-owner', governance.security_consolidation.security_release_gate === 'READY_FOR_OWNER_REVIEW');
ok('reliability not HEALTHY', governance.reliability_consolidation.live_health_status === 'UNKNOWN');
ok('reliability gate internal-review', governance.reliability_consolidation.release_readiness === 'READY_FOR_INTERNAL_REVIEW');

// ---- Legacy manifest (MP22) ----
ok('legacy 0 deletions', governance.legacy_retirement_manifest.deletions_executed === 0);
ok('legacy items present', governance.legacy_retirement_manifest.items.length >= 4);
ok('superseded branch KEEP', governance.legacy_retirement_manifest.items.some((i) => /KEEP_REFERENCE/.test(i.recommended_disposition)));

// ---- Test manifest + E2E (MP27,31) ----
ok('test manifest covers 14 OS', ['ai_hq', 'revenue_os', 'delivery_os', 'finance_os', 'executive_os', 'product_os', 'customer_success_os', 'analytics_os', 'growth_os', 'conversation_hub', 'integration_os', 'orchestrator_os', 'security_os', 'reliability_os'].every((s) => TEST_MANIFEST.some((t) => t.suite === s)));
ok('android explicit NOT_RUN', TEST_MANIFEST.find((t) => t.suite === 'android_unit').command === 'NOT_RUN');
ok('no networked test required', TEST_MANIFEST.every((t) => t.network_required === false));
{ const r = runConsolidatedE2E(); ok('consolidated E2E ok no send', r.ok && r.real_send === false && r.production_affected === false); ok('E2E has 18 steps', r.steps.length === 18); }
for (const s of E2E_SCENARIOS) ok(`e2e scenario ${s}`, runE2EScenario(s).ok === true && runE2EScenario(s).production_affected === false);

// ---- Release candidate + launch (MP35,39,40) ----
{ const rc = buildReleaseCandidate({ system_registry, governance, head_commit: 'HEAD' }, 'TS'); ok('release candidate valid', validateReleaseCandidate(rc).length === 0); ok('candidate 0 production changes', rc.production_changes === 0); ok('candidate no tag', /NONE/.test(rc.release_tag)); ok('candidate status', rc.status === 'CANONICAL_CONSOLIDATION_CANDIDATE'); }
ok('launch prerequisites >= 20', LAUNCH_PREREQUISITES.length >= 20);
ok('launch plan 12 phases', LAUNCH_PLAN.length === 12);
ok('launch plan ends FINAL_ACCEPTANCE', LAUNCH_PLAN[LAUNCH_PLAN.length - 1] === 'FINAL_ACCEPTANCE');

// ---- Aggregate + safety ----
ok('safety invariants locked', validateSafetyInvariants().length === 0);
ok('validate-all 0 blockers', validateAll({ ancestry, system_registry, docs, governance }).blockers === 0);

console.log(`\nconsolidation.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
