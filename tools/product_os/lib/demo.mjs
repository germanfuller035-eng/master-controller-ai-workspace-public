// tools/product_os/lib/demo.mjs
// Phase 18: Demo Asset Factory. INTERNAL_DRAFT default. No real company data. No send/publish.
import { product } from './catalog.mjs';
import { scanAssetForProhibited } from './claims.mjs';

export const ASSET_TYPES = ['product_one_pager', 'sample_report', 'sample_deliverable', 'sample_kickoff', 'sample_dashboard', 'sample_qa', 'sample_acceptance', 'sample_timeline', 'sample_scope', 'sample_risk_report'];

export function buildDemo(productId, assetType, opts = {}) {
  const p = product(productId);
  if (!p) return { ok: false, error: `unknown product ${productId}` };
  if (!ASSET_TYPES.includes(assetType)) return { ok: false, error: `unknown asset type ${assetType}` };

  const content = renderContent(p, assetType);
  // Hard block: prohibited claims in demo.
  const scan = scanAssetForProhibited(JSON.stringify(content));
  const errors = [];
  if (!scan.ok) errors.push(`prohibited claims: ${scan.prohibited_hits.join(',')}`);
  // No real company data: enforce synthetic placeholder.
  const text = JSON.stringify(content);
  if (/@(?!example|demo|test)[a-z0-9.-]+\.(ru|com)/i.test(text)) errors.push('possible real contact in demo');

  // Default INTERNAL_DRAFT; client-demo-ready only with owner approval.
  let status = 'INTERNAL_DRAFT';
  if (opts.requested_status === 'CLIENT_DEMO_READY') status = (opts.owner_approved && errors.length === 0) ? 'CLIENT_DEMO_READY' : 'INTERNAL_REVIEW';
  else if (opts.requested_status === 'OWNER_APPROVED') status = opts.owner_approved ? 'OWNER_APPROVED' : 'INTERNAL_REVIEW';

  return {
    ok: errors.length === 0, errors,
    asset: {
      asset_id: `demo_${productId}_${assetType}`, product_id: productId, asset_type: assetType,
      version: '1.0', status, content, source: 'synthetic (TEST_ONLY)', approved: false, client_ready: status === 'CLIENT_DEMO_READY',
      send_allowed: false, publish_allowed: false,
    },
  };
}

function renderContent(p, type) {
  const base = { product: p.name, client: '[DEMO client — synthetic]' };
  switch (type) {
    case 'product_one_pager': return { ...base, problem: p.target_problem, outcome: p.description, deliverables: p.deliverables, price_status: p.price.status };
    case 'sample_report': case 'sample_deliverable': return { ...base, sections: p.deliverables, note: 'synthetic findings, no real data' };
    case 'sample_scope': return { ...base, included: p.scope_included, excluded: p.scope_excluded };
    case 'sample_qa': return { ...base, checks: ['scope', 'evidence', 'client_language', 'no_growth_promise'] };
    case 'sample_acceptance': return { ...base, criteria: p.acceptance_criteria };
    case 'sample_timeline': return { ...base, timeline: p.delivery_days || 'relative' };
    case 'sample_risk_report': return { ...base, risks: p.risks };
    case 'sample_kickoff': return { ...base, goals: [p.target_problem], scope: p.scope_included };
    case 'sample_dashboard': return { ...base, metrics: ['findings', 'status', 'next_step'] };
    default: return base;
  }
}
