// tools/product_os/lib/components.mjs
// Phase 24-25: Reusable Component Library + Template System.

export const COMPONENTS = [
  { id: 'evidence_collector', used_by: ['mini_audit', 'full_business_audit', 'digital_presence_check'], source: 'revenue_os/lib/evidence.mjs' },
  { id: 'audit_framework', used_by: ['mini_audit', 'full_business_audit'], source: 'revenue_os/data/audit_taxonomy.json' },
  { id: 'finding_taxonomy', used_by: ['mini_audit', 'full_business_audit', 'funnel_audit'], source: 'revenue_os/data/audit_taxonomy.json' },
  { id: 'proposal_blocks', used_by: ['mini_audit', 'business_website', 'landing_sprint'], source: 'revenue_os/lib/proposal.mjs' },
  { id: 'kickoff_blocks', used_by: ['business_website', 'landing_sprint', 'start_page_sprint'], source: 'delivery_os/lib/kickoff.mjs' },
  { id: 'qa_checks', used_by: ['all'], source: 'delivery_os/lib/qa.mjs' },
  { id: 'acceptance_criteria', used_by: ['all'], source: 'delivery_os/lib/acceptance.mjs' },
  { id: 'website_sections', used_by: ['landing_sprint', 'start_page_sprint', 'business_website'], source: 'delivery_os playbooks' },
  { id: 'analytics_setup', used_by: ['landing_sprint', 'business_website'], source: 'delivery_os playbooks' },
  { id: 'form_patterns', used_by: ['landing_sprint', 'start_page_sprint', 'business_website', 'lead_system'], source: 'delivery_os playbooks' },
  { id: 'risk_templates', used_by: ['all'], source: 'delivery_os/data/risk_taxonomy.json' },
  { id: 'onboarding_inputs', used_by: ['all build products'], source: 'delivery_os/data/client_inputs_catalog.json' },
];

export const TEMPLATES = [
  'product_specification', 'scope', 'price_record', 'offer', 'proposal', 'delivery_plan',
  'milestone_plan', 'qa', 'acceptance', 'pilot', 'readiness_assessment', 'case_study', 'owner_decision_packet',
];

export function componentRegistry() {
  // Reuse score: components used by many products = high reuse leverage.
  return COMPONENTS.map((c) => ({ ...c, reuse_count: c.used_by.includes('all') ? 'all' : c.used_by.length }));
}

export function templateSystem() {
  return { count: TEMPLATES.length, templates: TEMPLATES, parameterized: true, note: 'One parameterized template system; no per-project copies.' };
}

// A template is rendered by id + product params (no per-project duplication).
export function renderTemplate(templateId, params = {}) {
  if (!TEMPLATES.includes(templateId)) return { ok: false, error: `unknown template ${templateId}` };
  return { ok: true, template: templateId, params, label: 'PARAMETERIZED', note: 'Single source template, parameterized by product.' };
}
