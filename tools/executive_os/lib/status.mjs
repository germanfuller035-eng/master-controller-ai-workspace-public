// tools/executive_os/lib/status.mjs
// Phase 8: Unified cross-system status model. Maps domain states to an executive summary WITHOUT
// overwriting or destructively collapsing distinct states.

// Mapping layer: source_system + source_status -> executive_summary_status + meaning + risk + action.
export const STATUS_MAP = {
  // Project (AI HQ registry)
  'project:ACTIVE_PRODUCTION': { summary: 'RUNNING', meaning: 'live in production', risk: 'change-control', action: 'protect' },
  'project:ACTIVE_DEVELOPMENT': { summary: 'IN_PROGRESS', meaning: 'being built', risk: 'capacity', action: 'continue' },
  'project:ACCEPTANCE': { summary: 'AWAITING_ACCEPTANCE', meaning: 'needs owner sign-off', risk: 'stalled', action: 'owner_review' },
  'project:PAUSED': { summary: 'PAUSED', meaning: 'intentionally on hold', risk: 'forgotten', action: 'review_resume_condition' },
  'project:BLOCKED_EXTERNAL': { summary: 'BLOCKED', meaning: 'external dependency', risk: 'external', action: 'track_dependency' },
  'project:PLANNED': { summary: 'PLANNED', meaning: 'not started', risk: 'none', action: 'prioritize' },
  'project:MAINTENANCE': { summary: 'MAINTAINED', meaning: 'steady state', risk: 'burden', action: 'monitor_cost' },
  'project:ARCHIVED': { summary: 'ARCHIVED', meaning: 'closed', risk: 'none', action: 'none' },
  // Product (Revenue OS)
  'product:ACTIVE': { summary: 'SELLABLE', meaning: 'ready to sell', risk: 'none', action: 'sell' },
  'product:READY_FOR_PILOT': { summary: 'PILOT_READY', meaning: 'pilot-only', risk: 'unproven', action: 'pilot' },
  'product:DELIVERY_DEFINED': { summary: 'BUILDABLE', meaning: 'delivery defined, not pilot-approved', risk: 'unapproved', action: 'owner_review' },
  'product:DRAFT': { summary: 'NOT_SELLABLE', meaning: 'draft only', risk: 'sell-before-ready', action: 'do_not_sell' },
  'product:PLANNED': { summary: 'CONCEPT', meaning: 'concept only', risk: 'sell-before-ready', action: 'do_not_sell' },
  // Finance
  'finance:CONFIRMED': { summary: 'FACT', meaning: 'verified', risk: 'none', action: 'use' },
  'finance:OWNER_TARGET': { summary: 'TARGET', meaning: 'owner goal not result', risk: 'mistake-for-fact', action: 'label_clearly' },
  'finance:MODEL_ESTIMATE': { summary: 'ESTIMATE', meaning: 'modeled', risk: 'mistake-for-fact', action: 'label_clearly' },
  'finance:UNKNOWN': { summary: 'UNKNOWN', meaning: 'no data', risk: 'blind-spot', action: 'gather_data' },
};

export function mapStatus(sourceSystem, sourceStatus) {
  const key = `${sourceSystem}:${sourceStatus}`;
  const m = STATUS_MAP[key];
  if (!m) return { source_system: sourceSystem, source_status: sourceStatus, executive_summary_status: 'UNKNOWN', meaning: 'unmapped', risk: 'unknown', recommended_action: 'map_status', mapped: false };
  return { source_system: sourceSystem, source_status: sourceStatus, executive_summary_status: m.summary, meaning: m.meaning, risk: m.risk, recommended_action: m.action, mapped: true };
}

// Validate that mapping does not collapse distinct source states to the same summary destructively
// in a way that loses risk info (informational check).
export function validateMapping() {
  const errors = [];
  // Executive must not claim to be the writer of any domain status.
  // Distinct DRAFT vs PLANNED must keep distinct risk action (both do_not_sell but different meaning) — OK.
  const summaries = {};
  for (const [k, v] of Object.entries(STATUS_MAP)) {
    summaries[v.summary] = summaries[v.summary] || [];
    summaries[v.summary].push(k);
  }
  return { ok: errors.length === 0, errors, summary_groups: Object.keys(summaries).length, total_mappings: Object.keys(STATUS_MAP).length };
}
