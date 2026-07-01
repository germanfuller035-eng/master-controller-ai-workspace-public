// telegram_contact_resolve_top1_regression_test.mjs
// Regression guards for the real-contact resolution stage of the sales pipeline.
//
// Guarantees:
//   - fake / example / test / EMAIL_TEST_TO emails are NEVER sendable
//   - resolver returns REAL_CLIENT_RECIPIENT_REQUIRED when no real email exists
//   - resolver returns a real, sendable email when present in registry
//   - local website-contact files (mailto / text) are parsed for real emails
//   - /contact_resolve top1 command classification works
//   - /contact_resolve output never marks the client contacted / sent
//   - no example.com / test* recipient leaks into a sendable result

import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    isFakeEmail,
    isRealEmail,
    parseEmailsFromText,
    classifyContactResolveCommand,
    resolveRealContact,
    formatContactResolveResult,
    handleContactResolveCommand,
    REAL_CLIENT_RECIPIENT_REQUIRED,
} from '../telegram_gateway/telegram_contact_resolver.mjs';

let passed = 0;
let failed = 0;
function test(name, fn) {
    try {
        fn();
        passed += 1;
        console.log(`  PASS  ${name}`);
    } catch (err) {
        failed += 1;
        console.log(`  FAIL  ${name}`);
        console.log(`        ${err && err.message}`);
    }
}

console.log('== telegram_contact_resolve_top1_regression_test ==');

// ---------------------------------------------------------------------------
// 1. Fake-email hard guards
// ---------------------------------------------------------------------------
test('blocks example.com', () => {
    assert.strictEqual(isFakeEmail('test-zb23@example.com'), true);
    assert.strictEqual(isRealEmail('test-zb23@example.com'), false);
});

test('blocks bare example.com address', () => {
    assert.strictEqual(isFakeEmail('info@example.com'), true);
});

test('blocks test* recipients', () => {
    assert.strictEqual(isFakeEmail('test@zb23.ru'), true);
    assert.strictEqual(isFakeEmail('test-foo@zb23.ru'), true);
    assert.strictEqual(isFakeEmail('test_foo@zb23.ru'), true);
});

test('blocks EMAIL_TEST_TO literal', () => {
    assert.strictEqual(isFakeEmail('EMAIL_TEST_TO'), true);
});

test('blocks malformed strings', () => {
    assert.strictEqual(isFakeEmail(''), true);
    assert.strictEqual(isFakeEmail(null), true);
    assert.strictEqual(isFakeEmail('not-an-email'), true);
});

test('accepts a real client email', () => {
    assert.strictEqual(isRealEmail('director@zb23.ru'), true);
    assert.strictEqual(isFakeEmail('director@zb23.ru'), false);
});

// ---------------------------------------------------------------------------
// 2. Email text / mailto parsing keeps only real emails
// ---------------------------------------------------------------------------
test('parseEmailsFromText extracts real mailto, drops fakes', () => {
    const text = `
        <a href="mailto:sales@zb23.ru">write us</a>
        contact: test@example.com
        backup: info@zb23.ru
    `;
    const emails = parseEmailsFromText(text);
    assert.ok(emails.includes('sales@zb23.ru'), 'real mailto kept');
    assert.ok(emails.includes('info@zb23.ru'), 'real text email kept');
    assert.ok(!emails.includes('test@example.com'), 'fake dropped');
});

// ---------------------------------------------------------------------------
// 3. Command classification
// ---------------------------------------------------------------------------
test('classifies /contact_resolve top1', () => {
    const c = classifyContactResolveCommand('/contact_resolve top1');
    assert.ok(c, 'must classify');
    assert.strictEqual(c.action, 'contact_resolve');
    assert.strictEqual(c.query, 'top1');
});

test('classifies RU "разреши контакт топ 1"', () => {
    const c = classifyContactResolveCommand('разреши контакт топ 1');
    assert.ok(c, 'must classify RU');
    assert.strictEqual(c.query, 'top1');
});

test('does not classify unrelated text', () => {
    assert.strictEqual(classifyContactResolveCommand('/audit_draft top1'), null);
    assert.strictEqual(classifyContactResolveCommand('hello'), null);
});

