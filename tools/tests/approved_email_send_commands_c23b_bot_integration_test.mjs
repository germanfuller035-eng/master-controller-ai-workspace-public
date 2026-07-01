/**
 * approved_email_send_commands_c23b_bot_integration_test.mjs
 * Phase C2.3b — STATIC integration test for the C2.3a bot patch.
 *
 * APPROVAL: APPROVE_APPROVED_EMAIL_SEND_COMMANDS_C23B_TESTS_ONLY_2026-05-31
 *
 * HARD MODE (read-only static analysis):
 *   - Reads telegram_master_bot.mjs and approved_email_send_commands.mjs as TEXT.
 *   - NEVER imports/executes the bot. NEVER touches Telegram API / .env / SMTP.
 *   - NEVER sends email. NEVER reads secrets. NEVER restarts the bot.
 *   - Verifies the C2.3a integration is correct and that no dangerous
 *     email/SMTP/.env patterns were introduced.
 *
 * Run:
 *   node tools/tests/approved_email_send_commands_c23b_bot_integration_test.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ─── paths ───────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const WORKSPACE  = path.resolve(path.join(__dirname, '..', '..'));
const GATEWAY    = path.join(WORKSPACE, 'tools', 'telegram_gateway');

const BOT_FILE      = path.join(GATEWAY, 'telegram_master_bot.mjs');
const COMMANDS_FILE = path.join(GATEWAY, 'approved_email_send_commands.mjs');

// ─── result helpers ──────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const results = [];

function ok(name) { passed++; results.push(`  ✅ PASS  ${name}`); }
function bad(name, reason) { failed++; results.push(`  ❌ FAIL  ${name}  →  ${reason}`); }
function check(name, cond, reason = 'condition false') { if (cond) ok(name); else bad(name, reason); }

// ─── load source as text (read-only) ─────────────────────────────────────────
function readText(p) {
    if (!fs.existsSync(p)) {
        throw new Error(`required source file not found: ${p}`);
    }
    return fs.readFileSync(p, 'utf-8');
}

const botSrc      = readText(BOT_FILE);
const commandsSrc = readText(COMMANDS_FILE);

// Helper: index of first regex/string match, or -1.
function indexOfRe(src, re) {
    const m = src.match(re);
    return m ? m.index : -1;
}

// Strip JS comments (block + line) so dangerous-pattern scans inspect REAL CODE
// only, not safety-contract docstrings (e.g. "Never reads .env / AI_SECRETS").
// This keeps the test strict by MEANING: documentation mentioning a forbidden
// pattern is fine; actual executable use of it is not.
function stripComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, ' ')   // block comments
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // line comments (keep http://)
}

const botCode      = stripComments(botSrc);
const commandsCode = stripComments(commandsSrc);


console.log('\n=== APPROVED EMAIL SEND COMMANDS C2.3b — BOT INTEGRATION STATIC TEST ===\n');

// ──────────────────────────────────────────────────────────────────────────────
// 1. import handleApprovedEmailSendCommand present
// ──────────────────────────────────────────────────────────────────────────────
const importRe = /import\s*\{[^}]*\bhandleApprovedEmailSendCommand\b[^}]*\}\s*from\s*['"]\.\/approved_email_send_commands\.mjs['"]/;
const importIdx = indexOfRe(botSrc, importRe);
check(
    '1. import handleApprovedEmailSendCommand from ./approved_email_send_commands.mjs',
    importIdx !== -1,
    'import statement not found',
);

// ──────────────────────────────────────────────────────────────────────────────
// 2. Call to handleApprovedEmailSendCommand present (not just the import)
// ──────────────────────────────────────────────────────────────────────────────
const callRe = /\bhandleApprovedEmailSendCommand\s*\(/;
const callIdx = indexOfRe(botSrc, callRe);
check(
    '2. handleApprovedEmailSendCommand(...) is invoked',
    callIdx !== -1,
    'no call expression found',
);

// ──────────────────────────────────────────────────────────────────────────────
// 3. Handler is AFTER handleApprovalCommand
// ──────────────────────────────────────────────────────────────────────────────
const approvalCallIdx = indexOfRe(botSrc, /\bhandleApprovalCommand\s*\(/);
check(
    '3. handler call is AFTER handleApprovalCommand call',
    approvalCallIdx !== -1 && callIdx !== -1 && callIdx > approvalCallIdx,
    `approvalCallIdx=${approvalCallIdx}, callIdx=${callIdx}`,
);

// ──────────────────────────────────────────────────────────────────────────────
// 4. Handler is BEFORE Sales Phase 2 block / Phase 2 sales ops block
//    Robust: match any of several plausible Phase 2 markers, choose the first
//    one that appears AFTER the handler call (the routing block).
// ──────────────────────────────────────────────────────────────────────────────
const phase2Patterns = [
    /SALES\s+PHASE\s*2/i,
    /Sales\s+Phase\s*2/i,
    /Phase\s*2\s+sales/i,
    /handleSalesPhase2\s*\(/,
    /PHASE\s*2\s+OWNER-ONLY/i,
];
let phase2Idx = -1;
for (const re of phase2Patterns) {
    // find first occurrence that is after the handler call (routing position)
    const all = [...botSrc.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))];
    for (const m of all) {
        if (m.index > callIdx) {
            if (phase2Idx === -1 || m.index < phase2Idx) phase2Idx = m.index;
            break;
        }
    }
}
check(
    '4. handler call is BEFORE Sales Phase 2 / Phase 2 sales ops block',
    phase2Idx !== -1 && callIdx < phase2Idx,
    `callIdx=${callIdx}, phase2Idx=${phase2Idx}`,
);

// ──────────────────────────────────────────────────────────────────────────────
// 5. Context passed to handler contains workspace: WORKSPACE, chatId,
//    sendTelegram, botLog. Inspect the call's argument object slice.
// ──────────────────────────────────────────────────────────────────────────────
let contextSlice = '';
if (callIdx !== -1) {
    // grab a window of text starting at the call up to the closing of the object
    const window = botSrc.slice(callIdx, callIdx + 600);
    contextSlice = window;
}
check(
    '5a. context contains workspace: WORKSPACE',
    /workspace\s*:\s*WORKSPACE\b/.test(contextSlice),
    'workspace: WORKSPACE not found in handler context',
);
check(
    '5b. context contains chatId',
    /\bchatId\b/.test(contextSlice),
    'chatId not found in handler context',
);
check(
    '5c. context contains sendTelegram',
    /\bsendTelegram\b/.test(contextSlice),
    'sendTelegram not found in handler context',
);
check(
    '5d. context contains botLog',
    /\bbotLog\b/.test(contextSlice),
    'botLog not found in handler context',
);

// ──────────────────────────────────────────────────────────────────────────────
// 6. Early return / stop routing after handled.
//    After the call, before the Phase 2 block, there must be a guarded
//    `return true;` tied to the handled flag.
// ──────────────────────────────────────────────────────────────────────────────
const afterCall = botSrc.slice(callIdx, phase2Idx === -1 ? callIdx + 1200 : phase2Idx);
const handledGuardRe = /if\s*\(\s*\w*[Hh]andled\w*\s*\)\s*\{[\s\S]{0,400}?return\s+true\s*;/;
const handledGuard = handledGuardRe.test(afterCall);
// fallback: a bare `return true;` shortly after the handled flag assignment
const handledFlagRe = /const\s+(\w*[Hh]andled\w*)\s*=\s*await\s+handleApprovedEmailSendCommand/;
const flagMatch = afterCall.match(handledFlagRe);
const hasReturnTrue = /return\s+true\s*;/.test(afterCall);
check(
    '6. early return on handled (if (handled) { ... return true; }) stops routing',
    handledGuard || (flagMatch && hasReturnTrue),
    'no handled-guarded `return true;` found after handler call',
);

// ──────────────────────────────────────────────────────────────────────────────
// 7. telegram_master_bot.mjs has NO new dangerous email/send patterns.
// ──────────────────────────────────────────────────────────────────────────────
const BOT_DANGEROUS = [
    ['nodemailer',        /\bnodemailer\b/],
    ['createTransport',   /\bcreateTransport\b/],
    ['SMTP_HOST',         /\bSMTP_HOST\b/],
    ['SMTP_USER',         /\bSMTP_USER\b/],
    ['SMTP_PASS',         /\bSMTP_PASS\b/],
    ['smtp://',           /smtp:\/\//],
    ['sendMail',          /\bsendMail\b/],
    ['transporter',       /\btransporter\b/],
    ['process.env.SMTP',  /process\.env\.SMTP/],
];
for (const [label, re] of BOT_DANGEROUS) {
    check(
        `7. bot file is free of dangerous pattern: ${label}`,
        !re.test(botCode),
        `dangerous pattern "${label}" present in telegram_master_bot.mjs (real code)`,
    );
}


// ──────────────────────────────────────────────────────────────────────────────
// 8. approved_email_send_commands.mjs has NO dangerous SMTP/.env patterns.
// ──────────────────────────────────────────────────────────────────────────────
const CMD_DANGEROUS = [
    ['process.env',       /process\.env\b/],
    ['dotenv',            /\bdotenv\b/],
    ['.env',              /\.env\b/],
    ['AI_SECRETS',        /\bAI_SECRETS\b/],
    ['nodemailer',        /\bnodemailer\b/],
    ['createTransport',   /\bcreateTransport\b/],
    ['SMTP_HOST',         /\bSMTP_HOST\b/],
    ['SMTP_USER',         /\bSMTP_USER\b/],
    ['SMTP_PASS',         /\bSMTP_PASS\b/],
    ['smtp://',           /smtp:\/\//],
    ['sendMail',          /\bsendMail\b/],
    ['transporter',       /\btransporter\b/],
    ['net.connect',       /net\.connect/],
    ['tls.connect',       /tls\.connect/],
];
for (const [label, re] of CMD_DANGEROUS) {
    check(
        `8. commands file is free of dangerous pattern: ${label}`,
        !re.test(commandsCode),
        `dangerous pattern "${label}" present in approved_email_send_commands.mjs (real code)`,
    );
}


// ──────────────────────────────────────────────────────────────────────────────
// 9. Russian router canonical commands present (in commands module).
// ──────────────────────────────────────────────────────────────────────────────
const CANONICAL = ['/send_approved_dry_run', '/send_job_status', '/send_jobs'];
for (const cmd of CANONICAL) {
    // The module stores commands without leading slash in SEND_COMMANDS; accept
    // either the slash form (in bot/comments) or the bare token in the module.
    const bare = cmd.slice(1);
    const present = commandsSrc.includes(cmd) || new RegExp(`['"]${bare}['"]`).test(commandsSrc);
    check(
        `9. canonical command present: ${cmd}`,
        present,
        `${cmd} not found in approved_email_send_commands.mjs`,
    );
}

// ─── summary ─────────────────────────────────────────────────────────────────
console.log(results.join('\n'));
console.log(`\n--- SUMMARY ---`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed}`);
console.log(`TOTAL : ${passed + failed}`);

if (failed > 0) {
    console.log('\n❌ C2.3b STATIC INTEGRATION TEST: FAIL\n');
    process.exit(1);
} else {
    console.log('\n✅ C2.3b STATIC INTEGRATION TEST: PASS\n');
    process.exit(0);
}
