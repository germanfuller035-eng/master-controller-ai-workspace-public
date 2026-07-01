// tools/finance_os/lib/reports.mjs
// Phase 33: Financial Report Factory. JSON/Markdown/CSV. Default INTERNAL_MANAGERIAL. No sending.

export const REPORT_TYPES = [
  'invoice_register', 'payment_register', 'receivables_aging', 'expense_report', 'project_profitability',
  'product_profitability', 'monthly_pnl', 'cashflow', 'budget_variance', 'reserve_report', 'debt_report',
  'business_unit_report', 'owner_summary',
];

export function buildReport(type, data, opts = {}) {
  if (!REPORT_TYPES.includes(type)) return { ok: false, error: `unknown report type ${type}` };
  const json = { schema: 'finance_os.report.v1', type, label: 'INTERNAL_MANAGERIAL', send_allowed: false, generated_ts: opts.ts || 'UNSTAMPED', data };
  return { ok: true, json, markdown: renderMd(type, data), csv: opts.csv ? renderCsv(data) : null };
}

function renderMd(type, data) {
  const L = [`# ${type.replace(/_/g, ' ')}`, '', '> **INTERNAL_MANAGERIAL** · send_allowed=false', ''];
  if (Array.isArray(data)) { data.slice(0, 100).forEach((row) => L.push(`- ${typeof row === 'object' ? JSON.stringify(row) : row}`)); }
  else if (data && typeof data === 'object') { for (const [k, v] of Object.entries(data)) L.push(`- **${k}**: ${typeof v === 'object' ? JSON.stringify(v) : v}`); }
  return L.join('\n');
}

function renderCsv(data) {
  if (!Array.isArray(data) || !data.length) return '';
  const keys = Object.keys(data[0]);
  const rows = [keys.join(',')];
  for (const r of data) rows.push(keys.map((k) => JSON.stringify(r[k] ?? '')).join(','));
  return rows.join('\n');
}
