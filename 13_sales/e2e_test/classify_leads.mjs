// classify_leads.mjs — read-only lead classification for Master Controller cleanup.
// Produces counts per category and a quarantine candidate list. Does NOT mutate the store.
import fs from 'node:fs';
import path from 'node:path';

const WS = process.cwd();
const STORE = path.join(WS, '13_sales', 'lead_pipeline_store.json');
const LEDGER = path.join(WS, '13_sales', 'outbound_send_ledger.jsonl');

const store = JSON.parse(fs.readFileSync(STORE, 'utf8'));
const leads = store.leads || {};

// Ledger-linked lead ids (must always keep)
const linked = new Set();
try {
  for (const line of fs.readFileSync(LEDGER, 'utf8').trim().split(/\n/)) {
    try { const o = JSON.parse(line); if (o.lead_id) linked.add(String(o.lead_id)); } catch {}
  }
} catch {}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function classify(id, l) {
  const status = String(l.status || '');
  // Preserve-first rules
  if (l.opt_out === true || l.do_not_contact === true) return 'DO_NOT_CONTACT';
  if (linked.has(id)) return 'HISTORICAL_KEEP';
  if (status === 'waiting_reply') return 'WAITING_REPLY_KEEP';
  if (status === 'send_uncertain' || l.last_send_status === 'uncertain_no_smtp_proof') return 'SEND_UNCERTAIN_REVIEW';
  if (l.reply_state || status === 'replied') return 'HISTORICAL_KEEP';
  if (String(id).startsWith('TEST') || l.environment === 'TEST') return 'TEST_ONLY';
  // Quality-based
  const reachable = l.website_reachable;
  if (reachable === false || l.domain_validation_status === 'dead' || l.domain_status === 'dead') return 'DEAD_DOMAIN';
  if (l.identity_match_status && /mismatch|wrong/i.test(String(l.identity_match_status))) return 'WRONG_IDENTITY';
  const email = String(l.email || l.recipient || '').trim();
  const emailOk = email && EMAIL_RE.test(email) && l.email_verified === true;
  if (status === 'ready' && emailOk) return 'VERIFIED_READY';
  if (status === 'written_channel_search_queue' || status === 'hold_no_public_email') return 'CONTACT_FORM_ONLY';
  if (status === 'hold_later' || status === 'needs_identity_verification') return 'MANUAL_REVIEW';
  if (status === 'rejected') {
    // rejected + no contact evidence + not linked => garbage candidate
    if (!emailOk && !l.contact_form_found && !l.phone_found) return 'QUARANTINED';
    return 'MANUAL_REVIEW';
  }
  if (!email && !l.contact_form_found && !l.phone_found) return 'INVALID_CONTACT';
  return 'MANUAL_REVIEW';
}

const counts = {}; const byCat = {};
for (const [id, l] of Object.entries(leads)) {
  const c = classify(id, l);
  counts[c] = (counts[c] || 0) + 1;
  (byCat[c] = byCat[c] || []).push(id);
}

// Quarantine candidates: only QUARANTINED + DEAD_DOMAIN that are NOT ledger-linked / waiting / uncertain / opt-out
const quarantineCats = new Set(['QUARANTINED', 'DEAD_DOMAIN', 'WRONG_IDENTITY', 'INVALID_CONTACT']);
const quarantine = [];
for (const [c, ids] of Object.entries(byCat)) {
  if (quarantineCats.has(c)) for (const id of ids) if (!linked.has(id)) quarantine.push({ id, category: c });
}

console.log('TOTAL', Object.keys(leads).length);
console.log('COUNTS', JSON.stringify(counts, null, 1));
console.log('QUARANTINE_CANDIDATES', quarantine.length);
console.log(JSON.stringify(quarantine));
fs.writeFileSync(path.join(WS, '13_sales', 'e2e_test', 'lead_classification.json'), JSON.stringify({ total: Object.keys(leads).length, counts, byCat, quarantine, ledgerLinked: [...linked] }, null, 2));
