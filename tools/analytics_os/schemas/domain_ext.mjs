// tools/analytics_os/schemas/domain_ext.mjs
// Analytics OS extended domain model (Phase 3). Read-only derived layer.
// Adds the entities required for full Analytics OS without altering the working domain.mjs.
// Every entity is derived/reference-only; none represents a canonical write.

export const ENTITIES = [
  'MetricDefinition', 'EventDefinition', 'Observation', 'DataContract', 'DatasetSnapshot',
  'DataQualityRule', 'DataQualityResult', 'LineageEdge', 'Experiment', 'ExperimentResult',
  'AttributionRecord', 'Anomaly', 'Insight',
];

// Authority map — who owns what. Analytics OS owns ONLY metric definitions + derived observations.
export const AUTHORITY = {
  'domain_raw_truth': 'domain_OS',
  'metric_definitions': 'Analytics_OS',
  'derived_observations': 'Analytics_OS',
  'targets': 'domain_OS / Executive_OS',
  'owner_decisions': 'Executive_OS',
  'production_operational_state': 'Master_Controller',
};

export const CONFIDENCE = ['CONFIRMED', 'MODEL_ESTIMATE', 'OWNER_TARGET', 'FORECAST', 'SYNTHETIC', 'UNKNOWN'];
export const METRIC_TYPE = ['count', 'ratio', 'currency', 'duration', 'rate', 'score', 'index', 'boolean'];
export const TIME_GRAIN = ['event', 'daily', 'weekly', 'monthly', 'quarterly', 'per_project', 'per_release', 'snapshot'];
export const EXPERIMENT_STATUS = ['IDEA', 'HYPOTHESIS_DEFINED', 'MEASUREMENT_READY', 'OWNER_REVIEW', 'APPROVED', 'READY', 'RUNNING', 'STOPPED', 'ANALYZED', 'ACCEPTED', 'REJECTED', 'INCONCLUSIVE'];
export const ATTRIBUTION_MODEL = ['first_touch', 'last_touch', 'linear', 'position_based', 'unknown'];

// ---- shape predicates (lightweight, dependency-free) ----
export function isMetricDefinition(m) {
  return !!m && typeof m.metric_id === 'string' && typeof m.source_system === 'string'
    && Array.isArray(m.source_fields) && METRIC_TYPE.includes(m.type) && CONFIDENCE.includes(m.confidence);
}
export function isEventDefinition(e) {
  return !!e && typeof e.event_id === 'string' && typeof e.domain === 'string' && typeof e.version === 'string';
}
export function isObservation(o) {
  // A derived observation MUST carry lineage (source reference) and confidence.
  return !!o && typeof o.metric_id === 'string' && (typeof o.value === 'number' || o.value === null)
    && typeof o.lineage_ref === 'string' && CONFIDENCE.includes(o.confidence);
}
export function isDataContract(c) {
  return !!c && typeof c.dataset === 'string' && typeof c.producer === 'string'
    && typeof c.schema_version === 'string' && Array.isArray(c.fields);
}
export function isDatasetSnapshot(s) {
  return !!s && typeof s.snapshot_id === 'string' && typeof s.dataset === 'string'
    && typeof s.schema_version === 'string' && typeof s.synthetic === 'boolean';
}
export function isLineageEdge(e) {
  return !!e && typeof e.from === 'string' && typeof e.to === 'string' && typeof e.transform === 'string';
}
export function isExperiment(x) {
  return !!x && typeof x.experiment_id === 'string' && EXPERIMENT_STATUS.includes(x.status);
}
export function isAttributionRecord(a) {
  return !!a && typeof a.subject_id === 'string' && ATTRIBUTION_MODEL.includes(a.model);
}
export function isInsight(i) {
  return !!i && typeof i.insight_id === 'string' && Array.isArray(i.source_metrics)
    && typeof i.confidence === 'string' && Array.isArray(i.limitations);
}

export const DOMAIN_EXT = {
  entities: ENTITIES,
  authority: AUTHORITY,
  note: 'Analytics OS is a derived read-only layer. It owns metric definitions + derived observations only; never raw truth, targets, decisions, or production state.',
};
