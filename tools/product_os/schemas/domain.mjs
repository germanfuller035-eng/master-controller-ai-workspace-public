// tools/product_os/schemas/domain.mjs
// Phase 3: Product OS domain model. Reuses Revenue OS schema validator.
import { PRODUCT_STATUS, CLAIM_TYPES, ASSET_STATUS, PILOT_STATUS, READINESS_SCORE } from '../lib/common.mjs';

export const ProductDefinitionSchema = {
  type: 'object',
  properties: {
    product_id: { type: 'string', required: true, pattern: '^[a-z0-9_]+$' },
    name: { type: 'string', required: true },
    version: { type: 'string', required: true },
    category: { type: 'string', required: true },
    status: { type: 'string', enum: PRODUCT_STATUS, required: true },
    problem: { type: 'string', required: true },
    customer: { type: 'string', required: true },
    non_customer: { type: 'string' },
    outcome: { type: 'string', required: true },
    inputs: { type: 'array', items: { type: 'string' }, required: true },
    deliverables: { type: 'array', items: { type: 'string' }, required: true },
    scope: { type: 'array', items: { type: 'string' }, required: true },
    exclusions: { type: 'array', items: { type: 'string' }, required: true },
    timeline: { type: ['string', 'null'], nullable: true },
    pricing_reference: { type: 'string', required: true },
    delivery_reference: { type: ['string', 'null'], nullable: true, required: true },
    qa_reference: { type: ['string', 'null'], nullable: true, required: true },
    acceptance_reference: { type: ['string', 'null'], nullable: true, required: true },
    economics_reference: { type: ['string', 'null'], nullable: true },
    claims_reference: { type: ['string', 'null'], nullable: true },
    risks: { type: 'array', items: { type: 'string' }, required: true },
    dependencies: { type: 'array', items: { type: 'string' } },
  },
};

export const ProductClaimSchema = {
  type: 'object',
  properties: {
    claim_id: { type: 'string', required: true },
    product_id: { type: 'string', required: true },
    claim: { type: 'string', required: true },
    claim_type: { type: 'string', enum: CLAIM_TYPES, required: true },
    evidence: { type: ['string', 'null'], nullable: true },
    status: { type: 'string', enum: ['DRAFT', 'VALIDATED', 'BLOCKED'], required: true },
    allowed_in_sales: { type: 'boolean', required: true },
    allowed_in_delivery: { type: 'boolean', required: true },
    owner_approved: { type: 'boolean', required: true },
  },
};

export const ProductAssetSchema = {
  type: 'object',
  properties: {
    asset_id: { type: 'string', required: true },
    product_id: { type: 'string', required: true },
    asset_type: { type: 'string', required: true },
    version: { type: 'string', required: true },
    status: { type: 'string', enum: ASSET_STATUS, required: true },
    path: { type: ['string', 'null'], nullable: true },
    source: { type: ['string', 'null'], nullable: true },
    approved: { type: 'boolean', required: true },
    client_ready: { type: 'boolean', required: true },
  },
};

export const InternalPilotSchema = {
  type: 'object',
  properties: {
    pilot_id: { type: 'string', required: true },
    product_id: { type: 'string', required: true },
    scenario: { type: 'string', required: true },
    status: { type: 'string', enum: PILOT_STATUS, required: true },
    inputs: { type: 'array', items: { type: 'string' } },
    planned_outputs: { type: 'array', items: { type: 'string' } },
    actual_outputs: { type: 'array', items: { type: 'string' } },
    planned_hours: { type: ['number', 'null'], nullable: true },
    actual_hours: { type: ['number', 'null'], nullable: true },
    qa_result: { type: 'string', enum: ['PASS', 'FAIL', 'WARNING', 'NOT_RUN'], required: true },
    acceptance_result: { type: 'string', enum: ['PASS', 'FAIL', 'WAIVED', 'NOT_RUN'], required: true },
    risks: { type: 'array', items: { type: 'string' } },
    lessons: { type: 'array', items: { type: 'string' } },
    recommendation: { type: ['string', 'null'], nullable: true },
    test_only: { type: 'boolean', required: true },
  },
};

export const ReadinessAssessmentSchema = {
  type: 'object',
  properties: {
    assessment_id: { type: 'string', required: true },
    product_id: { type: 'string', required: true },
    current_status: { type: 'string', enum: PRODUCT_STATUS, required: true },
    recommended_status: { type: 'string', enum: PRODUCT_STATUS, required: true },
    score: { type: 'number', required: true },
    blocking_gaps: { type: 'array', items: { type: 'string' }, required: true },
    evidence: { type: 'array', items: { type: 'object' } },
    owner_decision_required: { type: 'boolean', required: true },
    auto_promote: { type: 'boolean', required: true },
  },
};

export const ProductChangeSchema = {
  type: 'object',
  properties: {
    change_id: { type: 'string', required: true },
    product_id: { type: 'string', required: true },
    version: { type: 'string', required: true },
    reason: { type: 'string', required: true },
    source: { type: 'string', required: true },
    impact: { type: 'string', required: true },
    decision: { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED', 'DEFERRED'], required: true },
    owner_approval: { type: 'boolean', required: true },
  },
};

export const SCHEMAS = {
  product_definition: ProductDefinitionSchema, product_claim: ProductClaimSchema,
  product_asset: ProductAssetSchema, internal_pilot: InternalPilotSchema,
  readiness_assessment: ReadinessAssessmentSchema, product_change: ProductChangeSchema,
};
