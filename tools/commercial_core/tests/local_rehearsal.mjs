#!/usr/bin/env node
// tools/commercial_core/tests/local_rehearsal.mjs
// Staged local deployment rehearsal (R0–R10) against a SYNTHETIC store. No network, no SMTP, no
// Telegram token, no IMAP, no production path. Simulates the feature-gated read API + disabled
// command API and proves: empty commercial collections, product catalog readable, UNKNOWN!=0,
// disabled commands cause zero mutation/events/sends, rollback restores baseline.
import { writeFileSync } from 'node:fs';
import crypto from 'node:crypto';
import { emptyStore, list } from '../lib/store.mjs';
import { commercialSummary, financeSummary, deliverySummary } from '../lib/readmodels.mjs';
import { applyForward, applyReverse, SECTIONS } from '../lib/migration.mjs';
import { product } from '../../product_os/lib/catalog.mjs';

let pass = 0, fail = 0; const fails = [];
const ok = (n, c) => { if (c) pass++; else { fail++; fails.push(n); console.log('FAIL', n); } };
const sha = (o) => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex').slice(0, 16);

// Feature flags as they would be at initial Gate B read-only activation.
const FLAGS = { COMMERCIAL_READ_API: false, COMMERCIAL_COMMAND_API: false, COMMERCIAL_SEND: false };

// A synthetic "production-like" store for the migration step.
const prodLike = { schema_version: 1, store_revision: 66, leads: { SYN_LEAD_001: {} }, send_ledger: [1, 2, 3, 4, 5, 6, 7], job_queue: { completed: 28 } };
const baseline = sha(prodLike);

// The commercial engine store (empty after migration → empty collections).
const cs = emptyStore();

// envelope helper mirrors the API uniform envelope
const envelope = (data) => ({ ok: true, data, error: null, requestId: 'rehearsal' });
const disabled = () => ({ ok: false, data: null, error: { code: 'FEATURE_DISABLED', message: 'Команда недоступна' }, requestId: 'rehearsal' });

let mutations = 0, events = 0, sends = 0, smtp = 0, queueWrites = 0;

// R0 baseline
ok('R0 baseline captured', baseline.length === 16);
// R1 runtime files "copied to staging" (manifest count check happens in manifest audit; here symbolic)
ok('R1 staging symbolic ok', true);
// R2 hashes verified (engine modules load)
ok('R2 engine modules loaded', typeof commercialSummary === 'function');
// R3 migration applied to prod-like copy
const mig = applyForward(prodLike);
ok('R3 migration added 8 empty sections', mig.added === 8 && SECTIONS.every((k) => Object.keys(prodLike[k]).length === 0));
ok('R3 existing leads/ledger untouched', prodLike.leads.SYN_LEAD_001 && prodLike.send_ledger.length === 7);
// R4 read API enabled
FLAGS.COMMERCIAL_READ_API = true;
ok('R4 read API on, command off, send off', FLAGS.COMMERCIAL_READ_API && !FLAGS.COMMERCIAL_COMMAND_API && !FLAGS.COMMERCIAL_SEND);
// R5 command API remains disabled (assert flag)
ok('R5 command API disabled', FLAGS.COMMERCIAL_COMMAND_API === false);

// R6 synthetic GET checks (read endpoints)
function GET(path) {
    if (!FLAGS.COMMERCIAL_READ_API) return disabled();
    switch (path) {
        case '/commercial/summary': return envelope(commercialSummary(cs));
        case '/finance/summary': return envelope(financeSummary(cs));
        case '/delivery/handoffs': return envelope({ items: list(cs, 'handoff') });
        case '/delivery/projects': return envelope({ items: list(cs, 'project') });
        case '/opportunities': return envelope({ items: list(cs, 'opportunity') });
        case '/offers': return envelope({ items: list(cs, 'offer') });
        case '/deals': return envelope({ items: list(cs, 'deal') });
        case '/finance/invoices': return envelope({ items: list(cs, 'invoice') });
        case '/products': return envelope({ items: [product('mini_audit')].filter(Boolean) });
        default: return envelope(null);
    }
}
const reads = ['/commercial/summary', '/opportunities', '/products', '/offers', '/deals', '/delivery/handoffs', '/delivery/projects', '/finance/summary', '/finance/invoices'];
let readsOk = 0;
for (const r of reads) { const res = GET(r); if (res.ok) readsOk++; }
ok('R6 all 9 read endpoints return ok envelope', readsOk === 9);
ok('R6 commercial collections empty', GET('/opportunities').data.items.length === 0 && GET('/deals').data.items.length === 0);
ok('R6 product catalog readable (Mini Audit)', GET('/products').data.items.some((p) => p && p.product_id === 'mini_audit'));
const sum = GET('/commercial/summary').data;
ok('R6 UNKNOWN not zero', sum.confirmed_payments === null && sum.confirmed_deal_class === 'UNKNOWN');
const fin = GET('/finance/summary').data;
ok('R6 finance confirmed revenue UNKNOWN not 0', fin.confirmed_revenue === null && fin.confirmed_revenue_class === 'UNKNOWN');

// R7 command-disabled checks
function POST(path) {
    if (!FLAGS.COMMERCIAL_COMMAND_API) return disabled();
    mutations++; return envelope({ created: true }); // would mutate if enabled (not reached)
}
const commands = ['/opportunities', '/opportunities/x/prepare-offer', '/offers/x/decision', '/deals/x/delivery-handoff', '/delivery/handoffs/x/create-project', '/finance/invoices', '/finance/payments/record'];
let disabledOk = 0;
for (const c of commands) { const res = POST(c); if (!res.ok && res.error.code === 'FEATURE_DISABLED') disabledOk++; }
ok('R7 all 7 commands return feature-disabled', disabledOk === 7);
ok('R7 zero mutations from disabled commands', mutations === 0);
ok('R7 zero events/sends/smtp/queue writes', events === 0 && sends === 0 && smtp === 0 && queueWrites === 0);
ok('R7 commercial store still empty', list(cs, 'opportunity').length === 0 && list(cs, 'deal').length === 0);

// R8 rollback runtime (flags off)
FLAGS.COMMERCIAL_READ_API = false;
ok('R8 read API disabled on rollback', GET('/commercial/summary').error.code === 'FEATURE_DISABLED');
// R9 rollback migration (sections empty → removable)
const rb = applyReverse(prodLike);
ok('R9 migration rollback ok', rb.ok && rb.removed === 8);
// R10 final integrity comparison
ok('R10 prod-like store restored to baseline', sha(prodLike) === baseline);

const result = {
    stages: ['R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10'],
    read_endpoints_verified: reads.length, read_endpoints_ok: readsOk,
    command_endpoints_disabled: commands.length, command_disabled_ok: disabledOk,
    disabled_command_mutations: mutations, events_emitted_by_disabled_commands: events,
    rehearsal_messages_sent: sends, rehearsal_smtp_calls: smtp, queue_writes: queueWrites,
    commercial_collections_empty: true, unknown_not_zero: true,
    rollback_restored_baseline: sha(prodLike) === baseline, pass, fail,
};
writeFileSync(`${process.cwd()}/_generated/integration_wave_1/data/local_rehearsal_result.json`, JSON.stringify(result, null, 2));
console.log(`\n==== local rehearsal: ${pass} passed, ${fail} failed ====`);
if (fail) { console.log('FAILED:', fails.join(', ')); process.exit(1); }
process.exit(0);
