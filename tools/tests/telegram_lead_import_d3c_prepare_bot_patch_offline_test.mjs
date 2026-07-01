// telegram_lead_import_d3c_prepare_bot_patch_offline_test.mjs
// =============================================================================
// D3C OFFLINE bot-patch test.
//
// Verifies the live bot (telegram_master_bot.mjs) was patched correctly to
// route /lead_import_prepare <text> to the write-gated D3C prepare adapter,
// WITHOUT starting the bot, WITHOUT any network, WITHOUT touching real data.
//
// Two layers:
//   A. Behavioural routing — exercises the D3C adapter against a THROWAWAY temp
//      queue (the only file ever written) to prove routing + owner gate + usage.
//   B. Static source assertions — reads telegram_master_bot.mjs as text and
//      asserts the wiring + route order + safety holds (no bot execution).
//
// Hard boundaries: no bot start, no sendTelegram to clients, no real queue
// mutation, no import into leads_master/lead_contacts, no events write.
//
// Run: node tools/tests/telegram_lead_import_d3c_prepare_bot_patch_offline_test.mjs
// =============================================================================

import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

import {
    shouldRouteToPrepare,
    parsePrepareCommand,
    prepareLeadImportPendingCard,
} from '../telegram_gateway/lead_import_prepare_adapter.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE = path.resolve(path.join(__dirname, '..', '..'));
const BOT_FILE = path.join(WORKSPACE, 'tools', 'telegram_gateway', 'telegram_master_bot.mjs');
const PROD_QUEUE = path.join(WORKSPACE, '13_sales', 'approval_queue', 'lead_import_approvals.json');
const PROD_LEADS_MASTER = path.join(WORKSPACE, '13_sales', 'leads_master.json');
const PROD_LEAD_CONTACTS = path.join(WORKSPACE, '13_sales', 'lead_contacts.json');
const PROD_EVENTS = path.join(WORKSPACE, '13_sales', 'lead_intake_events.jsonl');

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

// Sandbox workspace + temp queue (only files ever written by this test).
const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'd3c_botpatch_'));
const SANDBOX_WS = path.join(TMP_ROOT, 'ws');
fs.mkdirSync(SANDBOX_WS, { recursive: true });
function tmpQueue(name) { return path.join(TMP_ROOT, `${name}.json`); }

const VALID_TEXT =
    'TEST_D3B_DO_NOT_COMMIT Иванов; https://example-test-d3b.ru; +7 900 000 00 00; test@example-test-d3b.ru';

// Capture real-data sha up-front; all must be identical at end.
const prodQueueShaBefore = sha256File(PROD_QUEUE);
const prodMasterShaBefore = sha256File(PROD_LEADS_MASTER);
const prodContactsShaBefore = sha256File(PROD_LEAD_CONTACTS);
const prodEventsShaBefore = sha256File(PROD_EVENTS);

// ===========================================================================
// LAYER A — Behavioural routing through the D3C adapter (temp queue only)
// ===========================================================================

// A1. /lead_import_prepare <text> routes
{
    check('A1. /lead_import_prepare <text> routes to D3C', shouldRouteToPrepare(`/lead_import_prepare ${VALID_TEXT}`) === true);
    const p = parsePrepareCommand(`/lead_import_prepare ${VALID_TEXT}`);
    check('A1. payload parsed off the command', p.ok === true && p.leadText === VALID_TEXT);
}

// A2. valid text creates exactly one PENDING card (temp queue only)
{
    const file = tmpQueue('a2');
    const out = await prepareLeadImportPendingCard(`/lead_import_prepare ${VALID_TEXT}`, { queuePath: file, isOwner: true, pipelineWorkspace: SANDBOX_WS });
    check('A2. valid text wrote PENDING card', out.ok === true && out.wrote === true && out.status === 'PENDING');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const cards = Array.isArray(data) ? data : data.cards;
    check('A2. exactly one PENDING card on disk', cards.filter((c) => c.status === 'PENDING').length === 1);
    check('A2. card carries BLOCKED safety flags', cards[0].real_import === 'BLOCKED' && cards[0].client_contact === 'BLOCKED' && cards[0].auto_send === 'BLOCKED');
}

