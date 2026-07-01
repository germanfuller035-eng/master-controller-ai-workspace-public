/**
 * lead_contact_commands_c26a_standalone_test.mjs
 *
 * APPROVAL: APPROVE_LEAD_CONTACT_COMMANDS_C26A_STANDALONE_2026-05-31
 *
 * Verifies the C2.6a standalone lead contact command module
 * (tools/telegram_gateway/lead_contact_commands.mjs).
 *
 * STANDALONE ONLY. No bot integration. No router change. No bot restart.
 * No SMTP. No .env. No email sent. No external messages. No git.
 *
 * Sandbox: tmp/lead_contact_commands_c26a_test_workspace/
 *
 * Coverage (16 checks):
 *   1.  /contact_show ZB23 shows contact
 *   2.  /contact_add_email ZB23 test@example.com adds email
 *   3.  duplicate email not duplicated
 *   4.  invalid email rejected
 *   5.  /contact_verify_email adds verified_emails[]
 *   6.  /contact_add_phone adds phone
 *   7.  duplicate phone not duplicated
 *   8.  invalid phone rejected
 *   9.  /contact_hold_whatsapp sets hold/not_found
 *   10. /contact_registry shows stats
 *   11. unknown lead → clear error
 *   12. bad format → usage
 *   13. non-contact command → false
 *   14. email not sent (no send adapter touched)
 *   15. SMTP not used (source-scan module)
 *   16. .env not read (source-scan module)
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { handleLeadContactCommand } from '../telegram_gateway/lead_contact_commands.mjs';
import { getLeadContactRegistryPaths, loadLeadContactRegistry } from '../telegram_gateway/lead_contact_registry.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const WORKSPACE  = path.resolve(__dirname, '..', '..');
const SANDBOX    = path.join(WORKSPACE, 'tmp', 'lead_contact_commands_c26a_test_workspace');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond) {
    if (cond) { passed++; console.log(`  ✅ ${name}`); }
    else { failed++; failures.push(name); console.log(`  ❌ ${name}`); }
}

// ──────────────────────────────────────────────
// Sandbox + fake context helpers
// ──────────────────────────────────────────────

function resetSandbox() {
    fs.rmSync(SANDBOX, { recursive: true, force: true });
    fs.mkdirSync(SANDBOX, { recursive: true });
}

function seedZB23() {
    const P = getLeadContactRegistryPaths(SANDBOX);
    fs.mkdirSync(P.root, { recursive: true });
    fs.writeFileSync(P.registryFile, JSON.stringify({
        ZB23: {
            lead_id: 'ZB23',
            primary_email: 'kvs@zb23.ru',
            emails: ['kvs@zb23.ru'],
            phones: [],
            whatsapp: null,
            source: 'manual_verified',
            note: 'Known working contact email from prior outreach',
            updated_at: '2026-05-31T00:00:00.000Z',
        },
    }, null, 2) + '\n', 'utf-8');
}

// Capture replies; never sends anything external.
function makeContext() {
    const sent = [];
    return {
        ctx: {
            workspace: SANDBOX,
            chatId: 'TEST_CHAT',
            sendTelegram: async (_chatId, message) => { sent.push(message); },
            botLog: () => {},
        },
        sent,
        last: () => sent[sent.length - 1] || '',
    };
}

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────

console.log('\n=== C2.6a Lead Contact Commands (Standalone) Tests ===\n');

// 1. /contact_show ZB23 shows contact
await (async function t1() {
    console.log('Test 1: /contact_show ZB23 shows contact');
    resetSandbox();
    seedZB23();
    const { ctx, last } = makeContext();
    const handled = await handleLeadContactCommand('/contact_show ZB23', ctx);
    check('1.handled true', handled === true);
    check('1.shows lead id', /ZB23/.test(last()));
    check('1.shows primary_email', /kvs@zb23\.ru/.test(last()));
})();

// 2. /contact_add_email adds email
await (async function t2() {
    console.log('Test 2: /contact_add_email adds email');
    resetSandbox();
    seedZB23();
    const { ctx, last } = makeContext();
    const handled = await handleLeadContactCommand('/contact_add_email ZB23 test@example.com', ctx);
    check('2.handled true', handled === true);
    const reg = loadLeadContactRegistry(SANDBOX);
    check('2.email stored', reg.ZB23.emails.includes('test@example.com'));
    check('2.reply confirms', /Email added/i.test(last()));
})();

// 3. duplicate email not duplicated
await (async function t3() {
    console.log('Test 3: duplicate email not duplicated');
    resetSandbox();
    seedZB23();
    const { ctx } = makeContext();
    await handleLeadContactCommand('/contact_add_email ZB23 dup@example.com', ctx);
    await handleLeadContactCommand('/contact_add_email ZB23 dup@example.com', ctx);
    await handleLeadContactCommand('/contact_add_email ZB23 DUP@example.com', ctx);
    const reg = loadLeadContactRegistry(SANDBOX);
    const count = reg.ZB23.emails.filter(e => e.toLowerCase() === 'dup@example.com').length;
    check('3.email stored once', count === 1);
})();

// 4. invalid email rejected
await (async function t4() {
    console.log('Test 4: invalid email rejected');
    resetSandbox();
    seedZB23();
    const { ctx, last } = makeContext();
    const handled = await handleLeadContactCommand('/contact_add_email ZB23 not-an-email', ctx);
    check('4.handled true', handled === true);
    check('4.reply rejects', /Invalid email/i.test(last()));
    const reg = loadLeadContactRegistry(SANDBOX);
    check('4.not stored', !reg.ZB23.emails.includes('not-an-email'));
})();

// 5. /contact_verify_email adds verified_emails[]
await (async function t5() {
    console.log('Test 5: /contact_verify_email adds verified_emails');
    resetSandbox();
    seedZB23();
    const { ctx, last } = makeContext();
    await handleLeadContactCommand('/contact_add_email ZB23 test@example.com', ctx);
    const handled = await handleLeadContactCommand('/contact_verify_email ZB23 test@example.com', ctx);
    check('5.handled true', handled === true);
    const reg = loadLeadContactRegistry(SANDBOX);
    check('5.verified_emails present', Array.isArray(reg.ZB23.verified_emails));
    check('5.email verified', reg.ZB23.verified_emails.includes('test@example.com'));
    check('5.existing schema intact', reg.ZB23.primary_email === 'kvs@zb23.ru' && reg.ZB23.emails.includes('kvs@zb23.ru'));
    check('5.reply confirms', /verified/i.test(last()));
})();

// 6. /contact_add_phone adds phone
await (async function t6() {
    console.log('Test 6: /contact_add_phone adds phone');
    resetSandbox();
    seedZB23();
    const { ctx, last } = makeContext();
    const handled = await handleLeadContactCommand('/contact_add_phone ZB23 +79180000000', ctx);
    check('6.handled true', handled === true);
    const reg = loadLeadContactRegistry(SANDBOX);
    check('6.phone stored', reg.ZB23.phones.includes('+79180000000'));
    check('6.reply confirms', /Phone added/i.test(last()));
})();

// 7. duplicate phone not duplicated
await (async function t7() {
    console.log('Test 7: duplicate phone not duplicated');
    resetSandbox();
    seedZB23();
    const { ctx } = makeContext();
    await handleLeadContactCommand('/contact_add_phone ZB23 +79180000000', ctx);
    await handleLeadContactCommand('/contact_add_phone ZB23 +79180000000', ctx);
    const reg = loadLeadContactRegistry(SANDBOX);
    const count = reg.ZB23.phones.filter(p => p === '+79180000000').length;
    check('7.phone stored once', count === 1);
})();

// 8. invalid phone rejected
await (async function t8() {
    console.log('Test 8: invalid phone rejected');
    resetSandbox();
    seedZB23();
    const { ctx, last } = makeContext();
    const handled = await handleLeadContactCommand('/contact_add_phone ZB23 abc', ctx);
    check('8.handled true', handled === true);
    check('8.reply rejects', /Invalid phone/i.test(last()));
    const reg = loadLeadContactRegistry(SANDBOX);
    check('8.not stored', !reg.ZB23.phones.includes('abc'));
})();

// 9. /contact_hold_whatsapp sets hold/not_found
await (async function t9() {
    console.log('Test 9: /contact_hold_whatsapp sets hold/not_found');
    resetSandbox();
    seedZB23();
    const { ctx } = makeContext();
    await handleLeadContactCommand('/contact_hold_whatsapp ZB23 not found on whatsapp', ctx);
    const reg = loadLeadContactRegistry(SANDBOX);
    check('9.whatsapp null', reg.ZB23.whatsapp === null);
    check('9.status not_found', reg.ZB23.whatsapp_status === 'not_found');
    check('9.note stored', reg.ZB23.whatsapp_note === 'not found on whatsapp');

    // A generic reason → hold
    const { ctx: ctx2 } = makeContext();
    await handleLeadContactCommand('/contact_hold_whatsapp ZB23 client asked to pause', ctx2);
    const reg2 = loadLeadContactRegistry(SANDBOX);
    check('9.status hold', reg2.ZB23.whatsapp_status === 'hold');
})();

// 10. /contact_registry shows stats
await (async function t10() {
    console.log('Test 10: /contact_registry shows stats');
    resetSandbox();
    seedZB23();
    const { ctx, last } = makeContext();
    const handled = await handleLeadContactCommand('/contact_registry', ctx);
    check('10.handled true', handled === true);
    check('10.shows total', /total leads with contacts: 1/.test(last()));
    check('10.shows with primary', /leads with primary_email: 1/.test(last()));
    check('10.shows without primary', /leads without primary_email: 0/.test(last()));
})();

// 11. unknown lead → clear error
await (async function t11() {
    console.log('Test 11: unknown lead → clear error');
    resetSandbox();
    seedZB23();
    const { ctx, last } = makeContext();
    const handled = await handleLeadContactCommand('/contact_show NOLEAD', ctx);
    check('11.handled true', handled === true);
    check('11.clear error', /not found/i.test(last()) && /NOLEAD/.test(last()));
})();

// 12. bad format → usage
await (async function t12() {
    console.log('Test 12: bad format → usage');
    resetSandbox();
    seedZB23();
    const { ctx, last } = makeContext();
    const handled = await handleLeadContactCommand('/contact_add_email', ctx);
    check('12.handled true', handled === true);
    check('12.usage shown', /Usage:/i.test(last()));
})();

// 13. non-contact command → false
await (async function t13() {
    console.log('Test 13: non-contact command → false');
    resetSandbox();
    seedZB23();
    const { ctx, sent } = makeContext();
    const handled = await handleLeadContactCommand('/some_other_command foo', ctx);
    check('13.returns false', handled === false);
    check('13.no reply sent', sent.length === 0);
    const handled2 = await handleLeadContactCommand('just plain text', ctx);
    check('13.plain text false', handled2 === false);
})();

// 14 + 15 + 16. email not sent / SMTP not used / .env not read (source-scan)
await (async function t14to16() {
    console.log('Test 14-16: no email, no SMTP, no .env');
    const modPath = path.join(WORKSPACE, 'tools', 'telegram_gateway', 'lead_contact_commands.mjs');
    const src = fs.readFileSync(modPath, 'utf-8');
    // Strip comment lines for the scan to avoid matching documentation.
    const codeOnly = src
        .split('\n')
        .filter(line => !/^\s*(\*|\/\/|\/\*)/.test(line))
        .join('\n');

    check('14.no send adapter import', !/approved_email_send_adapter|nodemailer|sendMail|smtp/i.test(codeOnly));
    check('15.no SMTP usage', !/require\(['"]nodemailer|from\s+['"]nodemailer|createTransport\s*\(|net\.connect\s*\(|tls\.connect\s*\(/i.test(codeOnly));
    check('16.no .env read', !/readFileSync\([^)]*\.env|process\.env|dotenv/i.test(codeOnly));
})();

// ──────────────────────────────────────────────
console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
    console.log('Failures:', failures.join(', '));
    process.exit(1);
}
process.exit(0);
