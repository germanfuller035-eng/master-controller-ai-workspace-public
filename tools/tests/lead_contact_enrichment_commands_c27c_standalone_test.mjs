/**
 * lead_contact_enrichment_commands_c27c_standalone_test.mjs
 *
 * APPROVAL: APPROVE_CONTACT_ENRICHMENT_COMMANDS_C27C_B_TESTS_ONLY_2026-05-31
 *
 * Verifies the C2.7c Standalone Lead Contact Enrichment Commands
 * (tools/telegram_gateway/lead_contact_enrichment_commands.mjs).
 *
 * OFFLINE / SANDBOXED. No SMTP. No .env. No email sent. No bot restart. No git.
 * No network. The module is NOT integrated into telegram_master_bot.mjs and
 * russian_command_router.mjs is NOT touched. sendTelegram is a local stub that
 * only collects reply strings — it never reaches a real chat / client.
 *
 * Sandbox:
 *   tmp/lead_contact_enrichment_commands_c27c_test_workspace/
 *
 * Coverage (17 scenarios):
 *   1.  /contact_enrich_text ZB23 html-with-email enriches registry
 *   2.  /contact_enrich_text extracts phone
 *   3.  /contact_enrich_text extracts wa.me as whatsapp
 *   4.  /contact_enrich_text extracts t.me as telegram
 *   5.  /contact_enrich_text extracts MAX signal
 *   6.  /contact_enrich_text extracts website form
 *   7.  /contact_channels ZB23 shows structured channels
 *   8.  /contact_best_channel ZB23 returns email when email exists
 *   9.  /contact_enrichment_status ZB23 shows last_enriched_at / counts
 *   10. bad format returns usage
 *   11. unknown lead without enrichment returns clear error
 *   12. non-enrichment command returns false
 *   13. no network (source scan + reply flags)
 *   14. no SMTP (source scan)
 *   15. no .env (source scan)
 *   16. no external send (replies go only to the stub, never to clients)
 *   17. manual_verified primary email NOT overwritten by weaker auto email
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
    handleLeadContactEnrichmentCommand,
} from '../telegram_gateway/lead_contact_enrichment_commands.mjs';

import {
    loadLeadContactRegistry,
    saveLeadContactRegistry,
    getLeadContactRegistryPaths,
} from '../telegram_gateway/lead_contact_registry.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..');

// Throwaway sandbox workspace (NOT the real 13_sales registry).
const SANDBOX = path.join(WORKSPACE_ROOT, 'tmp', 'lead_contact_enrichment_commands_c27c_test_workspace');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond) {
    if (cond) { passed++; console.log(`  ✅ ${name}`); }
    else { failed++; failures.push(name); console.log(`  ❌ ${name}`); }
}

// Reset the sandbox registry before each test for isolation.
function resetSandbox(initial) {
    const P = getLeadContactRegistryPaths(SANDBOX);
    fs.mkdirSync(P.root, { recursive: true });
    saveLeadContactRegistry(SANDBOX, initial && typeof initial === 'object' ? initial : {});
}

function readEntry(leadId) {
    const reg = loadLeadContactRegistry(SANDBOX);
    return reg[String(leadId).toUpperCase()] || null;
}

// Build a fresh test context. sendTelegram is a LOCAL stub that ONLY collects
// reply strings — it performs no network / no external send.
function makeContext() {
    const replies = [];
    const sentTo = [];
    const ctx = {
        workspace: SANDBOX,
        chatId: 'TEST_CHAT_OPAQUE',
        sendTelegram: async (chatId, message) => {
            sentTo.push(chatId);
            replies.push(String(message));
        },
        botLog: () => { /* no-op */ },
    };
    return { ctx, replies, sentTo };
}

console.log('\n=== C2.7c Standalone Lead Contact Enrichment Commands Tests ===\n');
console.log(`Sandbox: ${SANDBOX}\n`);

