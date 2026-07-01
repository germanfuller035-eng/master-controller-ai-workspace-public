// tools/finance_os/schemas/domain.mjs
// Phase 3: Finance OS domain model. Reuses Revenue OS schema validator.
import {
  INVOICE_STATUS, PAYMENT_STATUS, EXPENSE_STATUS, BUDGET_STATUS, CASHFLOW_TYPE,
  DATA_STATUS, SUPPORTED_CURRENCIES,
} from '../lib/common.mjs';

export const BusinessUnitSchema = {
  type: 'object',
  properties: {
    business_unit_id: { type: 'string', required: true, pattern: '^[a-z0-9_]+$' },
    name: { type: 'string', required: true },
    status: { type: 'string', enum: ['ACTIVE', 'PLANNED', 'PAUSED', 'ARCHIVED'], required: true },
    category: { type: 'string', required: true },
    owner: { type: 'string', required: true },
    currency: { type: 'string', enum: SUPPORTED_CURRENCIES, required: true },
    source_of_truth: { type: 'string', required: true },
    active_products: { type: 'array', items: { type: 'string' } },
    active_projects: { type: 'array', items: { type: 'string' } },
    cost_centers: { type: 'array', items: { type: 'string' } },
    revenue_centers: { type: 'array', items: { type: 'string' } },
  },
};

export const FinancialAccountReferenceSchema = {
  type: 'object',
  properties: {
    account_ref_id: { type: 'string', required: true },
    business_unit_id: { type: 'string', required: true },
    account_type: { type: 'string', enum: ['bank', 'card', 'cash', 'ewallet', 'tax', 'other'], required: true },
    institution: { type: ['string', 'null'], nullable: true },
    currency: { type: 'string', enum: SUPPORTED_CURRENCIES, required: true },
    masked_identifier: { type: ['string', 'null'], nullable: true },  // e.g. ****1234 only
    source: { type: 'string', enum: DATA_STATUS, required: true },
    active: { type: 'boolean', required: true },
    credentials_reference: { type: ['string', 'null'], nullable: true },  // path reference ONLY, never a value
  },
};

export const InvoiceSchema = {
  type: 'object',
  properties: {
    invoice_id: { type: 'string', required: true },
    deal_id: { type: ['string', 'null'], nullable: true },
    project_id: { type: ['string', 'null'], nullable: true },
    client_reference: { type: 'string', required: true },
    business_unit_id: { type: 'string', required: true },
    number: { type: 'string', required: true },
    issue_date: { type: ['string', 'null'], nullable: true },
    due_date: { type: ['string', 'null'], nullable: true },
    currency: { type: 'string', enum: SUPPORTED_CURRENCIES, required: true },
    subtotal: { type: 'number', required: true, min: 0 },
    tax: { type: 'number', required: true, min: 0 },
    total: { type: 'number', required: true, min: 0 },
    status: { type: 'string', enum: INVOICE_STATUS, required: true },
    payment_schedule: { type: 'array', items: { type: 'object' } },
    price_status: { type: 'string', enum: DATA_STATUS, required: true },
    evidence: { type: ['string', 'null'], nullable: true },
    test_only: { type: 'boolean', required: true },
    revision: { type: 'number', required: true },
  },
};

export const PaymentSchema = {
  type: 'object',
  properties: {
    payment_id: { type: 'string', required: true },
    invoice_id: { type: 'string', required: true },
    date: { type: ['string', 'null'], nullable: true },
    amount: { type: 'number', required: true, min: 0 },
    currency: { type: 'string', enum: SUPPORTED_CURRENCIES, required: true },
    method: { type: ['string', 'null'], nullable: true },
    reference: { type: ['string', 'null'], nullable: true },
    status: { type: 'string', enum: PAYMENT_STATUS, required: true },
    evidence: { type: ['string', 'null'], nullable: true },
    confirmed: { type: 'boolean', required: true },
    test_only: { type: 'boolean', required: true },
  },
};

export const ExpenseSchema = {
  type: 'object',
  properties: {
    expense_id: { type: 'string', required: true },
    business_unit_id: { type: ['string', 'null'], nullable: true },
    project_id: { type: ['string', 'null'], nullable: true },
    product_id: { type: ['string', 'null'], nullable: true },
    category: { type: 'string', required: true },
    date: { type: ['string', 'null'], nullable: true },
    amount: { type: 'number', required: true },
    currency: { type: 'string', enum: SUPPORTED_CURRENCIES, required: true },
    vendor: { type: ['string', 'null'], nullable: true },
    source: { type: 'string', enum: DATA_STATUS, required: true },
    status: { type: 'string', enum: EXPENSE_STATUS, required: true },
    tax_relevance: { type: 'string', enum: ['deductible', 'non_deductible', 'unknown'], required: true },
    recurring: { type: 'boolean', required: true },
    scope: { type: 'string', enum: ['business', 'personal', 'ambiguous'], required: true },
    direct: { type: 'boolean', required: true },
    evidence: { type: ['string', 'null'], nullable: true },
    test_only: { type: 'boolean', required: true },
  },
};

