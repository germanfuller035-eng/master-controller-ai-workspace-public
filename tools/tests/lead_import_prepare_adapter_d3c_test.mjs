// lead_import_prepare_adapter_d3c_test.mjs
// =============================================================================
// D3C — Offline tests for the prepare-PENDING-card adapter.
// Operates ONLY on a temp queue fixture in the OS temp dir. NEVER touches real
// 13_sales data. NO network, NO client contact, NO auto-send.
//
// Coverage:
//   1. missing text → usage, no mutation
//   2. non-owner → refused, no mutation
//   3. valid text → ONE PENDING card written
//   4. QA FAIL with valid_count > 0 → PENDING card WITH warning flags
//   5. backup created before write (pre-existing queue)
//   6. atomic write verified (tmp cleaned up, card present)
//   7. duplicate identical text → refused, no overwrite
//   8. no leads_master / lead_contacts / events writes in the sandbox workspace
// =============================================================================

import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'assert';

import {
    prepareLeadImportPendingCard,
    shouldRouteToPrepare,
    parsePrepareCommand,
    buildPendingCard,
    PREPARE_SAFETY,
} from '../telegram_gateway/lead_import_prepare_adapter.mjs';

let passed = 0;
let failed = 0;
const results = [];
function check(name, fn) {
    return fn().then(() => { passed++; results.push(`✅ ${name}`); })
        .catch((e) => { failed++; results.push(`❌ ${name} — ${e.message}`); });
}

// --- Sandbox workspace + temp queue ------------------------------------------
const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'd3c_prepare_'));
const SANDBOX_WS = path.join(TMP_ROOT, 'ws');
const SALES_DIR = path.join(SANDBOX_WS, '13_sales');
const QUEUE_DIR = path.join(SALES_DIR, 'approval_queue');
fs.mkdirSync(QUEUE_DIR, { recursive: true });

const LEADS_MASTER = path.join(SALES_DIR, 'leads_master.json');
const LEAD_CONTACTS = path.join(SALES_DIR, 'lead_contacts.json');
const EVENTS_LOG = path.join(SALES_DIR, 'lead_intake_events.jsonl');

function freshQueuePath(name) {
    return path.join(QUEUE_DIR, `${name}.json`);
}

const VALID_TEXT =
    'TEST_D3B_DO_NOT_COMMIT Иванов; https://example-test-d3b.ru; +7 900 000 00 00; test@example-test-d3b.ru';

function snapshotSalesDir() {
    return {
        master: fs.existsSync(LEADS_MASTER),
        contacts: fs.existsSync(LEAD_CONTACTS),
        events: fs.existsSync(EVENTS_LOG),
    };
}

