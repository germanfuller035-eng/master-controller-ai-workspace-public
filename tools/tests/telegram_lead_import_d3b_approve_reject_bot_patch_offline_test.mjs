// telegram_lead_import_d3b_approve_reject_bot_patch_offline_test.mjs
// =============================================================================
// D3B OFFLINE bot-patch test.
//
// Verifies the live bot (telegram_master_bot.mjs) was patched correctly to
// route /lead_import_approve|reject to the write-gated D3B decision glue,
// WITHOUT starting the bot, WITHOUT any network, WITHOUT touching real data.
//
// Two layers:
//   A. Behavioural routing — exercises the D3B glue against a THROWAWAY temp
//      queue (the only file ever written) to prove command dispatch + phases.
//   B. Static source assertions — reads telegram_master_bot.mjs as text and
//      asserts the wiring + route order + safety holds (no bot execution).
//
// Hard boundaries: no bot start, no sendTelegram to clients, no real queue
// mutation, no import into leads_master/lead_contacts.
//
// Run: node tools/tests/telegram_lead_import_d3b_approve_reject_bot_patch_offline_test.mjs
// =============================================================================

import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

import {
    shouldRouteToDecisionLiveControl,
    handleDecisionLiveControlBotMessage,
} from '../telegram_gateway/lead_import_approval_decision_live_bot_glue.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE = path.resolve(path.join(__dirname, '..', '..'));
const BOT_FILE = path.join(WORKSPACE, 'tools', 'telegram_gateway', 'telegram_master_bot.mjs');
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
// Temp queue fixtures (only files ever written by this test)
// ---------------------------------------------------------------------------
const PENDING_ID = 'IMP-20260606-101010-111111';
const PENDING2_ID = 'IMP-20260606-121212-444444';
const OWNER = { isOwner: true };

function makeQueueObject() {
    return {
        version: 1,
        cards: [
            { import_id: PENDING_ID, status: 'PENDING', source: 'synthetic', lead_count: 3, created_at: '2026-06-06T10:10:10Z' },
            { import_id: PENDING2_ID, status: 'PENDING', source: 'synthetic', lead_count: 4, created_at: '2026-06-06T12:12:12Z' },
        ],
    };
}

function makeTempQueue() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd3b_botpatch_'));
    const file = path.join(dir, 'lead_import_approvals.json');
    fs.writeFileSync(file, JSON.stringify(makeQueueObject(), null, 2), 'utf8');
    return { dir, file };
}

// Capture production queue sha up-front; must be identical at end.
const prodShaBefore = sha256File(PROD_QUEUE);

// ===========================================================================
// LAYER A — Behavioural routing through the D3B glue (temp queue only)
// ===========================================================================

// A1. approve check routes to D3B check (no write)
{
    const { file } = makeTempQueue();
    const before = sha256File(file);
    const out = handleDecisionLiveControlBotMessage(`/lead_import_approve ${PENDING_ID} check`, { queuePath: file });
    const after = sha256File(file);
    check('A1. approve check handled+routed', out.handled === true && out.action === 'approve' && out.phase === 'check');
    check('A1. approve check no write', out.wrote === false && before === after);
    check('A1. approve check text shows transition', /PENDING -> APPROVED/.test(out.text));
}

// A2. approve confirm routes to D3B confirm (writes temp queue only)
{
    const { file } = makeTempQueue();
    const out = handleDecisionLiveControlBotMessage(`/lead_import_approve ${PENDING_ID} confirm`, { queuePath: file, ...OWNER });
    check('A2. approve confirm handled+routed', out.handled === true && out.action === 'approve' && out.phase === 'confirm');
    check('A2. approve confirm wrote temp queue', out.wrote === true && out.result.new_status === 'APPROVED');
    const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
    check('A2. approve confirm persisted APPROVED', onDisk.cards.find((c) => c.import_id === PENDING_ID).status === 'APPROVED');
}

// A3. reject check routes to D3B check (no write)
{
    const { file } = makeTempQueue();
    const before = sha256File(file);
    const out = handleDecisionLiveControlBotMessage(`/lead_import_reject ${PENDING_ID} check`, { queuePath: file });
    const after = sha256File(file);
    check('A3. reject check handled+routed', out.handled === true && out.action === 'reject' && out.phase === 'check');
    check('A3. reject check no write', out.wrote === false && before === after);
    check('A3. reject check text shows transition', /PENDING -> REJECTED/.test(out.text));
}

// A4. reject confirm routes to D3B confirm (writes temp queue only)
{
    const { file } = makeTempQueue();
    const out = handleDecisionLiveControlBotMessage(`/lead_import_reject ${PENDING2_ID} confirm`, { queuePath: file, ...OWNER });
    check('A4. reject confirm handled+routed', out.handled === true && out.action === 'reject' && out.phase === 'confirm');
    check('A4. reject confirm wrote temp queue', out.wrote === true && out.result.new_status === 'REJECTED');
}

// A5. approve WITHOUT phase -> usage, no mutation
{
    const { file } = makeTempQueue();
    const before = sha256File(file);
    const out = handleDecisionLiveControlBotMessage(`/lead_import_approve ${PENDING_ID}`, { queuePath: file, ...OWNER });
    const after = sha256File(file);
    check('A5. approve bare -> usage', out.handled === true && out.usage === true && out.wrote === false);
    check('A5. approve bare no write', before === after);
    check('A5. approve bare usage text', /check/.test(out.text) && /confirm/.test(out.text));
}

