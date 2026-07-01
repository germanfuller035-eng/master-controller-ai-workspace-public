// tools/integration_os/lib/validators.mjs
// MP41 — validators across registry, ownership, IDs, timestamps, statuses, enums, evidence,
// revisions, idempotency, envelopes, errors, events, files, consent, privacy, cache,
// compatibility, migration, branch/doc plans, legacy + safety (no-production/network/send/delete).
import {
  CONFIDENCE, EVIDENCE_STATUS, SEVERITY, DATA_CLASS, ENVIRONMENT, CHANNEL, DIRECTION,
  ERROR_CODES, CONTRACT_TYPES, MIGRATION_STAGES, LEGACY_DISPOSITION, TEMPORAL_FIELDS,
  PRODUCTION_MUTATION_ALLOWED, LIVE_API_ACCESS_ALLOWED, NETWORK_ALLOWED, SEND_ALLOWED,
  CANONICAL_WRITE_ALLOWED, BRANCH_MERGE_ALLOWED, MIGRATION_APPLY_ALLOWED, DOC_APPLY_ALLOWED,
  FILE_DELETE_ALLOWED, GIT_PUSH_ALLOWED, GIT_REMOTE_ALLOWED, MAX_MIGRATION_STATUS, isIsoUtc,
} from './common.mjs';

const inSet = (set, v) => set.includes(v);

// ---- Contract registry validator (MP4) ----
export function validateContractRegistry(reg) {
  const e = [];
  const ids = new Set();
  for (const c of reg.contracts || []) {
    if (!c.contract_id) e.push('contract missing id');
    if (ids.has(c.contract_id)) e.push(`duplicate contract_id: ${c.contract_id}`);
    ids.add(c.contract_id);
    if (!c.owner) e.push(`${c.contract_id}: missing owner`);
    if (!inSet(CONTRACT_TYPES, c.contract_type)) e.push(`${c.contract_id}: bad contract_type ${c.contract_type}`);
    if (!c.producer) e.push(`${c.contract_id}: missing producer`);
  }
  return e;
}

// ---- Ownership matrix validator (MP5): exactly one canonical writer per mutable entity ----
export function validateOwnership(matrix) {
  const e = [];
  for (const ent of matrix.entities || []) {
    if (!ent.canonical_owner) e.push(`${ent.entity}: missing canonical_owner`);
    if (!ent.canonical_writer) e.push(`${ent.entity}: missing canonical_writer`);
    if (Array.isArray(ent.canonical_writer)) e.push(`${ent.entity}: multiple canonical writers (must be exactly one)`);
    // a recommender must not also be a forbidden writer that appears as writer
    if (ent.canonical_writer && (ent.forbidden_writers || []).includes(ent.canonical_writer)) e.push(`${ent.entity}: canonical_writer is also forbidden`);
    if (!ent.primary_id) e.push(`${ent.entity}: missing primary_id`);
  }
  return e;
}

// ---- ID standard validator (MP6) ----
export function validateId(id, opts = {}) {
  const e = [];
  if (typeof id !== 'string' || !id) { e.push('id must be non-empty string'); return e; }
  if (opts.test && !id.startsWith('TEST_')) e.push(`test id must be prefixed TEST_: ${id}`);
  if (opts.external && !/^[a-z_]+:/.test(id)) e.push(`external id must be namespaced (prefix:): ${id}`);
  if (/\s/.test(id)) e.push(`id must not contain whitespace: ${id}`);
  return e;
}

// ---- Temporal validator (MP7) ----
export function validateTimestamp(ts, field) {
  const e = [];
  if (ts == null) return e;
  if (!isIsoUtc(ts)) e.push(`${field || 'timestamp'} must be ISO 8601 UTC (Z): ${ts}`);
  return e;
}
export function validateTemporalField(name) {
  return TEMPORAL_FIELDS.includes(name) ? [] : [`unknown temporal field: ${name}`];
}

// ---- Status validator (MP8): no derived executive write-back ----
export function validateStatuses(statusDoc) {
  const e = [];
  for (const s of statusDoc.statuses || []) {
    if (!s.mutation_owner) e.push(`${s.source_status}: missing mutation_owner`);
    if (!s.canonical_domain) e.push(`${s.source_status}: missing canonical_domain`);
    if (s.mutation_owner === 'executive_os' && s.canonical_domain !== 'owner_decision') e.push(`${s.source_status}: executive must not own non-decision domain state`);
  }
  if (statusDoc.detections?.derived_executive_written_back?.found === true) e.push('derived executive status written back to a domain store');
  return e;
}