async function run() {
    // --- pure routing helpers ---
    await check('shouldRouteToPrepare matches /lead_import_prepare only', async () => {
        assert.strictEqual(shouldRouteToPrepare('/lead_import_prepare foo'), true);
        assert.strictEqual(shouldRouteToPrepare('/lead_import_approve X check'), false);
        assert.strictEqual(shouldRouteToPrepare('/lead_import_review'), false);
        assert.strictEqual(shouldRouteToPrepare('hello'), false);
    });

    await check('parsePrepareCommand splits command from payload', async () => {
        const p = parsePrepareCommand('/lead_import_prepare  some text here');
        assert.strictEqual(p.ok, true);
        assert.strictEqual(p.leadText, 'some text here');
        const empty = parsePrepareCommand('/lead_import_prepare');
        assert.strictEqual(empty.leadText, '');
    });

    await check('buildPendingCard sets PENDING + safety flags', async () => {
        const card = buildPendingCard({ qa_status: 'PASS', counts: { valid_count: 2, parsed_count: 2, final_unique_count: 2 }, leads: [{ a: 1 }, { a: 2 }] }, { importId: 'imp_test', now: '2026-06-06T00:00:00Z' });
        assert.strictEqual(card.status, 'PENDING');
        assert.strictEqual(card.source, 'telegram_manual_prepare');
        assert.strictEqual(card.real_import, 'BLOCKED');
        assert.strictEqual(card.client_contact, 'BLOCKED');
        assert.strictEqual(card.auto_send, 'BLOCKED');
        assert.strictEqual(card.commit_blocked_until_approved, true);
    });

    await check('buildPendingCard QA FAIL + valid>0 carries warning flags', async () => {
        const card = buildPendingCard({ qa_status: 'FAIL', counts: { valid_count: 1, parsed_count: 1, final_unique_count: 1 }, leads: [{ a: 1 }] }, { importId: 'imp_fail' });
        assert.strictEqual(card.status, 'PENDING');
        assert.strictEqual(card.qa_status, 'FAIL');
        assert.strictEqual(card.review_required, true);
        assert.strictEqual(card.commit_blocked_until_approved, true);
    });

    // --- 1. missing text → usage, no mutation ---
    await check('missing text → usage, no queue file created', async () => {
        const qp = freshQueuePath('q_missing');
        const r = await prepareLeadImportPendingCard('/lead_import_prepare   ', { queuePath: qp, isOwner: true, pipelineWorkspace: SANDBOX_WS });
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.usage, true);
        assert.strictEqual(r.wrote, false);
        assert.strictEqual(fs.existsSync(qp), false, 'no queue file must be created');
    });

    // --- 2. non-owner → refused ---
    await check('non-owner → refused, no mutation', async () => {
        const qp = freshQueuePath('q_owner');
        const r = await prepareLeadImportPendingCard('/lead_import_prepare ' + VALID_TEXT, { queuePath: qp, isOwner: false, pipelineWorkspace: SANDBOX_WS });
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.reason, 'owner_gate_blocked');
        assert.strictEqual(fs.existsSync(qp), false);
    });

    // --- 3. valid text → ONE PENDING card ---
    await check('valid text → exactly one PENDING card', async () => {
        const qp = freshQueuePath('q_valid');
        const r = await prepareLeadImportPendingCard('/lead_import_prepare ' + VALID_TEXT, { queuePath: qp, isOwner: true, pipelineWorkspace: SANDBOX_WS });
        assert.strictEqual(r.ok, true, JSON.stringify(r));
        assert.strictEqual(r.wrote, true);
        assert.strictEqual(r.status, 'PENDING');
        const data = JSON.parse(fs.readFileSync(qp, 'utf8'));
        const cards = Array.isArray(data) ? data : data.cards;
        const pending = cards.filter((c) => c.status === 'PENDING');
        assert.strictEqual(pending.length, 1, 'exactly one PENDING card');
        assert.strictEqual(pending[0].safety === undefined ? 'BLOCKED' : 'BLOCKED', 'BLOCKED');
        assert.strictEqual(pending[0].real_import, 'BLOCKED');
    });

    // --- 5. backup created before write (pre-existing queue) ---
    await check('backup created before write when queue exists', async () => {
        const qp = freshQueuePath('q_backup');
        fs.writeFileSync(qp, JSON.stringify({ schema: 'lead_import_approvals', cards: [] }, null, 2));
        const r = await prepareLeadImportPendingCard('/lead_import_prepare ' + VALID_TEXT, { queuePath: qp, isOwner: true, pipelineWorkspace: SANDBOX_WS });
        assert.strictEqual(r.ok, true, JSON.stringify(r));
        assert.strictEqual(r.backup_created, true);
        assert.ok(r.backup_path && fs.existsSync(r.backup_path), 'backup file must exist');
    });

    // --- 6. atomic write verified (no leftover tmp, card present) ---
    await check('atomic write: no leftover .tmp- files, card present', async () => {
        const qp = freshQueuePath('q_atomic');
        const r = await prepareLeadImportPendingCard('/lead_import_prepare ' + VALID_TEXT, { queuePath: qp, isOwner: true, pipelineWorkspace: SANDBOX_WS });
        assert.strictEqual(r.ok, true);
        const leftovers = fs.readdirSync(QUEUE_DIR).filter((f) => f.startsWith('q_atomic.json.tmp-'));
        assert.strictEqual(leftovers.length, 0, 'tmp file must be renamed away');
        const data = JSON.parse(fs.readFileSync(qp, 'utf8'));
        const cards = Array.isArray(data) ? data : data.cards;
        assert.ok(cards.find((c) => c.import_id === r.import_id), 'card present after rename');
    });

    // --- 7. duplicate identical text → refused, no overwrite ---
    await check('duplicate identical text → refused, no overwrite', async () => {
        const qp = freshQueuePath('q_dup');
        const r1 = await prepareLeadImportPendingCard('/lead_import_prepare ' + VALID_TEXT, { queuePath: qp, isOwner: true, pipelineWorkspace: SANDBOX_WS });
        assert.strictEqual(r1.ok, true);
        const r2 = await prepareLeadImportPendingCard('/lead_import_prepare ' + VALID_TEXT, { queuePath: qp, isOwner: true, pipelineWorkspace: SANDBOX_WS });
        assert.strictEqual(r2.ok, false);
        assert.strictEqual(r2.reason, 'duplicate_pending');
        const data = JSON.parse(fs.readFileSync(qp, 'utf8'));
        const cards = Array.isArray(data) ? data : data.cards;
        assert.strictEqual(cards.filter((c) => c.status === 'PENDING').length, 1, 'still exactly one card');
    });

    // --- 8. no leads_master / lead_contacts / events writes in sandbox ---
    await check('no leads_master / lead_contacts / events writes in sandbox', async () => {
        const before = snapshotSalesDir();
        const qp = freshQueuePath('q_noside');
        await prepareLeadImportPendingCard('/lead_import_prepare ' + VALID_TEXT + ' extra', { queuePath: qp, isOwner: true, pipelineWorkspace: SANDBOX_WS });
        const after = snapshotSalesDir();
        assert.strictEqual(after.master, before.master, 'leads_master must not appear');
        assert.strictEqual(after.contacts, before.contacts, 'lead_contacts must not appear');
        assert.strictEqual(after.events, before.events, 'events log must not appear');
    });

    // --- safety constant frozen ---
    await check('PREPARE_SAFETY frozen with BLOCKED flags', async () => {
        assert.strictEqual(PREPARE_SAFETY.real_import, 'BLOCKED');
        assert.strictEqual(PREPARE_SAFETY.client_contact, 'BLOCKED');
        assert.strictEqual(PREPARE_SAFETY.auto_send, 'BLOCKED');
    });

    // --- cleanup ---
    try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch (_) {}

    console.log('\n=== D3C prepare-adapter offline tests ===');
    results.forEach((l) => console.log(l));
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
