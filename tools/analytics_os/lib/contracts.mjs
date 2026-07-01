// tools/analytics_os/lib/contracts.mjs
// Data-contract compatibility validation + metric-catalog/glossary access (Phases 4-6).
// Read-only. No live reads, no emitters.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './common.mjs';

export function loadJson(name) { return JSON.parse(readFileSync(path.join(DATA_DIR, name), 'utf8')); }

export function metricCatalog() { return loadJson('metric_catalog.json'); }
export function glossary() { return loadJson('business_glossary.json'); }
export function eventTaxonomy() { return loadJson('event_taxonomy.json'); }
export function dataContracts() { return loadJson('data_contracts.json'); }

// Catalog integrity: every metric has source_system + source_fields + valid category.
export function validateCatalog(cat = metricCatalog()) {
  const errors = [];
  const cats = new Set(cat.categories);
  const ids = new Set();
  for (const m of cat.metrics) {
    if (ids.has(m.metric_id)) errors.push(`duplicate metric_id ${m.metric_id}`);
    ids.add(m.metric_id);
    if (!m.source_system) errors.push(`${m.metric_id}: missing source_system`);
    if (!Array.isArray(m.source_fields) || !m.source_fields.length) errors.push(`${m.metric_id}: missing source_fields`);
    if (!cats.has(m.category)) errors.push(`${m.metric_id}: unknown category ${m.category}`);
  }
  return errors;
}

// Glossary integrity: each term has owner_system + included + excluded + common_confusion.
export function validateGlossary(g = glossary()) {
  const errors = [];
  for (const t of g.terms) {
    for (const f of ['owner_system', 'included', 'excluded', 'common_confusion']) {
      if (!t[f]) errors.push(`term ${t.term}: missing ${f}`);
    }
  }
  return errors;
}

// Event taxonomy integrity: versioned, no emitter declared.
export function validateEventTaxonomy(e = eventTaxonomy()) {
  const errors = [];
  if (e.emitter_status !== 'NONE_CREATED') errors.push('event taxonomy must not declare an emitter');
  for (const [dom, spec] of Object.entries(e.domains)) {
    if (!spec.producer) errors.push(`domain ${dom}: missing producer`);
    for (const ev of spec.events) {
      if (!ev.version) errors.push(`event ${ev.event_id}: missing version`);
      if (!Array.isArray(ev.key_fields) || !ev.key_fields.length) errors.push(`event ${ev.event_id}: missing key_fields`);
    }
  }
  return errors;
}

// Contract compatibility: a candidate schema vs the registered contract.
// Additive (new fields) is backward-compatible; removed/renamed fields are breaking.
export function checkCompatibility(contract, candidateFields) {
  const have = new Set(candidateFields);
  const removed = contract.fields.filter((f) => !have.has(f));
  const added = candidateFields.filter((f) => !contract.fields.includes(f));
  return {
    dataset: contract.dataset,
    compatible: removed.length === 0,
    breaking: removed.length > 0,
    removed_fields: removed,
    added_fields: added,
    change_type: removed.length ? 'BREAKING' : (added.length ? 'ADDITIVE' : 'NONE'),
  };
}

// Validate all contracts are well-formed.
export function validateContracts(dc = dataContracts()) {
  const errors = [];
  const seen = new Set();
  for (const c of dc.contracts) {
    if (seen.has(c.dataset)) errors.push(`duplicate dataset ${c.dataset}`);
    seen.add(c.dataset);
    for (const f of ['producer', 'consumer', 'schema_version', 'fields', 'freshness', 'retention', 'breaking_change_policy']) {
      if (c[f] === undefined) errors.push(`${c.dataset}: missing ${f}`);
    }
  }
  return errors;
}
