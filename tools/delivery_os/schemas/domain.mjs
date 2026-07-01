// tools/delivery_os/schemas/domain.mjs
// Phase 3: Delivery OS machine-readable domain model. Reuses Revenue OS schema validator.
import {
  PROJECT_STATUS, MILESTONE_STATUS, TASK_STATUS, QA_STATUS, SEVERITY,
  ACCEPTANCE_STATUS, CHANGE_DECISION, CASE_STAGE, AGENTS,
} from '../lib/common.mjs';

export const ClientProjectSchema = {
  type: 'object',
  properties: {
    project_id: { type: 'string', required: true, pattern: '^[A-Za-z0-9_-]+$' },
    deal_id: { type: ['string', 'null'], nullable: true, required: true },
    canonical_lead_id: { type: ['string', 'null'], nullable: true },
    product_id: { type: 'string', required: true },
    name: { type: 'string', required: true },
    status: { type: 'string', enum: PROJECT_STATUS, required: true },
    priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'], required: true },
    owner: { type: 'string', required: true },
    project_manager: { type: ['string', 'null'], nullable: true },
    created_at: { type: ['string', 'null'], nullable: true },
    planned_start: { type: ['string', 'null'], nullable: true },
    actual_start: { type: ['string', 'null'], nullable: true },
    planned_end: { type: ['string', 'null'], nullable: true },
    actual_end: { type: ['string', 'null'], nullable: true },
    scope_version: { type: 'number', required: true },
    commercial_reference: { type: ['string', 'null'], nullable: true, required: true },
    client_reference: { type: ['string', 'null'], nullable: true },
    revision: { type: 'number', required: true },
    test_only: { type: 'boolean', required: true },
  },
};

export const ProjectInputSchema = {
  type: 'object',
  properties: {
    input_id: { type: 'string', required: true },
    project_id: { type: 'string', required: true },
    name: { type: 'string', required: true },
    description: { type: 'string' },
    required: { type: 'boolean', required: true },
    source: { type: 'string', enum: AGENTS.concat(['system']), required: true },
    status: { type: 'string', enum: ['MISSING', 'RECEIVED', 'VALIDATED', 'REJECTED'], required: true },
    received_at: { type: ['string', 'null'], nullable: true },
    validated: { type: 'boolean', required: true },
    sensitive: { type: 'boolean', required: true },
    blocker_if_missing: { type: 'boolean', required: true },
  },
};

export const MilestoneSchema = {
  type: 'object',
  properties: {
    milestone_id: { type: 'string', required: true },
    project_id: { type: 'string', required: true },
    name: { type: 'string', required: true },
    sequence: { type: 'number', required: true },
    status: { type: 'string', enum: MILESTONE_STATUS, required: true },
    planned_date: { type: ['string', 'null'], nullable: true },
    actual_date: { type: ['string', 'null'], nullable: true },
    dependencies: { type: 'array', items: { type: 'string' } },
    deliverables: { type: 'array', items: { type: 'string' }, required: true },
    acceptance_criteria: { type: 'array', items: { type: 'string' }, required: true },
    owner: { type: 'string', enum: AGENTS, required: true },
    blockers: { type: 'array', items: { type: 'string' } },
  },
};

export const TaskSchema = {
  type: 'object',
  properties: {
    task_id: { type: 'string', required: true },
    project_id: { type: 'string', required: true },
    milestone_id: { type: 'string', required: true },
    title: { type: 'string', required: true },
    agent: { type: 'string', enum: AGENTS, required: true },
    status: { type: 'string', enum: TASK_STATUS, required: true },
    estimate_hours: { type: ['number', 'null'], nullable: true },
    actual_hours: { type: ['number', 'null'], nullable: true },
    dependencies: { type: 'array', items: { type: 'string' } },
    input_requirements: { type: 'array', items: { type: 'string' } },
    output: { type: ['string', 'null'], nullable: true, required: true },
    evidence: { type: ['string', 'null'], nullable: true },
    review_required: { type: 'boolean', required: true },
  },
};

export const DeliverableSchema = {
  type: 'object',
  properties: {
    deliverable_id: { type: 'string', required: true },
    project_id: { type: 'string', required: true },
    product_id: { type: 'string', required: true },
    name: { type: 'string', required: true },
    type: { type: 'string', required: true },
    version: { type: 'number', required: true },
    status: { type: 'string', enum: ['DRAFT', 'IN_QA', 'QA_PASSED', 'DELIVERED', 'ACCEPTED'], required: true },
    path: { type: ['string', 'null'], nullable: true },
    acceptance_criteria: { type: 'array', items: { type: 'string' }, required: true },
    qa_status: { type: 'string', enum: QA_STATUS, required: true },
    owner_approved: { type: 'boolean', required: true },
    client_approved: { type: 'boolean', required: true },
  },
};

