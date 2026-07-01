/**
 * lead_intake_contract_d1_preflight_b_test.mjs
 *
 * APPROVAL: APPROVE_DAILY_LEAD_FACTORY_D1_PREFLIGHT_B_RESUME_TESTS_AND_REPORT_2026-05-31
 *
 * Verifies the standalone Lead Intake CONTRACT
 * (tools/telegram_gateway/lead_intake_contract.mjs).
 *
 * PURE IN-MEMORY. No network. No SMTP. No .env. No send. No bot. No git.
 * No real data writes. No leads_master.json. No lead_contact_registry.
 *
 * This is a PREFLIGHT layer — NOT the full Lead Intake Pipeline.
 *
 * Coverage (17 checks):
 *   1.  pipe row parsed correctly
 *   2.  semicolon row parsed correctly
 *   3.  loose text row parsed correctly
 *   4.  row with only website accepted
 *   5.  row with only name accepted
 *   6.  empty row → needs_review
 *   7.  garbage row → needs_review
 *   8.  lead_id normalized through dedupe engine
 *   9.  website/domain normalization compatible with dedupe engine
 *   10. splitLeadInputRows handles 100 rows
 *   11. 100-row contract test (70 structured + 15 loose + 10 partial + 5 garbage)
 *   12. no real data write (source scan)
 *   13. no lead_contact_registry write (source scan)
 *   14. no network (source scan)
 *   15. no SMTP (source scan)
 *   16. no .env (source scan)
 *   17. no external send patterns (source scan)
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
    getLeadIntakeContractVersion,
    splitLeadInputRows,
    detectLeadRowFormat,
    parseLeadInputRow,
    parseLeadInputBlock,
    validateLeadCandidate,
    buildLeadIntakeContractSummary,
} from '../telegram_gateway/lead_intake_contract.mjs';

import {
    normalizeLeadId,
    normalizeDomain,
    buildLeadDedupeKeys,
} from '../telegram_gateway/lead_dedupe_engine.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const WORKSPACE  = path.resolve(__dirname, '..', '..');
const CONTRACT_FILE = path.join(WORKSPACE, 'tools', 'telegram_gateway', 'lead_intake_contract.mjs');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond) {
    if (cond) { passed++; console.log(`  ✅ ${name}`); }
    else { failed++; failures.push(name); console.log(`  ❌ ${name}`); }
}

console.log('\n=== D1 Preflight B — Lead Intake Contract Tests ===\n');

// 1. pipe row parsed correctly
(function t1() {
    console.log('Test 1: pipe row parsed correctly');
    const row = 'ZB23 | ООО ЗБИ 23 | https://zb23.ru | ЖБИ | Краснодар';
    const c = parseLeadInputRow(row, { source: 'manual' });
    check('1.lead_id ZB23', c.lead_id === 'ZB23');
    check('1.name set', c.name === 'ООО ЗБИ 23');
    check('1.website normalized', c.website === 'zb23.ru');
    check('1.segment ЖБИ', c.segment === 'ЖБИ');
    check('1.region Краснодар', c.region === 'Краснодар');
    check('1.confidence high', c.parse_confidence >= 0.9);
    const v = validateLeadCandidate(c);
    check('1.valid + no review', v.valid === true && v.needs_review === false);
})();

// 2. semicolon row parsed correctly
(function t2() {
    console.log('Test 2: semicolon row parsed correctly');
    const row = 'ZB24; ООО Бетон; https://beton.ru; ЖБИ; Москва';
    const c = parseLeadInputRow(row);
    check('2.detect semicolon', detectLeadRowFormat(row) === 'semicolon');
    check('2.lead_id ZB24', c.lead_id === 'ZB24');
    check('2.name set', c.name === 'ООО Бетон');
    check('2.website normalized', c.website === 'beton.ru');
    check('2.confidence high', c.parse_confidence >= 0.9);
})();

// 3. loose text row parsed correctly
(function t3() {
    console.log('Test 3: loose text row parsed correctly');
    const row = 'ООО Ромашка, https://romashka.ru, ЖБИ';
    check('3.detect loose', detectLeadRowFormat(row) === 'loose');
    const c = parseLeadInputRow(row);
    check('3.name set', c.name === 'ООО Ромашка');
    check('3.website normalized', c.website === 'romashka.ru');
    check('3.confidence loose', c.parse_confidence >= 0.7);
    const v = validateLeadCandidate(c);
    check('3.valid', v.valid === true);
})();

// 4. row with only website accepted
(function t4() {
    console.log('Test 4: row with only website accepted');
    const c = parseLeadInputRow('https://onlysite.ru');
    check('4.website set', c.website === 'onlysite.ru');
    check('4.no name', !c.name);
    const v = validateLeadCandidate(c);
    check('4.accepted (valid)', v.valid === true);
})();

// 5. row with only name accepted
(function t5() {
    console.log('Test 5: row with only name accepted');
    const c = parseLeadInputRow('Ромашка Строй');
    check('5.name set', c.name === 'Ромашка Строй');
    check('5.no website', !c.website);
    const v = validateLeadCandidate(c);
    check('5.accepted (valid input)', v.valid === true);
})();

// 6. empty row → needs_review
(function t6() {
    console.log('Test 6: empty row → needs_review');
    const c = parseLeadInputRow('');
    const v = validateLeadCandidate(c);
    check('6.not valid', v.valid === false);
    check('6.needs_review', v.needs_review === true);
    check('6.reason set', typeof v.reason === 'string' && v.reason.length > 0);
})();

// 7. garbage row → needs_review
(function t7() {
    console.log('Test 7: garbage row → needs_review');
    const c = parseLeadInputRow(';;;;;');
    const v = validateLeadCandidate(c);
    check('7.no required field', !c.lead_id && !c.name && !c.website);
    check('7.not valid', v.valid === false);
    check('7.needs_review', v.needs_review === true);
})();

// 8. lead_id normalized through dedupe engine
(function t8() {
    console.log('Test 8: lead_id normalized through dedupe engine');
    const c = parseLeadInputRow('zb23 | Имя Компании | https://x-corp.ru');
    check('8.lead_id uppercased', c.lead_id === 'ZB23');
    check('8.matches dedupe normalizeLeadId', c.lead_id === normalizeLeadId('zb23'));
})();

// 9. website/domain normalization compatible with dedupe engine
(function t9() {
    console.log('Test 9: website/domain normalization compatible with dedupe');
    const url = 'https://www.zb23.ru/page?x=1';
    const c = parseLeadInputRow(`ООО ЗБИ | ${url} | ЖБИ`);
    check('9.website == normalizeDomain', c.website === normalizeDomain(url));
    check('9.website is zb23.ru', c.website === 'zb23.ru');
    const keys = buildLeadDedupeKeys(c);
    check('9.dedupe domainKey compatible', keys.domainKey === 'domain:zb23.ru');
})();

// 10. splitLeadInputRows handles 100 rows
(function t10() {
    console.log('Test 10: splitLeadInputRows handles 100 rows');
    const lines = [];
    for (let i = 0; i < 100; i++) lines.push(`ID${i} | Компания ${i} | https://c${i}.ru`);
    const block = lines.join('\n');
    const rows = splitLeadInputRows(block);
    check('10.exactly 100 rows', rows.length === 100);
    // blank/whitespace lines dropped
    const messy = splitLeadInputRows('a\n\n  \nb\r\nc');
    check('10.blank lines dropped', messy.length === 3);
})();

// 11. 100-row contract test
(function t11() {
    console.log('Test 11: 100-row contract test');
    const lines = [];

    // 70 valid structured rows (35 pipe + 35 semicolon), each with website → high conf.
    for (let i = 0; i < 35; i++) {
        lines.push(`ID${i} | Компания ${i} | https://company${i}.ru | ЖБИ | Краснодар`);
    }
    for (let i = 0; i < 35; i++) {
        lines.push(`SID${i}; Фирма ${i}; https://firm${i}.ru; Бетон; Москва`);
    }

    // 15 loose but valid rows (name + website) → loose conf, valid, no review.
    for (let i = 0; i < 15; i++) {
        lines.push(`Компания L${i}, https://loose${i}.ru, ЖБИ`);
    }

    // 10 partial rows (bare name, no website/contact) → partial → needs_review.
    for (let i = 0; i < 10; i++) {
        lines.push(`Партнёр ${i}`);
    }

    // 5 garbage rows (separator-only) → no required field → needs_review.
    const garbage = [';;;', '|||', ',,,', '; ; ;', '|  |'];
    for (const g of garbage) lines.push(g);

    const block = lines.join('\n');

    let threw = false;
    let result;
    try {
        result = parseLeadInputBlock(block, { source: 'manual' });
    } catch (e) {
        threw = true;
    }

    check('11.no throw', threw === false && !!result);
    check('11.total == 100', result.total === 100);
    check('11.valid >= 85', result.valid_count >= 85);
    check('11.needs_review 5..15',
        result.needs_review_count >= 5 && result.needs_review_count <= 15);
    check('11.valid+review == total',
        result.valid_count + result.needs_review_count === 100);

    const summary = buildLeadIntakeContractSummary(result);
    check('11.summary total == 100', summary.total === 100);
    check('11.summary version', summary.contract_version === getLeadIntakeContractVersion());
})();

// 12-17. Source scan of the contract module.
(function tScan() {
    console.log('Test 12-17: source scan (no write/registry/network/SMTP/.env/send)');
    const src = fs.readFileSync(CONTRACT_FILE, 'utf-8');
    const codeOnly = src
        .split('\n')
        .filter(line => !/^\s*(\*|\/\/|\/\*)/.test(line))
        .join('\n');

    // 12. no real data write
    check('12.no writeFileSync', !/writeFileSync\s*\(/.test(codeOnly));
    check('12.no appendFile', !/appendFileSync?\s*\(/.test(codeOnly));
    check('12.no leads_master write', !/leads_master/i.test(codeOnly));

    // 13. no lead_contact_registry write
    check('13.no contact registry', !/lead_contact_registry/i.test(codeOnly));
    check('13.no contact_registry write', !/contact_registry/i.test(codeOnly));

    // 14. no network
    check('14.no fetch', !/\bfetch\s*\(/.test(codeOnly));
    check('14.no http module', !/require\(['"]https?['"]\)|from\s+['"]node:?https?['"]/.test(codeOnly));
    check('14.no axios', !/axios/.test(codeOnly));

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