// 1. /contact_enrich_text ZB23 html-with-email enriches registry
await (async function t1() {
    console.log('Test 1: /contact_enrich_text ZB23 html-with-email enriches registry');
    resetSandbox({});
    const { ctx, replies } = makeContext();
    const handled = await handleLeadContactEnrichmentCommand(
        '/contact_enrich_text ZB23 <div>Почта: <a href="mailto:sales@example.ru">написать</a></div>', ctx);
    check('1.handled true', handled === true);
    const e = readEntry('ZB23');
    check('1.primary set', e && e.primary_email === 'sales@example.ru');
    check('1.emails[] contains', e && Array.isArray(e.emails) && e.emails.includes('sales@example.ru'));
    check('1.channels.email', e && e.channels.email.some(c => c.value === 'sales@example.ru'));
    check('1.reply mentions emails found', replies.some(r => /emails found: 1/.test(r)));
})();

// 2. /contact_enrich_text extracts phone
await (async function t2() {
    console.log('Test 2: /contact_enrich_text extracts phone');
    resetSandbox({});
    const { ctx, replies } = makeContext();
    await handleLeadContactEnrichmentCommand(
        '/contact_enrich_text ZB23 Звоните: +7 (495) 123-45-67', ctx);
    const e = readEntry('ZB23');
    check('2.phones[] contains', e && e.phones.includes('+74951234567'));
    check('2.channels.phone', e && e.channels.phone.some(c => c.value === '+74951234567'));
    check('2.reply phones found', replies.some(r => /phones found: 1/.test(r)));
})();

// 3. /contact_enrich_text extracts wa.me as whatsapp
await (async function t3() {
    console.log('Test 3: /contact_enrich_text extracts wa.me as whatsapp');
    resetSandbox({});
    const { ctx, replies } = makeContext();
    await handleLeadContactEnrichmentCommand(
        '/contact_enrich_text ZB23 Пишите: https://wa.me/79161234567', ctx);
    const e = readEntry('ZB23');
    check('3.whatsapp present', e && e.channels.whatsapp.length >= 1);
    check('3.whatsapp confirmed', e && e.channels.whatsapp.some(c => c.status === 'confirmed'));
    check('3.reply whatsapp found', replies.some(r => /whatsapp found: 1/.test(r)));
})();

// 4. /contact_enrich_text extracts t.me as telegram
await (async function t4() {
    console.log('Test 4: /contact_enrich_text extracts t.me as telegram');
    resetSandbox({});
    const { ctx, replies } = makeContext();
    await handleLeadContactEnrichmentCommand(
        '/contact_enrich_text ZB23 Канал: https://t.me/mychannel', ctx);
    const e = readEntry('ZB23');
    check('4.telegram present', e && e.channels.telegram.length >= 1);
    check('4.telegram confirmed', e && e.channels.telegram.some(c => c.status === 'confirmed'));
    check('4.reply telegram found', replies.some(r => /telegram found: 1/.test(r)));
})();

// 5. /contact_enrich_text extracts MAX signal
await (async function t5() {
    console.log('Test 5: /contact_enrich_text extracts MAX signal');
    resetSandbox({});
    const { ctx, replies } = makeContext();
    await handleLeadContactEnrichmentCommand(
        '/contact_enrich_text ZB23 Кнопка: Написать в MAX', ctx);
    const e = readEntry('ZB23');
    check('5.max present', e && e.channels.max.length >= 1);
    check('5.reply max found', replies.some(r => /max found: 1/.test(r)));
})();

// 6. /contact_enrich_text extracts website form
await (async function t6() {
    console.log('Test 6: /contact_enrich_text extracts website form');
    resetSandbox({});
    const { ctx, replies } = makeContext();
    await handleLeadContactEnrichmentCommand(
        '/contact_enrich_text ZB23 <form action="/send"><input/></form>', ctx);
    const e = readEntry('ZB23');
    check('6.website_form present', e && e.channels.website_form.length >= 1);
    check('6.reply website_form found', replies.some(r => /website_form found: 1/.test(r)));
})();

