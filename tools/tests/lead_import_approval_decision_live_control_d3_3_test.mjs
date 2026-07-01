// lead_import_approval_decision_live_control_d3_3_test.mjs
// =============================================================================
// D3B tests for the write-gated approval-decision live-control module.
//
// Scope (NO production mutation):
//   - check phases run on a synthetic temp queue and must NEVER write.
//   - confirm phases run ONLY on a throwaway temp-copy queue.
//   - production approval-queue file sha256 is asserted unchanged (before==after).
//
// Hard boundaries verified:
//   - real import: not invoked (module has no import code path)
//   - lead_contacts write: never touched
//   - client contact / auto-send: never invoked
//
// Run: node tools/tests/lead_import_approval_decision_live_control_d3_3_test.mjs
// =============================================================================

import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

import {
    parseDecisionCommand,
    isDecisionCommand,
    handleCheck,
    handleConfirm,
    handleDecisionCommand,
    SAFETY_FOOTER,
} from '../telegram_gateway/lead_import_approval_decision_live_control.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE = path.resolve(path.join(__dirname, '..', '..'));
const PROD_QUEUE = path.join(WORKSPACE, '13_sales', 'approval_queue', 'lead_import_approvals.json');

let passed = 0;
let failed = 0;
const results = [];

function check(name, cond) {
    if (cond) {
        passed++;
        results.push(`  ✅ ${name}`);
    } else {
        failed++;
        results.push(`  ❌ ${name}`);
    }
}

function sha256File(p) {
    if (!fs.existsSync(p)) return 'MISSING';
    return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------
const PENDING_ID = 'IMP-20260606-101010-111111';
const PENDING2_ID = 'IMP-20260606-121212-444444';
const COMMITTED_ID = 'IMP-20260606-100554-941263';
const CANCELLED_ID = 'IMP-20260606-202020-222222';
const APPROVED_ID = 'IMP-20260606-303030-333333';
const REJECTED_ID = 'IMP-20260606-404040-555555';
const UNKNOWN_ID = 'IMP-20260606-999999-999999';

function makeQueueObject() {
    return {
        version: 1,
        cards: [
            { import_id: PENDING_ID, status: 'PENDING', source: 'synthetic', lead_count: 3, created_at: '2026-06-06T10:10:10Z' },
            { import_id: PENDING2_ID, status: 'PENDING', source: 'synthetic', lead_count: 4, created_at: '2026-06-06T12:12:12Z' },
            { import_id: COMMITTED_ID, status: 'COMMITTED', source: 'prod', lead_count: 5, created_at: '2026-06-06T10:05:54Z' },
            { import_id: CANCELLED_ID, status: 'CANCELLED', source: 'synthetic', lead_count: 2, created_at: '2026-06-06T20:20:20Z' },
            { import_id: APPROVED_ID, status: 'APPROVED', source: 'synthetic', lead_count: 1, created_at: '2026-06-06T13:30:30Z' },
            { import_id: REJECTED_ID, status: 'REJECTED', source: 'synthetic', lead_count: 1, created_at: '2026-06-06T14:40:40Z' },
        ],
    };
}

// A throwaway temp queue file. Tests that "write" only ever touch this.
function makeTempQueue() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd3b_queue_'));
    const file = path.join(dir, 'lead_import_approvals.json');
    fs.writeFileSync(file, JSON.stringify(makeQueueObject(), null, 2), 'utf8');
    return { dir, file };
}

// Owner context required by the confirm gate.
const OWNER = { isOwner: true };

// ---------------------------------------------------------------------------
// 0. Production file sha256 BEFORE (captured up-front)
// ---------------------------------------------------------------------------
const prodShaBefore = sha256File(PROD_QUEUE);

// ---------------------------------------------------------------------------
// 1. approve check on synthetic PENDING = no write
// ---------------------------------------------------------------------------
{
    const { file } = makeTempQueue();
    const before = sha256File(file);
    const res = handleDecisionCommand(`/lead_import_approve ${PENDING_ID} check`, { queuePath: file });
    const after = sha256File(file);
    check('1. approve check ok on PENDING', res.ok === true && res.phase === 'check' && res.wrote === false);
    check('1. approve check shows PENDING -> APPROVED', res.would_transition === 'PENDING -> APPROVED');
    check('1. approve check exposes queue_path', res.queue_path === file);
    check('1. approve check exposes planned_backup', typeof res.planned_backup === 'string' && res.planned_backup.includes('.bak-'));
    check('1. approve check safety queue_write CHECK_ONLY', res.safety.queue_write === 'CHECK_ONLY');
    check('1. approve check did NOT write temp queue', before === after);
}

