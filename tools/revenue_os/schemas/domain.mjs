// tools/revenue_os/schemas/domain.mjs
// Machine-readable Revenue OS domain model (Phase 3). Schemas consumed by validators.
import {
  PRODUCT_STATUS, MATURITY, PRICE_STATUS, PRICE_TYPE, CLAIM_TYPE, SEVERITY,
  APPROVAL_STATE, DEAL_STAGES,
} from '../lib/common.mjs';

export const PriceSchema = {
  type: 'object',
  properties: {
    amount: { type: ['number', 'null'], nullable: true },
    amount_min: { type: ['number', 'null'], nullable: true },
    amount_max: { type: ['number', 'null'], nullable: true },
    currency: { type: 'string', required: true },
    type: { type: 'string', enum: PRICE_TYPE, required: true },
    source: { type: 'string', enum: PRICE_STATUS, required: true },
    status: { type: 'string', enum: PRICE_STATUS, required: true },
    valid_from: { type: ['string', 'null'], nullable: true },
    valid_until: { type: ['string', 'null'], nullable: true },
    approved_by_owner: { type: 'boolean', required: true },
  },
};

export const ProductSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    product_id: { type: 'string', required: true, pattern: '^[a-z0-9_]+$' },
    name: { type: 'string', required: true },
    client_name: { type: 'string' },
    category: { type: 'string', required: true },
    status: { type: 'string', enum: PRODUCT_STATUS, required: true },
    entry_product: { type: 'boolean', required: true },
    description: { type: 'string', required: true },
    target_problem: { type: 'string', required: true },
    target_customer: { type: 'string', required: true },
    eligibility: { type: 'array', items: { type: 'string' }, required: true },
    disqualifiers: { type: 'array', items: { type: 'string' }, required: true },
    deliverables: { type: 'array', items: { type: 'string' }, required: true },
    evidence_required: { type: 'array', items: { type: 'string' }, required: true },
    scope_included: { type: 'array', items: { type: 'string' }, required: true },
    scope_excluded: { type: 'array', items: { type: 'string' }, required: true },
    acceptance_criteria: { type: 'array', items: { type: 'string' }, required: true },
    price: PriceSchema,
    estimated_hours: { type: ['number', 'null'], nullable: true },
    owner_hours: { type: ['number', 'null'], nullable: true },
    delivery_days: { type: ['string', 'null'], nullable: true },
    automation_level: { type: 'string', enum: ['none', 'low', 'medium', 'high'], required: true },
    implementation_readiness: { type: 'string', enum: PRODUCT_STATUS, required: true },
    dependencies: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' }, required: true },
    upsells: { type: 'array', items: { type: 'string' } },
    downsells: { type: 'array', items: { type: 'string' } },
    next_products: { type: 'array', items: { type: 'string' } },
    approval_required: { type: 'boolean', required: true },
    evidence_in_workspace: { type: 'array', items: { type: 'string' } },
  },
};

export const CustomerProfileSchema = {
  type: 'object',
  properties: {
    profile_id: { type: 'string', required: true },
    industry: { type: 'string', required: true },
    region: { type: 'string' },
    company_size: { type: 'string' },
    digital_maturity: { type: 'string', enum: MATURITY, required: true },
    website_status: { type: 'string' },
    contactability: { type: 'string' },
    decision_maker_status: { type: 'string' },
    pain_signals: { type: 'array', items: { type: 'string' } },
    commercial_signals: { type: 'array', items: { type: 'string' } },
    risk_signals: { type: 'array', items: { type: 'string' } },
    budget_signal: { type: 'string' },
    urgency_signal: { type: 'string' },
    owner_capacity: { type: 'string' },
    evidence: { type: 'array', items: { type: 'object' }, required: true },
  },
};

export const RecommendationSchema = {
  type: 'object',
  properties: {
    recommendation_id: { type: 'string', required: true },
    customer_profile: { type: 'string', required: true },
    primary_product: { type: ['string', 'null'], nullable: true, required: true },
    secondary_product: { type: ['string', 'null'], nullable: true },
    do_not_offer: { type: 'array', items: { type: 'string' } },
    reason_codes: { type: 'array', items: { type: 'string' }, required: true },
    evidence: { type: 'array', items: { type: 'object' } },
    confidence: { type: 'number', min: 0, max: 1, required: true },
    blockers: { type: 'array', items: { type: 'string' } },
    manual_review: { type: 'boolean', required: true },
    price_range: { type: ['string', 'null'], nullable: true },
    recommended_next_action: { type: 'string', required: true },
  },
};

