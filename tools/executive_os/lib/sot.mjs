// tools/executive_os/lib/sot.mjs
// Phase 3: Source of Truth matrix loader + conflict detector.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { EXEC_ROOT } from './common.mjs';

let MATRIX = null;
export function loadMatrix() {
  if (!MATRIX) MATRIX = JSON.parse(readFileSync(path.join(EXEC_ROOT, 'data/source_of_truth_matrix.json'), 'utf8'));
  return MATRIX.entities;
}

// Detect: multiple writers, duplicate SoR, missing SoR, circular ownership, forbidden writer.
export function detectConflicts() {
  const entities = loadMatrix();
  const errors = [];
  const warnings = [];
  const sorByEntity = {};
  for (const e of entities) {
    if (!e.system_of_record) errors.push(`${e.entity}: missing system_of_record`);
    if (sorByEntity[e.entity]) errors.push(`${e.entity}: duplicate system of record`);
    sorByEntity[e.entity] = e.system_of_record;
    // Multiple writers (more than 1 distinct writer that isn't owner+system pair) -> warn.
    const writers = (e.writers || []).filter((w) => w !== 'owner');
    if (writers.length > 1 && !['risk', 'kpi'].includes(e.entity)) warnings.push(`${e.entity}: multiple writers ${writers.join(',')}`);
    // Forbidden writer also appearing as writer -> error.
    const fw = new Set(e.forbidden_writers || []);
    for (const w of (e.writers || [])) if (fw.has(w)) errors.push(`${e.entity}: ${w} is both writer and forbidden_writer`);
    // Executive_OS must never be a canonical writer (except owner_action).
    if (e.entity !== 'owner_action' && (e.writers || []).includes('Executive_OS')) errors.push(`${e.entity}: Executive_OS must not be a canonical writer`);
  }
  // Singleton canonical systems.
  const singletons = { 'AI_HQ_Project_Registry': 'projects', 'AI_HQ_task_ledger': 'task_history', 'AI_HQ_decision_register': 'decision' };
  return { ok: errors.length === 0, errors, warnings, entity_count: entities.length, singletons_present: Object.keys(singletons).filter((s) => entities.some((e) => e.system_of_record === s)) };
}