// ---------------------------------------------------------------------------
// 2. approve confirm on temp-copy PENDING = APPROVED + backup
// ---------------------------------------------------------------------------
{
    const { file } = makeTempQueue();
    const res = handleDecisionCommand(`/lead_import_approve ${PENDING_ID} confirm`, { queuePath: file, ...OWNER });
    check('2. approve confirm wrote', res.ok === true && res.wrote === true);
    check('2. approve confirm new_status APPROVED', res.new_status === 'APPROVED');
    check('2. approve confirm created backup file', !!res.backup_path && fs.existsSync(res.backup_path));
    check('2. approve confirm verified', res.verified === true);
    check('2. approve confirm safety CONFIRMED', res.safety.queue_write === 'CONFIRMED');
    // Confirm the on-disk card actually changed
    const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
    const card = onDisk.cards.find((c) => c.import_id === PENDING_ID);
    check('2. approve confirm persisted status', card && card.status === 'APPROVED');
    check('2. approve confirm did NOT touch COMMITTED card', onDisk.cards.find((c) => c.import_id === COMMITTED_ID).status === 'COMMITTED');
    // backup retains the ORIGINAL PENDING status (backup created before write)
    const backup = JSON.parse(fs.readFileSync(res.backup_path, 'utf8'));
    check('2. backup retains pre-write PENDING', backup.cards.find((c) => c.import_id === PENDING_ID).status === 'PENDING');
}

// ---------------------------------------------------------------------------
// 3. approve confirm already APPROVED = idempotent no-op
// ---------------------------------------------------------------------------
{
    const { file } = makeTempQueue();
    const before = sha256File(file);
    const res = handleDecisionCommand(`/lead_import_approve ${APPROVED_ID} confirm`, { queuePath: file, ...OWNER });
    const after = sha256File(file);
    check('3. approve already-APPROVED idempotent no-op', res.ok === true && res.wrote === false && res.idempotent === true);
    check('3. approve idempotent reports new_status APPROVED', res.new_status === 'APPROVED');
    check('3. approve idempotent no write', before === after);
}

// ---------------------------------------------------------------------------
// 4. approve refuses REJECTED / CANCELLED / COMMITTED
// ---------------------------------------------------------------------------
{
    for (const [label, id] of [['REJECTED', REJECTED_ID], ['CANCELLED', CANCELLED_ID], ['COMMITTED', COMMITTED_ID]]) {
        const { file } = makeTempQueue();
        const before = sha256File(file);
        const res = handleDecisionCommand(`/lead_import_approve ${id} confirm`, { queuePath: file, ...OWNER });
        const after = sha256File(file);
        check(`4. approve refuses ${label}`, res.ok === false && res.reason === 'status_not_pending' && res.wrote === false);
        check(`4. approve ${label} no write`, before === after);
    }
}

// ---------------------------------------------------------------------------
// 5. reject check on synthetic PENDING = no write
// ---------------------------------------------------------------------------
{
    const { file } = makeTempQueue();
    const before = sha256File(file);
    const res = handleDecisionCommand(`/lead_import_reject ${PENDING_ID} check`, { queuePath: file });
    const after = sha256File(file);
    check('5. reject check ok on PENDING', res.ok === true && res.phase === 'check' && res.wrote === false);
    check('5. reject check shows PENDING -> REJECTED', res.would_transition === 'PENDING -> REJECTED');
    check('5. reject check did NOT write temp queue', before === after);
}

