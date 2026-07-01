// tools/executive_os/lib/goals.mjs
// Phase 5: Strategic Goal Hierarchy. VISION->ANNUAL->QUARTERLY->MONTHLY->WEEKLY->DAILY.
// Detects goal without metric/owner, conflicts, duplicates, unsupported targets, too many priorities.
import { validate } from '../../revenue_os/lib/schema.mjs';
import { StrategicObjectiveSchema } from '../schemas/domain.mjs';

export const LEVELS = ['VISION', 'ANNUAL', 'QUARTERLY', 'MONTHLY', 'WEEKLY', 'DAILY'];

// objectives: [StrategicObjective], with parent_id linking upward.
export function validateHierarchy(objectives) {
  const errors = [];
  const warnings = [];
  const byId = Object.fromEntries(objectives.map((o) => [o.objective_id, o]));

  for (const o of objectives) {
    const shape = validate(o, StrategicObjectiveSchema, o.objective_id);
    if (!shape.ok) errors.push(...shape.errors);
    if (!o.metric_ids || o.metric_ids.length === 0) errors.push(`${o.objective_id}: goal without metric (activity-only)`);
    if (!o.owner) errors.push(`${o.objective_id}: goal without owner`);
    // Upward link (except VISION).
    if (o.time_horizon !== 'VISION') {
      if (!o.parent_id) warnings.push(`${o.objective_id}: no upward link (parent)`);
      else if (!byId[o.parent_id]) errors.push(`${o.objective_id}: parent ${o.parent_id} missing`);
    }
    // Unsupported target: target that is OWNER_TARGET/UNKNOWN with status ACTIVE.
    if (o.status === 'ACTIVE' && (o.source_status === 'UNKNOWN' || o.source_status === 'OWNER_DECISION_REQUIRED')) {
      warnings.push(`${o.objective_id}: ACTIVE but source_status ${o.source_status} (target not confirmed)`);
    }
  }
  // Duplicate goals (same name+horizon).
  const seen = new Map();
  for (const o of objectives) {
    const k = `${o.time_horizon}::${(o.name || '').toLowerCase()}`;
    if (seen.has(k)) errors.push(`${o.objective_id}: duplicate goal of ${seen.get(k)}`);
    else seen.set(k, o.objective_id);
  }
  // Too many active priorities at a level (>3 P0/P1 active).
  const activeTop = objectives.filter((o) => o.status === 'ACTIVE' && ['P0', 'P1'].includes(o.priority));
  if (activeTop.length > 3) warnings.push(`too many active P0/P1 objectives (${activeTop.length} > 3) — focus risk`);
  // Conflicting goals (same horizon, opposing keywords pause vs grow).
  const grow = objectives.filter((o) => /grow|scale|increase|expand/i.test(o.name));
  const pause = objectives.filter((o) => /pause|freeze|hold|stop/i.test(o.name));
  for (const g of grow) for (const p of pause) if (g.time_horizon === p.time_horizon && g.status === 'ACTIVE' && p.status === 'ACTIVE') {
    warnings.push(`possible conflict: "${g.name}" vs "${p.name}" both active at ${g.time_horizon}`);
  }

  return { ok: errors.length === 0, errors, warnings, total: objectives.length, levels: [...new Set(objectives.map((o) => o.time_horizon))] };
}
