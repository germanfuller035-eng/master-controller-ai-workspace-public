// tools/analytics_os/lib/sot.mjs
// Source-of-Truth governance validator (Phase 3). Blocks the forbidden analytics patterns.
import { CONFIDENCE } from '../schemas/domain_ext.mjs';

// Validate a SoT extension document: at most one canonical writer per entity.
export function validateSotExtension(ext) {
  const errors = [];
  const writerSeen = {};
  for (const e of ext.entities || []) {
    const writers = e.writers || [];
    if (writers.length > 1) errors.push(`entity ${e.entity} has ${writers.length} writers (max 1 canonical writer)`);
    if (e.system_of_record && writerSeen[e.entity]) errors.push(`entity ${e.entity} declared twice`);
    writerSeen[e.entity] = true;
  }
  return errors;
}

// Validate a single metric definition against governance rules.
export function validateMetricGovernance(m) {
  const errors = [];
  if (!m.source_system) errors.push(`metric ${m.metric_id || '?'} has no source_system`);
  if (!Array.isArray(m.source_fields) || m.source_fields.length === 0) errors.push(`metric ${m.metric_id || '?'} has no source_fields`);
  if (m.confidence && !CONFIDENCE.includes(m.confidence)) errors.push(`metric ${m.metric_id} invalid confidence ${m.confidence}`);
  return errors;
}

// Block: a target value presented as an actual observation.
export function blockTargetAsActual(observation) {
  if (observation.confidence === 'OWNER_TARGET' && observation.role === 'actual') {
    return [`observation ${observation.metric_id} presents an OWNER_TARGET as an actual value`];
  }
  return [];
}

// Block: a forecast presented as confirmed.
export function blockForecastAsConfirmed(observation) {
  if (observation.confidence === 'CONFIRMED' && observation.is_forecast === true) {
    return [`observation ${observation.metric_id} marks a forecast as CONFIRMED`];
  }
  return [];
}

// Block: a derived observation without lineage.
export function blockObservationWithoutLineage(observation) {
  if (!observation.lineage_ref) return [`observation ${observation.metric_id} has no lineage_ref`];
  return [];
}

// Block: any analytics attempt to mutate domain state.
export function blockDomainMutation(op) {
  if (op && op.mutates_domain === true) return [`operation ${op.name || '?'} would mutate domain state (forbidden)`];
  return [];
}

// Aggregate governance check over an observation set.
export function governanceScan({ sotExtension, metrics = [], observations = [], operations = [] }) {
  const errors = [];
  if (sotExtension) errors.push(...validateSotExtension(sotExtension));
  for (const m of metrics) errors.push(...validateMetricGovernance(m));
  for (const o of observations) {
    errors.push(...blockTargetAsActual(o), ...blockForecastAsConfirmed(o), ...blockObservationWithoutLineage(o));
  }
  for (const op of operations) errors.push(...blockDomainMutation(op));
  return { ok: errors.length === 0, error_count: errors.length, errors };
}
