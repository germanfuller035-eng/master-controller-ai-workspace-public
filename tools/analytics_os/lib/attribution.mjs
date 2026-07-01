// tools/analytics_os/lib/attribution.mjs
// Transparent attribution framework (Phase 13). Read-only, limitation-aware.
// attribution != causation. No forced allocation when touchpoints are incomplete.
import { round4 } from './common.mjs';

export const MODELS = ['first_touch', 'last_touch', 'linear', 'position_based', 'unknown'];

// Attribute credit for a conversion across an ordered touchpoint list.
// Each touchpoint: { channel, ts_order }. Returns weights summing to 1 (or limitation).
export function attribute(touchpoints, model = 'linear') {
  if (!Array.isArray(touchpoints) || touchpoints.length === 0) {
    return { model, allocations: [], total_weight: 0, limitation: 'NO_TOUCHPOINTS', causation_disclaimer: true };
  }
  const incomplete = touchpoints.some((t) => !t.channel);
  if (incomplete) {
    return { model: 'unknown', allocations: [], total_weight: 0, limitation: 'INCOMPLETE_TOUCHPOINTS', causation_disclaimer: true };
  }
  const n = touchpoints.length;
  let weights;
  switch (model) {
    case 'first_touch': weights = touchpoints.map((_, i) => (i === 0 ? 1 : 0)); break;
    case 'last_touch': weights = touchpoints.map((_, i) => (i === n - 1 ? 1 : 0)); break;
    case 'position_based':
      if (n === 1) weights = [1];
      else if (n === 2) weights = [0.5, 0.5];
      else { weights = touchpoints.map(() => 0.2 / (n - 2)); weights[0] = 0.4; weights[n - 1] = 0.4; }
      break;
    case 'linear': default: weights = touchpoints.map(() => 1 / n); break;
  }
  return {
    model,
    allocations: touchpoints.map((t, i) => ({ channel: t.channel, weight: round4(weights[i]) })),
    total_weight: round4(weights.reduce((a, b) => a + b, 0)),
    limitation: null,
    causation_disclaimer: true,
    note: 'Attribution reflects correlation of touchpoints with conversion, NOT proven causation.',
  };
}

// Compare models side-by-side for transparency (never picks a "true" model).
export function compareModels(touchpoints) {
  return MODELS.filter((m) => m !== 'unknown').map((m) => attribute(touchpoints, m));
}
