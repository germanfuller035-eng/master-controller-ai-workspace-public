// tools/finance_os/lib/import_contracts.mjs
// Phase 34: Future safe import schemas (bank/accounting/payment-provider/invoice/expense CSV).
// DRY-RUN only. No live service connection. Redacts sensitive fields.

export const IMPORT_TYPES = ['bank_csv', 'accounting_export', 'payment_provider_csv', 'invoice_csv', 'expense_csv'];

// Sensitive fields redacted on import preview (never stored raw).
const SENSITIVE_FIELDS = /(account|iban|card|pan|cvv|password|secret|token|inn_full|passport)/i;

export const IMPORT_SCHEMAS = {
  bank_csv: ['date', 'amount', 'currency', 'reference', 'counterparty', 'masked_account'],
  accounting_export: ['date', 'account', 'debit', 'credit', 'currency', 'memo'],
  payment_provider_csv: ['date', 'amount', 'currency', 'fee', 'reference', 'status'],
  invoice_csv: ['number', 'client_reference', 'total', 'currency', 'issue_date', 'due_date', 'status'],
  expense_csv: ['date', 'amount', 'currency', 'vendor', 'category'],
};

// Dry-run import: validate rows, redact sensitive, detect duplicates, normalize, never connect.
export function importDryRun(type, rows, opts = {}) {
  if (!IMPORT_TYPES.includes(type)) return { ok: false, error: `unknown import type ${type}` };
  const expected = IMPORT_SCHEMAS[type];
  const seen = new Set();
  const out = { type, mode: 'DRY_RUN', label: 'IMPORTED_UNVERIFIED', total: rows.length, valid: 0, redacted_fields: 0, duplicates: 0, unmatched_queue: 0, rows: [] };

  for (const raw of rows) {
    const row = {};
    let rowRedacted = 0;
    for (const [k, v] of Object.entries(raw)) {
      if (SENSITIVE_FIELDS.test(k)) { row[k] = '«REDACTED»'; rowRedacted++; out.redacted_fields++; }
      else row[k] = v;
    }
    // Normalize date/currency (shallow).
    if (row.currency) row.currency = String(row.currency).toUpperCase();
    // Duplicate detection by reference+amount+date.
    const key = `${row.reference || row.number || ''}::${row.amount || row.total || ''}::${row.date || ''}`;
    const dup = seen.has(key);
    if (dup) out.duplicates++; else seen.add(key);
    // Row validation: required fields present.
    const missing = expected.filter((f) => !(f in raw) && !SENSITIVE_FIELDS.test(f));
    const valid = missing.length === 0 && !dup;
    if (valid) out.valid++;
    if (!valid && !dup) out.unmatched_queue++;
    out.rows.push({ status: dup ? 'duplicate' : (valid ? 'valid' : 'needs_review'), missing, redacted: rowRedacted, normalized: row });
  }
  out.idempotent = true;
  out.rollback = 'dry-run produces no writes; nothing to roll back';
  out.note = 'No live service connection. All rows IMPORTED_UNVERIFIED until owner confirms.';
  return { ok: true, ...out };
}
