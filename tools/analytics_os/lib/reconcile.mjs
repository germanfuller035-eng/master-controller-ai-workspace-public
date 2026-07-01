// tools/analytics_os/lib/reconcile.mjs
// Cross-system reconciliation engine (Phase 9). Read-only. NO automatic correction.
// Flags inconsistencies across OS boundaries for owner review.

// Each check receives the synthetic cross-system fixture and returns findings (no mutation).
export function reconcile(data) {
  const findings = [];
  const add = (kind, ref, severity, note) => findings.push({ kind, ref, severity, note });

  const deals = data.deals || [];
  const projects = data.projects || [];
  const invoices = data.invoices || [];
  const payments = data.payments || [];
  const customers = data.customers || [];
  const products = data.products || [];
  const dashboardCounts = data.dashboard_counts || {};
  const sourceCounts = data.source_counts || {};

  const projByDeal = new Set(projects.map((p) => p.deal_id));
  const invByProject = new Set(invoices.map((i) => i.project_id));
  const payByInvoice = new Set(payments.map((p) => p.invoice_id));
  const projById = Object.fromEntries(projects.map((p) => [p.project_id, p]));

  // deal WON without Delivery project
  for (const d of deals) if (d.status === 'WON' && !projByDeal.has(d.deal_id)) add('WON_WITHOUT_PROJECT', d.deal_id, 'HIGH', 'won deal has no delivery project');
  // accepted project without invoice
  for (const p of projects) if (p.state === 'ACCEPTED' && !invByProject.has(p.project_id)) add('ACCEPTED_WITHOUT_INVOICE', p.project_id, 'HIGH', 'accepted project not invoiced');
  // paid invoice without payment evidence
  for (const i of invoices) if (i.status === 'PAID' && !payByInvoice.has(i.invoice_id)) add('PAID_WITHOUT_PAYMENT_EVIDENCE', i.invoice_id, 'CRITICAL', 'invoice marked paid without payment record');
  // customer active without accepted project
  for (const c of customers) {
    const hasAccepted = (c.project_ids || []).some((pid) => projById[pid] && projById[pid].state === 'ACCEPTED');
    if (['HEALTHY', 'ADOPTION', 'ACTIVE'].includes(c.status) && !hasAccepted) add('CUSTOMER_ACTIVE_WITHOUT_ACCEPTED_PROJECT', c.customer_ref_id, 'HIGH', 'active customer without accepted project');
    // renewal eligible while critical incident
    if (c.renewal_eligible === true && c.open_critical_support === true) add('RENEWAL_ELIGIBLE_WITH_CRITICAL_INCIDENT', c.customer_ref_id, 'HIGH', 'renewal eligible despite critical incident');
  }
  // product ACTIVE without owner-approved readiness
  for (const p of products) if (p.state === 'ACTIVE' && p.owner_approved_readiness !== true) add('PRODUCT_ACTIVE_WITHOUT_READINESS', p.product_id, 'HIGH', 'product ACTIVE without owner-approved readiness');
  // dashboard count != source count
  for (const [k, v] of Object.entries(dashboardCounts)) if (sourceCounts[k] !== undefined && sourceCounts[k] !== v) add('DASHBOARD_SOURCE_MISMATCH', k, 'MEDIUM', `dashboard=${v} source=${sourceCounts[k]}`);
  // historical sends mixed with release-window sends
  if (data.sends) {
    const mixed = data.sends.filter((s) => s.window === undefined);
    if (mixed.length) add('SENDS_WINDOW_UNCLASSIFIED', `${mixed.length}`, 'MEDIUM', 'sends not classified as historical vs release-window');
    const testInCommercial = data.sends.filter((s) => s.test_only === true && s.in_commercial_funnel === true);
    if (testInCommercial.length) add('TEST_ONLY_IN_COMMERCIAL_FUNNEL', `${testInCommercial.length}`, 'HIGH', 'TEST_ONLY sends counted in commercial funnel');
  }
  // payment confused with profit
  if (data.finance && data.finance.profit_equals_payment === true) add('PAYMENT_CONFUSED_WITH_PROFIT', 'finance', 'HIGH', 'payment/cash reported as profit');

  // Mini Audit macro/detailed stage reconciliation (canonical: 5 macro-phases / 18 detailed stages)
  if (data.mini_audit) {
    const m = data.mini_audit;
    if (m.macro_phases !== 5) add('MINI_AUDIT_MACRO_MISMATCH', 'mini_audit', 'MEDIUM', `macro_phases=${m.macro_phases}, canonical=5`);
    if (m.detailed_stages !== 18) add('MINI_AUDIT_DETAIL_MISMATCH', 'mini_audit', 'MEDIUM', `detailed_stages=${m.detailed_stages}, canonical=18 (5 macro contain ~18 detailed)`);
    if (m.uses_contradictory_legacy_description === true) add('MINI_AUDIT_LEGACY_DESCRIPTION', 'mini_audit', 'LOW', 'uses old contradictory stage description without reconciliation note');
  }

  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
  findings.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));
  return {
    total: findings.length,
    by_severity: findings.reduce((acc, f) => { acc[f.severity] = (acc[f.severity] || 0) + 1; return acc; }, {}),
    auto_correction: false,
    findings,
  };
}
