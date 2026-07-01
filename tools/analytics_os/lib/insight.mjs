// tools/analytics_os/lib/insight.mjs
// Insight engine with safety guards (Phase 19). Read-only.
// Blocks: single-point insight, causation-from-correlation, action exceeding evidence,
// any production mutation during freeze.

const CONFIDENCE_LEVELS = ['LOW', 'MEDIUM', 'HIGH'];

// Build a validated insight. Returns { insight, blocks }.
export function buildInsight(raw) {
  const blocks = [];
  const i = {
    insight_id: raw.insight_id,
    statement: raw.statement,
    source_metrics: raw.source_metrics || [],
    evidence: raw.evidence || [],
    confidence: raw.confidence || 'LOW',
    limitations: raw.limitations || [],
    recommended_action: raw.recommended_action || null,
    owner_review_required: true,
  };

  if (i.source_metrics.length === 0) blocks.push('insight has no source metrics');
  if ((raw.data_points ?? 0) < 2) blocks.push('insight from a single data point');
  if (raw.claims_causation === true && raw.has_controlled_experiment !== true) blocks.push('causation claimed from correlation without controlled experiment');
  if (raw.action_mutates_production === true) blocks.push('recommended action would mutate production during freeze');
  if (i.evidence.length === 0) blocks.push('insight has no evidence');
  if (!CONFIDENCE_LEVELS.includes(i.confidence)) blocks.push(`invalid confidence ${i.confidence}`);
  // action must not exceed evidence strength
  if (raw.action_strength === 'AGGRESSIVE' && i.confidence !== 'HIGH') blocks.push('recommended action exceeds evidence confidence');

  i.limitations = [...i.limitations];
  if (raw.claims_causation === true && raw.has_controlled_experiment !== true) i.limitations.push('correlation only — not causation');

  return { insight: i, blocks, valid: blocks.length === 0 };
}
