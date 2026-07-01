// tools/finance_os/lib/receivables.mjs
// Phase 8: Accounts Receivable. Aging views + metrics. No reminders sent (drafts only, send_allowed=false).

// invoices: [{invoice_id, client_reference, total, currency, status, due_date, paid_amount, disputed, evidence_missing}]
// now: 'YYYY-MM-DD'
export function buildReceivables(invoices, now) {
  const open = invoices.filter((i) => !['PAID', 'CANCELLED', 'WRITTEN_OFF'].includes(i.status));
  const ageDays = (due) => due && now ? Math.round((Date.parse(now) - Date.parse(due)) / 86400000) : null;

  const buckets = { upcoming: [], due_today: [], overdue_1_7: [], overdue_8_30: [], overdue_31_plus: [], disputed: [], partially_paid: [], blocked_missing_evidence: [] };
  for (const i of open) {
    const outstanding = (i.total || 0) - (i.paid_amount || 0);
    const rec = { invoice_id: i.invoice_id, client: i.client_reference, outstanding, due_date: i.due_date };
    if (i.disputed) buckets.disputed.push(rec);
    else if (i.evidence_missing) buckets.blocked_missing_evidence.push(rec);
    else if (i.status === 'PARTIALLY_PAID') buckets.partially_paid.push(rec);
    const d = ageDays(i.due_date);
    if (d == null) buckets.upcoming.push(rec);
    else if (d < 0) buckets.upcoming.push(rec);
    else if (d === 0) buckets.due_today.push(rec);
    else if (d <= 7) buckets.overdue_1_7.push(rec);
    else if (d <= 30) buckets.overdue_8_30.push(rec);
    else buckets.overdue_31_plus.push(rec);
  }

  const totalReceivable = open.reduce((s, i) => s + ((i.total || 0) - (i.paid_amount || 0)), 0);
  const overdue = [...buckets.overdue_1_7, ...buckets.overdue_8_30, ...buckets.overdue_31_plus].reduce((s, r) => s + r.outstanding, 0);
  const byClient = {};
  for (const i of open) byClient[i.client_reference] = (byClient[i.client_reference] || 0) + ((i.total || 0) - (i.paid_amount || 0));
  const largest = Object.entries(byClient).sort((a, b) => b[1] - a[1])[0] || null;
  const dueDays = open.map((i) => ageDays(i.due_date)).filter((d) => d != null && d > 0);

  return {
    label: 'MANAGERIAL_INTERNAL',
    buckets,
    metrics: {
      total_receivable: Math.round(totalReceivable),
      current: Math.round(totalReceivable - overdue),
      overdue: Math.round(overdue),
      average_days_outstanding: dueDays.length ? Math.round(dueDays.reduce((a, b) => a + b, 0) / dueDays.length) : 0,
      largest_exposure: largest ? { client: largest[0], amount: Math.round(largest[1]) } : null,
      concentration_pct: largest && totalReceivable ? Math.round((largest[1] / totalReceivable) * 100) : 0,
    },
    // Reminder DRAFTS only — never sent.
    reminder_drafts: [...buckets.overdue_1_7, ...buckets.overdue_8_30, ...buckets.overdue_31_plus].map((r) => ({
      invoice_id: r.invoice_id, label: 'INTERNAL_DRAFT', send_allowed: false,
      body: `Напоминание об оплате по счёту ${r.invoice_id} (черновик, не отправлять без approval).`,
    })),
  };
}
