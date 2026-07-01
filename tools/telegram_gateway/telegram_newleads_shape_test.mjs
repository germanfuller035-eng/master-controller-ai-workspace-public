// telegram_newleads_shape_test.mjs
// Verifies that telegram_queue.json shape is safe for /newleads handler.
// - file exists / valid JSON
// - normalizer returns array for all known shapes
// - .slice(0, N) is safe on result
// - leads have minimum required fields
//
// Does NOT touch Telegram. Does NOT change auto_send safety.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QUEUE_PATH = path.resolve(
    __dirname,
    '..',
    '..',
    '13_sales',
    'daily_lead_factory',
    'data',
    'processed',
    'telegram_queue.json'
);

// Inline copy of the normalizer used by telegram_master_bot.mjs.
// Keep in sync with telegram_master_bot.mjs::normalizeLeadQueue.
function normalizeLeadQueue(raw) {
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.leads)) return raw.leads;
    if (raw && Array.isArray(raw.queue)) return raw.queue;
    if (raw && Array.isArray(raw.items)) return raw.items;
    if (raw && Array.isArray(raw.data))  return raw.data;
    return [];
}

const results = [];
let failed = 0;

function check(name, ok, info = '') {
    results.push({ name, ok, info });
    if (!ok) failed++;
    const tag = ok ? '✅' : '❌';
    console.log(`${tag} ${name}${info ? '  —  ' + info : ''}`);
}

console.log('=== /newleads shape test ===\n');

// 1) File existence
check('queue file exists', fs.existsSync(QUEUE_PATH), QUEUE_PATH);

// 2) Valid JSON
let parsed = null;
let parseOk = false;
if (fs.existsSync(QUEUE_PATH)) {
    try {
        const raw = fs.readFileSync(QUEUE_PATH, 'utf-8');
        parsed = JSON.parse(raw);
        parseOk = true;
    } catch (e) {
        parseOk = false;
        check('queue file is valid JSON', false, e.message);
    }
}
if (parseOk) check('queue file is valid JSON', true);

// 3) Shape detection
let shape = 'unknown';
if (Array.isArray(parsed)) shape = 'array';
else if (parsed && Array.isArray(parsed.leads)) shape = 'object.leads';
else if (parsed && Array.isArray(parsed.queue)) shape = 'object.queue';
else if (parsed && Array.isArray(parsed.items)) shape = 'object.items';
else if (parsed && Array.isArray(parsed.data)) shape = 'object.data';
else if (parsed && typeof parsed === 'object') shape = 'object.other';
check('shape detected', shape !== 'unknown', `shape=${shape}`);

// 4) normalizeLeadQueue returns array
const leads = normalizeLeadQueue(parsed);
check('normalizeLeadQueue returns array', Array.isArray(leads), `length=${leads.length}`);

// 5) .slice is safe
let sliceOk = false;
try {
    const top = leads.slice(0, 10);
    sliceOk = Array.isArray(top);
} catch (e) {
    sliceOk = false;
}
check('leads.slice(0, 10) is safe', sliceOk);

// 6) Min fields per lead (only if leads present)
if (leads.length > 0) {
    const required = ['company_name', 'niche', 'city', 'score', 'risk_level', 'status'];
    const idFields = ['lead_id', 'id'];
    let bad = 0;
    const issues = [];
    leads.forEach((l, i) => {
        const hasId = idFields.some(f => l && l[f] !== undefined && l[f] !== null && l[f] !== '');
        const missing = required.filter(f => !(l && l[f] !== undefined && l[f] !== null && l[f] !== ''));
        if (!hasId || missing.length) {
            bad++;
            if (issues.length < 3) {
                issues.push(`#${i}: ${!hasId ? 'no lead_id/id; ' : ''}missing=${missing.join(',') || 'none'}`);
            }
        }
    });
    check('every lead has min fields', bad === 0, bad ? `${bad} bad. examples: ${issues.join(' | ')}` : 'all good');
} else {
    check('every lead has min fields', true, 'no leads to validate (empty queue)');
}

// 7) Unit tests for normalizer across shapes A–F
console.log('\n--- unit tests for normalizeLeadQueue ---');
const cases = [
    { label: 'A: []', input: [], expectArr: true, expectLen: 0 },
    { label: 'B: [{ company_name }]', input: [{ company_name: 'Test' }], expectArr: true, expectLen: 1 },
    { label: 'C: { leads: [...] }', input: { leads: [{ a: 1 }, { a: 2 }] }, expectArr: true, expectLen: 2 },
    { label: 'D: { queue: [...] }', input: { queue: [{ a: 1 }] }, expectArr: true, expectLen: 1 },
    { label: 'E: { items: [...] }', input: { items: [{ a: 1 }, { a: 2 }, { a: 3 }] }, expectArr: true, expectLen: 3 },
    { label: 'F: { bad: true }', input: { bad: true }, expectArr: true, expectLen: 0 },
    { label: 'G: null', input: null, expectArr: true, expectLen: 0 },
    { label: 'H: { data: [...] }', input: { data: [{ a: 1 }] }, expectArr: true, expectLen: 1 },
];
for (const c of cases) {
    let arr;
    let crashed = false;
    try {
        arr = normalizeLeadQueue(c.input);
    } catch (e) {
        crashed = true;
    }
    const ok = !crashed && Array.isArray(arr) === c.expectArr && arr.length === c.expectLen;
    check(`unit ${c.label}`, ok, `len=${arr ? arr.length : 'n/a'}, expected=${c.expectLen}`);
    // Ensure .slice doesn't throw
    if (arr && Array.isArray(arr)) {
        try { arr.slice(0, 10); } catch (e) { check(`unit ${c.label} .slice safe`, false, e.message); }
    }
}

console.log('\n=== summary ===');
console.log(`passed: ${results.length - failed} / ${results.length}`);
if (failed) {
    console.log(`❌ FAILED: ${failed}`);
    process.exit(1);
} else {
    console.log('✅ ALL PASSED');
    process.exit(0);
}