// ---- Enum validator (MP9/10) ----
export function validateConfidence(v) { return inSet(CONFIDENCE, v) ? [] : [`bad confidence: ${v}`]; }
export function validateSeverity(v) { return inSet(SEVERITY, v) ? [] : [`bad severity: ${v}`]; }
export function validateDataClass(v) { return inSet(DATA_CLASS, v) ? [] : [`bad data class: ${v}`]; }
export function validateChannel(v) { return inSet(CHANNEL, v) ? [] : [`bad channel: ${v}`]; }
export function validateErrorCode(v) { return inSet(ERROR_CODES, v) ? [] : [`bad error code: ${v}`]; }

// ---- Evidence validator (MP10): inference never auto-confirmed; synthetic stays synthetic ----
export function validateEvidence(ev) {
  const e = [];
  if (!inSet(CONFIDENCE, ev.confidence)) e.push(`bad confidence: ${ev.confidence}`);
  if (ev.confidence === 'CONFIRMED' && ev.derived_from === 'INFERENCE') e.push('inference cannot become CONFIRMED automatically');
  if (ev.synthetic === true && ev.confidence === 'CONFIRMED') e.push('synthetic evidence cannot be CONFIRMED');
  if (ev.volatile === true && !ev.freshness) e.push('volatile fact missing freshness');
  return e;
}

// ---- Revision validator (MP11) ----
export function validateRevisionMutation(cmd) {
  const e = [];
  if (cmd.mutation === true && cmd.expected_revision == null) e.push('mutation missing expected_revision');
  if (cmd.expected_revision != null && cmd.current_revision != null && cmd.expected_revision !== cmd.current_revision) {
    if (cmd.response_code !== 'CONFLICT') e.push('revision mismatch must yield CONFLICT (409)');
    if (cmd.returns_current_revision !== true) e.push('CONFLICT must return current_revision');
  }
  return e;
}

// ---- Idempotency validator (MP12) ----
export function validateIdempotency(op) {
  const e = [];
  if (op.external_mutation === true && !op.idempotency_key) e.push('external mutation missing idempotency_key');
  if (op.payload_changed === true && op.same_key === true) e.push('changed payload must use a new idempotency_key');
  if (op.transport_result === 'AMBIGUOUS' && op.action !== 'RECONCILE') e.push('ambiguous transport result must reconcile before retry');
  return e;
}

// ---- API envelope validator (MP14) ----
const REQ = ['request_id', 'operation', 'entity'];
const RESP = ['ok', 'request_id', 'operation', 'entity'];
const ERR = ['code', 'message', 'retryable', 'safe_to_retry'];
export function validateRequestEnvelope(o) { return REQ.filter((f) => o[f] == null).map((f) => `request missing ${f}`); }
export function validateResponseEnvelope(o) { return RESP.filter((f) => o[f] == null).map((f) => `response missing ${f}`); }
export function validateErrorEnvelope(o) {
  const e = ERR.filter((f) => o[f] == null).map((f) => `error missing ${f}`);
  if (o.code && !inSet(ERROR_CODES, o.code)) e.push(`bad error code: ${o.code}`);
  return e;
}

// ---- Event validator (MP17) ----
const EVT = ['event_type', 'producer', 'entity_type', 'version'];
export function validateEvent(ev) {
  const e = EVT.filter((f) => ev[f] == null).map((f) => `event missing ${f}`);
  if (ev.kind && !['FACT', 'RECOMMENDATION'].includes(ev.kind)) e.push(`bad event kind: ${ev.kind}`);
  return e;
}

