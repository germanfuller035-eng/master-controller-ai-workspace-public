// tools/finance_os/lib/invoice.mjs
// Phase 6-7: Invoice Engine + Payment Schedule Engine. Offline. DRAFT default. No sending. TEST_ONLY.
import { readFileSync } from 'node:fs';
import { REVENUE_CATALOG, round2, SUPPORTED_CURRENCIES } from './common.mjs';
import { validate } from '../../revenue_os/lib/schema.mjs';
import { InvoiceSchema } from '../schemas/domain.mjs';

let CATALOG = null;
function product(id) {
  if (!CATALOG) CATALOG = JSON.parse(readFileSync(REVENUE_CATALOG, 'utf8'));
  return CATALOG.products.find((p) => p.product_id === id) || null;
}

// Payment schedule templates.
export const SCHEDULE_TEMPLATES = {
  prepay_100: [{ name: 'Prepayment', percentage: 100, due_condition: 'on_issue' }],
  split_50_50: [{ name: 'Prepayment', percentage: 50, due_condition: 'on_issue' }, { name: 'On delivery', percentage: 50, due_condition: 'on_delivery' }],
  milestone: null, // provided explicitly
  monthly: null,
};

export function buildPaymentSchedule(invoiceTotal, template, customStages) {
  const stages = customStages || SCHEDULE_TEMPLATES[template] || SCHEDULE_TEMPLATES.prepay_100;
  const out = stages.map((s, i) => ({
    payment_stage_id: `stg${i + 1}`,
    name: s.name,
    percentage: s.percentage,
    amount: round2(invoiceTotal * (s.percentage / 100)),
    due_condition: s.due_condition || 'custom',
    due_date: s.due_date || null,
    status: 'EXPECTED',
  }));
  return out;
}

export function validatePaymentSchedule(stages, invoiceTotal) {
  const errors = [];
  if (!stages || stages.length === 0) return { ok: true, errors }; // schedule optional
  const pctTotal = stages.reduce((s, x) => s + (x.percentage || 0), 0);
  if (Math.abs(pctTotal - 100) > 0.01) errors.push(`schedule percentages total ${pctTotal} != 100`);
  const amtTotal = round2(stages.reduce((s, x) => s + (x.amount || 0), 0));
  if (Math.abs(amtTotal - invoiceTotal) > 0.01) errors.push(`schedule amounts total ${amtTotal} != invoice ${invoiceTotal}`);
  if (stages.some((x) => (x.amount || 0) < 0)) errors.push('negative payment amount');
  if (stages.some((x) => x.status === 'PAID' && !x.evidence)) errors.push('paid stage without evidence');
  return { ok: errors.length === 0, errors };
}

// inputs: { deal_id, project_id, client_reference, business_unit_id, product_id, currency,
//           price_approved, due_date, issue_date, number, schedule_template, custom_stages, tax_rate }
export function buildInvoice(inputs, existingNumbers = []) {
  const errors = [];
  const p = product(inputs.product_id);
  if (!p) return { ok: false, errors: [`unknown product ${inputs.product_id}`] };

  // Price from product (confirmed) unless explicitly provided.
  const subtotal = (typeof inputs.subtotal === 'number') ? inputs.subtotal : (p.price.amount ?? null);
  if (subtotal == null) errors.push('no amount: product price unknown and no subtotal provided');
  const priceStatus = inputs.price_status || p.price.status;
  if (priceStatus !== 'CONFIRMED' && inputs.price_approved !== true && !inputs.test_only) errors.push('price not approved/confirmed');

  const taxRate = inputs.tax_rate ?? 0;
  const tax = subtotal != null ? round2(subtotal * taxRate) : 0;
  const total = subtotal != null ? round2(subtotal + tax) : 0;

  const currency = inputs.currency || 'RUB';
  if (!SUPPORTED_CURRENCIES.includes(currency)) errors.push(`unsupported currency ${currency}`);
  if (!inputs.number) errors.push('missing invoice number');
  if (inputs.number && existingNumbers.includes(inputs.number)) errors.push(`duplicate invoice number ${inputs.number}`);
  if (!inputs.client_reference) errors.push('missing client reference');
  if (inputs.due_date && inputs.issue_date && inputs.due_date < inputs.issue_date) errors.push('due date before issue date');

  const schedule = inputs.schedule_template || inputs.custom_stages
    ? buildPaymentSchedule(total, inputs.schedule_template, inputs.custom_stages) : [];
  const schedCheck = validatePaymentSchedule(schedule, total);
  if (!schedCheck.ok) errors.push(...schedCheck.errors);

  if (errors.length) return { ok: false, errors };

  const invoice = {
    invoice_id: inputs.invoice_id || `${inputs.test_only ? 'TEST_' : ''}inv_${inputs.number}`,
    deal_id: inputs.deal_id || null,
    project_id: inputs.project_id || null,
    client_reference: inputs.client_reference,
    business_unit_id: inputs.business_unit_id || 'mini_audit',
    number: inputs.number,
    issue_date: inputs.issue_date || null,
    due_date: inputs.due_date || null,
    currency, subtotal: round2(subtotal), tax, total,
    status: 'DRAFT',
    payment_schedule: schedule,
    price_status: priceStatus,
    evidence: inputs.evidence || null,
    test_only: !!inputs.test_only,
    revision: 1,
  };
  const shape = validate(invoice, InvoiceSchema, 'invoice');
  if (!shape.ok) return { ok: false, errors: shape.errors };
  return { ok: true, invoice, send_allowed: false };
}

// Status transition guard: cannot become APPROVED without owner; ISSUED_EXTERNAL needs evidence.
export function canSetInvoiceStatus(invoice, target, ctx = {}) {
  const errors = [];
  if (target === 'APPROVED' && ctx.owner_approved !== true) errors.push('APPROVED requires owner approval');
  if (target === 'ISSUED_EXTERNAL' && !ctx.external_evidence) errors.push('ISSUED_EXTERNAL requires external evidence');
  if (target === 'PAID' && ctx.confirmed_payment !== true) errors.push('PAID requires confirmed payment');
  return { ok: errors.length === 0, errors };
}
