// lead_pipeline_offline_test.mjs
// BLOCK B offline regression — pure, no send, no mark, no network.
import assert from 'node:assert';
import {
    runLeadPipeline,
    classifyLead,
    formatLeadPipelineReport,
    REASON_NO_SITE,
    REASON_ALREADY_CONTACTED,
    REASON_NO_CONTACT,
    REASON_FAKE_EMAIL,
} from '../telegram_gateway/lead_pipeline.mjs';

let pass = 0;
function ok(name) { pass++; console.log(`  ok - ${name}`); }

// Injected registry: ZB23 has a real email, ACME has none.
const registry = {
    ZB23: { company: 'ЖЕЛЕЗОБЕТОН', website: 'zb23.ru', primary_email: 'kvs@zb23.ru', source: 'manual' },
};

const leads = [
    { lead_id: 'ZB23', company: 'ЖЕЛЕЗОБЕТОН', website: 'zb23.ru' },        // ready (real email)
    { lead_id: 'NOSITE', company: 'NoSite Co', website: '' },                // no_site
    { lead_id: 'NOMAIL', company: 'NoMail Co', website: 'nomail.ru' },       // no_contact
    { lead_id: 'FAKE', company: 'Fake Co', website: 'fake.ru', email: 'test@example.com' }, // fake_email
];

// 1) ready/blocked counts (no ledger -> nobody contacted)
const r1 = runLeadPipeline({ leads, registry, contactedIds: new Set() });
assert.strictEqual(r1.ready, 1, 'exactly 1 ready');
assert.strictEqual(r1.blocked, 3, 'exactly 3 blocked');
ok('ready=1 blocked=3');

// 2) next ready lead is ZB23 and sendable with real email
assert.ok(r1.nextReady, 'nextReady present');
assert.strictEqual(r1.nextReady.lead_id, 'ZB23', 'nextReady is ZB23');
assert.strictEqual(r1.nextReady.email, 'kvs@zb23.ru', 'real email surfaced');
ok('nextReady=ZB23 with real email');

// 3) blocked reasons are correct
const byId = Object.fromEntries(r1.items.map((i) => [i.lead_id, i]));
assert.strictEqual(byId.NOSITE.reason, REASON_NO_SITE, 'NOSITE -> no_site');
assert.strictEqual(byId.NOMAIL.reason, REASON_NO_CONTACT, 'NOMAIL -> no_contact');
assert.strictEqual(byId.FAKE.reason, REASON_FAKE_EMAIL, 'FAKE -> fake_email');
ok('blocked reasons: no_site / no_contact / fake_email');

// 4) fake email is NEVER sendable
assert.strictEqual(byId.FAKE.sendable, false, 'fake never sendable');
assert.strictEqual(byId.FAKE.email, '', 'fake email never surfaced');
ok('fake/example/test recipient is blocked');

// 5) already-contacted: ZB23 in ledger -> becomes blocked, ready drops to 0
const r2 = runLeadPipeline({ leads, registry, contactedIds: new Set(['zb23']) });
assert.strictEqual(r2.ready, 0, 'ready=0 when ZB23 already contacted');
const zb = r2.items.find((i) => i.lead_id === 'ZB23');
assert.strictEqual(zb.reason, REASON_ALREADY_CONTACTED, 'ZB23 -> already_contacted');
assert.strictEqual(r2.nextReady, null, 'no nextReady when all contacted/blocked');
ok('already_contacted skips sent lead');

// 6) report renders and NEVER claims a send happened
const txt = formatLeadPipelineReport(r1);
assert.ok(/ready leads: 1/.test(txt), 'report shows ready count');
assert.ok(/blocked leads: 3/.test(txt), 'report shows blocked count');
assert.ok(/НИЧЕГО не отправлено/.test(txt), 'report states nothing sent');
assert.ok(!/SENT/.test(txt), 'report never says SENT');
ok('report is read-only and honest');

// 7) classifyLead never marks contacted / mutates input
const before = JSON.stringify(leads[0]);
classifyLead(leads[0], { registry, contactedIds: new Set() });
assert.strictEqual(JSON.stringify(leads[0]), before, 'input lead not mutated');
ok('classifyLead does not mutate or mark');

console.log(`\nBLOCK B lead_pipeline offline: ${pass} checks GREEN`);
