#!/usr/bin/env node
// tools/integration_os/tests/integration.test.mjs
// MP42 — comprehensive offline tests. Deterministic. Real exit codes.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateContractRegistry, validateOwnership, validateId, validateTimestamp, validateStatuses,
  validateConfidence, validateErrorCode, validateEvidence, validateRevisionMutation, validateIdempotency,
  validateRequestEnvelope, validateResponseEnvelope, validateErrorEnvelope, validateEvent, validateFileRef,
  validateConsent, validateCache, validateMigration, validateBranchPlan, validateDocPlan, validateLegacyPlan,
  validateSafetyInvariants, validateAll,
} from '../lib/validators.mjs';
import { runScenario, classifyFailure, checkContract } from '../lib/e2e.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const L = (n) => JSON.parse(readFileSync(path.join(ROOT, 'data', n), 'utf8'));
const FX = JSON.parse(readFileSync(path.join(ROOT, 'fixtures/integration_fixtures.json'), 'utf8'));
const fx = (id) => FX.scenarios.find((s) => s.id.startsWith(id));

const registry = L('contract_registry.json');
const ownership = L('ownership_matrix.json');
const standards = L('standards.json');
const status = L('status_vocabulary.json');
const events = L('event_registry.json');
const plans = L('reconciliation_and_plans.json');
const docPlan = L('proposed_doc_consolidation_plan.json');
const inventory = L('system_inventory.json');

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) pass++; else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };

// ---- Registry (MP4) ----
ok('registry: valid', validateContractRegistry(registry).length === 0, validateContractRegistry(registry).join('; '));
ok('registry: every contract has owner', registry.contracts.every((c) => c.owner));
ok('registry: no duplicate ids', new Set(registry.contracts.map((c) => c.contract_id)).size === registry.contracts.length);

// ---- Ownership (MP5) ----
ok('ownership: valid', validateOwnership(ownership).length === 0, validateOwnership(ownership).join('; '));
ok('ownership: exactly one writer each', ownership.entities.every((e) => typeof e.canonical_writer === 'string'));
ok('ownership: send_ledger writer is MC', ownership.entities.find((e) => e.entity === 'send_ledger_entry').canonical_writer === 'master_controller');
ok('ownership: hub forbidden from opt_out write', ownership.entities.find((e) => e.entity === 'opt_out').forbidden_writers.includes('conversation_hub'));
ok('ownership: lead writer is MC', ownership.entities.find((e) => e.entity === 'lead').canonical_writer === 'master_controller');

// ---- ID crosswalk (MP6) ----
ok('id: test prefix enforced', validateId('lead_1', { test: true }).length === 1);
ok('id: valid test id', validateId('TEST_lead_1', { test: true }).length === 0);
ok('id: external namespaced', validateId('12345', { external: true }).length === 1);
ok('id: valid external', validateId('tg:12345', { external: true }).length === 0);
ok('id: no whitespace', validateId('bad id').length === 1);

// ---- Temporal (MP7) ----
ok('temporal: valid UTC', validateTimestamp('2026-06-10T09:00:00Z', 'created_at').length === 0);
ok('temporal: rejects local', validateTimestamp('2026-06-10 09:00:00', 'created_at').length === 1);
ok('temporal: rejects date-only', validateTimestamp('2026-06-10', 'created_at').length === 1);

// ---- Statuses (MP8) ----
ok('statuses: valid', validateStatuses(status).length === 0, validateStatuses(status).join('; '));
ok('statuses: no executive write-back', status.detections.derived_executive_written_back.found === false);
ok('statuses: ACTIVE name-collision resolved', status.detections.same_name_different_meaning.some((d) => d.name === 'ACTIVE'));
ok('mini audit: 5 macro phases', status.mini_audit_lifecycle.macro_phases.length === 5);
ok('mini audit: 18 detailed stages', status.mini_audit_lifecycle.macro_phases.reduce((a, p) => a + p.stages.length, 0) === 18);

