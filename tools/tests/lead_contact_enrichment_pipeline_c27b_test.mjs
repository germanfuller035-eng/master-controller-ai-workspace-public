/**
 * lead_contact_enrichment_pipeline_c27b_test.mjs
 *
 * APPROVAL: APPROVE_CONTACT_CHANNEL_REGISTRY_ENRICHMENT_C27B_2026-05-31
 *
 * Verifies the C2.7b Offline Lead Contact Enrichment Pipeline
 * (tools/telegram_gateway/lead_contact_enrichment_pipeline.mjs).
 *
 * OFFLINE / SANDBOXED. No SMTP. No .env. No email sent. No bot restart. No git.
 * No network. Writes ONLY into a throwaway sandbox workspace registry file.
 *
 * Sandbox:
 *   tmp/lead_contact_enrichment_pipeline_c27b_test_workspace/
 *
 * Coverage (15 scenarios):
 *   1.  HTML with email → primary_email + emails[] + channels.email
 *   2.  HTML with phone → phones[] + channels.phone
 *   3.  wa.me link → channels.whatsapp confirmed
 *   4.  phone-only does NOT become confirmed WhatsApp
 *   5.  t.me link → channels.telegram confirmed
 *   6.  Telegram + @username → channels.telegram confirmed
 *   7.  @username without context NOT Telegram
 *   8.  MAX explicit text → channels.max
 *   9.  form tag / "оставить заявку" → channels.website_form
 *   10. best_contact_channel selects email before phone
 *   11. manual_verified primary_email NOT overwritten by auto email
 *   12. duplicate enrichment does NOT duplicate contacts/channels
 *   13. invalid email does NOT enter registry
 *   14. no network / no SMTP / no .env (source scan + runtime flags)
 *   15. existing C2.6 command-compatible fields preserved
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
    enrichLeadContactsFromText,
    mergeExtractedChannelsIntoRegistry,
    getLeadContactEnrichmentPaths,
    buildContactEnrichmentSummary,
} from '../telegram_gateway/lead_contact_enrichment_pipeline.mjs';

import {
    loadLeadContactRegistry,
    saveLeadContactRegistry,
} from '../telegram_gateway/lead_contact_registry.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..');

// Throwaway sandbox workspace.
const SANDBOX = path.join(WORKSPACE_ROOT, 'tmp', 'lead_contact_enrichment_pipeline_c27b_test_workspace');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond) {
    if (cond) { passed++; console.log(`  ✅ ${name}`); }
    else { failed++; failures.push(name); console.log(`  ❌ ${name}`); }
}

// Reset the sandbox registry before each test for isolation.
function resetSandbox(initial) {
    const P = getLeadContactEnrichmentPaths(SANDBOX);
    fs.mkdirSync(P.root, { recursive: true });
    saveLeadContactRegistry(SANDBOX, initial && typeof initial === 'object' ? initial : {});
}

function readEntry(leadId) {
    const reg = loadLeadContactRegistry(SANDBOX);
    return reg[String(leadId).toUpperCase()] || null;
}

console.log('\n=== C2.7b Offline Lead Contact Enrichment Pipeline Tests ===\n');
console.log(`Sandbox: ${SANDBOX}\n`);

// 1. HTML with email → primary_email + emails[] + channels.email
(function t1() {
    console.log('Test 1: HTML email → primary_email + emails[] + channels.email');
    resetSandbox({});
    const html = '<div>Почта: <a href="mailto:sales@firma.ru">написать</a></div>';
    const r = enrichLeadContactsFromText(SANDBOX, 'L1', html);
    check('1.ok', r.ok === true);
    const e = readEntry('L1');
    check('1.primary set', e && e.primary_email === 'sales@firma.ru');
    check('1.emails[] contains', e && e.emails.includes('sales@firma.ru'));
    check('1.channels.email', e && e.channels.email.some(c => c.value === 'sales@firma.ru'));
})();

// 2. HTML with phone → phones[] + channels.phone
(function t2() {
    console.log('Test 2: HTML phone → phones[] + channels.phone');
    resetSandbox({});
    const html = '<p>Звоните: +7 (495) 123-45-67</p>';
    enrichLeadContactsFromText(SANDBOX, 'L2', html);
    const e = readEntry('L2');
    check('2.phones[] contains', e && e.phones.includes('+74951234567'));
    check('2.channels.phone', e && e.channels.phone.some(c => c.value === '+74951234567'));
})();

// 3. wa.me link → channels.whatsapp confirmed
(function t3() {
    console.log('Test 3: wa.me → channels.whatsapp confirmed');
    resetSandbox({});
    enrichLeadContactsFromText(SANDBOX, 'L3', 'Пишите: https://wa.me/79161234567');
    const e = readEntry('L3');
    check('3.whatsapp present', e && e.channels.whatsapp.length >= 1);
    check('3.whatsapp confirmed', e && e.channels.whatsapp.some(c => c.status === 'confirmed'));
})();

// 4. phone-only does NOT become confirmed WhatsApp
(function t4() {
    console.log('Test 4: phone-only NOT confirmed WhatsApp');
    resetSandbox({});
    enrichLeadContactsFromText(SANDBOX, 'L4', 'Контакт: +7 916 123 45 67');
    const e = readEntry('L4');
    check('4.no confirmed whatsapp', e && e.channels.whatsapp.length === 0);
    check('4.phone still recorded', e && e.phones.includes('+79161234567'));
})();

// 5. t.me link → channels.telegram confirmed
(function t5() {
    console.log('Test 5: t.me → channels.telegram confirmed');
    resetSandbox({});
    enrichLeadContactsFromText(SANDBOX, 'L5', 'Канал: https://t.me/mychannel');
    const e = readEntry('L5');
    check('5.telegram present', e && e.channels.telegram.length >= 1);
    check('5.telegram confirmed', e && e.channels.telegram.some(c => c.status === 'confirmed'));
})();

// 6. Telegram + @username → channels.telegram confirmed
(function t6() {
    console.log('Test 6: Telegram + @username → channels.telegram confirmed');
    resetSandbox({});
    enrichLeadContactsFromText(SANDBOX, 'L6', 'Пишите в Telegram: @manager_help');
    const e = readEntry('L6');
    check('6.handle confirmed', e && e.channels.telegram.some(c => c.value === '@manager_help' && c.status === 'confirmed'));
})();

// 7. @username without context NOT Telegram
(function t7() {
    console.log('Test 7: @username without context NOT Telegram');
    resetSandbox({});
    enrichLeadContactsFromText(SANDBOX, 'L7', 'Аккаунт @somehandle где-то тут.');
    const e = readEntry('L7');
    check('7.no telegram', e && e.channels.telegram.length === 0);
})();

// 8. MAX explicit text → channels.max
(function t8() {
    console.log('Test 8: MAX explicit → channels.max');
    resetSandbox({});
    enrichLeadContactsFromText(SANDBOX, 'L8', 'Кнопка: Написать в MAX');
    const e = readEntry('L8');
    check('8.max present', e && e.channels.max.length >= 1);
})();

// 9. form tag / "оставить заявку" → channels.website_form
(function t9() {
    console.log('Test 9: form/"оставить заявку" → channels.website_form');
    resetSandbox({});
    enrichLeadContactsFromText(SANDBOX, 'L9A', '<form action="/send"><input/></form>');
    const a = readEntry('L9A');
    check('9.form tag detected', a && a.channels.website_form.length >= 1);
    resetSandbox({});
    enrichLeadContactsFromText(SANDBOX, 'L9B', 'Можно оставить заявку на сайте.');
    const b = readEntry('L9B');
    check('9.phrase detected', b && b.channels.website_form.length >= 1);
})();

// 10. best_contact_channel selects email before phone
(function t10() {
    console.log('Test 10: best_contact_channel email before phone');
    resetSandbox({});
    const r = enrichLeadContactsFromText(SANDBOX, 'L10', 'Почта info@firma.ru, тел +7 495 123 45 67');
    check('10.best email', r.best && r.best.best_channel_type === 'email');
    const e = readEntry('L10');
    check('10.stored best email', e && e.best_contact_channel.best_channel_type === 'email');
})();

// 11. manual_verified primary_email NOT overwritten by auto email
(function t11() {
    console.log('Test 11: manual_verified primary_email not overwritten');
    resetSandbox({
        L11: {
            lead_id: 'L11',
            primary_email: 'verified@client.ru',
            emails: ['verified@client.ru'],
            phones: [],
            whatsapp: null,
            source: 'manual_verified',
            updated_at: '2026-05-31T00:00:00.000Z',
        },
    });
    enrichLeadContactsFromText(SANDBOX, 'L11', 'Другая почта auto@other.ru тоже есть');
    const e = readEntry('L11');
    check('11.primary preserved', e && e.primary_email === 'verified@client.ru');
    check('11.auto email added to emails[]', e && e.emails.includes('auto@other.ru'));
    check('11.source preserved', e && e.source === 'manual_verified');
})();

// 12. duplicate enrichment does NOT duplicate contacts/channels
(function t12() {
    console.log('Test 12: duplicate enrichment no duplicates');
    resetSandbox({});
    const text = 'Почта info@firma.ru тел +7 495 123 45 67 https://wa.me/79161234567';
    enrichLeadContactsFromText(SANDBOX, 'L12', text);
    enrichLeadContactsFromText(SANDBOX, 'L12', text);
    const e = readEntry('L12');
    check('12.emails not dup', e && e.emails.filter(x => x === 'info@firma.ru').length === 1);
    check('12.channels.email not dup', e && e.channels.email.filter(c => c.value === 'info@firma.ru').length === 1);
    check('12.phones not dup', e && e.phones.filter(x => x === '+74951234567').length === 1);
    check('12.whatsapp not dup', e && e.channels.whatsapp.length === 1);
})();

// 13. invalid email does NOT enter registry
(function t13() {
    console.log('Test 13: invalid email not in registry');
    resetSandbox({});
    // Directly feed a malformed email channel into the merge function.
    const r = mergeExtractedChannelsIntoRegistry(SANDBOX, 'L13', [
        { type: 'email', value: 'not-an-email', status: 'public_found', source: 'text', confidence: 0.9 },
        { type: 'email', value: 'good@firma.ru', status: 'public_found', source: 'text', confidence: 0.9 },
    ]);
    check('13.ok', r.ok === true);
    const e = readEntry('L13');
    check('13.invalid not in emails', e && !e.emails.includes('not-an-email'));
    check('13.invalid not in channels', e && !e.channels.email.some(c => c.value === 'not-an-email'));
    check('13.valid present', e && e.emails.includes('good@firma.ru'));
    check('13.invalid counted', r.added && r.added.invalid_emails >= 1);
})();

// 14. no network / no SMTP / no .env (source scan + runtime flags)
(function t14() {
    console.log('Test 14: no .env / no SMTP / no network');
    function codeOnly(file) {
        const src = fs.readFileSync(file, 'utf-8');
        return src.split('\n').filter(line => !/^\s*(\*|\/\/|\/\*)/.test(line)).join('\n');
    }
    const modSrc = codeOnly(path.join(WORKSPACE_ROOT, 'tools', 'telegram_gateway', 'lead_contact_enrichment_pipeline.mjs'));
    check('14.no .env read', !/readFileSync\([^)]*\.env|process\.env|dotenv/i.test(modSrc));
    check('14.no smtp', !/nodemailer|createTransport\s*\(|net\.connect\s*\(|tls\.connect\s*\(/i.test(modSrc));
    check('14.no network', !/\bfetch\s*\(|require\(['"]https?['"]\)|from\s+['"]node:?https?['"]|axios|XMLHttpRequest|dns\.|http\.request/i.test(modSrc));

    resetSandbox({});
    const r = enrichLeadContactsFromText(SANDBOX, 'L14', 'info@firma.ru');
    check('14.network_used false', r.safety.network_used === false);
    check('14.smtp_used false', r.safety.smtp_used === false);
    check('14.env_read false', r.safety.env_read === false);
    check('14.external_send false', r.safety.external_send === false);
    check('14.auto_send false', r.safety.auto_send === false);
})();

// 15. existing C2.6 command-compatible fields preserved
(function t15() {
    console.log('Test 15: C2.6 command-compatible fields preserved');
    resetSandbox({
        L15: {
            lead_id: 'L15',
            primary_email: 'kept@client.ru',
            emails: ['kept@client.ru'],
            phones: ['+74950000000'],
            whatsapp: 'hold',
            source: 'contact_command',
            note: 'Known working contact email from prior outreach',
            updated_at: '2026-05-31T00:00:00.000Z',
        },
    });
    const r = enrichLeadContactsFromText(SANDBOX, 'L15', 'Доп. тел +7 495 123 45 67');
    const e = readEntry('L15');
    check('15.primary string', e && typeof e.primary_email === 'string' && e.primary_email === 'kept@client.ru');
    check('15.emails array of strings', e && Array.isArray(e.emails) && e.emails.every(x => typeof x === 'string'));
    check('15.phones array of strings', e && Array.isArray(e.phones) && e.phones.every(x => typeof x === 'string'));
    check('15.old phone preserved', e && e.phones.includes('+74950000000'));
    check('15.new phone added', e && e.phones.includes('+74951234567'));
    check('15.whatsapp compat preserved', e && e.whatsapp === 'hold');
    check('15.note preserved', e && e.note === 'Known working contact email from prior outreach');
    // Summary helper does not leak secrets and reports public counts only.
    const summary = buildContactEnrichmentSummary(r);
    check('15.summary ok', summary.ok === true && summary.lead_id === 'L15');
})();

// ──────────────────────────────────────────────
console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
    console.log('Failures:', failures.join(', '));
    process.exit(1);
}
process.exit(0);
