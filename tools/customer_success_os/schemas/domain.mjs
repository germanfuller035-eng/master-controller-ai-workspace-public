// tools/customer_success_os/schemas/domain.mjs
// Phase 4: Customer Success OS domain model. Reuses Revenue OS schema validator.
import { LIFECYCLE, SUPPORT_STATUS, SEVERITY, HEALTH_STATE, INCIDENT_STATUS, OUTCOME_STATUS, ADOPTION_STATUS, PERMISSION_TYPES, PERMISSION_STATUS } from '../lib/common.mjs';

export const CustomerAccountReferenceSchema = {
  type: 'object',
  properties: {
    customer_ref_id: { type: 'string', required: true, pattern: '^[A-Za-z0-9_-]+$' },
    canonical_lead_id: { type: ['string', 'null'], nullable: true, required: true },  // reference only, no 2nd identity
    deal_id: { type: ['string', 'null'], nullable: true },
    project_ids: { type: 'array', items: { type: 'string' }, required: true },
    product_ids: { type: 'array', items: { type: 'string' }, required: true },
    status: { type: 'string', enum: LIFECYCLE, required: true },
    owner: { type: 'string', required: true },
    created_at: { type: ['string', 'null'], nullable: true },
    revision: { type: 'number', required: true },
    test_only: { type: 'boolean', required: true },
  },
};

export const SuccessPlanSchema = {
  type: 'object',
  properties: {
    success_plan_id: { type: 'string', required: true },
    customer_ref_id: { type: 'string', required: true },
    product_id: { type: 'string', required: true },
    expected_outcomes: { type: 'array', items: { type: 'string' }, required: true },
    customer_actions: { type: 'array', items: { type: 'string' }, required: true },
    owner_actions: { type: 'array', items: { type: 'string' }, required: true },
    milestones: { type: 'array', items: { type: 'string' } },
    metrics: { type: 'array', items: { type: 'object' } },
    risks: { type: 'array', items: { type: 'string' } },
    review_cadence: { type: 'string', required: true },
    status: { type: 'string', required: true },
    evidence: { type: ['string', 'null'], nullable: true },
  },
};

export const OutcomeSchema = {
  type: 'object',
  properties: {
    outcome_id: { type: 'string', required: true },
    customer_ref_id: { type: 'string', required: true },
    product_id: { type: 'string', required: true },
    description: { type: 'string', required: true },
    measurement_method: { type: ['string', 'null'], nullable: true },
    baseline: { type: ['number', 'string', 'null'], nullable: true },
    target: { type: ['number', 'string', 'null'], nullable: true },
    current: { type: ['number', 'string', 'null'], nullable: true },
    status: { type: 'string', enum: OUTCOME_STATUS, required: true },
    source: { type: 'string', enum: ADOPTION_STATUS, required: true },
    confidence: { type: ['number', 'null'], nullable: true },
    confirmed_by_customer: { type: 'boolean', required: true },
  },
};

export const CustomerHealthSchema = {
  type: 'object',
  properties: {
    health_id: { type: 'string', required: true },
    customer_ref_id: { type: 'string', required: true },
    score: { type: ['number', 'null'], nullable: true },
    status: { type: 'string', enum: HEALTH_STATE, required: true },
    dimensions: { type: 'object', required: true },
    risk_flags: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'string', required: true },
    calculated_at: { type: ['string', 'null'], nullable: true },
    owner_review_required: { type: 'boolean', required: true },
  },
};

export const SupportRequestSchema = {
  type: 'object',
  properties: {
    support_request_id: { type: 'string', required: true },
    customer_ref_id: { type: ['string', 'null'], nullable: true, required: true },
    project_id: { type: ['string', 'null'], nullable: true },
    product_id: { type: ['string', 'null'], nullable: true },
    category: { type: 'string', required: true },
    severity: { type: 'string', enum: SEVERITY, required: true },
    description: { type: 'string', required: true },
    source_channel: { type: 'string', required: true },
    status: { type: 'string', enum: SUPPORT_STATUS, required: true },
    created_at: { type: ['string', 'null'], nullable: true },
    owner: { type: ['string', 'null'], nullable: true },
    evidence: { type: ['string', 'null'], nullable: true },
    revision: { type: 'number', required: true },
    test_only: { type: 'boolean', required: true },
  },
};

export const IncidentSchema = {
  type: 'object',
  properties: {
    incident_id: { type: 'string', required: true },
    customer_ref_id: { type: ['string', 'null'], nullable: true },
    product_id: { type: ['string', 'null'], nullable: true },
    severity: { type: 'string', enum: SEVERITY, required: true },
    impact: { type: 'string', required: true },
    status: { type: 'string', enum: INCIDENT_STATUS, required: true },
    mitigation: { type: ['string', 'null'], nullable: true },
    root_cause: { type: ['string', 'null'], nullable: true },
    resolution: { type: ['string', 'null'], nullable: true },
    lessons: { type: 'array', items: { type: 'string' } },
    test_only: { type: 'boolean', required: true },
  },
};

export const FeedbackSchema = {
  type: 'object',
  properties: {
    feedback_id: { type: 'string', required: true },
    customer_ref_id: { type: 'string', required: true },
    type: { type: 'string', required: true },
    score: { type: ['number', 'null'], nullable: true },
    text_reference: { type: ['string', 'null'], nullable: true },
    source: { type: 'string', required: true },
    date: { type: ['string', 'null'], nullable: true },
    permission: { type: 'string', enum: PERMISSION_STATUS, required: true },
    confidence: { type: 'string', required: true },
  },
};

export const PermissionRecordSchema = {
  type: 'object',
  properties: {
    permission_id: { type: 'string', required: true },
    customer_ref_id: { type: 'string', required: true },
    permission_type: { type: 'string', enum: PERMISSION_TYPES, required: true },
    status: { type: 'string', enum: PERMISSION_STATUS, required: true },
    evidence: { type: ['string', 'null'], nullable: true },
    granted_at: { type: ['string', 'null'], nullable: true },
    expires_at: { type: ['string', 'null'], nullable: true },
    restrictions: { type: 'array', items: { type: 'string' } },
  },
};

export const ChurnRecordSchema = {
  type: 'object',
  properties: {
    churn_id: { type: 'string', required: true },
    customer_ref_id: { type: 'string', required: true },
    reason: { type: 'string', required: true },
    source: { type: 'string', required: true },
    preventable: { type: 'string', enum: ['preventable', 'partially_preventable', 'not_preventable', 'unknown'], required: true },
    financial_impact: { type: ['string', 'null'], nullable: true },
    lessons: { type: 'array', items: { type: 'string' } },
  },
};

export const SCHEMAS = {
  customer_ref: CustomerAccountReferenceSchema, success_plan: SuccessPlanSchema, outcome: OutcomeSchema,
  customer_health: CustomerHealthSchema, support_request: SupportRequestSchema, incident: IncidentSchema,
  feedback: FeedbackSchema, permission: PermissionRecordSchema, churn: ChurnRecordSchema,
};
