// contact_enrichment_commands_c27f_bot_integration_test.mjs
//
// STATIC integration test for the C2.7e bot patch that wired
// `handleLeadContactEnrichmentCommand` into `telegram_master_bot.mjs`.
//
// SAFETY / SCOPE:
//   - Pure static text analysis. Reads .mjs files as TEXT only.
//   - Does NOT import the bot, does NOT start the bot, does NOT restart anything.
//   - No network, no Telegram API, no SMTP, no .env, no AI_SECRETS access.
//   - No production code is modified.
//
// Verifies (per C2.7f spec):
//   1.  import handleLeadContactEnrichmentCommand present.
//   2.  Call/invocation of handleLeadContactEnrichmentCommand present.
//   3.  Handler is positioned AFTER handleLeadContactCommand.
//   4.  Handler is positioned BEFORE Sales Phase 2 (handleSalesPhase2) invocation.
//   5.  Context object passes: workspace: WORKSPACE, chatId, sendTelegram, botLog.
//   6.  Early return / stop routing after handled.
//   7.  Canonical enrichment commands present in chain (module).
//   8.  telegram_master_bot.mjs has no NEW dangerous SMTP/mailer patterns (code, not comments).
//   9.  lead_contact_enrichment_commands.mjs has no dangerous patterns (code, not comments).
//   10. Russian canonical commands present in russian_command_router.mjs.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const GW = resolve(__dirname, '..', 'telegram_gateway');

const BOT = resolve(GW, 'telegram_master_bot.mjs');
const ENRICH = resolve(GW, 'lead_contact_enrichment_commands.mjs');
const RU_ROUTER = resolve(GW, 'russian_command_router.mjs');

const results = [];
function check(name, cond, detail = '') {
    results.push({ name, pass: !!cond, detail });
}

function read(path) {
    return readFileSync(path, 'utf8');
}

