// tools/finance_os/lib/reconcile.mjs
// Phase 9: Payment Reconciliation. Offline, synthetic fixtures only. Never auto-confirms a probable match.

// invoice: {invoice_id, total, currency, client_reference}
// bankRow: {amount, currency, date, reference, client_hint}  (synthetic fixture)
export function reconcile(invoice, bankRow, opts = {}) {
  const reasons = [];
  if (!invoice || !bankRow) return { result: 'unmatched', confidence: 0, reasons: ['missing input'], auto_confirm: false };

  if (invoice.currency !== bankRow.currency) reasons.push('currency mismatch');

  const amt = bankRow.amount;
  const total = invoice.total;
  const refMatch = bankRow.reference && (bankRow.reference.includes(invoice.invoice_id) || bankRow.reference.includes(invoice.number || '___'));
  const clientMatch = bankRow.client_hint && invoice.client_reference && bankRow.client_hint.toLowerCase().includes(invoice.client_reference.toLowerCase());

  let result, confidence;
  if (amt === total && refMatch) { result = 'exact_match'; confidence = 0.99; }
  else if (amt === total && clientMatch) { result = 'probable_match'; confidence = 0.8; }
  else if (amt === total) { result = 'probable_match'; confidence = 0.6; reasons.push('amount matches, weak reference'); }
  else if (amt > total) { result = 'overpayment'; confidence = clientMatch || refMatch ? 0.7 : 0.4; reasons.push(`overpaid by ${amt - total}`); }
  else if (amt < total && (clientMatch || refMatch)) { result = 'underpayment'; confidence = 0.7; reasons.push(`underpaid by ${total - amt}`); }
  else { result = 'unmatched'; confidence = 0.1; reasons.push('no amount/reference/client match'); }

  // Duplicate detection via opts.seen references.
  if (opts.seenReferences && bankRow.reference && opts.seenReferences.includes(bankRow.reference)) {
    result = 'duplicate'; reasons.push('duplicate bank reference');
  }

  // NEVER auto-confirm anything below exact_match.
  const auto_confirm = false;
  return {
    result, confidence: Math.round(confidence * 100) / 100, reasons,
    auto_confirm,
    requires_owner_confirmation: result !== 'exact_match',
    note: 'Probable/over/under/unmatched are NEVER auto-confirmed. Owner confirms.',
  };
}

// Split payment detection: multiple rows against one invoice.
export function reconcileSplit(invoice, bankRows) {
  const sum = bankRows.reduce((s, r) => s + (r.amount || 0), 0);
  if (sum === invoice.total) return { result: 'split_payment', confidence: 0.75, rows: bankRows.length, auto_confirm: false };
  if (sum < invoice.total) return { result: 'partial_split', confidence: 0.6, outstanding: invoice.total - sum, auto_confirm: false };
  return { result: 'overpaid_split', confidence: 0.5, over: sum - invoice.total, auto_confirm: false };
}