// 7. /contact_channels ZB23 shows structured channels
await (async function t7() {
    console.log('Test 7: /contact_channels ZB23 shows structured channels');
    resetSandbox({});
    const { ctx } = makeContext();
    await handleLeadContactEnrichmentCommand(
        '/contact_enrich_text ZB23 Почта info@firma.ru, тел +7 495 123 45 67', ctx);
    const { ctx: ctx2, replies } = makeContext();
    const handled = await handleLeadContactEnrichmentCommand('/contact_channels ZB23', ctx2);
    check('7.handled true', handled === true);
    const reply = replies.join('\n');
    check('7.shows header', /Contact channels: ZB23/.test(reply));
    check('7.shows email value', /email: .*info@firma\.ru/.test(reply));
    check('7.shows phone value', /phone: .*\+74951234567/.test(reply));
    check('7.shows best_contact_channel', /best_contact_channel:/.test(reply));
    check('7.shows last_enriched_at', /last_enriched_at:/.test(reply));
})();

// 8. /contact_best_channel ZB23 returns email when email exists
await (async function t8() {
    console.log('Test 8: /contact_best_channel ZB23 returns email when email exists');
    resetSandbox({});
    const { ctx } = makeContext();
    await handleLeadContactEnrichmentCommand(
        '/contact_enrich_text ZB23 Почта info@firma.ru, тел +7 495 123 45 67', ctx);
    const { ctx: ctx2, replies } = makeContext();
    const handled = await handleLeadContactEnrichmentCommand('/contact_best_channel ZB23', ctx2);
    check('8.handled true', handled === true);
    const reply = replies.join('\n');
    check('8.best channel type email', /best channel type: email/.test(reply));
    check('8.best value is the email', /best value: info@firma\.ru/.test(reply));
    const e = readEntry('ZB23');
    check('8.stored best is email', e && e.best_contact_channel.best_channel_type === 'email');
})();

// 9. /contact_enrichment_status ZB23 shows last_enriched_at / counts
await (async function t9() {
    console.log('Test 9: /contact_enrichment_status ZB23 shows last_enriched_at/counts');
    resetSandbox({});
    const { ctx } = makeContext();
    await handleLeadContactEnrichmentCommand(
        '/contact_enrich_text ZB23 Почта info@firma.ru тел +7 495 123 45 67', ctx);
    const { ctx: ctx2, replies } = makeContext();
    const handled = await handleLeadContactEnrichmentCommand('/contact_enrichment_status ZB23', ctx2);
    check('9.handled true', handled === true);
    const reply = replies.join('\n');
    check('9.enrichment data YES', /enrichment data: YES/.test(reply));
    check('9.shows last_enriched_at value', /last_enriched_at: 20\d\d-/.test(reply));
    check('9.shows counts header', /counts by channel:/.test(reply));
    check('9.shows email count', /email: 1/.test(reply));
    check('9.shows phone count', /phone: 1/.test(reply));
})();

// 10. bad format returns usage
await (async function t10() {
    console.log('Test 10: bad format returns usage');
    resetSandbox({});
    const { ctx, replies } = makeContext();
    // missing the <text_or_html> argument
    const handled = await handleLeadContactEnrichmentCommand('/contact_enrich_text ZB23', ctx);
    check('10.handled true', handled === true);
    check('10.usage shown', replies.some(r => /Usage: \/contact_enrich_text/.test(r)));
    const e = readEntry('ZB23');
    check('10.no record created', e === null);
})();

// 11. unknown lead without enrichment returns clear error
await (async function t11() {
    console.log('Test 11: unknown lead without enrichment returns clear error');
    resetSandbox({});
    const { ctx, replies } = makeContext();
    const handled = await handleLeadContactEnrichmentCommand('/contact_channels NOPE99', ctx);
    check('11.handled true', handled === true);
    check('11.clear error', replies.some(r => /No contact record for lead "NOPE99"/.test(r)));
    check('11.suggests enrich', replies.some(r => /\/contact_enrich_text NOPE99/.test(r)));
})();

// 12. non-enrichment command returns false
await (async function t12() {
    console.log('Test 12: non-enrichment command returns false');
    resetSandbox({});
    const { ctx, replies } = makeContext();
    const handled = await handleLeadContactEnrichmentCommand('/some_other_command ZB23', ctx);
    check('12.returns false', handled === false);
    check('12.no reply sent', replies.length === 0);
})();