export const QualityCheckSchema = {
  type: 'object',
  properties: {
    check_id: { type: 'string', required: true },
    deliverable_id: { type: 'string', required: true },
    category: { type: 'string', required: true },
    requirement: { type: 'string', required: true },
    status: { type: 'string', enum: QA_STATUS, required: true },
    evidence: { type: ['string', 'null'], nullable: true },
    checked_by: { type: 'string', enum: AGENTS, required: true },
    checked_at: { type: ['string', 'null'], nullable: true },
    severity: { type: 'string', enum: SEVERITY, required: true },
  },
};

export const RiskSchema = {
  type: 'object',
  properties: {
    risk_id: { type: 'string', required: true },
    project_id: { type: 'string', required: true },
    category: { type: 'string', required: true },
    description: { type: 'string', required: true },
    probability: { type: 'string', enum: ['low', 'medium', 'high'], required: true },
    impact: { type: 'string', enum: ['low', 'medium', 'high'], required: true },
    mitigation: { type: 'string', required: true },
    owner: { type: 'string', enum: AGENTS, required: true },
    status: { type: 'string', enum: ['OPEN', 'MITIGATED', 'TRIGGERED', 'CLOSED'], required: true },
    trigger: { type: ['string', 'null'], nullable: true },
  },
};

export const ChangeRequestSchema = {
  type: 'object',
  properties: {
    change_id: { type: 'string', required: true },
    project_id: { type: 'string', required: true },
    requested_by: { type: 'string', enum: AGENTS, required: true },
    description: { type: 'string', required: true },
    reason: { type: 'string', required: true },
    scope_impact: { type: 'string', required: true },
    time_impact: { type: 'string', required: true },
    price_impact: { type: 'string', required: true },
    decision: { type: 'string', enum: CHANGE_DECISION, required: true },
    approved_by_owner: { type: 'boolean', required: true },
    created_at: { type: ['string', 'null'], nullable: true },
  },
};

export const AcceptanceSchema = {
  type: 'object',
  properties: {
    acceptance_id: { type: 'string', required: true },
    project_id: { type: 'string', required: true },
    deliverable_id: { type: ['string', 'null'], nullable: true },
    criteria: { type: 'array', items: { type: 'object' }, required: true },
    evidence: { type: 'array', items: { type: 'string' } },
    status: { type: 'string', enum: ACCEPTANCE_STATUS, required: true },
    owner_approval: { type: 'boolean', required: true },
    client_approval: { type: 'boolean', required: true },
    accepted_at: { type: ['string', 'null'], nullable: true },
  },
};

export const ProjectLessonSchema = {
  type: 'object',
  properties: {
    lesson_id: { type: 'string', required: true },
    project_id: { type: 'string', required: true },
    product_id: { type: 'string', required: true },
    category: { type: 'string', required: true },
    observation: { type: 'string', required: true },
    root_cause: { type: ['string', 'null'], nullable: true },
    recommendation: { type: 'string', required: true },
    product_change_required: { type: 'boolean', required: true },
    evidence: { type: ['string', 'null'], nullable: true },
  },
};

export const CaseEvidenceSchema = {
  type: 'object',
  properties: {
    case_id: { type: 'string', required: true },
    project_id: { type: 'string', required: true },
    product_id: { type: 'string', required: true },
    stage: { type: 'string', enum: CASE_STAGE, required: true },
    before: { type: ['string', 'null'], nullable: true },
    after: { type: ['string', 'null'], nullable: true },
    deliverables: { type: 'array', items: { type: 'string' } },
    metrics: { type: 'array', items: { type: 'object' } },
    client_permission: { type: 'boolean', required: true },
    anonymized: { type: 'boolean', required: true },
    publishable: { type: 'boolean', required: true },
  },
};

export const SCHEMAS = {
  client_project: ClientProjectSchema, project_input: ProjectInputSchema, milestone: MilestoneSchema,
  task: TaskSchema, deliverable: DeliverableSchema, quality_check: QualityCheckSchema, risk: RiskSchema,
  change_request: ChangeRequestSchema, acceptance: AcceptanceSchema, project_lesson: ProjectLessonSchema,
  case_evidence: CaseEvidenceSchema,
};
