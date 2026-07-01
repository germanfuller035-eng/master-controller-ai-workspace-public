// leadgen_verify.mjs — Master Controller canonical lead verification gate (REVIEW_ONLY).
// Lightweight, VPS-friendly (curl/DNS over Node core, no headless browser).
// Takes candidate {company, domain} pairs and runs the canonical gate:
//   SOURCE -> DNS resolve -> HTTPS reachable -> identity match (company tokens on page)
//   -> region check -> contact evidence (email/tel/form on page) -> RISK GATE -> verdict.
// Produces provenance per lead. NEVER sends outreach. NEVER auto-promotes to READY.
import dns from 'node:dns/promises';
import https from 'node:https';

// Use explicit public resolvers for c-ares (environment may have none configured),
// and fall back to the OS resolver (getaddrinfo) which is known to work here.
try { dns.setServers(['1.1.1.1', '8.8.8.8']); } catch { /* ignore */ }
async function resolveDomain(domain) {
  try { const a = await dns.resolve4(domain); if (a && a.length) return a; } catch { /* fall through */ }
  try { const r = await dns.lookup(domain, { family: 4 }); if (r && r.address) return [r.address]; } catch { /* fall through */ }
  return [];
}

const CANDIDATES = [
  { company: 'КЖБИ', domain: 'kgbi23.ru', region: 'Краснодарский край', industry: 'ЖБИ' },
  // guessed-style domains that previously polluted the store (should FAIL the gate):
  { company: 'ЖБИ Кубань', domain: 'jbi-kuban.ru', region: 'Краснодарский край', industry: 'ЖБИ' },
  { company: 'Бетон Кубани', domain: 'beton-kubani.ru', region: 'Краснодарский край', industry: 'бетон' },
];

function fetchHtml(host) {
  return new Promise((resolve) => {
    const req = https.request({ host, path: '/', method: 'GET', timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MasterControllerLeadVerify/1.0)' } }, (res) => {
      let body = ''; let size = 0;
      res.on('data', (c) => { size += c.length; if (size < 600000) body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '', error: 'timeout' }); });
    req.on('error', (e) => resolve({ status: 0, body: '', error: e.code || e.message }));
    req.end();
  });
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const TEL_RE = /tel:\+?[0-9()\-\s]{6,}/i;
const tokens = (s) => String(s).toLowerCase().replace(/[^a-zа-я0-9 ]/gi, ' ').split(/\s+/).filter((t) => t.length > 2);

async function verify(c) {
  const out = { company: c.company, domain: c.domain, region: c.region, industry: c.industry,
    source_name: 'live_discovery_sample', source_url: `https://${c.domain}`, discovered_at: '2026-06-16',
    domain_status: null, website_reachable: false, identity_match_status: 'not_verified',
    identity_confidence: 'low', region_check: 'unverified', contact_evidence_url: null,
    email_status: 'missing', email_on_official_site: null, phone_found: false, contact_form_found: false,
    risk_flags: [], verification_method: 'dns+https+html', verification_timestamp: '2026-06-16',
    quality_score: 0, verdict: 'MANUAL_REVIEW', next_action: 'review' };

  // DNS
  try { const a = await resolveDomain(c.domain); out.domain_status = a.length ? 'resolves' : 'no_a_record'; if (a.length) out.dns_a = a[0]; if (!a.length) { out.risk_flags.push('domain_unresolved'); out.verdict = 'DEAD_DOMAIN'; out.next_action = 'quarantine'; return out; } }
  catch { out.domain_status = 'nxdomain'; out.risk_flags.push('domain_unresolved'); out.verdict = 'DEAD_DOMAIN'; out.next_action = 'quarantine'; return out; }

  // HTTPS + HTML
  const r = await fetchHtml(c.domain);
  if (!r.status || r.status >= 400) { out.risk_flags.push('site_unreachable'); out.verdict = 'DEAD_DOMAIN'; out.next_action = 'quarantine'; return out; }
  out.website_reachable = true;
  const html = (r.body || '').toLowerCase();

  // identity: company tokens present on page
  const ct = tokens(c.company); const hits = ct.filter((t) => html.includes(t));
  if (hits.length >= Math.max(1, Math.ceil(ct.length / 2))) { out.identity_match_status = 'matched'; out.identity_confidence = 'high'; }
  else { out.identity_match_status = 'mismatch'; out.risk_flags.push('identity_unconfirmed'); }

  // region
  if (html.includes(c.region.toLowerCase().split(' ')[0].slice(0, 6)) || /краснодар|кубан|адыге/.test(html)) out.region_check = 'matched';
  else out.risk_flags.push('region_unconfirmed');

  // contact evidence
  const email = (r.body.match(EMAIL_RE) || [])[0] || null;
  out.email_on_official_site = email; out.email_status = email ? 'found_on_site' : 'missing';
  out.phone_found = TEL_RE.test(r.body);
  out.contact_form_found = /<form/i.test(r.body);
  if (email || out.phone_found || out.contact_form_found) out.contact_evidence_url = `https://${c.domain}`;

  // scoring + risk gate
  let score = 0;
  if (out.domain_status === 'resolves') score += 20;
  if (out.website_reachable) score += 20;
  if (out.identity_match_status === 'matched') score += 25;
  if (out.region_check === 'matched') score += 15;
  if (out.contact_evidence_url) score += 20;
  out.quality_score = score;

  // VERIFIED_READY requires ALL gates; else MANUAL_REVIEW. NEVER auto-promote.
  const allPass = out.domain_status === 'resolves' && out.website_reachable
    && out.identity_match_status === 'matched' && out.region_check === 'matched' && !!out.contact_evidence_url;
  out.verdict = allPass ? 'VERIFIED_CANDIDATE_REVIEW_ONLY' : 'MANUAL_REVIEW';
  out.next_action = 'human_review'; // explicit: no auto-promote, no outreach
  return out;
}

const results = [];
for (const c of CANDIDATES) results.push(await verify(c));
console.log(JSON.stringify(results, null, 2));
