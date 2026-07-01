// tools/delivery_os/lib/inputs.mjs
// Phase 7: Client Inputs Engine. Builds required-input set per product + completeness score.
// Credential values are never stored — only references to approved secret storage.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DELIVERY_ROOT } from './common.mjs';

let CAT = null;
function catalog() {
  if (!CAT) CAT = JSON.parse(readFileSync(path.join(DELIVERY_ROOT, 'data/client_inputs_catalog.json'), 'utf8'));
  return CAT;
}
function category(key) { return catalog().categories.find((c) => c.key === key) || null; }

// Build the required + optional input list for a product.
export function buildInputSet(productId, projectId) {
  const cat = catalog();
  const requiredKeys = cat.product_required_inputs[productId] || [];
  const inputs = [];
  for (const c of cat.categories) {
    const required = requiredKeys.includes(c.key) || (c.required && requiredKeys.length === 0);
    inputs.push({
      input_id: `${projectId || 'proj'}_${c.key}`,
      project_id: projectId || null,
      name: c.key,
      required,
      source: 'client',
      status: 'MISSING',
      received_at: null,
      validated: false,
      sensitive: c.sensitive,
      blocker_if_missing: required && c.blocker_if_missing,
      // For sensitive credentials: store only a reference, never a value.
      value_storage: c.formats.includes('credential_reference') ? 'D:\\AI_SECRETS (reference only)' : 'inline-safe',
      fallback: c.fallback,
    });
  }
  return inputs;
}

// Completeness score from a set of inputs (with their statuses).
export function completenessScore(inputs) {
  const required = inputs.filter((i) => i.required);
  const receivedRequired = required.filter((i) => i.status === 'RECEIVED' || i.status === 'VALIDATED' || i.validated);
  const blockersMissing = required.filter((i) => i.blocker_if_missing && !(i.status === 'RECEIVED' || i.status === 'VALIDATED' || i.validated));
  const score = required.length ? Math.round((receivedRequired.length / required.length) * 100) : 100;
  return {
    score,
    required_total: required.length,
    required_received: receivedRequired.length,
    blockers_missing: blockersMissing.map((i) => i.name),
    ready_to_start: blockersMissing.length === 0,
    // Embedded secret check: any sensitive input that carries an inline value is a violation.
    secret_violations: inputs.filter((i) => i.sensitive && i.value && !/AI_SECRETS|reference/i.test(String(i.value))).map((i) => i.name),
  };
}

// Validate that no credential value is embedded.
export function validateNoEmbeddedSecrets(inputs) {
  const errors = [];
  for (const i of inputs) {
    if (i.sensitive && i.value && !/AI_SECRETS|reference/i.test(String(i.value))) {
      errors.push(`embedded credential value in input ${i.name} — must reference D:\\AI_SECRETS`);
    }
  }
  return { ok: errors.length === 0, errors };
}
