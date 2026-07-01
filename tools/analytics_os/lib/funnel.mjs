// tools/analytics_os/lib/funnel.mjs
// Read-only funnel CONVERSION VIEW over an EXISTING funnel definition.
// Does NOT define a new funnel — funnel_ref points at the canonical Revenue OS funnel.
import { round4, pct } from './common.mjs';

// Build a derived conversion view from an ordered list of {name,count} stages.
export function funnelView(funnelRef, stages) {
  if (!Array.isArray(stages) || stages.length === 0) {
    return { funnel_ref: funnelRef, stages: [], overall_conversion: null, status: 'MISSING_DATA' };
  }
  const top = stages[0].count;
  let prev = top;
  const out = stages.map((s, i) => {
    const conv_from_top = pct(s.count, top);
    const conv_from_prev = i === 0 ? 1 : pct(s.count, prev);
    const drop_from_prev = i === 0 ? 0 : round4(1 - (conv_from_prev ?? 0));
    prev = s.count;
    return { stage: s.name, count: s.count, conv_from_top, conv_from_prev, drop_from_prev };
  });
  const bottom = stages[stages.length - 1].count;
  return {
    funnel_ref: funnelRef,
    stages: out,
    overall_conversion: pct(bottom, top),
    biggest_drop_stage: biggestDrop(out),
    status: 'MODEL_ESTIMATE',
  };
}

// Identify the stage with the largest proportional drop from the previous stage.
function biggestDrop(viewStages) {
  let worst = null;
  for (let i = 1; i < viewStages.length; i++) {
    const d = viewStages[i].drop_from_prev ?? 0;
    if (!worst || d > worst.drop) worst = { stage: viewStages[i].stage, drop: d };
  }
  return worst;
}
