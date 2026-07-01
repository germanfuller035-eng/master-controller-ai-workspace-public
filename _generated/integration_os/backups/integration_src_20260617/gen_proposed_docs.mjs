#!/usr/bin/env node
// tools/integration_os/gen_proposed_docs.mjs — generates proposed canonical docs (MP43). Read-only.
// Writes ONLY under docs_canonical_proposed/. Does NOT apply. Owner applies post-review.
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'docs_canonical_proposed');
const SUB = '14_integration';

const DOCS = [
  ['integration_architecture_note.md', 'Integration Architecture — Canonical Note', '14_integration/integration_architecture_note.md', 'Integration Architecture & Data Contracts consolidation unifies all OS + Master Controller + Lead Hunter + Conversation Hub into one compatible data/ID/status/event/API/write-rights architecture. It is NOT a new OS or runtime. It owns the cross-system contract registry, entity ownership, ID/temporal/status/enum/evidence/revision/idempotency/envelope/error/event/file/consent/cache standards, compatibility matrix, migration/branch/doc/legacy plans. It never mutates production, merges branches, applies migrations/docs, or deletes anything.'],
  ['contract_registry.md', 'Contract Registry', '14_integration/contract_registry.md', '21 cross-system contracts with producer/consumer/owner/type/schema-version/read-write-mode/revision/idempotency/approval/sensitivity/compatibility. Detects duplicate/conflicting/ownerless/multi-writer/stale.'],
  ['entity_ownership_matrix.md', 'Entity Ownership Matrix', '14_integration/entity_ownership_matrix.md', '39 entities; exactly one canonical writer each. Recommendation != mutation. Derived views/UI caches/JSON exports/proposed docs are never source of truth. lead/approval/send_ledger_entry/reply/opt_out owned by Master Controller; product by Product OS; price/deal by Revenue; etc.'],
  ['id_standard.md', 'Global ID Standard', '14_integration/id_standard.md', '20 canonical IDs, stable/immutable, no join by display name or guessed email, TEST_ prefix, external IDs namespaced (tg:/email:/form:), no cross-domain collision, legacy ID crosswalk, no silent re-key.'],
  ['temporal_standard.md', 'Temporal Standard', '14_integration/temporal_standard.md', 'UTC ISO 8601 storage; created/updated/observed/effective/received/sent/accepted/generated/source timestamps; display-time conversion only. Detects local-time ambiguity, date-only misuse, synthetic-without-marker, future/stale.'],
  ['status_vocabulary.md', 'Status Vocabulary Consolidation', '14_integration/status_vocabulary.md', 'Domain statuses mapped to executive_summary_status without destructive collapse or write-back. ACTIVE/READY/DRAFT/OPTED_OUT name-collisions resolved by domain-namespacing. Mini Audit = 5 macro-phases + 18 detailed stages.'],
  ['enum_registry.md', 'Shared Enum Registry', '14_integration/enum_registry.md', 'Cross-cutting enums only: confidence, evidence status, approval reference, severity, data classification, source status, environment, synthetic marker, channel, direction, recommendation status. Domain-only enums stay in their domain.'],
  ['evidence_standard.md', 'Evidence & Confidence Standard', '14_integration/evidence_standard.md', '8 confidence states; inference never auto-confirmed; synthetic stays synthetic; freshness mandatory for volatile facts; missing evidence blocks factual claims.'],
  ['revision_standard.md', 'Revision & Concurrency Standard', '14_integration/revision_standard.md', 'Canonical+entity revision; expected_revision on mutation; 409 CONFLICT returns current_revision; no blind overwrite; no client-side conflict resolution without user decision.'],
  ['idempotency_standard.md', 'Idempotency Standard', '14_integration/idempotency_standard.md', 'idempotency_key/request_id/attempt_id/payload_hash; all external mutations idempotent; approved send durable identity; changed payload -> new key; ambiguous transport -> reconcile.'],
  ['command_query_standard.md', 'Command / Query Separation', '14_integration/command_query_standard.md', 'Queries read-only/cacheable/provenance/freshness/revision. Commands validation/approval/idempotency/expected-revision/audit/canonical-owner. No mutation via query endpoint.'],
  ['api_envelope_standard.md', 'Standard API Envelope', '14_integration/api_envelope_standard.md', 'Request (request_id/idempotency_key/actor/source_system/operation/entity/entity_id/expected_revision/payload/metadata), response (ok/revision/data/warnings/errors/provenance), error (code/retryable/safe_to_retry/current_revision/correlation_id).'],
  ['error_taxonomy.md', 'Error Taxonomy', '14_integration/error_taxonomy.md', '18 standard error codes + legacy HTTP/domain mapping + retryable matrix.'],
  ['event_standard.md', 'Event Standard', '14_integration/event_standard.md', 'Event envelope; fact vs recommendation separated; replay-safe; ordering limits explicit; schema version required; no production emitter.'],
  ['file_handoff_standard.md', 'File Handoff Standard', '14_integration/file_handoff_standard.md', 'File Vault handoff: ref/hash/mime/size/sensitivity/scan_status/version. No binary duplication, immutable original, versioned derivative, no path traversal, no external URL, delete only after owner approval.'],
  ['consent_standard.md', 'Consent / Privacy Contract', '14_integration/consent_standard.md', 'subject_ref/channel/purpose/status/source/evidence/granted/revoked/expires/restrictions. Separates commercial/support/case/testimonial/logo/referral/analytics. No implied permission.'],
  ['data_classification.md', 'Data Classification', '14_integration/data_classification.md', '9 data classes; per-contract input/output classification, allowed storage/logs, redaction, retention.'],
  ['cache_standard.md', 'Cache Standard', '14_integration/cache_standard.md', 'Android Room/dashboard/report/analytics/read-model caches. Cache never canonical; TTL+stale+revision+invalidation; no offline mutation; no secret caching.'],
  ['android_contract_reconciliation.md', 'Android Contract Reconciliation', '14_integration/android_contract_reconciliation.md', 'DTO findings: revision/idempotency/enum/cache/timestamp alignment proposals. Room is cache not canonical; no offline canonical mutation. No Android code changed; no APK/AAB.'],
  ['telegram_contract_reconciliation.md', 'Telegram Contract Reconciliation', '14_integration/telegram_contract_reconciliation.md', 'Callback revision+idempotency proposals; buttons not command strings; canonical IDs in views; no direct local fallback. No deployment.'],
  ['mc_api_gap_report.md', 'Master Controller API Gap Report', '14_integration/mc_api_gap_report.md', '34 endpoints inventoried; idempotency formalization + uniform 409 envelope gaps; 3 proposed additions (draft-request/opt-out-recommendation/crosswalk). No production API modified.'],
  ['compatibility_matrix.md', 'Cross-System Compatibility Matrix', '14_integration/compatibility_matrix.md', '15 producer/consumer pairs; all compatible (some with proposed endpoint/field or status adapter).'],
  ['adapter_policy.md', 'Adapter Policy', '14_integration/adapter_policy.md', 'Adapters only when semantics preserved, version mismatch unavoidable, no duplicate truth, explicit owner, tested, deprecation path. No runtime deployment.'],
  ['migration_policy.md', 'Migration Policy', '14_integration/migration_policy.md', '9 migration stages; max status READY this task; owner approval required; backup+rollback. Includes committing untracked communication_monitor + legacy lead ID crosswalk. No real migration.'],
  ['branch_consolidation_plan.md', 'Branch Consolidation Plan', '14_integration/branch_consolidation_plan.md', 'Chain confirmed LINEAR ai_hq->revenue->delivery->finance->executive->product->customer_success->analytics->growth->conversation_hub. analytics-os-metrics-reporting-v1 SUPERSEDED (keep, do not delete). Nothing merged.'],
  ['proposed_doc_consolidation_plan.md', 'Proposed Docs Consolidation Plan', '14_integration/proposed_doc_consolidation_plan.md', '114 proposed docs / 114 unique targets / 11 projects. Ordered additive apply; shared MASTER_CONTEXT merged last; nothing applied.'],
  ['legacy_retirement_plan.md', 'Legacy Retirement Plan', '14_integration/legacy_retirement_plan.md', '37 historical telegram scripts -> MOVE_TO_ARCHIVE; communication_monitor KEEP_ACTIVE (must be committed); obsolete branch KEEP_REFERENCE. No deletion.'],
  ['integration_dashboard.md', 'Integration Dashboard', '09_dashboards/integration_dashboard.md', 'Systems/contracts/compatibility/ownership/duplicate-writers/version-conflicts/missing-fields/migration-readiness/legacy-risks/proposed-doc-conflicts/branch-consolidation/blockers/owner-decisions.'],
  ['owner_integration_command_center.md', 'Owner Integration Command Center', '09_dashboards/owner_integration_command_center.md', 'Highest-risk contract, duplicate-writer risk, migration blocker (commit communication_monitor), branch conflict, proposed-doc collision, legacy decision, next safe action, intentionally-not-applied.'],
  ['what_already_exists_links.md', 'WHAT_ALREADY_EXISTS + AI System Map Links', '14_integration/what_already_exists_links.md', 'Integration consolidation adds the cross-system contract registry, ownership matrix, all data/API standards, compatibility matrix, and migration/branch/doc/legacy plans over the existing chain. Links: tools/integration_os/, _generated/integration_os/.'],
  ['synthetic_e2e_report.md', 'Synthetic E2E Report', '14_integration/synthetic_e2e_report.md', '8 cross-system E2E scenarios (Mini Audit full lifecycle + opt-out + identity conflict + revision conflict + partial failure + duplicate idempotent + product-not-ready + capacity-blocked) pass with ownership checks; no real send.'],
  ['security_boundary_report.md', 'Security Boundary Report', '14_integration/security_boundary_report.md', 'Proves no second writer, no direct canonical write/send/SMTP/Telegram/unofficial-channel, no secret/PII propagation, no offline mutation, no duplicate ledger, no merge/migration/doc-apply/delete. Scanner catches planted violations.'],
];

mkdirSync(path.join(ROOT, SUB), { recursive: true });
let count = 0;
for (const [file, title, target, body] of DOCS) {
  const dir = target.includes('/') ? path.dirname(target) : SUB;
  mkdirSync(path.join(ROOT, dir), { recursive: true });
  const md = `---\ncanonical_target: ${target}\nrelated_project: integration-data-contracts\nstatus: PROPOSED_NOT_APPLIED\nsynthetic: true\n---\n\n# ${title}\n\n${body}\n\n> Proposed canonical doc. NOT applied. Owner applies post-review via AI HQ apply flow.\n`;
  writeFileSync(path.join(ROOT, dir, file), md);
  count++;
}
console.log(`[gen-proposed-docs] wrote ${count} integration proposed docs under docs_canonical_proposed/`);
