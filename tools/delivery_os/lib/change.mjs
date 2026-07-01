// tools/delivery_os/lib/change.mjs
// Phase 17: Change Request engine. Detects scope creep. Never auto-approves.
import { readFileSync } from 'node:fs';
import { REVENUE_CATALOG } from './common.mjs';

let CATALOG = null;
function product(id) {
  if (!CATALOG) CATALOG = JSON.parse(readFileSync(REVENUE_CATALOG, 'utf8'));
  return CATALOG.products.find((p) => p.product_id === id) || null;
}

// Scope-creep signals.
const CREEP_RULES = [
  { key: 'new_integration', re: /integrat|api|crm|webhook/i },
  { key: 'new_channel', re: /channel|whatsapp|telegram|email channel/i },
  { key: 'new_language', re: /language|translat|locale/i },
  { key: 'new_product', re: /new product|additional product|another service/i },
  { key: 'new_deadline', re: /faster|sooner|urgent|deadline|by (monday|friday|tomorrow)/i },
  { key: 'infrastructure_change', re: /hosting|server|migrate|infrastructure/i },
];

// request: { project_id, description, reason, requested_by, product_id, scope_included(from product),
//            revision_count, revision_limit, requested_deliverable }
export function evaluateChange(request) {
  const flags = [];
  const text = `${request.description || ''} ${request.reason || ''}`;
  for (const r of CREEP_RULES) if (r.re.test(text)) flags.push(r.key);

  const p = request.product_id ? product(request.product_id) : null;
  const inScope = p ? p.scope_included.map((s) => s.toLowerCase()) : [];

  // Requested deliverable absent from scope.
  if (request.requested_deliverable && p) {
    const present = inScope.some((s) => s.includes(request.requested_deliverable.toLowerCase())) ||
      p.deliverables.some((d) => d.toLowerCase().includes(request.requested_deliverable.toLowerCase()));
    if (!present) flags.push('deliverable_absent_from_scope');
  }
  // Revision limit exceeded.
  if (request.revision_count != null && request.revision_limit != null && request.revision_count >= request.revision_limit) {
    flags.push('revision_limit_exceeded');
  }
  // Client input delay (timeline impact).
  if (/delay|waiting|not provided/i.test(text)) flags.push('client_input_delay');

  // Decision suggestion (NEVER auto-approve; default PENDING).
  let suggested = 'PENDING';
  let scope_impact = flags.length ? 'expands scope' : 'within scope';
  let requires_new_offer = flags.some((f) => ['new_integration', 'new_product', 'deliverable_absent_from_scope', 'new_channel'].includes(f));
  if (requires_new_offer) suggested = 'REQUIRES_NEW_OFFER';

  return {
    change_id: request.change_id || `chg_${request.project_id}_${(request.description || '').slice(0, 8)}`,
    scope_creep_flags: flags,
    scope_impact,
    time_impact: flags.includes('new_deadline') || flags.includes('client_input_delay') ? 'likely' : 'minimal',
    price_impact: requires_new_offer ? 'new offer required' : 'none/minor',
    suggested_decision: suggested,
    decision: 'PENDING',           // actual decision is always owner-set
    approved_by_owner: false,      // never auto-approved
    note: 'Change requests are never auto-approved. Owner decides.',
  };
}