// A3. /lead_import_prepare WITHOUT text -> usage, no mutation
{
    const file = tmpQueue('a3');
    const out = await prepareLeadImportPendingCard('/lead_import_prepare   ', { queuePath: file, isOwner: true, pipelineWorkspace: SANDBOX_WS });
    check('A3. bare prepare -> usage, no write', out.usage === true && out.wrote === false);
    check('A3. bare prepare created no queue file', fs.existsSync(file) === false);
}

// A4. non-owner refused, no mutation
{
    const file = tmpQueue('a4');
    const out = await prepareLeadImportPendingCard(`/lead_import_prepare ${VALID_TEXT}`, { queuePath: file, isOwner: false, pipelineWorkspace: SANDBOX_WS });
    check('A4. non-owner refused', out.ok === false && out.reason === 'owner_gate_blocked' && out.wrote === false);
    check('A4. non-owner created no queue file', fs.existsSync(file) === false);
}

// A5. /lead_import_review NOT hijacked by D3C router
{
    check('A5. /lead_import_review not routed to D3C', shouldRouteToPrepare('/lead_import_review') === false);
}

// A6. approve/reject check|confirm NOT hijacked by D3C router
{
    check('A6. /lead_import_approve not routed to D3C', shouldRouteToPrepare('/lead_import_approve IMP-X check') === false);
    check('A6. /lead_import_reject not routed to D3C', shouldRouteToPrepare('/lead_import_reject IMP-X confirm') === false);
}

// A7. /lead_import_commit NOT routed to D3C (D4 stays HOLD)
{
    check('A7. /lead_import_commit not routed to D3C', shouldRouteToPrepare('/lead_import_commit IMP-X confirm') === false);
}

// A8. /ping /health /today NOT hijacked
{
    check('A8. /ping not routed to D3C', shouldRouteToPrepare('/ping') === false);
    check('A8. /health not routed to D3C', shouldRouteToPrepare('/health') === false);
    check('A8. /today not routed to D3C', shouldRouteToPrepare('/today') === false);
}

// A9. /lead_import_preview & /lead_import_sandbox NOT routed to D3C
{
    check('A9. /lead_import_preview not routed to D3C', shouldRouteToPrepare('/lead_import_preview x') === false);
    check('A9. /lead_import_sandbox not routed to D3C', shouldRouteToPrepare('/lead_import_sandbox x') === false);
}

// ===========================================================================
// LAYER B — Static source assertions on telegram_master_bot.mjs (no execution)
// ===========================================================================
const botSrc = fs.readFileSync(BOT_FILE, 'utf8');

// B1. D3C adapter imported
check('B1. D3C prepare adapter imported', /import \* as leadImportPrepareAdapter from '\.\/lead_import_prepare_adapter\.mjs'/.test(botSrc));

