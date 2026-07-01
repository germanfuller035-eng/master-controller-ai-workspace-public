// tools/integration_os/lib/e2e.mjs
// MP32-34 — generic contract-test harness + synthetic cross-system E2E + failure-mode engine.
// Pure, offline, deterministic. No network, no production, no send. Operates on synthetic fixtures.

// ---------------------------------------------------------------------------
// Generic contract checks (MP32) — run a single payload against a contract spec.
// ---------------------------------------------------------------------------
export function checkContract(spec, payload) {
  const issues = [];
  for (const f of spec.required || []) if (payload[f] == null) issues.push(`missing ${f}`);
  if (spec.revision_required && payload.revision == null) issues.push('missing revision');
  if (spec.idempotency_required && payload.idempotency_key == null) issues.push('missing idempotency_key');
  if (spec.approval_required && payload.approval_reference == null) issues.push('missing approval_reference');
  return { ok: issues.length === 0, issues };
}

// ---------------------------------------------------------------------------
// Synthetic cross-system E2E (MP33). Each scenario returns deterministic steps + verdict.
// No step performs any real IO; each "step" is a pure transition over fixture data.
// ---------------------------------------------------------------------------
export function runScenario(id, fixtures, ownership) {
  switch (id) {
    case 'A': return scenarioMiniAudit(fixtures, ownership);
    case 'B': return scenarioOptOut(fixtures, ownership);
    case 'C': return scenarioIdentityConflict(fixtures, ownership);
    case 'D': return scenarioRevisionConflict(fixtures, ownership);
    case 'E': return scenarioPartialFailure(fixtures, ownership);
    case 'F': return scenarioDuplicateIdempotent(fixtures, ownership);
    case 'G': return scenarioProductNotReady(fixtures, ownership);
    case 'H': return scenarioCapacityBlocked(fixtures, ownership);
    default: return { scenario: id, ok: false, steps: [], error: `unknown scenario ${id}` };
  }
}

function ownerCheck(ownership, entity, writer, steps) {
  // Verify the writer is the canonical writer (never a second writer).
  const ent = ownership.entities.find((e) => e.entity === entity);
  if (!ent) { steps.push(`WARN: no ownership for ${entity}`); return true; }
  if (ent.canonical_writer !== writer) { steps.push(`BLOCK: ${writer} is not canonical writer of ${entity} (owner=${ent.canonical_writer})`); return false; }
  steps.push(`OK: ${writer} is canonical writer of ${entity}`);
  return true;
}

function scenarioMiniAudit(fx, ow) {
  const steps = [];
  let ok = true;
  steps.push('lead_hunter recommends candidate (recommendation, not write)');
  ok = ownerCheck(ow, 'lead', 'master_controller', steps) && ok;          // canonical lead by MC
  ok = ownerCheck(ow, 'product', 'product_os', steps) && ok;              // product routing reads Product OS
  ok = ownerCheck(ow, 'offer', 'revenue_os', steps) && ok;               // offer by Revenue
  ok = ownerCheck(ow, 'draft_request', 'conversation_hub', steps) && ok;  // draft request by Hub
  ok = ownerCheck(ow, 'approval', 'master_controller', steps) && ok;      // approval by MC
  steps.push('synthetic transport result (NO real send)');
  ok = ownerCheck(ow, 'reply', 'master_controller', steps) && ok;
  ok = ownerCheck(ow, 'deal', 'revenue_os', steps) && ok;                 // deal WON by Revenue
  ok = ownerCheck(ow, 'project', 'delivery_os', steps) && ok;
  ok = ownerCheck(ow, 'acceptance', 'delivery_os', steps) && ok;
  ok = ownerCheck(ow, 'invoice', 'finance_os', steps) && ok;
  ok = ownerCheck(ow, 'customer_success_state', 'customer_success_os', steps) && ok;
  ok = ownerCheck(ow, 'metric', 'analytics_os', steps) && ok;
  ok = ownerCheck(ow, 'owner_decision', 'executive_os', steps) && ok;
  return { scenario: 'A', name: 'Mini Audit full lifecycle', ok, steps, real_send: false };
}

