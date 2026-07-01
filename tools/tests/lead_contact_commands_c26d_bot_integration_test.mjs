/**
 * lead_contact_commands_c26d_bot_integration_test.mjs
 *
 * APPROVAL: APPROVE_LEAD_CONTACT_COMMANDS_C26D_TESTS_ONLY_2026-05-31
 *
 * STATIC integration test for the C2.6c bot patch.
 *
 * Verifies (by reading source text only, NO bot start, NO network) that
 * lead_contact_commands.mjs is correctly wired into telegram_master_bot.mjs
 * and that no dangerous email/SMTP/.env patterns were introduced.
 *
 * HARD MODE:
 *   - Does NOT modify production code.
 *   - Does NOT read .env or AI_SECRETS.
 *   - Does NOT print tokens / passwords / chat ids / SMTP credentials.
 *   - Does NOT send email / Telegram / WhatsApp.
 *   - Does NOT start the bot, no SMTP, no auto-send.
 *
 * Coverage:
 *   1.  import handleLeadContactCommand present in bot.
 *   2.  handleLeadContactCommand invocation present in bot.
 *   3.  Handler is AFTER handleApprovedEmailSendCommand.
 *   4.  Handler is BEFORE Sales Phase 2 / Phase 2 sales ops block.
 *   5.  Context carries workspace: WORKSPACE, chatId, sendTelegram, botLog.
 *   6.  Early return / stop-routing after handled.
 *   7.  Canonical contact commands exist in the executable code chain.
 *   8.  Bot has NO new dangerous email/send patterns (executable code).
 *   9.  lead_contact_commands.mjs has NO dangerous patterns (executable code).
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const WORKSPACE  = path.resolve(__dirname, '..', '..');
const GW         = path.join(WORKSPACE, 'tools', 'telegram_gateway');

const BOT_PATH     = path.join(GW, 'telegram_master_bot.mjs');
const CONTACT_PATH = path.join(GW, 'lead_contact_commands.mjs');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond) {
    if (cond) { passed++; console.log(`  PASS  ${name}`); }
    else { failed++; failures.push(name); console.log(`  FAIL  ${name}`); }
}

// ──────────────────────────────────────────────
// Helper — separate executable code from comments
// ──────────────────────────────────────────────
//
// Removes block comments and line comments so dangerous-pattern scans never
// match documentation. This lets the test distinguish ".env"/"SMTP" mentioned
// in comments from real executable references.
function stripComments(src) {
    let s = src.replace(/\/\*[\s\S]*?\*\//g, '');
    const lines = s.split('\n').map((line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
            return '';
        }
        const idx = line.indexOf('//');
        if (idx >= 0 && line[idx - 1] !== ':') {
            return line.slice(0, idx);
        }
        return line;
    });
    return lines.join('\n');
}

const botSrc      = fs.readFileSync(BOT_PATH, 'utf-8');
const botCode     = stripComments(botSrc);
const contactSrc  = fs.readFileSync(CONTACT_PATH, 'utf-8');
const contactCode = stripComments(contactSrc);

console.log('\n=== C2.6d Lead Contact Commands — Bot Integration (Static) Tests ===\n');

// 1. import present
console.log('Test 1: import handleLeadContactCommand present');
check('1.import statement present',
    /import\s*\{\s*handleLeadContactCommand\s*\}\s*from\s*['"]\.\/lead_contact_commands\.mjs['"]/.test(botCode));

// 2. invocation present
console.log('Test 2: handleLeadContactCommand invocation present');
check('2.invocation present',
    /await\s+handleLeadContactCommand\s*\(\s*text\s*,/.test(botCode));

// 3. handler AFTER handleApprovedEmailSendCommand
console.log('Test 3: handler is AFTER handleApprovedEmailSendCommand');
const idxApprovedCall = botCode.search(/await\s+handleApprovedEmailSendCommand\s*\(\s*text\s*,/);
const idxContactCall  = botCode.search(/await\s+handleLeadContactCommand\s*\(\s*text\s*,/);
check('3.approved-email call found', idxApprovedCall >= 0);
check('3.contact call found', idxContactCall >= 0);
check('3.contact AFTER approved-email', idxApprovedCall >= 0 && idxContactCall > idxApprovedCall);

// 4. handler BEFORE Sales Phase 2 / Phase 2 sales ops block
//    Anchor on the actual Phase 2 handler INVOCATION (not the top-of-file
//    import), so the ordering check reflects the real routing chain.
console.log('Test 4: handler is BEFORE Sales Phase 2 / Phase 2 sales ops');
const phase2InvocationMarkers = [
    /await\s+handleSalesPhase2\s*\(/,
    /handleSalesPhase2\s*\(\s*chatId\s*,\s*text\s*,/,
];
let idxPhase2 = -1;
for (const re of phase2InvocationMarkers) {
    const m = botCode.search(re);
    if (m >= 0 && (idxPhase2 === -1 || m < idxPhase2)) idxPhase2 = m;
}
let phase2Anchor = idxPhase2;
if (phase2Anchor === -1) {
    // Fallback to the executable Phase-2 guard banner in raw source.
    phase2Anchor = botSrc.search(/SALES PHASE 2 OWNER-ONLY GUARDS/);
    const idxContactRaw = botSrc.search(/await\s+handleLeadContactCommand\s*\(\s*text\s*,/);
    check('4.phase2 anchor found (raw banner)', phase2Anchor >= 0);
    check('4.contact BEFORE phase2', idxContactRaw >= 0 && phase2Anchor > idxContactRaw);
} else {
    check('4.phase2 anchor found (invocation)', phase2Anchor >= 0);
    check('4.contact BEFORE phase2', idxContactCall >= 0 && phase2Anchor > idxContactCall);
}

// 5. Context fields
console.log('Test 5: context carries workspace/chatId/sendTelegram/botLog');
const callRegion = botCode.slice(idxContactCall, idxContactCall + 600);
check('5.workspace: WORKSPACE', /workspace\s*:\s*WORKSPACE/.test(callRegion));
check('5.chatId', /\bchatId\b/.test(callRegion));
check('5.sendTelegram', /\bsendTelegram\b/.test(callRegion));
check('5.botLog', /\bbotLog\b/.test(callRegion));

// 6. early return / stop routing after handled
console.log('Test 6: early return / stop routing after handled');
check('6.return true after handled',
    /if\s*\(\s*contactHandled\s*\)\s*\{[\s\S]{0,400}?return\s+true\s*;/.test(botCode));

// 7. canonical contact commands present in executable code chain
console.log('Test 7: canonical contact commands present in executable code chain');
const canonical = [
    '/contact_show',
    '/contact_add_email',
    '/contact_verify_email',
    '/contact_add_phone',
    '/contact_hold_whatsapp',
    '/contact_registry',
];
for (const cmd of canonical) {
    check(`7.${cmd} in module code`, contactCode.includes(cmd));
}

// 8. bot has NO new dangerous email/send patterns (executable code)
console.log('Test 8: bot has no dangerous email/send patterns (executable code)');
const botDangerous = [
    ['nodemailer',         /nodemailer/i],
    ['createTransport',    /createTransport\s*\(/],
    ['SMTP_HOST',          /SMTP_HOST/],
    ['SMTP_USER',          /SMTP_USER/],
    ['SMTP_PASS',          /SMTP_PASS/],
    ['smtp://',            /smtp:\/\//i],
    ['sendMail',           /sendMail\s*\(/],
    ['transporter',        /\btransporter\b/],
    ['process.env.SMTP',   /process\.env\.SMTP/],
];
for (const [label, re] of botDangerous) {
    check(`8.bot no ${label}`, !re.test(botCode));
}

// 9. lead_contact_commands.mjs has NO dangerous patterns (executable code)
console.log('Test 9: lead_contact_commands.mjs has no dangerous patterns (executable code)');
const moduleDangerous = [
    ['process.env',        /process\.env/],
    ['dotenv',             /dotenv/i],
    ['.env read',          /readFileSync\s*\([^)]*\.env/i],
    ['AI_SECRETS',         /AI_SECRETS/i],
    ['nodemailer',         /nodemailer/i],
    ['createTransport',    /createTransport\s*\(/],
    ['SMTP_HOST/USER/PASS',/SMTP_HOST|SMTP_USER|SMTP_PASS/],
    ['smtp://',            /smtp:\/\//i],
    ['sendMail',           /sendMail\s*\(/],
    ['transporter',        /\btransporter\b/],
    ['net.connect',        /net\.connect\s*\(/],
    ['tls.connect',        /tls\.connect\s*\(/],
];
for (const [label, re] of moduleDangerous) {
    check(`9.module no ${label}`, !re.test(contactCode));
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
    console.log('Failures:', failures.join(', '));
    process.exit(1);
}
process.exit(0);
