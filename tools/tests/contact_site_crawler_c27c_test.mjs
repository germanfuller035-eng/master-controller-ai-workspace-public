/**
 * contact_site_crawler_c27c_test.mjs
 *
 * Verifies the C2.7c Bounded Same-Domain Contact Crawler
 * (tools/telegram_gateway/contact_site_crawler.mjs).
 *
 * PURE / OFFLINE. No network. No SMTP. No .env. No email sent. No git.
 * The crawler runs in offline mode against injected HTML fixtures only.
 *
 * Coverage:
 *   1.  homepage → contact page is discovered and crawled (frontier follows links)
 *   2.  email on the contact page is collected into contacts
 *   3.  evidence records the contact page URL + found types
 *   4.  best_contact_channel selects the email
 *   5.  same-domain only: external links are NOT crawled
 *   6.  maxPages budget is respected (crawl stays bounded)
 *   7.  contact-page links are prioritized over low-value links (scoreLink)
 *   8.  robots.txt Disallow blocks a path
 *   9.  invalid start url → BLOCKED, ok:false
 *   10. live mode without CONTACT_CRAWL_LIVE env → downgraded to offline (double gate)
 *   11. crawl_status COMPLETE when frontier drains, PARTIAL when page budget hit
 *   12. no network / no secrets / no send (source scan + safety flags)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
    crawlContactSite,
    createCrawlFetcher,
    scoreLink,
    extractLinks,
    sameDomain,
    normalizeUrl,
    parseRobots,
    isAllowedByRobots,
} from '../telegram_gateway/contact_site_crawler.mjs';

import {
    isPlaceholderEmail,
    emailDomain,
    emailMatchesDomain,
    extractEmails,
} from '../telegram_gateway/contact_channel_extractor.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passed = 0;
let failed = 0;
const failures = [];
function check(name, cond) {
    if (cond) { passed++; console.log(`  ✅ ${name}`); }
    else { failed++; failures.push(name); console.log(`  ❌ ${name}`); }
}

// Ensure live gate is OFF for the whole suite (offline determinism).
delete process.env.CONTACT_CRAWL_LIVE;

const HOME = 'https://acme.example/';
const CONTACTS = 'https://acme.example/kontakty';
const ABOUT = 'https://acme.example/o-kompanii';
const EXTERNAL = 'https://vk.com/acme';

const FIXTURES = {
    [HOME]: `<!doctype html><html><head><title>Acme</title></head><body>
        <nav>
          <a href="/kontakty">Контакты</a>
          <a href="/o-kompanii">О компании</a>
          <a href="/catalog">Каталог</a>
          <a href="https://vk.com/acme">Мы в VK</a>
        </nav>
        <p>Производство мебели в Москве.</p>
      </body></html>`,
    [CONTACTS]: `<!doctype html><html><head><title>Контакты — Acme</title></head><body>
        <h1>Контакты</h1>
        <p>Email: <a href="mailto:sales@acme.example">sales@acme.example</a></p>
        <p>Телефон: +7 (495) 123-45-67</p>
        <form action="/send" method="post"><input name="msg"></form>
      </body></html>`,
    [ABOUT]: `<!doctype html><html><head><title>О компании</title></head><body>
        <p>ООО «Акме», работаем с 2005 года.</p>
      </body></html>`,
};

console.log('\n=== C2.7c Bounded Same-Domain Contact Crawler Tests ===\n');
console.log('Test 1-4: homepage → contact page discovery + extraction');
const r1 = await crawlContactSite(HOME, { fixtures: FIXTURES, maxDepth: 2, maxPages: 5 });
check('1.crawled contact page', r1.pages_crawled.some((p) => p.url === CONTACTS));
check('1.crawled homepage first', r1.pages_crawled[0] && r1.pages_crawled[0].url === HOME);
check('2.email collected', r1.contacts.some((c) => c.type === 'email' && c.value === 'sales@acme.example'));
check('2.phone collected', r1.contacts.some((c) => c.type === 'phone' && c.value === '+74951234567'));
check('3.evidence has contact page', r1.evidence.some((e) => e.url === CONTACTS && e.found.includes('email')));
check('4.best channel is email', r1.best_contact_channel && r1.best_contact_channel.best_channel_type === 'email');
check('4.confidence > 0.8', r1.confidence > 0.8);
check('4.ok true', r1.ok === true);

console.log('Test 5: same-domain only — external VK link not crawled');
check('5.external not crawled', !r1.pages_crawled.some((p) => p.url === EXTERNAL));
check('5.sameDomain helper', sameDomain(HOME, CONTACTS) && !sameDomain(HOME, EXTERNAL));

console.log('Test 6: maxPages budget respected');
const r6 = await crawlContactSite(HOME, { fixtures: FIXTURES, maxDepth: 2, maxPages: 2 });
check('6.bounded to 2 pages', r6.pages_crawled.length <= 2);

console.log('Test 7: scoreLink prioritizes contact/about/requisites');
check('7.contacts > catalog', scoreLink('/kontakty', 'Контакты') > scoreLink('/catalog', 'Каталог'));
check('7.requisites high', scoreLink('/rekvizity', 'Реквизиты') >= 90);
check('7.catalog zero', scoreLink('/catalog', 'Каталог') === 0);

console.log('Test 8: robots.txt Disallow blocks a path');
const robots = parseRobots('User-agent: *\nDisallow: /kontakty\n');
check('8.parsed disallow', robots.disallow.includes('/kontakty'));
check('8.blocks contacts', !isAllowedByRobots(robots, '/kontakty'));
check('8.allows home', isAllowedByRobots(robots, '/'));
const r8 = await crawlContactSite(HOME, { fixtures: FIXTURES, robotsTxt: 'User-agent: *\nDisallow: /kontakty\n' });
check('8.contact page skipped under robots', !r8.pages_crawled.some((p) => p.url === CONTACTS));

console.log('Test 9: invalid start url → BLOCKED');
const r9 = await crawlContactSite('not a url', { fixtures: {} });
check('9.blocked', r9.crawl_status === 'BLOCKED');
check('9.ok false', r9.ok === false);

console.log('Test 10: live mode without env flag → offline (double gate)');
const f10 = createCrawlFetcher({ mode: 'live' });
check('10.downgraded to offline', f10.mode === 'offline');

console.log('Test 11: crawl_status COMPLETE vs PARTIAL');
check('11.complete drains frontier', r1.crawl_status === 'COMPLETE');
check('11.partial on budget', r6.crawl_status === 'PARTIAL');

console.log('Test 12: safety — no network, no send, source scan');
check('12.network_used false (offline)', r1.safety.network_used === false);
check('12.forms_submitted false', r1.safety.forms_submitted === false);
check('12.smtp false', r1.safety.smtp_used === false);
const src = fs.readFileSync(path.resolve(__dirname, '..', 'telegram_gateway', 'contact_site_crawler.mjs'), 'utf8');
check('12.no POST method literal in fetch', !/method:\s*['"]POST['"]/i.test(src));
check('12.no smtp/nodemailer import', !/nodemailer|createTransport|net\.connect|tls\.connect/i.test(src));
check('12.extractLinks pure (no fetch inside)', typeof extractLinks(FIXTURES[HOME], HOME)[0] === 'object');
check('12.normalizeUrl rejects non-http', normalizeUrl('ftp://x/y') === null);

console.log('Test 13: placeholder email filtering');
const PLACEHOLDER_HOME = 'https://demo.example/';
const FIXTURES_PLACEHOLDER = {
    [PLACEHOLDER_HOME]: `<!doctype html><html><body>
        <a href="/kontakty">Контакты</a>
        <p>Пример: ivan@domain.ru, example@example.com, user@example.com</p>
        <p>Реальный: <a href="mailto:info@demo.example">info@demo.example</a></p>
      </body></html>`,
    'https://demo.example/kontakty': `<!doctype html><html><body>
        <p>Шаблон: your@email.com, test@test.ru</p>
        <p>Почта: <a href="mailto:info@demo.example">info@demo.example</a></p>
      </body></html>`,
};
const r13 = await crawlContactSite(PLACEHOLDER_HOME, { fixtures: FIXTURES_PLACEHOLDER });
check('13.placeholder ivan@domain.ru dropped', !r13.contacts.some((c) => c.value === 'ivan@domain.ru'));
check('13.placeholder example@example.com dropped', !r13.contacts.some((c) => c.value === 'example@example.com'));
check('13.placeholder your@email.com dropped', !r13.contacts.some((c) => c.value === 'your@email.com'));
check('13.real email kept', r13.contacts.some((c) => c.value === 'info@demo.example'));
check('13.isPlaceholderEmail ivan@domain.ru', isPlaceholderEmail('ivan@domain.ru') === true);
check('13.isPlaceholderEmail user@example.com', isPlaceholderEmail('user@example.com') === true);
check('13.isPlaceholderEmail test@test.ru', isPlaceholderEmail('test@test.ru') === true);
check('13.real not placeholder', isPlaceholderEmail('sales@acme.example') === false);
check('13.extractEmails drops placeholder', !extractEmails('пишите ivan@domain.ru').some((e) => e.value === 'ivan@domain.ru'));

console.log('Test 14: same-domain verification boosts email confidence');
check('14.emailDomain', emailDomain('sales@acme.example') === 'acme.example');
check('14.matches site', emailMatchesDomain('sales@acme.example', 'https://acme.example/') === true);
check('14.subdomain matches', emailMatchesDomain('info@mail.acme.example', 'acme.example') === true);
check('14.foreign domain no match', emailMatchesDomain('sales@gmail.com', 'acme.example') === false);
const onDomainEmail = r1.contacts.find((c) => c.type === 'email' && c.value === 'sales@acme.example');
check('14.on-domain confidence boosted', onDomainEmail && onDomainEmail.confidence >= 0.95);

console.log('Test 15: rich email contact evidence model');
check('15.source_url', onDomainEmail && onDomainEmail.source_url === CONTACTS);
check('15.source_page_title', onDomainEmail && typeof onDomainEmail.source_page_title === 'string' && onDomainEmail.source_page_title.length > 0);
check('15.official_domain', onDomainEmail && onDomainEmail.official_domain === 'acme.example');
check('15.same_domain true', onDomainEmail && onDomainEmail.same_domain === true);
check('15.evidence_type OFFICIAL_PAGE', onDomainEmail && onDomainEmail.evidence_type === 'OFFICIAL_PAGE');
check('15.content_hash present', onDomainEmail && typeof onDomainEmail.content_hash === 'string' && onDomainEmail.content_hash.length === 16);
check('15.extractor_version', onDomainEmail && onDomainEmail.extractor_version === 'contact_site_crawler_v1');
check('15.discovered_at ISO', onDomainEmail && /^\d{4}-\d{2}-\d{2}T/.test(onDomainEmail.discovered_at || ''));

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failed > 0) { console.log('FAILURES:', failures.join(', ')); process.exit(1); }
process.exit(0);
