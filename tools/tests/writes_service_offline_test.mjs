// writes_service_offline_test.mjs — PURE offline, no network, no send.
// Uses the REAL writes/service.mjs functions against a temp store in the PRODUCTION
// shape (leads as an object-map keyed by lead_id). Proves transaction persistence,
// revision bump, operation idempotency, revision-conflict, restart recovery, no lost update.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n); } };

// temp store in PRODUCTION shape (object-map). Point the service at it BEFORE import.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'writes_'));
const storePath = path.join(dir, 'lead_pipeline_store.json');
fs.writeFileSync(storePath, JSON.stringify({
    version: 1, store_revision: 1, updated_at: '2026-06-16T00:00:00Z',
    leads: {
        'KGBI23_RU': { lead_id: 'KGBI23_RU', company: 'КГБИ', status: 'hold_later' },
        'ACME_RU': { lead_id: 'ACME_RU', company: 'Acme', status: 'waiting_reply' },
    },
}, null, 2));
process.env.MATER_STORE_PATH = storePath;
process.env.MATER_API_SECRETS_DIR = path.join(dir, 'sec');

const writes = await import('../mater_controller_api/src/writes/service.mjs');
const { readStore } = await import('../mater_controller_api/src/shared/store_access.mjs');
const read = () => readStore(storePath);
const leadOf = (s, id) => (Array.isArray(s.leads) ? s.leads.find(l => l.lead_id === id) : s.leads[id]);

// 1. transaction persists + revision bump (object-map shape)
let r = writes.updateLeadStatus({ leadId: 'KGBI23_RU', status: 'verified_ready', operationId: 'op-1' });
ok('mutation written', r.written === true);
ok('revision bumped 1->2', r.revision === 2);
ok('persisted to disk (object-map)', leadOf(read(), 'KGBI23_RU').status === 'verified_ready');

// 2. idempotency: same op-1 with different status → no double-apply
const revBefore = read().store_revision;
let r2 = writes.updateLeadStatus({ leadId: 'KGBI23_RU', status: 'rejected', operationId: 'op-1' });
ok('idempotent op flagged', r2.idempotent === true);
ok('idempotent op did not bump revision', read().store_revision === revBefore);
ok('idempotent op did NOT overwrite status', leadOf(read(), 'KGBI23_RU').status === 'verified_ready');

// 3. revision conflict
let threw = false;
try { writes.updateLeadStatus({ leadId: 'ACME_RU', status: 'rejected', operationId: 'op-2', expectedRevision: 1 }); }
catch (e) { threw = e.code === 'STORE_REVISION_CONFLICT'; }
ok('stale expectedRevision → STORE_REVISION_CONFLICT', threw);

// 4. correct expectedRevision succeeds
const cur = read().store_revision;
let r4 = writes.updateLeadStatus({ leadId: 'ACME_RU', status: 'rejected', operationId: 'op-3', expectedRevision: cur });
ok('correct expectedRevision applies', r4.written === true);

// 5. restart recovery
ok('restart recovery: ACME rejected on disk', leadOf(read(), 'ACME_RU').status === 'rejected');

// 6. draft save + reject (object-map)
let d = writes.saveLeadDraft({ leadId: 'KGBI23_RU', draft: { subject: 'Hi', body: 'X' }, operationId: 'op-4' });
ok('draft saved v1', d.written === true && d.draftVersion === 1);
let dr = writes.rejectLeadDraft({ leadId: 'KGBI23_RU', reason: 'test', operationId: 'op-5' });
ok('draft rejected', dr.written === true);
ok('draft rejection persisted', !!leadOf(read(), 'KGBI23_RU').draft_rejected);

// 7. unknown lead → LEAD_NOT_FOUND (not a crash)
let nf = writes.updateLeadStatus({ leadId: 'NOPE_RU', status: 'rejected', operationId: 'op-6' });
ok('unknown lead → LEAD_NOT_FOUND', nf.ok === false && nf.code === 'LEAD_NOT_FOUND');

// 8. non-writable status rejected
let bad = writes.updateLeadStatus({ leadId: 'ACME_RU', status: 'totally_made_up', operationId: 'op-7' });
ok('non-writable status rejected', bad.ok === false && bad.code === 'STATUS_NOT_WRITABLE');

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n==== writes_service: ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
