#!/usr/bin/env node
// tools/customer_success_os/tests/success.test.mjs
// Phase 50: Comprehensive offline test suite for Customer Success OS. Deterministic. Real exit code.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from '../../revenue_os/lib/schema.mjs';
import { SCHEMAS } from '../schemas/domain.mjs';
import { validateTransition } from '../lib/lifecycle.mjs';
import { buildHandoff, miniAuditHierarchy } from '../lib/handoff.mjs';
import { buildOnboarding, buildSuccessPlan, assessAdoption, allowedOutcomes } from '../lib/success.mjs';
import { computeHealth, buildRisks } from '../lib/health.mjs';
import { triage, classifyBoundary, slaModel } from '../lib/support.mjs';
import { incidentTransition, evaluateKnownIssue, buildKbArticle, buildSupportDraft } from '../lib/incidents.mjs';
import { recordFeedback, interpretSatisfaction, valueReview } from '../lib/feedback.mjs';
import { renewalAssessment, expansionAssessment, classifyChurn, customerProfitability } from '../lib/lifecycle_commercial.mjs';
import { evaluatePermission, permissionAllows, caseHandoff } from '../lib/permissions.mjs';
import { buildPortfolio, dashboard, ownerCommandCenter, feedbackLoop, playbook } from '../lib/portfolio.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const customers = JSON.parse(readFileSync(path.join(ROOT, 'fixtures/customers.json'), 'utf8')).customers;
const cust = (id) => customers.find((c) => c.customer_ref_id === id);

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) pass++; else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };

// Lifecycle
ok('lifecycle: valid transition', validateTransition('HANDOFF_PENDING', 'ONBOARDING').ok);
ok('lifecycle: invalid transition', !validateTransition('HANDOFF_PENDING', 'HEALTHY').ok);
ok('lifecycle: onboarding before accept blocked', !validateTransition('HANDOFF_PENDING', 'ONBOARDING', { accepted: false }).ok);
ok('lifecycle: HEALTHY from payment blocked', !validateTransition('VALUE_REVIEW', 'HEALTHY', { healthFromPaymentOnly: true }).ok);
ok('lifecycle: closed with open support blocked', !validateTransition('RENEWAL_REVIEW', 'CLOSED', { unresolvedContractualSupport: true }).ok);
// Handoff
ok('handoff: accepted project ok', buildHandoff({ project_id: 'p', accepted: true, acceptance_evidence: 'e', support_terms: '30d', customer_actions: ['a'], owner: 'o', product_version: '1.0' }).ok);
ok('handoff: missing acceptance blocked', !buildHandoff({ project_id: 'p', accepted: false }).ok);
ok('handoff: critical defect blocked', !buildHandoff({ project_id: 'p', accepted: true, acceptance_evidence: 'e', support_terms: 's', customer_actions: ['a'], owner: 'o', product_version: '1', critical_defect_open: true }).ok);
ok('handoff: send false', buildHandoff({ project_id: 'p', accepted: true, acceptance_evidence: 'e', support_terms: 's', customer_actions: ['a'], owner: 'o', product_version: '1' }).handoff.send_allowed === false);
// Mini audit reconciliation
ok('mini audit: 5 macro-phases', miniAuditHierarchy().summary.macro_phases === 5);
ok('mini audit: detailed stages > macro', miniAuditHierarchy().summary.detailed_stages_total > 5);
// Schema
ok('schema: customer_ref valid', validate({ customer_ref_id: 'TEST_c', canonical_lead_id: null, project_ids: ['p'], product_ids: ['mini_audit'], status: 'ONBOARDING', owner: 'o', revision: 1, test_only: true }, SCHEMAS.customer_ref).ok);
// Onboarding / plan / outcomes / adoption
ok('onboarding: internal draft', buildOnboarding('c', 'mini_audit').onboarding.status === 'INTERNAL_DRAFT');
ok('onboarding: planned spec-only', buildOnboarding('c', 'lead_system').onboarding.specification_only === true);
ok('outcomes: mini_audit prohibits growth', allowedOutcomes('mini_audit').prohibited.includes('revenue increased'));
ok('plan: no-value-risk no baseline', buildSuccessPlan({ customer_ref_id: 'c', product_id: 'mini_audit' }).plan.no_value_risk === true);
ok('adoption: unknown default', assessAdoption({ customer_ref_id: 'c', product_id: 'mini_audit', observed: {} }).adoption_level === 0);
// Health
ok('health: critical incident', computeHealth({ unresolved_critical_incident: true, dimensions: {} }).status === 'CRITICAL');
ok('health: all unknown -> UNKNOWN', computeHealth({ dimensions: {} }).status === 'UNKNOWN');
ok('health: payment-bad flagged not dissatisfaction', computeHealth({ dimensions: { payment_status: 'bad', adoption: 'good', outcome_progress: 'good', engagement: 'good', support_load: 'good', open_risks: 'good', product_fit: 'good', delivery_satisfaction: 'good', owner_capacity: 'good', customer_dependency: 'good' } }).risk_flags.some((f) => /commercial only/.test(f)));
ok('health: unknown not high-conf HEALTHY', computeHealth({ dimensions: { adoption: 'good' } }).status !== 'HEALTHY');
ok('risk: critical severity', buildRisks('c', [{ category: 'no_adoption', probability: 'high', impact: 'high' }])[0].severity === 'CRITICAL');
// Support / triage / boundary / SLA
ok('triage: security auto-resolve blocked', triage({ support_request_id: 't', customer_ref_id: 'c', product_id: 'business_website', category: 'security', description: 'breach' }).auto_resolve_blocked === true);
ok('triage: outage SEV1', triage({ support_request_id: 't', customer_ref_id: 'c', product_id: 'business_website', category: 'outage', description: 'down' }).severity === 'SEV1_CRITICAL');
ok('triage: change-request detected', triage({ support_request_id: 't', customer_ref_id: 'c', product_id: 'business_website', category: 'other', description: 'можно добавить раздел' }).kind === 'change_request');
ok('triage: duplicate flagged', triage({ support_request_id: 't', customer_ref_id: 'c', product_id: 'x', dedupe_hash: 'h' }, { seenHashes: ['h'] }).flags.includes('duplicate_ticket'));
ok('boundary: unknown owner review', classifyBoundary({ category: 'other', description: 'q' }, 'business_website').owner_review_required === true);
ok('sla: 24/7 no coverage blocked', !slaModel({ implies_247: true, has_247_coverage: false, severity_defined: true, support_window: '9-18' }).ok);
ok('sla: third-party resolution blocked', !slaModel({ resolution_target: '1d', third_party_dependency: true, severity_defined: true, support_window: '9-18' }).ok);
ok('sla: default internal target', slaModel({ severity_defined: true, support_window: '9-18' }).status === 'INTERNAL_TARGET');
// Incidents / known issues / KB / drafts
ok('incident: valid transition', incidentTransition('DETECTED', 'TRIAGED').ok);
ok('incident: invalid transition', !incidentTransition('DETECTED', 'CLOSED').ok);
ok('known issue: fixed without version blocked', !evaluateKnownIssue({ issue_id: 'k', fixed: true }).ok);
ok('known issue: hidden critical blocked', !evaluateKnownIssue({ issue_id: 'k', severity: 'SEV1_CRITICAL', hidden: true }).ok);
ok('kb: customer-ready needs owner', buildKbArticle('faq', 'mini_audit', { requested: 'CUSTOMER_READY', owner_approved: false }).article.status === 'INTERNAL_REVIEW');
ok('kb: no publish', buildKbArticle('faq', 'mini_audit').article.publish_allowed === false);
ok('draft: ack no send', buildSupportDraft({ support_request_id: 't', type: 'acknowledgement' }).draft.send_allowed === false);
ok('draft: resolution without evidence flagged', buildSupportDraft({ support_request_id: 't', type: 'resolution' }).risk_flags.includes('resolution_without_evidence'));
// Feedback / value
ok('feedback: complaint follow-up', recordFeedback({ feedback_id: 'f', customer_ref_id: 'c', type: 'complaint' }).feedback.follow_up_required === true);
ok('satisfaction: no-response UNKNOWN', /UNKNOWN/.test(interpretSatisfaction([]).interpretation));
ok('value: blocked by adoption', valueReview({ outcomes: [{ status: 'ACHIEVED', confirmed_by_customer: true }], adoption_level: 10 }).verdict === 'value_blocked_by_adoption');
ok('value: no fabricated ROI note', /No fabricated ROI/.test(valueReview({ outcomes: [] }).note));
// Renewal / expansion / churn / profitability
ok('renewal: critical incident -> DO_NOT_RENEW', renewalAssessment({ product_id: 'growth_support', support_period_ending: true, unresolved_critical_incident: true, communication_permission: true }).recommended_action === 'DO_NOT_RENEW');
ok('renewal: one-time NOT_APPLICABLE', renewalAssessment({ product_id: 'mini_audit' }).recommended_action === 'NOT_APPLICABLE');
ok('expansion: opt-out blocked', expansionAssessment({ opted_out: true, candidate_product: 'x' }).eligible === false);
ok('expansion: eligible with evidence', expansionAssessment({ customer_need_evidence: true, current_product_adopted: true, candidate_ready: true, financially_viable: true }).eligible === true);
ok('churn: no source blocked', !classifyChurn({ churn_id: 'c', customer_ref_id: 'c', reason: 'budget' }).ok);
ok('churn: product_mismatch routes lessons', classifyChurn({ churn_id: 'c', customer_ref_id: 'c', reason: 'product_mismatch', source: 'exit' }).churn.lessons_for.product_os === true);
ok('profitability: modeled not confirmed', customerProfitability({ customer_ref_id: 'c', revenue: 10000, support_cost: 3000, cost_status: 'modeled' }).confidence === 'modeled');
// Permissions / case
ok('permission: inferred blocked', !evaluatePermission({ permission_type: 'testimonial', status: 'GRANTED', inferred_from_feedback: true }).ok);
ok('permission: granted without evidence blocked', !evaluatePermission({ permission_type: 'public_case', status: 'GRANTED' }).ok);
ok('permission: logo without permission blocked', !permissionAllows('logo_use', []).ok);
ok('permission: referral after complaint blocked', !permissionAllows('referral_request', [{ permission_type: 'referral_request', status: 'GRANTED', evidence: 'x' }], { recent_complaint: true }).ok);
ok('case: synthetic-labelled-real blocked', !caseHandoff({ project_accepted: true, evidence: 'e', permission_granted: true, synthetic: true, labelled_real: true }).ok);
ok('case: no auto publish', caseHandoff({ project_accepted: true, evidence: 'e', permission_granted: true }).case.publish_allowed === false);
// Portfolio / dashboards / feedback loop / playbooks
ok('portfolio: synthetic label', /TEST_ONLY/.test(buildPortfolio(customers).label));
ok('portfolio: 24 customers', buildPortfolio(customers).total === 24);
ok('dashboard: no duplicate note', /does NOT duplicate/i.test(dashboard(customers).note));
ok('dashboard: critical detected', dashboard(customers).critical.length >= 1);
ok('OCC: primary action', !!ownerCommandCenter(customers).primary_customer_action);
ok('feedback loop: proposals only', /PROPOSALS_ONLY/.test(feedbackLoop({}).label));
ok('playbook: mini_audit success-is-not', playbook('mini_audit').success_is_not.includes('guaranteed revenue'));
ok('playbook: lead_system spec-only PLANNED', playbook('lead_system').spec_only === true && playbook('lead_system').keep_status === 'PLANNED');

console.log(`\n[success.test] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