// ---- Enums + evidence (MP9-10) ----
ok('enum: confidence valid', validateConfidence('CONFIRMED').length === 0);
ok('enum: confidence invalid', validateConfidence('MAYBE').length === 1);
ok('enum: error code valid', validateErrorCode('CONFLICT').length === 0);
ok('evidence: inference not auto-confirmed', validateEvidence({ confidence: 'CONFIRMED', derived_from: 'INFERENCE' }).length >= 1);
ok('evidence: synthetic not confirmed', validateEvidence({ confidence: 'CONFIRMED', synthetic: true }).length >= 1);
ok('evidence: volatile needs freshness', validateEvidence({ confidence: 'SYSTEM_OBSERVED', volatile: true }).length === 1);

// ---- Revision (MP11) ----
ok('revision: mutation needs expected_revision', validateRevisionMutation({ mutation: true }).length === 1);
ok('revision: conflict yields 409', validateRevisionMutation({ mutation: true, expected_revision: 1, current_revision: 2, response_code: 'CONFLICT', returns_current_revision: true }).length === 0);
ok('revision: mismatch w/o conflict fails', validateRevisionMutation({ mutation: true, expected_revision: 1, current_revision: 2, response_code: 'OK' }).length >= 1);

// ---- Idempotency (MP12) ----
ok('idempotency: external mutation needs key', validateIdempotency({ external_mutation: true }).length === 1);
ok('idempotency: changed payload new key', validateIdempotency({ external_mutation: true, idempotency_key: 'k', payload_changed: true, same_key: true }).length === 1);
ok('idempotency: ambiguous reconcile', validateIdempotency({ external_mutation: true, idempotency_key: 'k', transport_result: 'AMBIGUOUS', action: 'RETRY' }).length === 1);

// ---- Command/query + API envelope (MP13-14) ----
ok('envelope: request valid', validateRequestEnvelope({ request_id: 'r', operation: 'op', entity: 'lead' }).length === 0);
ok('envelope: request missing', validateRequestEnvelope({ request_id: 'r' }).length === 2);
ok('envelope: response valid', validateResponseEnvelope({ ok: true, request_id: 'r', operation: 'op', entity: 'lead' }).length === 0);
ok('envelope: error valid', validateErrorEnvelope({ code: 'CONFLICT', message: 'm', retryable: false, safe_to_retry: false }).length === 0);
ok('envelope: error bad code', validateErrorEnvelope({ code: 'WAT', message: 'm', retryable: false, safe_to_retry: false }).length === 1);

// ---- Errors taxonomy (MP15) ----
ok('errors: 18 codes', standards.error_taxonomy.codes.length === 18);
ok('errors: legacy 409 mapped', standards.error_taxonomy.legacy_map['409'] === 'CONFLICT');
ok('errors: retryable map', standards.error_taxonomy.retryable.TEMPORARY_FAILURE === true && standards.error_taxonomy.retryable.CONFLICT === false);

// ---- Events (MP17-18) ----
ok('events: all valid', events.events.flatMap(validateEvent).length === 0);
ok('events: fact vs recommendation', events.events.some((e) => e.kind === 'FACT') && events.events.some((e) => e.kind === 'RECOMMENDATION'));
ok('events: opt_out is recommendation', events.events.find((e) => e.event_type === 'opt_out_detected').kind === 'RECOMMENDATION');
ok('events: no recommendation-as-fact', events.compatibility_reconciliation.recommendation_as_fact.every((r) => r.resolution));

// ---- File handoff (MP19) ----
ok('file: valid ref', validateFileRef({ hash: 'sha256:x', storage_reference: 'vault://f/1' }).length === 0);
ok('file: no binary', validateFileRef({ hash: 'x', binary: 'AAAA' }).length >= 1);
ok('file: no path traversal', validateFileRef({ hash: 'x', storage_reference: '../../etc/passwd' }).length >= 1);
ok('file: no external url', validateFileRef({ hash: 'x', storage_reference: 'http://evil.test/f' }).length >= 1);