export const BudgetSchema = {
  type: 'object',
  properties: {
    budget_id: { type: 'string', required: true },
    business_unit_id: { type: 'string', required: true },
    period: { type: 'string', required: true },
    category: { type: 'string', required: true },
    planned: { type: 'number', required: true },
    approved: { type: ['number', 'null'], nullable: true },
    actual: { type: ['number', 'null'], nullable: true },
    variance: { type: ['number', 'null'], nullable: true },
    currency: { type: 'string', enum: SUPPORTED_CURRENCIES, required: true },
    status: { type: 'string', enum: BUDGET_STATUS, required: true },
    owner_approved: { type: 'boolean', required: true },
  },
};

export const CashflowEventSchema = {
  type: 'object',
  properties: {
    event_id: { type: 'string', required: true },
    business_unit_id: { type: ['string', 'null'], nullable: true },
    type: { type: 'string', enum: CASHFLOW_TYPE, required: true },
    date: { type: ['string', 'null'], nullable: true },
    amount: { type: 'number', required: true },
    currency: { type: 'string', enum: SUPPORTED_CURRENCIES, required: true },
    status: { type: 'string', enum: ['actual', 'expected', 'forecast'], required: true },
    source_entity: { type: ['string', 'null'], nullable: true },
    confidence: { type: ['number', 'null'], nullable: true },
  },
};

export const ProfitabilityRecordSchema = {
  type: 'object',
  properties: {
    record_id: { type: 'string', required: true },
    project_id: { type: ['string', 'null'], nullable: true },
    product_id: { type: ['string', 'null'], nullable: true },
    revenue: { type: 'number', required: true },
    direct_costs: { type: 'number', required: true },
    owner_hours: { type: ['number', 'null'], nullable: true },
    owner_hour_cost: { type: ['number', 'null'], nullable: true },
    ai_costs: { type: 'number' },
    contractor_costs: { type: 'number' },
    overhead_allocation: { type: 'number' },
    gross_profit: { type: ['number', 'null'], nullable: true },
    contribution_margin: { type: ['number', 'null'], nullable: true },
    net_estimate: { type: ['number', 'null'], nullable: true },
    confidence: { type: 'string', enum: DATA_STATUS, required: true },
  },
};

export const TaxReserveSchema = {
  type: 'object',
  properties: {
    reserve_id: { type: 'string', required: true },
    business_unit_id: { type: 'string', required: true },
    period: { type: 'string', required: true },
    tax_regime: { type: ['string', 'null'], nullable: true },
    taxable_base: { type: ['number', 'null'], nullable: true },
    rate: { type: ['number', 'null'], nullable: true },
    reserve_amount: { type: ['number', 'null'], nullable: true },
    source: { type: 'string', enum: DATA_STATUS, required: true },
    status: { type: 'string', enum: ['ESTIMATE', 'CONFIRMED', 'UNKNOWN'], required: true },
    approved: { type: 'boolean', required: true },
  },
};

export const DebtObligationSchema = {
  type: 'object',
  properties: {
    debt_id: { type: 'string', required: true },
    type: { type: 'string', required: true },
    creditor: { type: ['string', 'null'], nullable: true },
    currency: { type: 'string', enum: SUPPORTED_CURRENCIES, required: true },
    principal: { type: ['number', 'null'], nullable: true },
    interest_rate: { type: ['number', 'null'], nullable: true },
    payment: { type: ['number', 'null'], nullable: true },
    frequency: { type: ['string', 'null'], nullable: true },
    remaining_term: { type: ['string', 'null'], nullable: true },
    scope: { type: 'string', enum: ['business', 'personal'], required: true },
    status: { type: 'string', enum: ['ACTIVE', 'CLOSED', 'PLANNED'], required: true },
    source: { type: 'string', enum: DATA_STATUS, required: true },
    confirmed: { type: 'boolean', required: true },
  },
};

export const SCHEMAS = {
  business_unit: BusinessUnitSchema, account_ref: FinancialAccountReferenceSchema, invoice: InvoiceSchema,
  payment: PaymentSchema, expense: ExpenseSchema, budget: BudgetSchema, cashflow_event: CashflowEventSchema,
  profitability: ProfitabilityRecordSchema, tax_reserve: TaxReserveSchema, debt: DebtObligationSchema,
};
