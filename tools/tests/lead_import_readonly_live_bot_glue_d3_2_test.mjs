// lead_import_readonly_live_bot_glue_d3_2_test.mjs
// =============================================================================
// D3-2 — Offline dispatcher tests for the read-only bot glue.
//
// Verifies routing, owner-facing text return, forbidden write-verb rejection,
// safe failure on malformed input, and NO write/send APIs in the glue source.
//
// READ-ONLY: no production mutation, no Telegram send.
// =============================================================================

import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as glue from '../telegram_gateway/lead_import_readonly_live_bot_glue.mjs';

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

const beforeQueue = sha256(QUEUE_PATH);
const beforeContacts = sha256(CONTACTS_PATH);

// ---- 1. routing recognition ----
test('shouldRouteToReadonlyLiveControl recognizes all 4 commands', () => {
    assert.strictEqual(glue.shouldRouteToReadonlyLiveControl('/lead_queue'), true);
    assert.strictEqual(glue.shouldRouteToReadonlyLiveControl('/lead_status X'), true);
    assert.strictEqual(glue.shouldRouteToReadonlyLiveControl('/lead_review X'), true);
    assert.strictEqual(glue.shouldRouteToReadonlyLiveControl('/lead_health'), true);
    assert.strictEqual(glue.shouldRouteToReadonlyLiveControl('/some_other'), false);
});

// ---- 2. /lead_queue via glue ----
test('glue /lead_queue handled with text', () => {
    const r = glue.handleReadonlyLiveControlBotMessage('/lead_queue', OPTS);
    assert.strictEqual(r.handled, true);
    assert.ok(r.text.includes('Очередь импорта'), 'queue header present');
    assert.ok(r.meta && r.meta.counts.total >= 1, 'meta counts present');
});

// ---- 3. /lead_status import_id COMMITTED ----
test('glue /lead_status import_id → COMMITTED + snapshot', () => {
    const r = glue.handleReadonlyLiveControlBotMessage(`/lead_status ${KNOWN_IMPORT_ID}`, OPTS);
    assert.strictEqual(r.handled, true);
    assert.ok(/COMMITTED/i.test(r.text), 'COMMITTED present');
    assert.ok(/SNAP-/.test(r.text), 'snapshot present');
});

// ---- 4. /lead_status lead_id ----
test('glue /lead_status lead_id → lead found', () => {
    const r = glue.handleReadonlyLiveControlBotMessage(`/lead_status ${KNOWN_LEAD_ID}`, OPTS);
    assert.strictEqual(r.handled, true);
    assert.ok(/SNAP-/.test(r.text), 'snapshot present');
});

// ---- 5. /lead_review safe ----
test('glue /lead_review → safe review, no raw email', () => {
    const r = glue.handleReadonlyLiveControlBotMessage(`/lead_review ${KNOWN_IMPORT_ID}`, OPTS);
    assert.strictEqual(r.handled, true);
    assert.ok(r.text.includes('Safety envelope'), 'safety envelope present');
    assert.ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(r.text), 'no raw email');
});

// ---- 6. /lead_health ----
test('glue /lead_health → blocked flags', () => {
    const r = glue.handleReadonlyLiveControlBotMessage('/lead_health', OPTS);
    assert.strictEqual(r.handled, true);
    assert.ok(r.text.includes('write commands: BLOCKED'), 'write BLOCKED');
});

// ---- 7. forbidden write verbs not routed ----
test('forbidden write verbs are NOT handled by read-only glue', () => {
    for (const cmd of ['/approve IMP-1', '/reject IMP-1', '/commit IMP-1', '/import x', '/send x']) {
        assert.strictEqual(glue.isForbiddenWriteCommand(cmd), true, `${cmd} flagged forbidden`);
        const r = glue.handleReadonlyLiveControlBotMessage(cmd, OPTS);
        assert.strictEqual(r.handled, false, `${cmd} not handled`);
    }
});

// ---- 8. malformed / non-command safe failure ----
test('malformed / non-command → handled:false', () => {
    assert.strictEqual(glue.handleReadonlyLiveControlBotMessage('hello world', OPTS).handled, false);
    assert.strictEqual(glue.handleReadonlyLiveControlBotMessage('', OPTS).handled, false);
    assert.strictEqual(glue.handleReadonlyLiveControlBotMessage(null, OPTS).handled, false);
    // recognized command with bad arg → still handled, but ok:false inside
    const r = glue.handleReadonlyLiveControlBotMessage('/lead_status !!bad!!', OPTS);
    assert.strictEqual(r.handled, true);
    assert.ok(r.text.length > 0, 'safe message returned');
});

// ---- 9. no write/send APIs in glue source ----
test('glue source uses NO write/send APIs', () => {
    const src = fs.readFileSync(
        path.join(WORKSPACE, 'tools', 'telegram_gateway', 'lead_import_readonly_live_bot_glue.mjs'),
        'utf8',
    );
    const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const bad of ['writeFile', 'appendFile', 'unlink', 'sendTelegram', 'sendMessage', 'tgRequest']) {
        assert.ok(!code.includes(bad), `must not reference ${bad}`);
    }
});

// ---- 10. production files unchanged ----
test('production files sha256 before == after (no mutation)', () => {
    assert.strictEqual(sha256(QUEUE_PATH), beforeQueue, 'queue unchanged');
    assert.strictEqual(sha256(CONTACTS_PATH), beforeContacts, 'contacts unchanged');
});

const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;
console.log(`\n=== D3-2 glue tests: ${passed}/${results.length} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