// ---- File handoff validator (MP19) ----
export function validateFileRef(f) {
  const e = [];
  if (!f.hash) e.push('file_ref missing hash');
  if (f.binary != null || f.content_base64 != null) e.push('no binary duplication in handoff');
  if (typeof f.storage_reference === 'string' && /\.\.(\/|\\)/.test(f.storage_reference)) e.push('path traversal in storage_reference');
  if (typeof f.storage_reference === 'string' && /^https?:\/\//.test(f.storage_reference)) e.push('uncontrolled external URL');
  return e;
}

// ---- Consent validator (MP20) ----
export function validateConsent(c) {
  const e = [];
  if (!c.subject_ref) e.push('consent missing subject_ref');
  if (!c.purpose) e.push('consent missing purpose');
  if (!c.source) e.push('consent missing source/evidence (no implied permission)');
  return e;
}

// ---- Cache validator (MP22) ----
export function validateCache(c) {
  const e = [];
  if (c.canonical === true) e.push('cache must never be canonical');
  if (c.ttl == null) e.push('cache missing TTL');
  if (c.offline_mutation === true) e.push('cache must not allow offline mutation');
  if (c.caches_secret === true) e.push('cache must not store secrets');
  return e;
}

// ---- Migration validator (MP28): max status READY in this task ----
export function validateMigration(m) {
  const e = [];
  if (!inSet(MIGRATION_STAGES, m.status)) e.push(`bad migration status: ${m.status}`);
  const idx = MIGRATION_STAGES.indexOf(m.status);
  if (idx > MIGRATION_STAGES.indexOf(MAX_MIGRATION_STATUS)) e.push(`migration ${m.migration_id} exceeds max status ${MAX_MIGRATION_STATUS}`);
  if (m.owner_approval !== 'REQUIRED' && m.status === 'READY') e.push(`migration ${m.migration_id} READY must require owner approval`);
  return e;
}

// ---- Branch plan validator (MP29): nothing merged ----
export function validateBranchPlan(p) {
  const e = [];
  if (p.merge_executed !== false) e.push('branch plan must not execute merges');
  if (p.chain_linear !== true) e.push('chain expected linear');
  return e;
}

// ---- Proposed-doc plan validator (MP30): nothing applied ----
export function validateDocPlan(p) {
  const e = [];
  if (p.ordered_apply_plan?.apply_executed !== false) e.push('doc plan must not apply');
  if (p.ordered_apply_plan?.canonical_docs_applied !== 0) e.push('canonical_docs_applied must be 0');
  return e;
}

// ---- Legacy retirement validator (MP31): no deletion ----
export function validateLegacyPlan(p) {
  const e = [];
  if (p.deletions_executed !== 0) e.push('legacy plan must not execute deletions');
  for (const it of p.items || []) {
    if (!inSet(LEGACY_DISPOSITION, it.disposition)) e.push(`bad disposition: ${it.disposition}`);
    if (it.disposition === 'DELETE_AFTER_APPROVAL' && it.owner_approval_required !== true) e.push(`${it.target}: delete requires owner approval`);
  }
  return e;
}

// ---- Safety invariants (MP35) ----
export function validateSafetyInvariants() {
  const e = [];
  const must = {
    PRODUCTION_MUTATION_ALLOWED, LIVE_API_ACCESS_ALLOWED, NETWORK_ALLOWED, SEND_ALLOWED,
    CANONICAL_WRITE_ALLOWED, BRANCH_MERGE_ALLOWED, MIGRATION_APPLY_ALLOWED, DOC_APPLY_ALLOWED,
    FILE_DELETE_ALLOWED, GIT_PUSH_ALLOWED, GIT_REMOTE_ALLOWED,
  };
  for (const [k, v] of Object.entries(must)) if (v !== false) e.push(`${k} must be false`);
  return e;
}

// ---- Aggregate ----
export function validateAll(ds) {
  const dims = {};
  let blockers = 0;
  const add = (name, errs) => { dims[name] = errs.length === 0 ? 'PASS' : `FAIL(${errs.length})`; blockers += errs.length; };
  add('safety_invariants', validateSafetyInvariants());
  add('contract_registry', validateContractRegistry(ds.registry || {}));
  add('ownership_matrix', validateOwnership(ds.ownership || {}));
  add('statuses', validateStatuses(ds.status || {}));
  add('events', (ds.events?.events || []).flatMap(validateEvent));
  add('migrations', (ds.plans?.migration_model?.migrations || []).flatMap(validateMigration));
  add('branch_plan', validateBranchPlan(ds.plans?.branch_consolidation_plan || {}));
  add('doc_plan', validateDocPlan(ds.docPlan || {}));
  add('legacy_plan', validateLegacyPlan(ds.plans?.legacy_retirement_plan || {}));
  return { blockers, dimensions: dims };
}