// ---------------------------------------------------------------------------
// 6. reject confirm on temp-copy PENDING = REJECTED + backup
// ---------------------------------------------------------------------------
{
    const { file } = makeTempQueue();
    const res = handleDecisionCommand(`/lead_import_reject ${PENDING_ID} confirm`, { queuePath: file, ...OWNER });
    check('6. reject confirm wrote', res.ok === true && res.wrote === true);
    check('6. reject confirm new_status REJECTED', res.new_status === 'REJECTED');
    check('6. reject confirm created backup', !!res.backup_path && fs.existsSync(res.backup_path));
    check('6. reject confirm verified', res.verified === true);
    const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
    check('6. reject confirm persisted REJECTED', onDisk.cards.find((c) => c.import_id === PENDING_ID).status === 'REJECTED');
}

// ---------------------------------------------------------------------------
// 7. reject confirm already REJECTED = idempotent no-op
// ---------------------------------------------------------------------------
{
    const { file } = makeTempQueue();
    const before = sha256File(file);
    const res = handleDecisionCommand(`/lead_import_reject ${REJECTED_ID} confirm`, { queuePath: file, ...OWNER });
    const after = sha256File(file);
    check('7. reject already-REJECTED idempotent no-op', res.ok === true && res.wrote === false && res.idempotent === true);
    check('7. reject idempotent no write', before === after);
}

// ---------------------------------------------------------------------------
// 8. reject refuses APPROVED / CANCELLED / COMMITTED
// ---------------------------------------------------------------------------
{
    for (const [label, id] of [['APPROVED', APPROVED_ID], ['CANCELLED', CANCELLED_ID], ['COMMITTED', COMMITTED_ID]]) {
        const { file } = makeTempQueue();
        const before = sha256File(file);
        const res = handleDecisionCommand(`/lead_import_reject ${id} confirm`, { queuePath: file, ...OWNER });
        const after = sha256File(file);
        check(`8. reject refuses ${label}`, res.ok === false && res.reason === 'status_not_pending' && res.wrote === false);
        check(`8. reject ${label} no write`, before === after);
    }
}

// ---------------------------------------------------------------------------
// 9. missing id refused
// ---------------------------------------------------------------------------
{
    const { file } = makeTempQueue();
    const res = handleDecisionCommand('/lead_import_approve', { queuePath: file });
    check('9. missing id refused', res.ok === false && res.wrote === false && res.reason === 'missing_import_id');
}

// ---------------------------------------------------------------------------
// 10. missing phase refused (bare command -> usage, no write)
// ---------------------------------------------------------------------------
{
    const { file } = makeTempQueue();
    const before = sha256File(file);
    const res = handleDecisionCommand(`/lead_import_approve ${PENDING_ID}`, { queuePath: file });
    const after = sha256File(file);
    check('10. missing phase -> usage', res.usage === true && res.wrote === false && res.reason === 'missing_phase');
    check('10. usage lines present', Array.isArray(res.usage_lines) && res.usage_lines.length === 2);
    check('10. missing phase no write', before === after);
}

// ---------------------------------------------------------------------------
// 11. non-owner confirm refused
// ---------------------------------------------------------------------------
{
    const { file } = makeTempQueue();
    const before = sha256File(file);
    const res = handleDecisionCommand(`/lead_import_approve ${PENDING_ID} confirm`, { queuePath: file, isOwner: false });
    const after = sha256File(file);
    check('11. non-owner confirm refused', res.ok === false && res.reason === 'owner_gate_blocked');
    check('11. non-owner confirm no write', before === after);
}

// ---------------------------------------------------------------------------
// 12. unknown id refused (no write)
// ---------------------------------------------------------------------------
{
    const { file } = makeTempQueue();
    const before = sha256File(file);
    const res = handleDecisionCommand(`/lead_import_approve ${UNKNOWN_ID} check`, { queuePath: file });
    const after = sha256File(file);
    check('12. unknown id refused', res.ok === false && res.reason === 'unknown_import_id');
    check('12. unknown id no write', before === after);
}

// ---------------------------------------------------------------------------
// 13. confirm with stray token refused (intent not exact)
// ---------------------------------------------------------------------------
{
    const { file } = makeTempQueue();
    const before = sha256File(file);
    const res = handleDecisionCommand(`/lead_import_approve ${PENDING_ID} confirm now`, { queuePath: file, ...OWNER });
    const after = sha256File(file);
    check('13. confirm with stray token refused', res.ok === false && res.reason === 'confirm_intent_not_exact');
    check('13. stray-token confirm no write', before === after);
}

