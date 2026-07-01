// tools/ai_hq/lib/redact.mjs
// Secret/sensitive redaction shared by all AI HQ tools.
// Never prints secret values; replaces with typed placeholders.

// Patterns that indicate a secret VALUE (not just a key name).
const SECRET_VALUE_PATTERNS = [
  { name: 'telegram_bot_token', re: /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/g },
  { name: 'ssh_private_key', re: /-----BEGIN (?:RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY-----/g },
  { name: 'aws_access_key', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'bearer_token', re: /\bBearer\s+[A-Za-z0-9._\-]{20,}\b/gi },
  { name: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { name: 'generic_hex_secret', re: /\b[0-9a-f]{40,}\b/gi },
  { name: 'slack_token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: 'google_api_key', re: /\bAIza[0-9A-Za-z_\-]{30,}\b/g },
];

// Key=value style assignments where the KEY looks sensitive.
const SECRET_ASSIGNMENT_RE =
  /\b([A-Z0-9_]*(?:PASSWORD|PASSWD|SECRET|TOKEN|API[_-]?KEY|APIKEY|PRIVATE[_-]?KEY|ACCESS[_-]?KEY|CLIENT[_-]?SECRET|AUTH|CREDENTIAL|PASSPHRASE|SIGNING[_-]?KEY)[A-Z0-9_]*)\s*[:=]\s*["']?([^"'\s,}#]{4,})/gi;

// HTTP header style secrets.
const HEADER_SECRET_RE = /\b(Authorization|Cookie|X-Api-Key|X-Auth-Token|Proxy-Authorization)\s*:\s*([^\r\n]{4,})/gi;

// Secret-looking query params in URLs.
const QUERY_SECRET_RE = /([?&](?:token|api_key|apikey|access_token|key|secret|password|auth)=)([^&\s"']+)/gi;

export function redactString(input) {
  if (typeof input !== 'string') return { text: input, hits: [] };
  let text = input;
  const hits = [];

  for (const { name, re } of SECRET_VALUE_PATTERNS) {
    text = text.replace(re, () => { hits.push(name); return `«REDACTED:${name}»`; });
  }
  text = text.replace(SECRET_ASSIGNMENT_RE, (m, key) => {
    hits.push(`assignment:${key}`);
    return `${key}=«REDACTED»`;
  });
  text = text.replace(HEADER_SECRET_RE, (m, h) => {
    hits.push(`header:${h}`);
    return `${h}: «REDACTED»`;
  });
  text = text.replace(QUERY_SECRET_RE, (m, prefix) => {
    hits.push('query_param');
    return `${prefix}«REDACTED»`;
  });
  return { text, hits };
}

// Returns array of {category, severity} findings WITHOUT exposing values.
export function scanForSecrets(input) {
  if (typeof input !== 'string') return [];
  const findings = [];
  for (const { name, re } of SECRET_VALUE_PATTERNS) {
    const matches = input.match(re);
    if (matches && matches.length) {
      const severity = /private_key|telegram|aws|google|slack/.test(name) ? 'critical' : 'high';
      findings.push({ category: name, count: matches.length, severity });
    }
  }
  let m;
  const assignRe = new RegExp(SECRET_ASSIGNMENT_RE.source, SECRET_ASSIGNMENT_RE.flags);
  let assignCount = 0;
  while ((m = assignRe.exec(input)) !== null) {
    // Ignore obvious placeholders/examples and our own redaction markers.
    const val = m[2] || '';
    if (/^(your|example|changeme|xxx+|<.*>|\*+|placeholder|redacted|dummy|test)$/i.test(val)) continue;
    if (val.includes('REDACTED') || val.includes('«')) continue;
    assignCount++;
  }
  if (assignCount) findings.push({ category: 'sensitive_key_assignment', count: assignCount, severity: 'high' });
  return findings;
}

export function redactObject(obj) {
  const json = JSON.stringify(obj);
  const { text, hits } = redactString(json);
  try { return { value: JSON.parse(text), hits }; }
  catch { return { value: obj, hits }; }
}
