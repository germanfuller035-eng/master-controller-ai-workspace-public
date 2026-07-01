// tools/product_os/lib/versioning.mjs
// Phase 26-27: Product Versioning + Change Control. No retroactive rewriting, no auto-approval.

// Changes that require a NEW product version.
export const VERSION_TRIGGERS = ['price_change', 'scope_change', 'deliverable_change', 'timeline_change', 'acceptance_change', 'major_risk_change', 'channel_change', 'integration_change'];

// Parse a date-based version YYYY.MM.N or semantic.
export function nextVersion(current, changeType) {
  const requiresNew = VERSION_TRIGGERS.includes(changeType);
  if (!requiresNew) return { new_version: current, version_bump: false, reason: 'non-versioning change' };
  // Semantic bump: major for scope/deliverable/price/acceptance; minor otherwise.
  const major = ['price_change', 'scope_change', 'deliverable_change', 'acceptance_change'].includes(changeType);
  const m = String(current || '1.0').match(/^(\d+)\.(\d+)$/);
  let nv;
  if (m) nv = major ? `${parseInt(m[1]) + 1}.0` : `${m[1]}.${parseInt(m[2]) + 1}`;
  else nv = '1.1';
  return { new_version: nv, version_bump: true, bump_type: major ? 'major' : 'minor', supersedes: current, reason: `${changeType} requires new version` };
}

// Change control: evaluate a change request. Never auto-approves.
export function evaluateChange(req) {
  const errors = [];
  if (!req.product_id) errors.push('missing product_id');
  if (!req.proposed_change) errors.push('missing proposed_change');
  const versioning = nextVersion(req.current_version || '1.0', req.change_type || 'other');
  return {
    ok: errors.length === 0, errors,
    change: {
      product_id: req.product_id, current_version: req.current_version || '1.0',
      proposed_change: req.proposed_change, reason: req.reason || null, source: req.source || 'product_os',
      commercial_impact: req.commercial_impact || 'unknown', delivery_impact: req.delivery_impact || 'unknown',
      financial_impact: req.financial_impact || 'unknown', risk_impact: req.risk_impact || 'unknown',
      version_result: versioning,
      decision: 'PENDING', owner_approval: false,
    },
    note: 'No automatic approval. No retroactive rewriting. Owner decides.',
  };
}