// ---- Consent + cache (MP20-22) ----
ok('consent: valid', validateConsent({ subject_ref: 's', purpose: 'support', source: 'form' }).length === 0);
ok('consent: no implied', validateConsent({ subject_ref: 's', purpose: 'commercial' }).length === 1);
ok('cache: not canonical', validateCache({ canonical: true, ttl: 60 }).length >= 1);
ok('cache: needs TTL', validateCache({ canonical: false }).length === 1);
ok('cache: no offline mutation', validateCache({ canonical: false, ttl: 60, offline_mutation: true }).length === 1);

// ---- Migration + branch + doc + legacy plans (MP28-31) ----
ok('migration: all <= READY', plans.migration_model.migrations.flatMap(validateMigration).length === 0, plans.migration_model.migrations.flatMap(validateMigration).join('; '));
ok('migration: max status READY', plans.migration_model.max_status_this_task === 'READY');
ok('branch: not merged + linear', validateBranchPlan(plans.branch_consolidation_plan).length === 0);
ok('branch: obsolete flagged superseded', /SUPERSEDED/.test(plans.branch_consolidation_plan.obsolete_parallel_branch.status));
ok('doc plan: not applied', validateDocPlan(docPlan).length === 0);
ok('doc plan: applied=0', docPlan.ordered_apply_plan.canonical_docs_applied === 0);
ok('legacy plan: no deletions', validateLegacyPlan(plans.legacy_retirement_plan).length === 0);
ok('legacy: communication_monitor KEEP_ACTIVE', plans.legacy_retirement_plan.items.find((i) => /communication_monitor/.test(i.target)).disposition === 'KEEP_ACTIVE');

// ---- Reconciliation (MP23-26) ----
ok('android: revision finding present', plans.android_reconciliation.findings.some((f) => /revision/.test(f.issue)));
ok('telegram: callback revision finding', plans.telegram_reconciliation.findings.some((f) => /revision/.test(f.issue)));
ok('mc gaps: endpoints inventoried', plans.mc_api_gaps.endpoints_inventoried === 34);
ok('mc gaps: proposed not applied', plans.mc_api_gaps.proposed_additions.every((p) => p.status === 'PROPOSED_ONLY'));
ok('compatibility: 15 pairs', plans.compatibility_matrix.pairs.length === 15);
ok('compatibility: all compatible', plans.compatibility_matrix.pairs.every((p) => p.compatible === true));

// ---- E2E (MP33) ----
for (const id of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) {
  const r = runScenario(id, FX, ownership);
  ok(`e2e: scenario ${id} ${r.name}`, r.ok === true, (r.steps || []).filter((s) => /BLOCK/.test(s)).join('; '));
}
ok('e2e: Mini Audit no real send', runScenario('A', FX, ownership).real_send === false);
ok('e2e: opt-out blocks hub canonical write', runScenario('B', FX, ownership).ok === true);

// ---- Failure modes (MP34) ----
const failures = ['stale_revision', 'duplicate_request', 'network_unavailable', 'downstream_unavailable', 'invalid_schema', 'unknown_enum', 'expired_approval', 'opt_out', 'missing_evidence', 'broken_lineage', 'missing_file_reference', 'unsupported_product', 'absent_capacity', 'partial_transaction', 'timeout_ambiguity', 'out_of_order_event'];
for (const f of failures) ok(`failure: ${f} handled`, classifyFailure(f).handled === true, classifyFailure(f).expected_error);

// ---- Contract harness (MP32) ----
ok('harness: contract ok', checkContract({ required: ['entity_id'], revision_required: true }, { entity_id: 'x', revision: 1 }).ok);
ok('harness: contract missing revision', !checkContract({ required: ['entity_id'], revision_required: true }, { entity_id: 'x' }).ok);

// ---- Aggregate validate-all + safety ----
ok('safety invariants locked', validateSafetyInvariants().length === 0);
ok('validate-all: 0 blockers', validateAll({ registry, ownership, status, events, plans, docPlan, inventory }).blockers === 0);

console.log(`\nintegration.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