export const EvidenceClaimSchema = {
  type: 'object',
  properties: {
    claim: { type: 'string', required: true },
    claim_type: { type: 'string', enum: CLAIM_TYPE, required: true },
    category: { type: 'string', required: true },
    source_url: { type: ['string', 'null'], nullable: true },
    source_type: { type: 'string', required: true },
    checked_at: { type: ['string', 'null'], nullable: true },
    evidence_excerpt: { type: ['string', 'null'], nullable: true },
    confidence: { type: 'number', min: 0, max: 1, required: true },
    freshness: { type: 'string', enum: ['fresh', 'aging', 'stale', 'unknown'], required: true },
    identity_link: { type: ['string', 'null'], nullable: true },
  },
};

export const FindingSchema = {
  type: 'object',
  properties: {
    finding_id: { type: 'string', required: true },
    category: { type: 'string', required: true },
    title: { type: 'string', required: true },
    severity: { type: 'string', enum: SEVERITY, required: true },
    fact: { type: 'string', required: true },
    evidence: { type: 'array', items: EvidenceClaimSchema, required: true },
    business_implication: { type: 'string', required: true },
    recommended_fix: { type: 'string', required: true },
    effort: { type: 'string', enum: ['low', 'medium', 'high'], required: true },
    confidence: { type: 'number', min: 0, max: 1, required: true },
    eligible_products: { type: 'array', items: { type: 'string' } },
    prohibited_claims: { type: 'array', items: { type: 'string' } },
  },
};

export const OfferSchema = {
  type: 'object',
  properties: {
    offer_id: { type: 'string', required: true },
    lead_reference: { type: ['string', 'null'], nullable: true },
    product_id: { type: 'string', required: true },
    problem_statement: { type: 'string', required: true },
    evidence_summary: { type: 'array', items: { type: 'object' }, required: true },
    deliverables: { type: 'array', items: { type: 'string' }, required: true },
    timeline: { type: 'string', required: true },
    price: PriceSchema,
    assumptions: { type: 'array', items: { type: 'string' }, required: true },
    exclusions: { type: 'array', items: { type: 'string' }, required: true },
    client_inputs: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    validity_period: { type: 'string', required: true },
    approval_state: { type: 'string', enum: APPROVAL_STATE, required: true },
    send_allowed: { type: 'boolean', required: true },
  },
};

export const DealSchema = {
  type: 'object',
  properties: {
    deal_id: { type: 'string', required: true },
    canonical_lead_id: { type: ['string', 'null'], nullable: true, required: true },
    product_id: { type: 'string', required: true },
    stage: { type: 'string', enum: DEAL_STAGES, required: true },
    value: { type: ['number', 'null'], nullable: true },
    probability: { type: 'number', min: 0, max: 1 },
    expected_close_date: { type: ['string', 'null'], nullable: true },
    owner: { type: 'string' },
    blocker: { type: ['string', 'null'], nullable: true },
    next_action: { type: 'string', required: true },
    source: { type: 'string', required: true },
    revision: { type: 'number', required: true },
    test_only: { type: 'boolean', required: true },
  },
};

export const ProjectHandoffSchema = {
  type: 'object',
  properties: {
    handoff_id: { type: 'string', required: true },
    deal_id: { type: 'string', required: true },
    product_id: { type: 'string', required: true },
    scope: { type: 'array', items: { type: 'string' }, required: true },
    deliverables: { type: 'array', items: { type: 'string' }, required: true },
    acceptance_criteria: { type: 'array', items: { type: 'string' }, required: true },
    timeline: { type: 'string', required: true },
    inputs_required: { type: 'array', items: { type: 'string' }, required: true },
    dependencies: { type: 'array', items: { type: 'string' } },
    risk_register: { type: 'array', items: { type: 'string' }, required: true },
    communication_plan: { type: 'string', required: true },
    payment_terms: { type: 'string', required: true },
    test_only: { type: 'boolean', required: true },
  },
};

export const RevenueEventSchema = {
  type: 'object',
  properties: {
    event_id: { type: 'string', required: true },
    deal_id: { type: 'string', required: true },
    type: { type: 'string', enum: ['confirmed', 'invoiced', 'paid', 'outstanding', 'target', 'forecast', 'estimate'], required: true },
    amount: { type: 'number', required: true },
    currency: { type: 'string', required: true },
    date: { type: ['string', 'null'], nullable: true },
    evidence: { type: ['string', 'null'], nullable: true },
    confirmed: { type: 'boolean', required: true },
    test_only: { type: 'boolean', required: true },
  },
};

export const SCHEMAS = {
  product: ProductSchema, customer_profile: CustomerProfileSchema, recommendation: RecommendationSchema,
  evidence_claim: EvidenceClaimSchema, finding: FindingSchema, offer: OfferSchema, deal: DealSchema,
  project_handoff: ProjectHandoffSchema, revenue_event: RevenueEventSchema, price: PriceSchema,
};