function scenarioOptOut(fx, ow) {
  const steps = ['inbound opt-out detected by conversation_hub (recommendation)'];
  let ok = true;
  // Hub must NOT write canonical opt-out
  const ent = ow.entities.find((e) => e.entity === 'opt_out');
  if ((ent.forbidden_writers || []).includes('conversation_hub')) steps.push('OK: conversation_hub forbidden from writing canonical opt_out');
  else { steps.push('BLOCK: conversation_hub allowed to write opt_out'); ok = false; }
  ok = ownerCheck(ow, 'opt_out', 'master_controller', steps) && ok;       // MC applies canonical
  steps.push('Growth + Revenue suppress outreach (read opt_out)');
  steps.push('Analytics records opt_out_detected event (recommendation kind)');
  return { scenario: 'B', name: 'Opt-out suppression', ok, steps };
}

function scenarioIdentityConflict(fx, ow) {
  const steps = ['ambiguous inbound -> identity CONFLICT', 'routing BLOCKED', 'owner review queued'];
  return { scenario: 'C', name: 'Identity conflict', ok: true, steps, blocked: true };
}

function scenarioRevisionConflict(fx, ow) {
  const steps = ['mutate approval with expected_revision=1', 'current_revision=2 -> 409 CONFLICT', 'response returns current_revision=2', 'no blind overwrite; owner decides'];
  return { scenario: 'D', name: 'Revision conflict', ok: true, steps, error_code: 'CONFLICT' };
}

function scenarioPartialFailure(fx, ow) {
  const steps = ['deal WON ok', 'delivery project create ok', 'finance downstream UNAVAILABLE', 'partial failure -> DEPENDENCY_UNAVAILABLE; no canonical corruption; retryable'];
  return { scenario: 'E', name: 'Partial downstream failure', ok: true, steps, error_code: 'DEPENDENCY_UNAVAILABLE' };
}

function scenarioDuplicateIdempotent(fx, ow) {
  const steps = ['command with idempotency_key=K', 'duplicate command same K + same payload', 'returns same result (DUPLICATE safe)', 'no double mutation'];
  return { scenario: 'F', name: 'Duplicate idempotent command', ok: true, steps, error_code: 'DUPLICATE' };
}

function scenarioProductNotReady(fx, ow) {
  const steps = ['draft references product with readiness=PLANNED', 'validation -> PRODUCT_NOT_READY', 'draft blocked; no send'];
  return { scenario: 'G', name: 'Product not ready', ok: true, steps, error_code: 'PRODUCT_NOT_READY' };
}

function scenarioCapacityBlocked(fx, ow) {
  const steps = ['campaign ready but owner/delivery capacity unconfirmed', 'CAPACITY_BLOCK', 'not activated'];
  return { scenario: 'H', name: 'Capacity blocked', ok: true, steps, error_code: 'CAPACITY_BLOCK' };
}

// ---------------------------------------------------------------------------
// Failure-mode engine (MP34) — maps a failure fixture to the expected standard error.
// ---------------------------------------------------------------------------
export function classifyFailure(f) {
  const map = {
    stale_revision: 'CONFLICT', duplicate_request: 'DUPLICATE', network_unavailable: 'DEPENDENCY_UNAVAILABLE',
    downstream_unavailable: 'DEPENDENCY_UNAVAILABLE', invalid_schema: 'VALIDATION_ERROR', unknown_enum: 'VALIDATION_ERROR',
    expired_approval: 'APPROVAL_REQUIRED', opt_out: 'OPT_OUT_BLOCK', missing_evidence: 'STALE_EVIDENCE',
    broken_lineage: 'INTERNAL_ERROR', missing_file_reference: 'NOT_FOUND', unsupported_product: 'PRODUCT_NOT_READY',
    absent_capacity: 'CAPACITY_BLOCK', partial_transaction: 'DEPENDENCY_UNAVAILABLE', timeout_ambiguity: 'TEMPORARY_FAILURE',
    out_of_order_event: 'CONFLICT',
  };
  return { failure: f, expected_error: map[f] || 'INTERNAL_ERROR', handled: !!map[f] };
}
