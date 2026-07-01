// apply_quarantine.mjs — additive, atomic quarantine of garbage leads for Master Controller.
// - NEVER deletes a lead; sets quarantine_status + moves nothing out of the canonical store.
// - Re-reads under the canonical write lock, adds store_revision (optimistic concurrency),
//   writes atomically (temp+rename) via the canonical accessor.
// - Refuses to touch ledger-linked / waiting_reply / send_uncertain / opt-out leads.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const WS = process.cwd();
const sa = await import(pathToFileURL(path.join(WS, 'tools', 'mater_controller_api', 'src', 'shared', 'store_access.mjs')).href);
const classification = JSON.parse(fs.readFileSync(path.join(WS, '13_sales', 'e2e_test', 'lead_classification.json'), 'utf8'));

const STORE = path.join(WS, '13_sales', 'lead_pipeline_store.json');
const linked = new Set(classification.ledgerLinked || []);
const candidates = (classification.quarantine || []).map((q) => q);

// Fresh backup immediately before write
const ts = '20260616_0815';
fs.copyFileSync(STORE, `${STORE}.bak_quarantine_${ts}`);

// Read current store fresh (the live bot may have changed it since classification)
const store = sa.readStore(STORE);
const leads = store.leads || {};

let applied = 0; const skipped = [];
for (const { id, category } of candidates) {
  const l = leads[id];
  if (!l) { skipped.push(`${id}:missing`); continue; }
  // Safety re-check at write time
  if (linked.has(id) || l.status === 'waiting_reply' || l.status === 'send_uncertain'
      || l.opt_out === true || l.do_not_contact === true || l.reply_state) {
    skipped.push(`${id}:protected`); continue;
  }
  if (l.quarantine_status) { skipped.push(`${id}:already`); continue; }
  // ADDITIVE flag — lead stays in store with full provenance, just marked quarantined.
  l.quarantine_status = 'quarantined';
  l.quarantine_category = category;
  l.quarantine_reason = category === 'DEAD_DOMAIN' ? 'domain_unreachable_guessed'
    : category === 'WRONG_IDENTITY' ? 'site_company_identity_mismatch' : category.toLowerCase();
  l.quarantined_at = '2026-06-16T08:15:00.000Z';
  l.quarantined_by = 'master_controller_cleanup';
  applied++;
}

// Optimistic concurrency fields
store.store_revision = (Number(store.store_revision) || 0) + 1;
store.updated_at = '2026-06-16T08:15:00.000Z';
store.updated_by = 'master_controller_cleanup';
store.last_operation_id = `quarantine_${ts}`;

sa.writeStoreAtomic(store, { backup: true, storePath: STORE });
console.log(JSON.stringify({ applied, skipped, store_revision: store.store_revision, total: Object.keys(leads).length }, null, 2));
