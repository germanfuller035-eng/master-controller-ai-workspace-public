// lead_import_approval_decision_live_bot_glue_d3_3_test.mjs
// =============================================================================
// D3B tests for the bot glue that routes /lead_import_approve and
// /lead_import_reject only.
//
// Verifies:
//   - glue routes ONLY /lead_import_approve and /lead_import_reject.
//   - short aliases /lead_approve and /lead_reject are NOT routed (inactive).
//   - other commands (/lead_import_commit /lead_queue ...) are NOT handled here.
//   - check never writes; confirm on temp-copy writes & is reported.
//   - bare command (no phase) returns usage text and never writes.
//   - glue text always carries the safety footer.
//   - no lead_contacts / leads_master / client-contact / send APIs in glue source.
//
// Run: node tools/tests/lead_import_approval_decision_live_bot_glue_d3_3_test.mjs
// =============================================================================

import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

import {
    shouldRouteToDecisionLiveControl,
    handleDecisionLiveControlBotMessage,
    parseDecisionCommand,
    SAFETY_FOOTER,
} from '../telegram_gateway/lead_import_approval_decision_live_bot_glue.mjs';

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

const PENDING_ID = 'IMP-20260606-101010-111111';
const COMMITTED_ID = 'IMP-20260606-100554-941263';

function makeTempQueue() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd3b_glue_'));
    const file = path.join(dir, 'lead_import_approvals.json');
    fs.writeFileSync(file, JSON.stringify({
        version: 1,
        cards: [
            { import_id: PENDING_ID, status: 'PENDING', source: 'synthetic', lead_count: 3 },
            { import_id: COMMITTED_ID, status: 'COMMITTED', source: 'prod', lead_count: 5 },
        ],
    }, null, 2), 'utf8');
    return { dir, file };
}

const OWNER = { isOwner: true };

const prodShaBefore = sha256File(PROD_QUEUE);

// ---------------------------------------------------------------------------
// 1. routing: only /lead_import_approve and /lead_import_reject
// ---------------------------------------------------------------------------
{
    check('1. routes /lead_import_approve', shouldRouteToDecisionLiveControl(`/lead_import_approve ${PENDING_ID} check`) === true);
    check('1. routes /lead_import_reject', shouldRouteToDecisionLiveControl(`/lead_import_reject ${PENDING_ID} check`) === true);
    // short aliases must remain inactive
    check('1. does NOT route /lead_approve alias', shouldRouteToDecisionLiveControl('/lead_approve IMP-X check') === false);
    check('1. does NOT route /lead_reject alias', shouldRouteToDecisionLiveControl('/lead_reject IMP-X check') === false);
    // other commands
    check('1. does NOT route /lead_import_commit', shouldRouteToDecisionLiveControl(`/lead_import_commit ${PENDING_ID} confirm`) === false);
    check('1. does NOT route /lead_import_review', shouldRouteToDecisionLiveControl('/lead_import_review') === false);
    check('1. does NOT route /lead_queue', shouldRouteToDecisionLiveControl('/lead_queue') === false);
    check('1. does NOT route /ping', shouldRouteToDecisionLiveControl('/ping') === false);
    check('1. does NOT route arbitrary text', shouldRouteToDecisionLiveControl('привет') === false);
}

// ---------------------------------------------------------------------------
// 2. other commands not handled here (handled:false)
// ---------------------------------------------------------------------------
{
    const r1 = handleDecisionLiveControlBotMessage(`/lead_import_commit ${PENDING_ID} confirm`, { queuePath: 'x' });
    const r2 = handleDecisionLiveControlBotMessage('/lead_queue', { queuePath: 'x' });
    const r3 = handleDecisionLiveControlBotMessage('/lead_approve IMP-X confirm', { queuePath: 'x' });
    check('2. /lead_import_commit not handled', r1.handled === false);
    check('2. /lead_queue not handled', r2.handled === false);
    check('2. /lead_approve alias not handled', r3.handled === false);
}

// ---------------------------------------------------------------------------
// 3. approve IMP-X check routes to D3B check (no write) + transition text
// ---------------------------------------------------------------------------
{
    const { file } = makeTempQueue();
    const before = sha256File(file);
    const r = handleDecisionLiveControlBotMessage(`/lead_import_approve ${PENDING_ID} check`, { queuePath: file });
    const after = sha256File(file);
    check('3. approve check handled', r.handled === true && r.phase === 'check' && r.wrote === false);
    check('3. approve check text has PENDING -> APPROVED', /PENDING/.test(r.text) && /APPROVED/.test(r.text));
    check('3. approve check no write', before === after);
}

// ---------------------------------------------------------------------------
// 4. approve IMP-X confirm routes to D3B confirm (writes on temp-copy)
// ---------------------------------------------------------------------------
{
    const { file } = makeTempQueue();
    const r = handleDecisionLiveControlBotMessage(`/lead_import_approve ${PENDING_ID} confirm`, { queuePath: file, ...OWNER });
    check('4. approve confirm handled + wrote', r.handled === true && r.wrote === true);
    const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
    check('4. approve confirm persisted APPROVED', onDisk.cards.find((c) => c.import_id === PENDING_ID).status === 'APPROVED');
}

