// lead_import_readonly_live_control_d3_2_test.mjs
// =============================================================================
// D3-2 — Standalone tests for the read-only live-control module.
//
// Verifies: counts, status lookups (import_id + lead_id), safe review (no raw
// PII), health flags, missing-id safe failure, malformed-command safe failure,
// NO write APIs used, and production-file sha256 before == after.
//
// READ-ONLY: this test never mutates production data.
// =============================================================================

import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as ctl from '../telegram_gateway/lead_import_readonly_live_control.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE = path.resolve(path.join(__dirname, '..', '..'));

const QUEUE_PATH = path.join(WORKSPACE, '13_sales', 'approval_queue', 'lead_import_approvals.json');
const CONTACTS_PATH = path.join(WORKSPACE, '13_sales', 'lead_contacts.json');
const OPTS = { queuePath: QUEUE_PATH, contactsPath: CONTACTS_PATH };

const KNOWN_IMPORT_ID = 'IMP-20260606-100554-941263';
const KNOWN_LEAD_ID = 'DLF-20260603-0001';

function sha256(p) {
    if (!fs.existsSync(p)) return 'MISSING';
    return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

// Raw PII pattern guard: emails and phone numbers must never appear in output.
// Structured system IDs (IMP-/DLF-/SNAP-/timestamps) legitimately contain long
// digit runs with dashes — strip them before scanning for phone-like sequences.
function assertNoRawPII(text) {
    assert.ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(text), 'output must not contain raw email');
    const scrubbed = text
        .replace(/\b(?:IMP|DLF|SNAP|SNP)-[A-Za-z0-9-]+/g, 'ID')
        .replace(/\b\d{4}-\d{2}-\d{2}\b/g, 'DATE');
    assert.ok(!/\+?\d[\d\s().-]{7,}\d/.test(scrubbed), 'output must not contain raw phone');
}


const results = [];
function test(name, fn) {
    try {
        fn();
        results.push({ name, ok: true });
        console.log(`✅ ${name}`);
    } catch (err) {
        results.push({ name, ok: false, error: err.message });
        console.log(`❌ ${name}\n   ${err.message}`);
    }
}

// ---- sha256 snapshot before ----
const beforeQueue = sha256(QUEUE_PATH);
const beforeContacts = sha256(CONTACTS_PATH);

// ---- 1. /lead_queue returns counts ----
test('/lead_queue returns counts + top cards + blocked flags', () => {
    const r = ctl.buildLeadQueue(OPTS);
    assert.strictEqual(r.ok, true);
    assert.ok(r.counts && typeof r.counts.total === 'number', 'counts.total numeric');
    assert.ok(r.counts.total >= 1, 'at least 1 card');
    assert.ok(Array.isArray(r.top), 'top is array');
    assert.ok(r.text.includes('client_contact: BLOCKED'), 'client_contact BLOCKED');
    assert.ok(r.text.includes('auto_send: BLOCKED'), 'auto_send BLOCKED');
});

// ---- 2. /lead_status <import_id> → COMMITTED + snapshot ----
test('/lead_status import_id returns COMMITTED + snapshot', () => {
    const r = ctl.buildLeadStatus(KNOWN_IMPORT_ID, OPTS);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.found, true);
    assert.ok(r.has_card, 'found in approval queue');
    assert.ok(/COMMITTED/i.test(r.text), 'status COMMITTED present');
    assert.ok(/SNAP-/.test(r.text), 'snapshot id present');
    assertNoRawPII(r.text);
});

// ---- 3. /lead_status <lead_id> → lead found + snapshot ----
test('/lead_status lead_id returns lead found + snapshot', () => {
    const r = ctl.buildLeadStatus(KNOWN_LEAD_ID, OPTS);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.found, true);
    assert.ok(r.has_contact, 'found in lead_contacts');
    assert.ok(/SNAP-/.test(r.text), 'snapshot id present');
    assertNoRawPII(r.text);
});

// ---- 4. /lead_review <import_id> → safe review, no raw PII ----
test('/lead_review import_id shows safe review, no raw PII', () => {
    const r = ctl.buildLeadReview(KNOWN_IMPORT_ID, OPTS);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.found, true);
    assert.ok(r.text.includes('Safety envelope'), 'safety envelope present');
    assert.ok(r.text.includes('snapshot_id'), 'snapshot field present');
    assert.ok(/raw PII не отображается/.test(r.text), 'PII disclaimer present');
    assertNoRawPII(r.text);
});

// ---- 5. /lead_health → readable files + blocked safety flags ----
test('/lead_health returns readable files and blocked safety flags', () => {
    const r = ctl.buildLeadHealth(OPTS);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.queue_readable, true, 'queue readable');
    assert.strictEqual(r.contacts_readable, true, 'contacts readable');
    assert.strictEqual(r.map_shape_detected, true, 'map-shape detected');
    assert.ok(r.text.includes('D2 status: CLOSED'), 'D2 CLOSED');
    assert.ok(r.text.includes('client_contact: BLOCKED'), 'client_contact BLOCKED');
    assert.ok(r.text.includes('auto_send: BLOCKED'), 'auto_send BLOCKED');
    assert.ok(r.text.includes('write commands: BLOCKED'), 'write commands BLOCKED');
});

// ---- 6. missing id → safe failure ----
test('missing id → safe not found', () => {
    const r = ctl.buildLeadStatus('IMP-DOES-NOT-EXIST-000', OPTS);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.found, false);
    assert.ok(/not found|Не найдено/i.test(r.text), 'safe not-found message');
});

// ---- 7. malformed command → safe failure ----
test('malformed command → safe failure (handled:false)', () => {
    const r1 = ctl.handleReadonlyLiveControl('/totally_unknown xyz', OPTS);
    assert.strictEqual(r1.handled, false, 'unknown command not handled');

    const r2 = ctl.buildLeadStatus('!!bad id!!', OPTS);
    assert.strictEqual(r2.ok, false, 'bad arg rejected');
    assert.strictEqual(r2.error, 'bad_arg');

    const r3 = ctl.buildLeadStatus(null, OPTS);
    assert.strictEqual(r3.ok, false, 'null arg rejected');

    const r4 = ctl.parseReadonlyCommand(12345);
    assert.strictEqual(r4.ok, false, 'non-string parse rejected');
});

// ---- 8. no write APIs used (static source scan) ----
test('module uses NO write APIs', () => {
    const src = fs.readFileSync(
        path.join(WORKSPACE, 'tools', 'telegram_gateway', 'lead_import_readonly_live_control.mjs'),
        'utf8',
    );
    // Strip comments so doc-mentions of these words don't trip the scan.
    const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const bad of ['writeFile', 'appendFile', 'rename', 'unlink', 'mkdir', 'rmdir', 'rm(']) {
        assert.ok(!code.includes(bad), `must not call ${bad}`);
    }
});

// ---- 9. production files sha256 before == after ----
test('production files sha256 before == after (no mutation)', () => {
    const afterQueue = sha256(QUEUE_PATH);
    const afterContacts = sha256(CONTACTS_PATH);
    assert.strictEqual(afterQueue, beforeQueue, 'approval queue unchanged');
    assert.strictEqual(afterContacts, beforeContacts, 'lead_contacts unchanged');
});

// ---- summary ----
const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;
console.log(`\n=== D3-2 control tests: ${passed}/${results.length} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