// ---------------------------------------------------------------------------
// 14. backup created before write (atomic write verified)
// ---------------------------------------------------------------------------
{
    const { file } = makeTempQueue();
    const res = handleDecisionCommand(`/lead_import_approve ${PENDING2_ID} confirm`, { queuePath: file, ...OWNER });
    check('14. backup exists', !!res.backup_path && fs.existsSync(res.backup_path));
    // backup reflects PRE-write state (proves backup taken before write)
    const backup = JSON.parse(fs.readFileSync(res.backup_path, 'utf8'));
    check('14. backup pre-write state PENDING', backup.cards.find((c) => c.import_id === PENDING2_ID).status === 'PENDING');
    // post-write file is valid JSON & verified -> atomic write succeeded
    const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
    check('14. atomic write verified APPROVED', res.verified === true && onDisk.cards.find((c) => c.import_id === PENDING2_ID).status === 'APPROVED');
    // no leftover tmp file in queue dir
    const dir = path.dirname(file);
    const leftover = fs.readdirSync(dir).filter((f) => f.includes('.tmp-'));
    check('14. no leftover .tmp file after atomic rename', leftover.length === 0);
}

// ---------------------------------------------------------------------------
// 15. queue unreadable safe fail
// ---------------------------------------------------------------------------
{
    const res = handleDecisionCommand(`/lead_import_approve ${PENDING_ID} check`, { queuePath: path.join(os.tmpdir(), 'does_not_exist_d3b.json') });
    check('15. unreadable queue refused', res.ok === false && res.reason === 'queue_unreadable');
}

// ---------------------------------------------------------------------------
// 16. safety footer always present (success + refusal)
// ---------------------------------------------------------------------------
{
    const { file } = makeTempQueue();
    const okRes = handleDecisionCommand(`/lead_import_approve ${PENDING_ID} check`, { queuePath: file });
    const failRes = handleDecisionCommand('/lead_import_approve', { queuePath: file });
    const sOk = okRes.safety || {};
    const sFail = failRes.safety || {};
    check('16. safety footer on success', sOk.real_import === 'BLOCKED' && sOk.client_contact === 'BLOCKED' && sOk.auto_send === 'BLOCKED');
    check('16. safety footer on refusal', sFail.real_import === 'BLOCKED' && sFail.client_contact === 'BLOCKED' && sFail.auto_send === 'BLOCKED');
}

// ---------------------------------------------------------------------------
// 17. short aliases NOT matched by parser (remain inactive)
// ---------------------------------------------------------------------------
{
    check('17. /lead_approve not a decision command', isDecisionCommand('/lead_approve IMP-X check') === false);
    check('17. /lead_reject not a decision command', isDecisionCommand('/lead_reject IMP-X check') === false);
    check('17. /lead_import_approve is a decision command', isDecisionCommand(`/lead_import_approve ${PENDING_ID} check`) === true);
}

// ---------------------------------------------------------------------------
// 18. module source contains NO client-contact / send / lead_contacts write APIs
// ---------------------------------------------------------------------------
{
    const src = fs.readFileSync(path.join(__dirname, '..', 'telegram_gateway', 'lead_import_approval_decision_live_control.mjs'), 'utf8');
    const forbidden = ['sendTelegram', 'smtp', 'sendMail', 'nodemailer', 'lead_contacts', 'leads_master', 'runImport', 'commitImport', 'whatsapp', 'fetch(', 'axios'];
    const hits = forbidden.filter((f) => src.toLowerCase().includes(f.toLowerCase()));
    check('18. no client-contact/send/import/lead_contacts/leads_master APIs in module', hits.length === 0);
}

// ---------------------------------------------------------------------------
// 19. production file sha256 before == after
// ---------------------------------------------------------------------------
{
    const prodShaAfter = sha256File(PROD_QUEUE);
    check('19. production queue sha256 unchanged (before==after)', prodShaBefore === prodShaAfter);
}

// ---------------------------------------------------------------------------
console.log('\n=== D3B approval-decision live-control TEST ===\n');
console.log(results.join('\n'));
console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