// ---------------------------------------------------------------------------
// 5. reject IMP-X check routes to D3B check (no write)
// ---------------------------------------------------------------------------
{
    const { file } = makeTempQueue();
    const before = sha256File(file);
    const r = handleDecisionLiveControlBotMessage(`/lead_import_reject ${PENDING_ID} check`, { queuePath: file });
    const after = sha256File(file);
    check('5. reject check handled no write', r.handled === true && r.phase === 'check' && r.wrote === false);
    check('5. reject check text has PENDING -> REJECTED', /PENDING/.test(r.text) && /REJECTED/.test(r.text));
    check('5. reject check no write', before === after);
}

// ---------------------------------------------------------------------------
// 6. reject IMP-X confirm routes to D3B confirm (writes on temp-copy)
// ---------------------------------------------------------------------------
{
    const { file } = makeTempQueue();
    const r = handleDecisionLiveControlBotMessage(`/lead_import_reject ${PENDING_ID} confirm`, { queuePath: file, ...OWNER });
    check('6. reject confirm handled + wrote', r.handled === true && r.wrote === true);
    const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
    check('6. reject confirm persisted REJECTED', onDisk.cards.find((c) => c.import_id === PENDING_ID).status === 'REJECTED');
}

// ---------------------------------------------------------------------------
// 7. approve IMP-X without phase -> usage, no mutation
// ---------------------------------------------------------------------------
{
    const { file } = makeTempQueue();
    const before = sha256File(file);
    const r = handleDecisionLiveControlBotMessage(`/lead_import_approve ${PENDING_ID}`, { queuePath: file });
    const after = sha256File(file);
    check('7. approve bare -> usage handled no write', r.handled === true && r.usage === true && r.wrote === false);
    check('7. approve bare usage text shows check & confirm', /check/.test(r.text) && /confirm/.test(r.text) && /No write without explicit confirm/.test(r.text));
    check('7. approve bare no write', before === after);
}

// ---------------------------------------------------------------------------
// 8. reject IMP-X without phase -> usage, no mutation
// ---------------------------------------------------------------------------
{
    const { file } = makeTempQueue();
    const before = sha256File(file);
    const r = handleDecisionLiveControlBotMessage(`/lead_import_reject ${PENDING_ID}`, { queuePath: file });
    const after = sha256File(file);
    check('8. reject bare -> usage handled no write', r.handled === true && r.usage === true && r.wrote === false);
    check('8. reject bare no write', before === after);
}

// ---------------------------------------------------------------------------
// 9. non-owner confirm refused via glue (no write)
// ---------------------------------------------------------------------------
{
    const { file } = makeTempQueue();
    const before = sha256File(file);
    const r = handleDecisionLiveControlBotMessage(`/lead_import_approve ${PENDING_ID} confirm`, { queuePath: file, isOwner: false });
    const after = sha256File(file);
    check('9. non-owner confirm refused no write', r.handled === true && r.wrote === false);
    check('9. non-owner confirm no write', before === after);
}

// ---------------------------------------------------------------------------
// 10. COMMITTED card refusal text + no write
// ---------------------------------------------------------------------------
{
    const { file } = makeTempQueue();
    const before = sha256File(file);
    const r = handleDecisionLiveControlBotMessage(`/lead_import_approve ${COMMITTED_ID} confirm`, { queuePath: file, ...OWNER });
    const after = sha256File(file);
    check('10. COMMITTED refused no write', r.handled === true && r.wrote === false);
    check('10. COMMITTED no write', before === after);
}

// ---------------------------------------------------------------------------
// 11. safety footer always present in formatted text
// ---------------------------------------------------------------------------
{
    const { file } = makeTempQueue();
    const ok = handleDecisionLiveControlBotMessage(`/lead_import_approve ${PENDING_ID} check`, { queuePath: file });
    const fail = handleDecisionLiveControlBotMessage('/lead_import_approve', { queuePath: file });
    check('11. footer in success text', /real_import:\s*BLOCKED/.test(ok.text) && /client_contact:\s*BLOCKED/.test(ok.text) && /auto_send:\s*BLOCKED/.test(ok.text));
    check('11. footer in refusal/usage text', /real_import:\s*BLOCKED/.test(fail.text));
}

// ---------------------------------------------------------------------------
// 12. glue source contains NO lead_contacts / leads_master / send APIs
// ---------------------------------------------------------------------------
{
    const src = fs.readFileSync(path.join(__dirname, '..', 'telegram_gateway', 'lead_import_approval_decision_live_bot_glue.mjs'), 'utf8');
    const forbidden = ['sendTelegram', 'smtp', 'sendMail', 'nodemailer', 'lead_contacts', 'leads_master', 'runImport', 'commitImport', 'whatsapp', 'fetch(', 'axios'];
    const hits = forbidden.filter((f) => src.toLowerCase().includes(f.toLowerCase()));
    check('12. glue references no contact/send/import/lead_contacts/leads_master APIs', hits.length === 0);
}

// ---------------------------------------------------------------------------
// 13. production queue sha256 unchanged
// ---------------------------------------------------------------------------
{
    const prodShaAfter = sha256File(PROD_QUEUE);
    check('13. production queue sha256 unchanged (before==after)', prodShaBefore === prodShaAfter);
}

console.log('\n=== D3B approval-decision live bot glue TEST ===\n');
console.log(results.join('\n'));
console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