// Strip line comments (// ...) and block comments (/* ... */) so dangerous-pattern
// scans look only at executable code, not commentary. String literals are left in
// place intentionally (a real string with "smtp://" would still be flagged), but
// the spec's main concern is to NOT false-positive on comments that mention .env/SMTP.
function stripComments(src) {
    // Remove block comments first.
    let out = src.replace(/\/\*[\s\S]*?\*\//g, '');
    // Remove line comments. Naive but adequate for these .mjs files (no regex-literal
    // edge cases involving // in this codebase's affected lines).
    out = out
        .split('\n')
        .map((line) => {
            const idx = line.indexOf('//');
            return idx === -1 ? line : line.slice(0, idx);
        })
        .join('\n');
    return out;
}

const botSrc = read(BOT);
const botCode = stripComments(botSrc);
const enrichSrc = read(ENRICH);
const enrichCode = stripComments(enrichSrc);
const ruSrc = read(RU_ROUTER);

// ── 1. import present ───────────────────────────────────────────────
const importRe = /import\s*\{[^}]*\bhandleLeadContactEnrichmentCommand\b[^}]*\}\s*from\s*['"]\.\/lead_contact_enrichment_commands\.mjs['"]/;
check('1. import handleLeadContactEnrichmentCommand present', importRe.test(botCode),
    'import statement from ./lead_contact_enrichment_commands.mjs');

// ── 2. invocation present ───────────────────────────────────────────
const callRe = /\bhandleLeadContactEnrichmentCommand\s*\(/;
check('2. handleLeadContactEnrichmentCommand invocation present', callRe.test(botCode));

// Positions (use code-with-comments-stripped to avoid comment-mention skew, but
// fall back to raw text positions for invocation ordering which is unambiguous).
const idxEnrichCall = botCode.indexOf('handleLeadContactEnrichmentCommand(');
const idxContactCall = botCode.indexOf('handleLeadContactCommand(');
const idxSales2Call = botCode.indexOf('handleSalesPhase2(');

// ── 3. handler AFTER handleLeadContactCommand ───────────────────────
check('3. enrichment handler AFTER handleLeadContactCommand',
    idxContactCall !== -1 && idxEnrichCall !== -1 && idxEnrichCall > idxContactCall,
    `contactCall@${idxContactCall} < enrichCall@${idxEnrichCall}`);

// ── 4. handler BEFORE Sales Phase 2 invocation ──────────────────────
check('4. enrichment handler BEFORE handleSalesPhase2 invocation',
    idxSales2Call !== -1 && idxEnrichCall !== -1 && idxEnrichCall < idxSales2Call,
    `enrichCall@${idxEnrichCall} < sales2Call@${idxSales2Call}`);

// ── 5. context object fields ────────────────────────────────────────
// Isolate the enrichment call argument block for precise context checking.
function extractCallBlock(code, callIdx) {
    // From the call opening paren, capture up to the matching ')' that closes the args,
    // by finding the second-arg object braces. Simpler: grab ~600 chars window.
    const start = callIdx;
    return code.slice(start, start + 600);
}
const enrichBlock = idxEnrichCall !== -1 ? extractCallBlock(botCode, idxEnrichCall) : '';
check('5a. context has workspace: WORKSPACE', /workspace\s*:\s*WORKSPACE/.test(enrichBlock));
check('5b. context has chatId', /\bchatId\b/.test(enrichBlock));
check('5c. context has sendTelegram', /\bsendTelegram\b/.test(enrichBlock));
check('5d. context has botLog', /\bbotLog\b/.test(enrichBlock));

// ── 6. early return / stop routing after handled ────────────────────
// Look for the handled-block guard: enrichmentHandled true -> return true.
const handledBlockRe = /enrichmentHandled[\s\S]{0,200}?return\s+true/;
const genericReturnRe = idxEnrichCall !== -1
    ? /return\s+true/.test(botCode.slice(idxEnrichCall, idxEnrichCall + 800))
    : false;
check('6. early return / stop routing after handled',
    handledBlockRe.test(botCode) || genericReturnRe,
    'enrichmentHandled -> return true');

// ── 7. canonical enrichment commands in module chain ────────────────
const canonical = ['/contact_enrich_text', '/contact_channels', '/contact_best_channel', '/contact_enrichment_status'];
for (const cmd of canonical) {
    check(`7. canonical command present in enrichment module: ${cmd}`, enrichSrc.includes(cmd));
}

// ── 8. bot: no NEW dangerous mailer/SMTP patterns (code only) ───────
const botDangerous = [
    'nodemailer',
    'createTransport',
    'SMTP_HOST',
    'SMTP_USER',
    'SMTP_PASS',
    'smtp://',
    'sendMail',
    'transporter',
    'process.env.SMTP',
];
for (const pat of botDangerous) {
    check(`8. bot code free of dangerous pattern: ${pat}`, !botCode.includes(pat));
}

// ── 9. enrichment module: no dangerous patterns (code only) ─────────
const enrichDangerousLiteral = [
    'process.env',
    'dotenv',
    '.env',
    'AI_SECRETS',
    'nodemailer',
    'createTransport',
    'smtp://',
    'sendMail',
    'transporter',
    'net.connect',
    'tls.connect',
];
for (const pat of enrichDangerousLiteral) {
    check(`9. enrichment module code free of dangerous pattern: ${pat}`, !enrichCode.includes(pat));
}
// SMTP credential env vars (regex group).
const smtpEnvRe = /SMTP_HOST|SMTP_USER|SMTP_PASS/;
check('9. enrichment module code free of SMTP_HOST|SMTP_USER|SMTP_PASS', !smtpEnvRe.test(enrichCode));

// ── 10. Russian canonical commands present in russian_command_router ─
for (const cmd of canonical) {
    check(`10. RU router contains canonical command: ${cmd}`, ruSrc.includes(cmd));
}

// ── Report ──────────────────────────────────────────────────────────
let failed = 0;
console.log('=== CONTACT ENRICHMENT COMMANDS C2.7F — BOT INTEGRATION STATIC TEST ===\n');
for (const r of results) {
    const tag = r.pass ? 'PASS' : 'FAIL';
    if (!r.pass) failed++;
    console.log(`[${tag}] ${r.name}${r.detail && !r.pass ? `  (${r.detail})` : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} checks passed.`);
if (failed > 0) {
    console.error(`\nRESULT: FAIL (${failed} failing checks)`);
    process.exit(1);
} else {
    console.log('\nRESULT: PASS (all static integration checks green)');
    process.exit(0);
}
