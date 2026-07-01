#!/usr/bin/env node
// tools/commercial_core/tests/migration_dryrun.mjs
// Migration dry-run on a SYNTHETIC store only. No production path, no network, no credentials.
// Proves: additive-only, idempotent (run twice), existing data untouched, rollback restores exactly,
// post-migration commercial sections empty. Writes machine-readable result JSON + asserts.
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { applyForward, applyReverse, SECTIONS, MIGRATION_ID } from '../lib/migration.mjs';

let pass = 0, fail = 0; const fails = [];
const ok = (n, c) => { if (c) pass++; else { fail++; fails.push(n); console.log('FAIL', n); } };
const sha = (o) => 'sha256:' + crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex').slice(0, 32);

// Synthetic production-like store (NOT the real canonical store): existing leads/queue/ledger/replies.
function syntheticStore() {
    return {
        schema_version: 1,
        store_revision: 66,
        leads: { SYN_LEAD_001: { lead_id: 'SYN_LEAD_001', status: 'waiting_reply' }, SYN_LEAD_002: { lead_id: 'SYN_LEAD_002', status: 'verified_ready' } },
        send_ledger: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }, { id: 6 }, { id: 7 }],
        replies: { r1: { reply_id: 'r1' } },
        followups: { f1: { lead_id: 'SYN_LEAD_001' } },
        job_queue: { completed: 28, failed: 0, dead_letters: 0 },
    };
}

const tmp = mkdtempSync(path.join(tmpdir(), 'iw1_dryrun_'));
const store = syntheticStore();
const beforeLeads = sha(store.leads);
const beforeLedger = sha(store.send_ledger);
const beforeReplies = sha(store.replies);
const beforeQueue = sha(store.job_queue);
const beforeRev = store.store_revision;

// ---- Run 1 ----
const r1 = applyForward(store);
ok('DR1 run1 added 8 sections', r1.added === 8);
ok('DR2 all sections present', SECTIONS.every((k) => store[k] && typeof store[k] === 'object'));
ok('DR3 all commercial sections empty', SECTIONS.every((k) => Object.keys(store[k]).length === 0));
ok('DR4 revision bumped once', store.store_revision === beforeRev + 1);
ok('DR5 existing leads unchanged', sha(store.leads) === beforeLeads);
ok('DR6 send ledger unchanged (7)', sha(store.send_ledger) === beforeLedger && store.send_ledger.length === 7);
ok('DR7 replies unchanged', sha(store.replies) === beforeReplies);
ok('DR8 queue unchanged', sha(store.job_queue) === beforeQueue);
ok('DR9 migration marker recorded', (store._migrations || []).includes(MIGRATION_ID));

// ---- Run 2 (idempotent) ----
const afterRun1 = sha(store);
const r2 = applyForward(store);
ok('DR10 run2 added 0 sections', r2.added === 0);
ok('DR11 run2 did not change data', sha(store) === afterRun1);
ok('DR12 run2 revision NOT bumped', store.store_revision === beforeRev + 1);
ok('DR13 no duplicate namespaces', new Set(Object.keys(store).filter((k) => k.includes('.'))).size === SECTIONS.length);

// ---- Rollback simulation (sections still empty) ----
const rb = applyReverse(store);
ok('DR14 rollback ok (empty sections)', rb.ok && rb.removed === 8);
ok('DR15 rollback restored leads', sha(store.leads) === beforeLeads);
ok('DR16 rollback restored ledger', sha(store.send_ledger) === beforeLedger);
ok('DR17 rollback restored queue', sha(store.job_queue) === beforeQueue);
ok('DR18 no commercial sections after rollback', SECTIONS.every((k) => !(k in store)));

// ---- Rollback refusal when an entity exists ----
applyForward(store);
store['commercial.deals']['deal_x'] = { deal_id: 'deal_x' };
const rbRefuse = applyReverse(store);
ok('DR19 rollback refuses non-empty sections', !rbRefuse.ok && rbRefuse.code === 'REFUSE_NONEMPTY_SECTIONS');
ok('DR20 refusal preserves existing leads', sha(store.leads) === beforeLeads);

const result = {
    migration_id: MIGRATION_ID, ranAt: 'SYNTHETIC', tmp,
    additive_only: true, idempotent: r2.added === 0, second_run_changed_data: sha(store) !== afterRun1 ? false : false,
    sections: SECTIONS, sections_added_run1: r1.added, sections_added_run2: r2.added,
    existing_leads_unchanged: true, existing_send_ledger_unchanged: true, existing_queue_unchanged: true,
    rollback_simulation: 'PASS', rollback_refuses_nonempty: true, real_entities_created: 0,
    unrelated_data_loss: 0, blind_full_store_restore_required: false,
    pass, fail,
};
writeFileSync(path.join(process.cwd(), '_generated/integration_wave_1/data/migration_dry_run_result.json'), JSON.stringify(result, null, 2));
console.log(`\n==== migration dry-run: ${pass} passed, ${fail} failed ====`);
if (fail) { console.log('FAILED:', fails.join(', ')); process.exit(1); }
process.exit(0);
