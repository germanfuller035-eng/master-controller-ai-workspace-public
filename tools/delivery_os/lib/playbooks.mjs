// tools/delivery_os/lib/playbooks.mjs
// Phase 10-14: Playbook loader + Mini Audit delivery factory.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DELIVERY_ROOT } from './common.mjs';
import { planMilestones } from './milestones.mjs';
import { generateTasks } from './tasks.mjs';

let PB = null, ADV = null;
function playbooks() { if (!PB) PB = JSON.parse(readFileSync(path.join(DELIVERY_ROOT, 'data/playbooks.json'), 'utf8')); return PB.playbooks; }
function advanced() { if (!ADV) ADV = JSON.parse(readFileSync(path.join(DELIVERY_ROOT, 'data/advanced_playbooks.json'), 'utf8')); return ADV; }

export function getPlaybook(productId) {
  const p = playbooks()[productId];
  if (p) return p;
  const a = advanced();
  if (a[productId]) return a[productId];
  return null;
}

export function listPlaybooks() {
  const basic = Object.values(playbooks()).map((p) => ({ product_id: p.product_id, readiness: p.readiness, milestones: (p.milestones || []).length }));
  const adv = ['lead_system', 'ai_front_office'].map((k) => ({ product_id: k, readiness: advanced()[k].readiness, type: 'architecture_spec' }));
  return [...basic, ...adv];
}

// Validate a playbook is internally consistent (milestones plan cleanly, tasks generate).
export function validatePlaybook(productId) {
  const pb = getPlaybook(productId);
  if (!pb) return { ok: false, errors: [`no playbook for ${productId}`] };
  const errors = [];
  if (!pb.milestones) {
    // architecture-spec playbook (lead_system / ai_front_office): check mandatory + acceptance tests.
    if (!pb.mandatory_architecture && !pb.mandatory) errors.push('architecture playbook missing mandatory rules');
    if (!pb.acceptance_tests) errors.push('architecture playbook missing acceptance tests');
    return { ok: errors.length === 0, errors, type: 'architecture_spec' };
  }
  const plan = planMilestones({ product_id: productId, milestones: pb.milestones, owner_capacity_days: 30 });
  if (!plan.ok) errors.push(...plan.errors.map((e) => `milestones: ${e}`));
  const tg = generateTasks({ project_id: `pb_${productId}`, milestones: pb.milestones });
  if (!tg.ok) errors.push(...tg.errors.map((e) => `tasks: ${e}`));
  if (!pb.deliverables || pb.deliverables.length === 0) errors.push('no deliverables');
  if (!pb.acceptance || pb.acceptance.length === 0) errors.push('no acceptance criteria');
  return { ok: errors.length === 0, errors, type: 'standard', plan, task_summary: tg.by_agent };
}

// Phase 11: Mini Audit delivery factory — produce a structured (synthetic) delivery package.
export function runMiniAuditDelivery(input) {
  const pb = getPlaybook('mini_audit');
  const evidence = input.evidence || [];
  const findings = input.findings || [];
  const errors = [];

  // Stage checks (synthetic, no real fetch).
  const stages = {
    identity_verified: input.identity_verified === true,
    website_verified: input.website_verified === true,
    contact_verified: input.contact_verified === true,
    evidence_collected: evidence.length > 0,
    findings_generated: findings.length > 0,
    findings_count_ok: findings.length >= 5 && findings.length <= 7,
    no_duplicates: new Set(findings.map((f) => (f.title || '').toLowerCase())).size === findings.length,
    price_correct: input.price === 10000,
  };
  for (const [k, v] of Object.entries(stages)) if (!v) errors.push(`stage failed: ${k}`);

  const sla = pb.sla;
  const deliverables = errors.length === 0 ? {
    audit_summary: `Mini Audit for ${input.client_name || '[client]'}`,
    findings_list: findings,
    evidence_register: evidence,
    priority_matrix: findings.map((f) => ({ title: f.title, severity: f.severity || 'MEDIUM' })),
    recommended_fixes: findings.map((f) => f.fix || 'fix'),
    commercial_next_step: 'Implementation Sprint (soft offer, price on approval)',
    qa_report: { scope_ok: stages.findings_count_ok, evidence_ok: stages.evidence_collected, no_dup: stages.no_duplicates },
  } : null;

  return {
    ok: errors.length === 0,
    errors,
    stages,
    sla,
    deliverables,
    upsell_recommendation: findings.length > 7 ? 'mini_audit_plus or full_business_audit' : 'implementation_sprint',
    send_allowed: false,
    label: errors.length === 0 ? 'INTERNAL_DRAFT' : 'BLOCKED',
  };
}
