/**
 * lead_dedupe_engine_d1_preflight_a_test.mjs
 *
 * APPROVAL: APPROVE_DAILY_LEAD_FACTORY_D1_PREFLIGHT_A_LEAD_DEDUPE_ENGINE_2026-05-31
 *
 * Verifies the standalone Lead Dedupe Engine
 * (tools/telegram_gateway/lead_dedupe_engine.mjs).
 *
 * PURE IN-MEMORY. No network. No SMTP. No .env. No send. No bot. No git.
 *
 * Coverage (17 checks):
 *   1.  normalizeLeadId "zb23" → "ZB23"
 *   2.  normalizeLeadId rejects unsafe characters
 *   3.  normalizeDomain https://www.zb23.ru/page?x=1 → zb23.ru
 *   4.  normalizeName collapses whitespace + lowercases
 *   5.  duplicate by lead_id
 *   6.  duplicate by domain
 *   7.  duplicate by name + region
 *   8.  no duplicate when name same but region differs
 *   9.  merge preserves existing created_at
 *   10. merge fills empty old field with new value
 *   11. merge does not overwrite non-empty old field with empty
 *   12. dedupe 100 candidate rows → 0 duplicate output by lead_id/domain/name+region
 *   13. summary contains imported/added/merged/duplicate counts
 *   14. no network (source scan)
 *   15. no SMTP (source scan)
 *   16. no .env (source scan)
 *   17. no external send patterns (source scan)
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
    normalizeLeadId,
    normalizeDomain,
    normalizeName,
    normalizeRegion,
    buildLeadDedupeKeys,
    findDuplicateLead,
    mergeLeadRecords,
    dedupeLeadRecords,
    buildDedupeSummary,
} from '../telegram_gateway/lead_dedupe_engine.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const WORKSPACE  = path.resolve(__dirname, '..', '..');
const ENGINE_FILE = path.join(WORKSPACE, 'tools', 'telegram_gateway', 'lead_dedupe_engine.mjs');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond) {
    if (cond) { passed++; console.log(`  ✅ ${name}`); }
    else { failed++; failures.push(name); console.log(`  ❌ ${name}`); }
}

const NOW = '2026-05-31T12:00:00.000Z';

console.log('\n=== D1 Preflight A — Lead Dedupe Engine Tests ===\n');

// 1. normalizeLeadId "zb23" → "ZB23"
(function t1() {
    console.log('Test 1: normalizeLeadId uppercases');
    check('1."zb23" → "ZB23"', normalizeLeadId('zb23') === 'ZB23');
    check('1.trims spaces', normalizeLeadId('  zb23  ') === 'ZB23');
    check('1.keeps _ and -', normalizeLeadId('lead_01-a') === 'LEAD_01-A');
})();

// 2. normalizeLeadId rejects unsafe characters
(function t2() {
    console.log('Test 2: normalizeLeadId rejects unsafe characters');
    check('2.space inside rejected', normalizeLeadId('zb 23') === '');
    check('2.slash rejected', normalizeLeadId('zb/23') === '');
    check('2.cyrillic rejected', normalizeLeadId('зб23') === '');
    check('2.empty rejected', normalizeLeadId('') === '');
    check('2.null rejected', normalizeLeadId(null) === '');
})();

// 3. normalizeDomain https://www.zb23.ru/page?x=1 → zb23.ru
(function t3() {
    console.log('Test 3: normalizeDomain strips protocol/www/path/query');
    check('3.full url → zb23.ru', normalizeDomain('https://www.zb23.ru/page?x=1') === 'zb23.ru');
    check('3.http www', normalizeDomain('http://www.example.com/') === 'example.com');
    check('3.hash stripped', normalizeDomain('https://Example.COM/#section') === 'example.com');
    check('3.port stripped', normalizeDomain('http://example.com:8080/x') === 'example.com');
    check('3.bare domain', normalizeDomain('zb23.ru') === 'zb23.ru');
    check('3.no-dot rejected', normalizeDomain('localhost') === '');
})();

// 4. normalizeName collapses whitespace + lowercases
(function t4() {
    console.log('Test 4: normalizeName collapses whitespace + lowercases');
    check('4.collapse + lower', normalizeName('  ЗБИ   23  ') === 'зби 23');
    check('4.legal form soft strip', normalizeName('ООО ЗБИ 23') === 'зби 23');
    check('4.quotes stripped', normalizeName('ООО "ЗБИ 23"') === 'зби 23');
    check('4.ip soft strip', normalizeName('ИП Иванов') === 'иванов');
})();

// 5. duplicate by lead_id
(function t5() {
    console.log('Test 5: duplicate by lead_id');
    const existing = [{ lead_id: 'ZB23', name: 'ЗБИ 23', website: 'https://zb23.ru', region: 'Краснодарский край' }];
    const candidate = { lead_id: 'zb23', name: 'Совсем другое', website: 'https://other.ru', region: 'Москва' };
    const dup = findDuplicateLead(existing, candidate);
    check('5.found', dup.found === true);
    check('5.reason lead_id', dup.reason === 'lead_id');
    check('5.index 0', dup.index === 0);
})();

// 6. duplicate by domain
(function t6() {
    console.log('Test 6: duplicate by domain');
    const existing = [{ lead_id: 'A1', name: 'Some Co', website: 'https://zb23.ru', region: 'Москва' }];
    const candidate = { lead_id: 'B2', name: 'Other Co', website: 'http://www.zb23.ru/contacts', region: 'Сочи' };
    const dup = findDuplicateLead(existing, candidate);
    check('6.found', dup.found === true);
    check('6.reason domain', dup.reason === 'domain');
})();

// 7. duplicate by name + region
(function t7() {
    console.log('Test 7: duplicate by name + region');
    const existing = [{ lead_id: 'A1', name: 'ООО ЗБИ 23', website: '', region: 'Краснодарский край' }];
    const candidate = { lead_id: 'B2', name: 'ЗБИ 23', website: '', region: 'краснодарский  край' };
    const dup = findDuplicateLead(existing, candidate);
    check('7.found', dup.found === true);
    check('7.reason name+region', dup.reason === 'name+region');
})();

// 8. no duplicate when name same but region differs
(function t8() {
    console.log('Test 8: no duplicate when name same but region differs');
    const existing = [{ lead_id: 'A1', name: 'ЗБИ 23', website: '', region: 'Краснодарский край' }];
    const candidate = { lead_id: 'B2', name: 'ЗБИ 23', website: '', region: 'Московская область' };
    const dup = findDuplicateLead(existing, candidate);
    check('8.not found', dup.found === false);
})();

// 9. merge preserves existing created_at
(function t9() {
    console.log('Test 9: merge preserves existing created_at');
    const existing = { lead_id: 'ZB23', name: 'ЗБИ 23', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' };
    const candidate = { lead_id: 'ZB23', name: 'ЗБИ 23', created_at: '2026-05-31T00:00:00.000Z' };
    const merged = mergeLeadRecords(existing, candidate, { now: NOW });
    check('9.created_at preserved', merged.created_at === '2026-01-01T00:00:00.000Z');
    check('9.updated_at refreshed', merged.updated_at === NOW);
})();

// 10. merge fills empty old field with new value
(function t10() {
    console.log('Test 10: merge fills empty old field with new value');
    const existing = { lead_id: 'ZB23', name: 'ЗБИ 23', website: '', segment: null };
    const candidate = { lead_id: 'ZB23', website: 'https://zb23.ru', segment: 'ЖБИ' };
    const merged = mergeLeadRecords(existing, candidate, { now: NOW });
    check('10.website filled', merged.website === 'https://zb23.ru');
    check('10.segment filled', merged.segment === 'ЖБИ');
})();

// 11. merge does not overwrite non-empty old field with empty
(function t11() {
    console.log('Test 11: merge does not overwrite non-empty old field with empty');
    const existing = { lead_id: 'ZB23', name: 'ЗБИ 23', website: 'https://zb23.ru', status: 'qualified', score: 87, contacts: { email: 'a@zb23.ru' } };
    const candidate = { lead_id: 'ZB23', name: '', website: '', status: '', score: null, contacts: {} };
    const merged = mergeLeadRecords(existing, candidate, { now: NOW });
    check('11.name kept', merged.name === 'ЗБИ 23');
    check('11.website kept', merged.website === 'https://zb23.ru');
    check('11.status kept', merged.status === 'qualified');
    check('11.score kept', merged.score === 87);
    check('11.contacts kept', merged.contacts && merged.contacts.email === 'a@zb23.ru');
})();

// 12. dedupe 100 candidate rows → 0 duplicate output by lead_id/domain/name+region
(function t12() {
    console.log('Test 12: dedupe 100 candidate rows → 0 duplicates in output');
    const candidates = [];
    // 25 unique base leads, each duplicated 4 times by different keys = 100 rows.
    for (let i = 0; i < 25; i++) {
        const base = {
            lead_id: `LEAD${i}`,
            name: `Компания ${i}`,
            website: `https://company${i}.ru`,
            segment: 'ЖБИ',
            region: 'Краснодарский край',
            source: 'manual',
            status: 'new',
            score: null,
            raw: {},
        };
        // 1: exact
        candidates.push({ ...base });
        // 2: dup by lead_id (different domain/name)
        candidates.push({ ...base, name: `Иное ${i}`, website: `https://alt${i}.ru` });
        // 3: dup by domain (different lead_id/name)
        candidates.push({ ...base, lead_id: `XID${i}`, name: `Другое ${i}` });
        // 4: dup by name+region (different lead_id, no domain)
        candidates.push({ ...base, lead_id: `YID${i}`, website: '', name: `КОМПАНИЯ ${i}` });
    }
    check('12.candidate count is 100', candidates.length === 100);

    const result = dedupeLeadRecords([], candidates, { now: NOW });
    check('12.final unique == 25', result.leads.length === 25);
    check('12.added == 25', result.added_count === 25);
    check('12.merged == 75', result.merged_count === 75);

    // Verify zero residual duplicates in output across all three keys.
    const idKeys = new Set();
    const domKeys = new Set();
    const nrKeys = new Set();
    let residual = 0;
    for (const lead of result.leads) {
        const k = buildLeadDedupeKeys(lead);
        if (k.leadIdKey) { if (idKeys.has(k.leadIdKey)) residual++; idKeys.add(k.leadIdKey); }
        if (k.domainKey) { if (domKeys.has(k.domainKey)) residual++; domKeys.add(k.domainKey); }
        if (k.nameRegionKey) { if (nrKeys.has(k.nameRegionKey)) residual++; nrKeys.add(k.nameRegionKey); }
    }
    check('12.zero residual duplicate keys in output', residual === 0);
})();

// 13. summary contains imported/added/merged/duplicate counts
(function t13() {
    console.log('Test 13: summary fields present');
    const candidates = [
        { lead_id: 'A1', name: 'X', website: 'https://x.ru', region: 'r' },
        { lead_id: 'A1', name: 'X', website: 'https://x.ru', region: 'r' },
        { lead_id: 'B2', name: 'Y', website: 'https://y.ru', region: 'r' },
    ];
    const result = dedupeLeadRecords([], candidates, { now: NOW });
    const summary = buildDedupeSummary(result);
    check('13.imported_count', summary.imported_count === 3);
    check('13.added_count', summary.added_count === 2);
    check('13.merged_count', summary.merged_count === 1);
    check('13.duplicate_count', summary.duplicate_count === 1);
    check('13.has all keys',
        ['imported_count', 'added_count', 'merged_count', 'duplicate_count']
            .every(k => Object.prototype.hasOwnProperty.call(summary, k)));
})();

// 14-17. Source scan: no network / no SMTP / no .env / no external send patterns
(function t14to17() {
    console.log('Test 14-17: source scan (no network/SMTP/.env/send)');
    const src = fs.readFileSync(ENGINE_FILE, 'utf-8');
    // Strip comment lines so documentation prose does not trigger false positives.
    const codeOnly = src
        .split('\n')
        .filter(line => !/^\s*(\*|\/\/|\/\*)/.test(line))
        .join('\n');

    // 14. no network
    check('14.no fetch', !/\bfetch\s*\(/.test(codeOnly));
    check('14.no http module', !/require\(['"]https?['"]\)|from\s+['"]node:?https?['"]/.test(codeOnly));
    check('14.no axios', !/axios/.test(codeOnly));
    check('14.no net/tls connect', !/net\.connect\s*\(|tls\.connect\s*\(/.test(codeOnly));

    // 15. no SMTP
    check('15.no nodemailer', !/nodemailer/i.test(codeOnly));
    check('15.no createTransport', !/createTransport\s*\(/.test(codeOnly));
    check('15.no smtp ref', !/smtp/i.test(codeOnly));

    // 16. no .env
    check('16.no process.env', !/process\.env/.test(codeOnly));
    check('16.no dotenv', !/dotenv/i.test(codeOnly));
    check('16.no .env read', !/readFileSync\([^)]*\.env/.test(codeOnly));

    // 17. no external send patterns
    check('17.no telegram api', !/api\.telegram\.org|sendMessage\s*\(/.test(codeOnly));
    check('17.no whatsapp/max send', !/whatsapp|wa\.me/i.test(codeOnly));
    check('17.no exec/spawn', !/child_process|execSync\s*\(|spawn\s*\(/.test(codeOnly));
})();

// ──────────────────────────────────────────────
console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
    console.log('Failures:', failures.join(', '));
    process.exit(1);
}
process.exit(0);