// ---------------------------------------------------------------------------
// 4. Resolver: no real email -> REAL_CLIENT_RECIPIENT_REQUIRED
// ---------------------------------------------------------------------------
test('empty registry -> REAL_CLIENT_RECIPIENT_REQUIRED', () => {
    const r = resolveRealContact({
        lead: { lead_id: '002', company: 'ЖЕЛЕЗОБЕТОН', website: 'zb23.ru' },
        query: 'top1',
        registry: {},
        contactFileDirs: ['D:/__no_such_dir__'],
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.sendable, false);
    assert.strictEqual(r.code, REAL_CLIENT_RECIPIENT_REQUIRED);
    assert.strictEqual(r.email, '');
    assert.strictEqual(r.email_found, false);
});

test('registry with only fake email -> blocked', () => {
    const r = resolveRealContact({
        lead: { lead_id: '002', company: 'ЖЕЛЕЗОБЕТОН', website: 'zb23.ru' },
        query: 'top1',
        registry: {
            '002': { company: 'ЖЕЛЕЗОБЕТОН', website: 'zb23.ru', primary_email: 'test-zb23@example.com' },
        },
        contactFileDirs: ['D:/__no_such_dir__'],
    });
    assert.strictEqual(r.sendable, false);
    assert.strictEqual(r.code, REAL_CLIENT_RECIPIENT_REQUIRED);
    assert.ok(!/example\.com/.test(r.email), 'fake email must NOT leak');
});

// ---------------------------------------------------------------------------
// 5. Resolver: real email present -> sendable
// ---------------------------------------------------------------------------
test('registry real email -> sendable', () => {
    const r = resolveRealContact({
        lead: { lead_id: '002', company: 'ЖЕЛЕЗОБЕТОН', website: 'zb23.ru' },
        query: 'top1',
        registry: {
            '002': { company: 'ЖЕЛЕЗОБЕТОН', website: 'zb23.ru', primary_email: 'sales@zb23.ru', source: 'manual' },
        },
        contactFileDirs: ['D:/__no_such_dir__'],
    });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.sendable, true);
    assert.strictEqual(r.email, 'sales@zb23.ru');
    assert.strictEqual(r.email_found, true);
    assert.ok(r.source, 'must carry a source');
});

test('registry prefers real over fake in emails[]', () => {
    const r = resolveRealContact({
        lead: { lead_id: '002', website: 'zb23.ru' },
        query: 'top1',
        registry: {
            '002': { website: 'zb23.ru', emails: ['test@example.com', 'real@zb23.ru'] },
        },
        contactFileDirs: ['D:/__no_such_dir__'],
    });
    assert.strictEqual(r.sendable, true);
    assert.strictEqual(r.email, 'real@zb23.ru');
});

// ---------------------------------------------------------------------------
// 6. Resolver: website-contact file parsed for real email
// ---------------------------------------------------------------------------
test('local website contact file -> sendable real email', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'contact_resolve_'));
    try {
        fs.writeFileSync(
            path.join(tmp, 'zb23.html'),
            'fake test@example.com <a href="mailto:office@zb23.ru">office</a>',
            'utf8',
        );
        const r = resolveRealContact({
            lead: { lead_id: '999', website: 'https://zb23.ru/contacts' },
            query: 'top1',
            registry: {},
            contactFileDirs: [tmp],
        });
        assert.strictEqual(r.sendable, true);
        assert.strictEqual(r.email, 'office@zb23.ru');
        assert.ok(/website_contact_file/.test(r.source));
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
});

// ---------------------------------------------------------------------------
// 7. Output formatting never implies a send / contacted state
// ---------------------------------------------------------------------------
test('format output is read-only and never says contacted/sent', () => {
    const r = resolveRealContact({
        lead: { lead_id: '002', company: 'ЖЕЛЕЗОБЕТОН', website: 'zb23.ru' },
        query: 'top1',
        registry: {},
        contactFileDirs: ['D:/__no_such_dir__'],
    });
    const txt = formatContactResolveResult(r);
    assert.ok(/НЕ contacted/i.test(txt), 'must state client NOT contacted');
    assert.ok(!/отправлено клиенту/i.test(txt), 'must not claim a client send');
    assert.ok(/sendable: NO/.test(txt));
    assert.ok(txt.includes(REAL_CLIENT_RECIPIENT_REQUIRED));
});

test('handleContactResolveCommand wires classify+resolve+format', () => {
    const parsed = classifyContactResolveCommand('/contact_resolve top1');
    const out = handleContactResolveCommand(parsed, {
        lead: { lead_id: '002', company: 'ЖЕЛЕЗОБЕТОН', website: 'zb23.ru' },
        registry: {},
        contactFileDirs: ['D:/__no_such_dir__'],
    });
    assert.ok(out && out.result && out.text);
    assert.strictEqual(out.result.sendable, false);
    assert.ok(out.text.includes('company:'));
    assert.ok(out.text.includes('found email: NO'));
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('  ALL GREEN');
