// tools/executive_os/schemas/domain.mjs
// Phase 4: Executive OS domain model. Reuses Revenue OS schema validator.
import { OBJECTIVE_STATUS, DECISION_STATUS, ACTION_STATUS, DATA_STATUS, SEVERITY, DECISION_CATEGORIES, PORTFOLIO_ACTIONS } from '../lib/common.mjs';

export const StrategicObjectiveSchema = {
  type: 'object',
  properties: {
    objective_id: { type: 'string', required: true, pattern: '^[a-z0-9_]+$' },
    name: { type: 'string', required: true },
    description: { type: 'string', required: true },
    category: { type: 'string', required: true },
    status: { type: 'string', enum: OBJECTIVE_STATUS, required: true },
    priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'], required: true },
    time_horizon: { type: 'string', enum: ['VISION', 'ANNUAL', 'QUARTERLY', 'MONTHLY', 'WEEKLY', 'DAILY'], required: true },
    owner: { type: 'string', required: true },
    metric_ids: { type: 'array', items: { type: 'string' }, required: true },
    dependencies: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    evidence: { type: ['string', 'null'], nullable: true },
    source_status: { type: 'string', enum: DATA_STATUS, required: true },
    parent_id: { type: ['string', 'null'], nullable: true },
  },
};

export const KeyResultSchema = {
  type: 'object',
  properties: {
    key_result_id: { type: 'string', required: true },
    objective_id: { type: 'string', required: true },
    name: { type: 'string', required: true },
    metric: { type: 'string', required: true },
    baseline: { type: ['number', 'string', 'null'], nullable: true },
    target: { type: ['number', 'string', 'null'], nullable: true, required: true },
    current: { type: ['number', 'string', 'null'], nullable: true },
    status: { type: 'string', enum: ['ON_TRACK', 'AT_RISK', 'OFF_TRACK', 'UNKNOWN'], required: true },
    source: { type: 'string', enum: DATA_STATUS, required: true },
    confidence: { type: ['number', 'null'], nullable: true },
    due_period: { type: ['string', 'null'], nullable: true },
  },
};

export const ExecutiveDecisionSchema = {
  type: 'object',
  properties: {
    decision_id: { type: 'string', required: true },
    category: { type: 'string', enum: DECISION_CATEGORIES, required: true },
    title: { type: 'string', required: true },
    description: { type: 'string', required: true },
    options: { type: 'array', items: { type: 'string' }, required: true },
    recommended_option: { type: ['string', 'null'], nullable: true },
    evidence: { type: ['string', 'null'], nullable: true },
    impact: { type: 'string', enum: ['low', 'medium', 'high'], required: true },
    urgency: { type: 'string', enum: ['low', 'medium', 'high'], required: true },
    reversibility: { type: 'string', enum: ['reversible', 'partial', 'irreversible'], required: true },
    cost_of_delay: { type: 'string', enum: ['low', 'medium', 'high'], required: true },
    owner_required: { type: 'boolean', required: true },
    status: { type: 'string', enum: DECISION_STATUS, required: true },
    created_at: { type: ['string', 'null'], nullable: true },
    due_at: { type: ['string', 'null'], nullable: true },
    resolved_at: { type: ['string', 'null'], nullable: true },
    supersedes: { type: ['string', 'null'], nullable: true },
  },
};

export const OwnerActionSchema = {
  type: 'object',
  properties: {
    action_id: { type: 'string', required: true },
    decision_id: { type: ['string', 'null'], nullable: true },
    project_id: { type: ['string', 'null'], nullable: true },
    title: { type: 'string', required: true },
    description: { type: 'string', required: true },
    priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'], required: true },
    urgency: { type: 'string', enum: ['low', 'medium', 'high'], required: true },
    effort: { type: 'string', enum: ['low', 'medium', 'high'], required: true },
    deadline: { type: ['string', 'null'], nullable: true },
    blocker: { type: ['string', 'null'], nullable: true },
    status: { type: 'string', enum: ACTION_STATUS, required: true },
    evidence: { type: ['string', 'null'], nullable: true },
    next_step: { type: 'string', required: true },
  },
};

export const PortfolioItemSchema = {
  type: 'object',
  properties: {
    portfolio_item_id: { type: 'string', required: true },
    project_id: { type: 'string', required: true },
    status: { type: 'string', required: true },
    priority: { type: 'string', required: true },
    strategic_value: { type: 'number', min: 0, max: 10, required: true },
    revenue_value: { type: 'number', min: 0, max: 10, required: true },
    risk: { type: 'number', min: 0, max: 10, required: true },
    effort: { type: 'number', min: 0, max: 10, required: true },
    capacity_need: { type: 'number', min: 0, max: 10, required: true },
    dependencies: { type: 'array', items: { type: 'string' } },
    owner_attention: { type: 'string', enum: ['low', 'medium', 'high'], required: true },
    recommended_action: { type: 'string', enum: PORTFOLIO_ACTIONS, required: true },
  },
};

export const ExceptionSchema = {
  type: 'object',
  properties: {
    exception_id: { type: 'string', required: true },
    category: { type: 'string', required: true },
    severity: { type: 'string', enum: SEVERITY, required: true },
    source_system: { type: 'string', required: true },
    source_entity: { type: ['string', 'null'], nullable: true },
    description: { type: 'string', required: true },
    evidence: { type: ['string', 'null'], nullable: true },
    owner_action: { type: ['string', 'null'], nullable: true },
    status: { type: 'string', enum: ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'], required: true },
  },
};

export const SCHEMAS = {
  strategic_objective: StrategicObjectiveSchema, key_result: KeyResultSchema,
  executive_decision: ExecutiveDecisionSchema, owner_action: OwnerActionSchema,
  portfolio_item: PortfolioItemSchema, exception: ExceptionSchema,
};
