/**
 * contact_channel_extractor_c27a_test.mjs
 *
 * APPROVAL: APPROVE_AUTOMATIC_CONTACT_CHANNEL_EXTRACTOR_C27A_STANDALONE_2026-05-31
 *
 * Verifies the C2.7a Automatic Contact Channel Extractor module
 * (tools/telegram_gateway/contact_channel_extractor.mjs).
 *
 * PURE / OFFLINE. No SMTP. No .env. No email sent. No bot restart. No git.
 * No network. The module is a string-in / structured-data-out analyzer only.
 *
 * Coverage (18 checks):
 *   1.  email from mailto: extracted
 *   2.  email from plain text extracted
 *   3.  +7 phone normalized
 *   4.  8... phone normalized to +7...
 *   5.  wa.me link → whatsapp confirmed
 *   6.  api.whatsapp.com → whatsapp confirmed
 *   7.  phone-only does NOT become whatsapp confirmed
 *   8.  t.me link → telegram confirmed
 *   9.  @username without Telegram context NOT caught as telegram
 *   10. Telegram + @username → telegram confirmed
 *   11. MAX explicit text/button → max possible/confirmed
 *   12. phone-only does NOT become MAX
 *   13. <form> tag → website_form
 *   14. "оставить заявку" → website_form
 *   15. best channel selects email before phone
 *   16. best channel selects confirmed messenger before website_form
 *   17. duplicate contacts deduped
 *   18. no secrets / no .env / no SMTP / no network (source scan)
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
    extractContactChannels,
    extractEmails,
    extractPhones,
    extractWhatsAppChannels,
    extractTelegramChannels,
    extractMaxChannels,
    extractWebsiteForms,
    classifyBestContactChannel,
    normalizeExtractedChannels,
    normalizeRussianPhone,
    CHANNEL_TYPES,
    CHANNEL_STATUS,
} from '../telegram_gateway/contact_channel_extractor.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const WORKSPACE  = path.resolve(__dirname, '..', '..');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond) {
    if (cond) { passed++; console.log(`  ✅ ${name}`); }
    else { failed++; failures.push(name); console.log(`  ❌ ${name}`); }
}

console.log('\n=== C2.7a Automatic Contact Channel Extractor Tests ===\n');

// 1. email from mailto:
(function t1() {
    console.log('Test 1: email from mailto: extracted');
    // NOTE: must use a real-looking domain — example.* is now filtered as placeholder.
    const r = extractEmails('Свяжитесь: <a href="mailto:sales@firma.ru">написать</a>');
    check('1.found email', r.some(e => e.value === 'sales@firma.ru'));
    check('1.type email', r[0] && r[0].type === CHANNEL_TYPES.EMAIL);
    check('1.status public_found', r[0] && r[0].status === CHANNEL_STATUS.PUBLIC_FOUND);
})();

// 2. email from plain text
(function t2() {
    console.log('Test 2: email from plain text extracted');
    const r = extractEmails('Пишите на info@firma.ru в любое время.');
    check('2.found email', r.some(e => e.value === 'info@firma.ru'));
})();

// 3. +7 phone normalized
(function t3() {
    console.log('Test 3: +7 phone normalized');
    const r = extractPhones('Звоните +7 (495) 123-45-67 ежедневно');
    check('3.found phone', r.length >= 1);
    check('3.normalized +7', r[0] && r[0].value === '+74951234567');
    check('3.direct normalize', normalizeRussianPhone('+7 (495) 123-45-67') === '+74951234567');
})();

// 4. 8... phone normalized to +7...
(function t4() {
    console.log('Test 4: 8... phone normalized to +7...');
    const r = extractPhones('Телефон 8 800 555 35 35');
    check('4.found phone', r.length >= 1);
    check('4.normalized to +7', r[0] && r[0].value === '+78005553535');
    check('4.direct normalize 8->7', normalizeRussianPhone('8 800 555 35 35') === '+78005553535');
})();

// 5. wa.me link → whatsapp confirmed
(function t5() {
    console.log('Test 5: wa.me link → whatsapp confirmed');
    const r = extractWhatsAppChannels('Напишите нам: https://wa.me/79161234567');
    check('5.found whatsapp', r.length >= 1);
    check('5.confirmed', r[0] && r[0].status === CHANNEL_STATUS.CONFIRMED);
})();

// 6. api.whatsapp.com → whatsapp confirmed
(function t6() {
    console.log('Test 6: api.whatsapp.com → whatsapp confirmed');
    const r = extractWhatsAppChannels('Кнопка: https://api.whatsapp.com/send?phone=79161234567');
    check('6.found whatsapp', r.length >= 1);
    check('6.confirmed', r[0] && r[0].status === CHANNEL_STATUS.CONFIRMED);
})();

// 7. phone-only does NOT become whatsapp confirmed
(function t7() {
    console.log('Test 7: phone-only does NOT become whatsapp confirmed');
    const r = extractWhatsAppChannels('Контакт: +7 916 123 45 67');
    const confirmed = r.filter(c => c.status === CHANNEL_STATUS.CONFIRMED);
    check('7.no confirmed whatsapp', confirmed.length === 0);
})();

// 8. t.me link → telegram confirmed
(function t8() {
    console.log('Test 8: t.me link → telegram confirmed');
    const r = extractTelegramChannels('Наш канал: https://t.me/mychannel');
    check('8.found telegram', r.length >= 1);
    check('8.confirmed', r[0] && r[0].status === CHANNEL_STATUS.CONFIRMED);
})();

// 9. @username without Telegram context NOT caught as telegram
(function t9() {
    console.log('Test 9: @username without Telegram context NOT caught');
    const r = extractTelegramChannels('Почта user@domain.ru и аккаунт @somehandle тут.');
    // @somehandle has no Telegram context word → must not be captured.
    const handles = r.filter(c => c.value === '@somehandle');
    check('9.no bare handle as telegram', handles.length === 0);
    // also email's @ must not be caught
    const emailAt = r.filter(c => /domain/.test(c.value));
    check('9.no email-@ as telegram', emailAt.length === 0);
})();

// 10. Telegram + @username → telegram confirmed
(function t10() {
    console.log('Test 10: Telegram + @username → telegram confirmed');
    const r = extractTelegramChannels('Пишите в Telegram: @manager_help');
    check('10.found handle', r.some(c => c.value === '@manager_help'));
    check('10.confirmed', r.some(c => c.value === '@manager_help' && c.status === CHANNEL_STATUS.CONFIRMED));
})();

// 11. MAX explicit text/button → max possible/confirmed
(function t11() {
    console.log('Test 11: MAX explicit text/button → max possible/confirmed');
    const rBtn = extractMaxChannels('Кнопка: Написать в MAX');
    check('11.button confirmed', rBtn.some(c => c.status === CHANNEL_STATUS.CONFIRMED));
    const rWord = extractMaxChannels('Мы есть в MAX — заходите.');
    check('11.word possible-or-confirmed', rWord.some(c =>
        c.status === CHANNEL_STATUS.POSSIBLE || c.status === CHANNEL_STATUS.CONFIRMED));
})();

// 12. phone-only does NOT become MAX
(function t12() {
    console.log('Test 12: phone-only does NOT become MAX');
    const r = extractMaxChannels('Звоните: +7 916 123 45 67');
    check('12.no max from bare phone', r.length === 0);
})();

// 13. <form> tag → website_form
(function t13() {
    console.log('Test 13: <form> tag → website_form');
    const r = extractWebsiteForms('<div><form action="/send"><input/></form></div>');
    check('13.found form', r.length >= 1);
    check('13.type website_form', r[0] && r[0].type === CHANNEL_TYPES.WEBSITE_FORM);
    check('13.value form_detected', r[0] && r[0].value === 'form_detected');
})();

// 14. "оставить заявку" → website_form
(function t14() {
    console.log('Test 14: "оставить заявку" → website_form');
    const r = extractWebsiteForms('Вы можете оставить заявку на сайте.');
    check('14.found form', r.length >= 1);
    check('14.type website_form', r[0] && r[0].type === CHANNEL_TYPES.WEBSITE_FORM);
})();

// 15. best channel selects email before phone
(function t15() {
    console.log('Test 15: best channel selects email before phone');
    const out = extractContactChannels('Почта info@firma.ru, тел +7 495 123 45 67');
    check('15.best is email', out.best.best_channel_type === CHANNEL_TYPES.EMAIL);
    check('15.best value email', out.best.best_value === 'info@firma.ru');
})();

// 16. best channel selects confirmed messenger before website_form
(function t16() {
    console.log('Test 16: best selects confirmed messenger before website_form');
    const out = extractContactChannels('Свяжитесь: https://wa.me/79161234567 или оставить заявку');
    check('16.best is whatsapp', out.best.best_channel_type === CHANNEL_TYPES.WHATSAPP);
    // confirm form was also detected but not chosen
    check('16.form present', out.channels.some(c => c.type === CHANNEL_TYPES.WEBSITE_FORM));
})();

// 17. duplicate contacts deduped
(function t17() {
    console.log('Test 17: duplicate contacts deduped');
    const out = extractContactChannels('info@firma.ru info@firma.ru INFO@firma.ru +7 495 123 45 67 8 495 123 45 67');
    const emails = out.channels.filter(c => c.type === CHANNEL_TYPES.EMAIL);
    check('17.email deduped to 1', emails.length === 1);
    const phones = out.channels.filter(c => c.type === CHANNEL_TYPES.PHONE);
    check('17.phone deduped to 1', phones.length === 1);
    // normalizeExtractedChannels direct
    const dn = normalizeExtractedChannels([
        { type: 'email', value: 'a@b.ru', status: 'public_found', confidence: 0.9 },
        { type: 'email', value: 'A@b.ru', status: 'public_found', confidence: 0.9 },
    ]);
    check('17.normalize dedupes', dn.length === 1);
})();

// 18. no secrets / no .env / no SMTP / no network (source scan + runtime safety)
(function t18() {
    console.log('Test 18: no .env / no SMTP / no network');
    function codeOnly(file) {
        const src = fs.readFileSync(file, 'utf-8');
        return src
            .split('\n')
            .filter(line => !/^\s*(\*|\/\/|\/\*)/.test(line))
            .join('\n');
    }
    const modSrc = codeOnly(path.join(WORKSPACE, 'tools', 'telegram_gateway', 'contact_channel_extractor.mjs'));

    check('18.no .env read', !/readFileSync\([^)]*\.env|process\.env|dotenv/i.test(modSrc));
    check('18.no smtp', !/nodemailer|createTransport\s*\(|net\.connect\s*\(|tls\.connect\s*\(/i.test(modSrc));
    check('18.no network', !/\bfetch\s*\(|require\(['"]https?['"]\)|from\s+['"]node:?https?['"]|axios|XMLHttpRequest|dns\.|http\.request/i.test(modSrc));
    check('18.no fs writes', !/writeFileSync|createWriteStream|appendFileSync/i.test(modSrc));

    // runtime safety flags
    const out = extractContactChannels('info@firma.ru');
    check('18.safety network_used false', out.safety.network_used === false);
    check('18.safety smtp_used false', out.safety.smtp_used === false);
    check('18.safety env_read false', out.safety.env_read === false);
    check('18.safety external_send false', out.safety.external_send === false);
})();

// ──────────────────────────────────────────────
console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
    console.log('Failures:', failures.join(', '));
    process.exit(1);
}
process.exit(0);
