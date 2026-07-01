// tools/finance_os/lib/common.mjs
// Shared constants + helpers for Finance OS. Dependency-free, deterministic. Offline.
import path from 'node:path';

export const FINANCE_ROOT = process.env.FINANCE_OS_ROOT || path.resolve(process.cwd(), 'tools/finance_os');
export const GENERATED_ROOT = process.env.FINANCE_OS_GENERATED || path.resolve(process.cwd(), '_generated/finance_os');
export const DATA_DIR = path.join(FINANCE_ROOT, 'data');
export const FIXTURE_DIR = path.join(FINANCE_ROOT, 'fixtures');
export const REVENUE_CATALOG = path.resolve(process.cwd(), 'tools/revenue_os/data/product_catalog.json');

export const CURRENCY = 'RUB';
export const SUPPORTED_CURRENCIES = ['RUB', 'USD', 'EUR'];

// Financial data status vocabulary (every number carries one).
export const DATA_STATUS = ['CONFIRMED', 'OWNER_TARGET', 'MODEL_ESTIMATE', 'IMPORTED_UNVERIFIED', 'UNKNOWN'];

export const INVOICE_STATUS = ['DRAFT', 'OWNER_REVIEW', 'APPROVED', 'ISSUED_EXTERNAL', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'DISPUTED', 'WRITTEN_OFF'];
export const PAYMENT_STATUS = ['EXPECTED', 'RECEIVED_UNVERIFIED', 'CONFIRMED', 'FAILED', 'REFUNDED', 'REVERSED'];
export const EXPENSE_STATUS = ['PLANNED', 'INCURRED_UNVERIFIED', 'CONFIRMED', 'REIMBURSABLE', 'REIMBURSED', 'CANCELLED'];
export const BUDGET_STATUS = ['DRAFT', 'OWNER_REVIEW', 'APPROVED', 'LOCKED', 'CLOSED'];
export const CASHFLOW_TYPE = ['opening_cash', 'operating_inflow', 'operating_outflow', 'investing', 'financing', 'debt_service', 'owner_contribution', 'owner_draw', 'closing_cash'];

// Money confusion categories — the validator prevents mixing these.
export const MONEY_KINDS = ['booked_revenue', 'invoiced', 'payment', 'profit', 'cash_balance', 'target', 'forecast', 'credit_availability', 'asset_valuation', 'personal_funds'];

// The global no-send / no-bank invariant. Finance OS never sends or touches banks.
export const SEND_ALLOWED = false;
export const BANK_ACCESS_ALLOWED = false;

export function nowStamp(ts) { return ts || process.env.FINANCE_OS_TS || 'UNSTAMPED'; }
export function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
export function hasFlag(name) { return process.argv.includes(name); }

// Build a typed money value. NEVER promotes estimate/target to confirmed.
export function money(amount, status = 'UNKNOWN', opts = {}) {
  return {
    amount: (typeof amount === 'number') ? amount : null,
    currency: opts.currency || CURRENCY,
    status: DATA_STATUS.includes(status) ? status : 'UNKNOWN',
    source: opts.source || null,
    as_of: opts.as_of || null,
    confidence: opts.confidence ?? null,
    approved_by_owner: opts.approved_by_owner === true,
  };
}

export function round2(n) { return Math.round(n * 100) / 100; }