// 13. no network (source scan + reply flags)
await (async function t13() {
    console.log('Test 13: no network');
    function codeOnly(file) {
        const src = fs.readFileSync(file, 'utf-8');
        return src.split('\n').filter(line => !/^\s*(\*|\/\/|\/\*)/.test(line)).join('\n');
    }
    const modSrc = codeOnly(path.join(WORKSPACE_ROOT, 'tools', 'telegram_gateway', 'lead_contact_enrichment_commands.mjs'));
    check('13.no fetch/http/axios', !/\bfetch\s*\(|require\(['"]https?['"]\)|from\s+['"]node:?https?['"]|axios|XMLHttpRequest|dns\.|http\.request/i.test(modSrc));
    // The enrich reply explicitly reports network_used: NO
    resetSandbox({});
    const { ctx, replies } = makeContext();
    await handleLeadContactEnrichmentCommand('/contact_enrich_text ZB23 info@firma.ru', ctx);
    check('13.reply network_used NO', replies.some(r => /network_used: NO/.test(r)));
})();

// 14. no SMTP (source scan)
await (async function t14() {
    console.log('Test 14: no SMTP');
    function codeOnly(file) {
        const src = fs.readFileSync(file, 'utf-8');
        return src.split('\n').filter(line => !/^\s*(\*|\/\/|\/\*)/.test(line)).join('\n');
    }
    const modSrc = codeOnly(path.join(WORKSPACE_ROOT, 'tools', 'telegram_gateway', 'lead_contact_enrichment_commands.mjs'));
    check('14.no smtp/nodemailer', !/nodemailer|createTransport\s*\(|net\.connect\s*\(|tls\.connect\s*\(|smtp/i.test(modSrc));
})();

// 15. no .env (source scan)
await (async function t15() {
    console.log('Test 15: no .env');
    function codeOnly(file) {
        const src = fs.readFileSync(file, 'utf-8');
        return src.split('\n').filter(line => !/^\s*(\*|\/\/|\/\*)/.test(line)).join('\n');
    }
    const modSrc = codeOnly(path.join(WORKSPACE_ROOT, 'tools', 'telegram_gateway', 'lead_contact_enrichment_commands.mjs'));
    check('15.no .env / process.env / dotenv', !/readFileSync\([^)]*\.env|process\.env|dotenv/i.test(modSrc));
})();

// 16. no external send (replies go only to the stub, never to clients)
await (async function t16() {
    console.log('Test 16: no external send');
    resetSandbox({});
    const { ctx, replies, sentTo } = makeContext();
    await handleLeadContactEnrichmentCommand('/contact_enrich_text ZB23 info@firma.ru', ctx);
    // Every reply went ONLY to the operator's opaque chat stub, never to a client.
    check('16.all replies to operator stub', sentTo.length >= 1 && sentTo.every(id => id === 'TEST_CHAT_OPAQUE'));
    check('16.reply external_send NO', replies.some(r => /external_send: NO/.test(r)));
})();

// 17. manual_verified primary email NOT overwritten by weaker auto email
await (async function t17() {
    console.log('Test 17: manual_verified primary email not overwritten by weaker auto email');
    resetSandbox({
        ZB23: {
            lead_id: 'ZB23',
            primary_email: 'verified@client.ru',
            emails: ['verified@client.ru'],
            phones: [],
            whatsapp: null,
            source: 'manual_verified',
            updated_at: '2026-05-31T00:00:00.000Z',
        },
    });
    const { ctx } = makeContext();
    await handleLeadContactEnrichmentCommand(
        '/contact_enrich_text ZB23 Другая почта auto@other.ru тоже есть', ctx);
    const e = readEntry('ZB23');
    check('17.primary preserved', e && e.primary_email === 'verified@client.ru');
    check('17.auto email added to emails[]', e && e.emails.includes('auto@other.ru'));
    check('17.source preserved', e && e.source === 'manual_verified');
})();

// ──────────────────────────────────────────────
console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
    console.log('Failures:', failures.join(', '));
    process.exit(1);
}
process.exit(0);