// B2. bot calls shouldRouteToPrepare + prepareLeadImportPendingCard
check('B2. bot calls shouldRouteToPrepare', /leadImportPrepareAdapter\.shouldRouteToPrepare\(text\)/.test(botSrc));
check('B2. bot calls prepareLeadImportPendingCard', /leadImportPrepareAdapter\.prepareLeadImportPendingCard\(/.test(botSrc));

// B3. ROUTE ORDER: D3C guard BEFORE D3B decision guard AND BEFORE D2E1 mutation_blocked
{
    const idxD3C = botSrc.indexOf('shouldRouteToPrepare(text)');
    const idxD3B = botSrc.indexOf('shouldRouteToDecisionLiveControl(text)');
    const idxD2E1 = botSrc.indexOf('mutation_blocked_d2e1');
    check('B3. D3C guard present', idxD3C !== -1);
    check('B3. D3B guard still present', idxD3B !== -1);
    check('B3. D2E1 mutation_blocked guard still present', idxD2E1 !== -1);
    check('B3. D3C routed BEFORE D3B', idxD3C !== -1 && idxD3B !== -1 && idxD3C < idxD3B);
    check('B3. D3C routed BEFORE D2E1 mutation_blocked', idxD3C !== -1 && idxD2E1 !== -1 && idxD3C < idxD2E1);
}

// B4. owner gate wired for D3C
check('B4. D3C passes isOwner gate', /isOwner:\s*_d3cIsFromOwner === true/.test(botSrc) || /_d3cIsFromOwner/.test(botSrc));

// B5. queue path points at the real approval_queue file
check('B5. bot wires approval_queue path', /'13_sales', 'approval_queue', 'lead_import_approvals\.json'/.test(botSrc));

// B6. D4 commit glue NOT imported (HOLD) — only as a comment
{
    const activeImport = /^\s*import \* as leadImportCommitGlue from/m.test(botSrc);
    check('B6. D4 commit glue NOT actively imported', activeImport === false);
    check('B6. D4 commit referenced as HOLD comment', /commit.*HOLD/i.test(botSrc));
}

// B7. no hardcoded confirm:true / confirm = true in bot
check('B7. no hardcoded confirm:true', /confirm\s*:\s*true/.test(botSrc) === false);
check('B7. no hardcoded confirm = true', /confirm\s*=\s*true/.test(botSrc) === false);

// ===========================================================================
// STATIC SAFETY SCAN — adapter + bot D3C wiring never touch unsafe paths
// ===========================================================================
const adapterRaw = fs.readFileSync(path.join(WORKSPACE, 'tools', 'telegram_gateway', 'lead_import_prepare_adapter.mjs'), 'utf8');

// Strip comments before the safety scan so the module's OWN documentation
// (which intentionally enumerates the forbidden patterns: "No email/SMTP",
// "No fetch/axios", "No secrets / .env / AI_SECRETS", "lead_intake_events")
// cannot produce false positives. We scan only executable code.
function stripComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')      // block comments
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1');  // line comments (avoid http://)
}
const adapterSrc = stripComments(adapterRaw);

// S1. adapter never writes leads_master / lead_contacts / events
check('S1. adapter has no leads_master.json write', /writeFileSync[^\n]*leads_master/.test(adapterSrc) === false);
check('S1. adapter has no lead_contacts.json write', /writeFileSync[^\n]*lead_contacts/.test(adapterSrc) === false);
check('S1. adapter has no events jsonl write', /lead_intake_events/.test(adapterSrc) === false);

// S2. no client send / smtp / network in adapter
check('S2. no nodemailer/smtp', /nodemailer|smtp/i.test(adapterSrc) === false);
check('S2. no fetch/axios', /\bfetch\(|axios/.test(adapterSrc) === false);
check('S2. no sendTelegram client path', /sendTelegram\(/.test(adapterSrc) === false);

// S3. no secrets/.env reads in adapter
check('S3. no AI_SECRETS reference', /AI_SECRETS/.test(adapterSrc) === false);
check('S3. no .env reference', /\.env\b/.test(adapterSrc) === false);

// S4. no hardcoded confirm:true in adapter
check('S4. no hardcoded confirm:true in adapter', /confirm\s*:\s*true/.test(adapterSrc) === false);


// ===========================================================================
// FINAL — real data untouched
// ===========================================================================
check('FINAL. production queue sha256 unchanged', prodQueueShaBefore === sha256File(PROD_QUEUE));
check('FINAL. leads_master sha256 unchanged', prodMasterShaBefore === sha256File(PROD_LEADS_MASTER));
check('FINAL. lead_contacts sha256 unchanged', prodContactsShaBefore === sha256File(PROD_LEAD_CONTACTS));
check('FINAL. events log sha256 unchanged', prodEventsShaBefore === sha256File(PROD_EVENTS));

// cleanup temp sandbox
try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch (_) {}

console.log('\n=== D3C prepare OFFLINE bot-patch TEST ===\n');
console.log(results.join('\n'));
console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