// A6. reject WITHOUT phase -> usage, no mutation
{
    const { file } = makeTempQueue();
    const before = sha256File(file);
    const out = handleDecisionLiveControlBotMessage(`/lead_import_reject ${PENDING_ID}`, { queuePath: file, ...OWNER });
    const after = sha256File(file);
    check('A6. reject bare -> usage', out.handled === true && out.usage === true && out.wrote === false);
    check('A6. reject bare no write', before === after);
}

// A7. /lead_import_review NOT hijacked by D3B router
{
    check('A7. /lead_import_review not routed to D3B', shouldRouteToDecisionLiveControl('/lead_import_review') === false);
    const out = handleDecisionLiveControlBotMessage('/lead_import_review', {});
    check('A7. /lead_import_review returns handled:false', out.handled === false);
}

// A8. /ping /health /today NOT hijacked
{
    check('A8. /ping not routed to D3B', shouldRouteToDecisionLiveControl('/ping') === false);
    check('A8. /health not routed to D3B', shouldRouteToDecisionLiveControl('/health') === false);
    check('A8. /today not routed to D3B', shouldRouteToDecisionLiveControl('/today') === false);
}

// A9. short aliases /lead_approve & /lead_reject remain inactive (fallback)
{
    check('A9. /lead_approve not routed to D3B', shouldRouteToDecisionLiveControl('/lead_approve IMP-X check') === false);
    check('A9. /lead_reject not routed to D3B', shouldRouteToDecisionLiveControl('/lead_reject IMP-X check') === false);
    const o1 = handleDecisionLiveControlBotMessage('/lead_approve IMP-X check', {});
    const o2 = handleDecisionLiveControlBotMessage('/lead_reject IMP-X check', {});
    check('A9. alias commands not handled by D3B glue', o1.handled === false && o2.handled === false);
}

// A10. /lead_import_commit NOT routed to D3B (D4 stays HOLD)
{
    check('A10. /lead_import_commit not routed to D3B', shouldRouteToDecisionLiveControl('/lead_import_commit IMP-X confirm') === false);
    const out = handleDecisionLiveControlBotMessage('/lead_import_commit IMP-X confirm', {});
    check('A10. /lead_import_commit returns handled:false', out.handled === false);
}

// A11. non-owner confirm refused via glue (no mutation)
{
    const { file } = makeTempQueue();
    const before = sha256File(file);
    const out = handleDecisionLiveControlBotMessage(`/lead_import_approve ${PENDING_ID} confirm`, { queuePath: file, isOwner: false });
    const after = sha256File(file);
    check('A11. non-owner confirm refused', out.handled === true && out.wrote === false && out.result.reason === 'owner_gate_blocked');
    check('A11. non-owner confirm no write', before === after);
}

// ===========================================================================
// LAYER B — Static source assertions on telegram_master_bot.mjs (no execution)
// ===========================================================================
const botSrc = fs.readFileSync(BOT_FILE, 'utf8');

// B1. D3B glue imported
{
    check('B1. D3B glue imported', /import \* as leadImportDecisionGlue from '\.\/lead_import_approval_decision_live_bot_glue\.mjs'/.test(botSrc));
}

// B2. D3B guard calls shouldRouteToDecisionLiveControl + handler
{
    check('B2. bot calls shouldRouteToDecisionLiveControl', /leadImportDecisionGlue\.shouldRouteToDecisionLiveControl\(text\)/.test(botSrc));
    check('B2. bot calls handleDecisionLiveControlBotMessage', /leadImportDecisionGlue\.handleDecisionLiveControlBotMessage\(/.test(botSrc));
}

// B3. ROUTE ORDER: D3B guard BEFORE D2E1 mutation_blocked guard
{
    const idxD3B = botSrc.indexOf('shouldRouteToDecisionLiveControl(text)');
    const idxD2E1 = botSrc.indexOf('mutation_blocked_d2e1');
    check('B3. D3B guard present', idxD3B !== -1);
    check('B3. D2E1 mutation_blocked guard still present', idxD2E1 !== -1);
    check('B3. D3B routed BEFORE D2E1 mutation_blocked', idxD3B !== -1 && idxD2E1 !== -1 && idxD3B < idxD2E1);
}

// B4. D4 commit glue NOT imported (HOLD) — only as a comment
{
    const activeImport = /^\s*import \* as leadImportCommitGlue from/m.test(botSrc);
    check('B4. D4 commit glue NOT actively imported', activeImport === false);
    check('B4. D4 commit referenced as HOLD comment', /commit live-control remains HOLD|commit.*HOLD/i.test(botSrc));
}

// B5. queue path points at the real approval_queue file (read by confirm only)
{
    check('B5. bot wires approval_queue path', /'13_sales', 'approval_queue', 'lead_import_approvals\.json'/.test(botSrc));
}

// B6. no hardcoded confirm:true / confirm = true in bot D3B wiring
{
    check('B6. no hardcoded confirm:true', /confirm\s*:\s*true/.test(botSrc) === false);
    check('B6. no hardcoded confirm = true', /confirm\s*=\s*true/.test(botSrc) === false);
}

// B7. owner gate wired for D3B confirm
{
    check('B7. D3B passes isOwner from isOwnerSender', /isOwner:\s*_d3bIsFromOwner === true/.test(botSrc));
}

// ===========================================================================
// FINAL — production queue untouched
// ===========================================================================
{
    const prodShaAfter = sha256File(PROD_QUEUE);
    check('FINAL. production queue sha256 unchanged (before==after)', prodShaBefore === prodShaAfter);
}

console.log('\n=== D3B approve/reject OFFLINE bot-patch TEST ===\n');
console.log(results.join('\n'));
console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
