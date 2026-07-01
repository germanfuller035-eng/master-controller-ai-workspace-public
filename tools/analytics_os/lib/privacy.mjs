// tools/analytics_os/lib/privacy.mjs
// Privacy + data-minimization validator (Phase 21). Read-only.
// Flags secrets, raw PII, oversized text, and non-stable identifiers in analytics artifacts.

const SECRET_RX = [
  { name: 'telegram_token', re: /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/ },
  { name: 'private_key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'password_assign', re: /(password|smtp_pass|api_key|secret)["']?\s*[:=]\s*["']?[^\s"',}]{6,}/i },
];
const REAL_EMAIL_RX = /[A-Za-z0-9._%+-]+@(?!.*\.test\b)(?!example\.)(?!.*acme\.test)[A-Za-z0-9.-]+\.(ru|com|org|net|io)\b/;
const PHONE_RX = /(?:\+\d{1,3}[\s-]?)?(?:\(?\d{3}\)?[\s-]?){2}\d{2,4}/;

// Scan a single object/record for privacy violations.
export function scanRecord(rec, { allowEmailFields = [] } = {}) {
  const violations = [];
  const json = JSON.stringify(rec);
  for (const s of SECRET_RX) if (s.re.test(json)) violations.push({ kind: 'SECRET', detail: s.name });
  for (const [k, v] of Object.entries(rec || {})) {
    if (typeof v !== 'string') continue;
    if (!allowEmailFields.includes(k) && REAL_EMAIL_RX.test(v)) violations.push({ kind: 'RAW_EMAIL', field: k });
    if (k.toLowerCase().includes('phone') && PHONE_RX.test(v)) violations.push({ kind: 'RAW_PHONE', field: k });
    if ((k === 'body' || k === 'message_body') && v.length > 200) violations.push({ kind: 'FULL_MESSAGE_BODY', field: k });
  }
  // identifier stability: ref ids should be stable tokens, not raw names
  if (rec && rec.customer_name) violations.push({ kind: 'RAW_NAME', field: 'customer_name' });
  return violations;
}

// Scan a dataset (array of records). Returns aggregate.
export function scanDataset(rows, opts) {
  const all = [];
  (rows || []).forEach((r, i) => scanRecord(r, opts).forEach((v) => all.push({ ...v, row: i })));
  return { total: all.length, violations: all, ok: all.length === 0 };
}

// Minimization principle check on a metric/observation: prefer aggregates + references over copies.
export function checkMinimization(artifact) {
  const issues = [];
  if (artifact.copies_source_rows === true) issues.push('artifact copies source rows instead of referencing');
  if (artifact.grain === 'individual' && artifact.aggregatable === true) issues.push('individual grain where aggregate would suffice');
  if (artifact.redaction_applied === false && artifact.contains_free_text === true) issues.push('free text not redacted');
  return issues;
}
