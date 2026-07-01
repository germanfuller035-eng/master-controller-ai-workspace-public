// contact_resolver_v1_contract_test.mjs
// ============================================================
// BLOCK C — Contact Resolver v1 contract (OFFLINE, READ-ONLY)
// ------------------------------------------------------------
// Locks the v1 sendable-YES/NO contract so the resolver can NEVER
// regress into emitting a fake/example/test recipient as sendable.
//
// Contract asserted:
//   resolveRealContact(...) returns an object that ALWAYS carries:
//     ok, sendable, company, website, email, email_found, source, confidence
//   Hard-block rules (sendable MUST be false):
//     - *@example.(com|org|net)
//     - test*@... / *@test.*
//     - EMAIL_TEST_TO literal
//     - empty / missing email
//   Positive: a registry record with a REAL email -> sendable YES, confidence high.
//
// SAFETY: no network, no Telegram, no token, no production writes.
// ============================================================

import {
    resolveRealContact,
    isFakeEmail,
    isRealEmail,
    formatContactResolveResult,
    REAL_CLIENT_RECIPIENT_REQUIRED,
} from '../telegram_gateway/telegram_contact_resolver.mjs';

let pass = 0;
let fail = 0;
function ok(name, cond) {
    if (cond) {
        pass++;
        console.log(`  PASS ${name}`);
    } else {
        fail++;
        console.log(`  FAIL ${name}`);
    }
}

console.log('== Block C: Contact Resolver v1 contract ==');

// ---------------------------------------------------------------------------
console.log('\n-- isFakeEmail hard-block rules --');
const FAKE = [
    'a@example.com',
    'a@example.org',
    'a@example.net',
    'test@anything.ru',
    'test.user@foo.com',
    'demo@foo.com',
    'noreply@foo.com',
    'no-reply@foo.com',
    'user@test.local',
    'EMAIL_TEST_TO',
    '',
    '   ',
    'not-an-email',
];
for (const e of FAKE) {
    ok(`fake blocked: ${JSON.stringify(e)}`, isFakeEmail(e) === true && isRealEmail(e) === false);
}

console.log('\n-- isRealEmail accepts genuine client emails --');
const REAL = ['kvs@zb23.ru', 'info@realfactory.ru', 'sales@company.com'];
for (const e of REAL) {
    ok(`real accepted: ${e}`, isRealEmail(e) === true && isFakeEmail(e) === false);
}

// ---------------------------------------------------------------------------
console.log('\n-- contract: blocked when no real email (empty registry) --');
const blocked = resolveRealContact({
    lead: { lead_id: '999', company: 'NoContact Co', website: 'nocontact.ru' },
    query: 'top1',
    registry: {}, // injected -> no file read
    contactFileDirs: ['D:/AI_WORKSPACE/__nonexistent_dir__'],
});
const CONTRACT_FIELDS = ['ok', 'sendable', 'company', 'website', 'email', 'email_found', 'source', 'confidence'];
for (const f of CONTRACT_FIELDS) {
    ok(`blocked result has field '${f}'`, Object.prototype.hasOwnProperty.call(blocked, f));
}
ok('blocked: sendable === false', blocked.sendable === false);
ok('blocked: ok === false', blocked.ok === false);
ok('blocked: email is empty', blocked.email === '');
ok('blocked: email_found === false', blocked.email_found === false);
ok('blocked: confidence none', blocked.confidence === 'none');
ok('blocked: code REAL_CLIENT_RECIPIENT_REQUIRED', blocked.code === REAL_CLIENT_RECIPIENT_REQUIRED);

// ---------------------------------------------------------------------------
console.log('\n-- contract: registry with a FAKE email never becomes sendable --');
const fakeRegistry = {
    '999': { company: 'Fake Co', website: 'fakeco.ru', primary_email: 'test@example.com', emails: ['demo@foo.com'] },
};
const fakeRes = resolveRealContact({
    lead: { lead_id: '999', company: 'Fake Co', website: 'fakeco.ru' },
    query: 'top1',
    registry: fakeRegistry,
    contactFileDirs: ['D:/AI_WORKSPACE/__nonexistent_dir__'],
});
ok('fake registry: sendable === false', fakeRes.sendable === false);
ok('fake registry: email empty', !fakeRes.email);

// ---------------------------------------------------------------------------
console.log('\n-- contract: registry with a REAL email -> sendable YES --');
const realRegistry = {
    ZB23: { company: 'ЖЕЛЕЗОБЕТОН', website: 'zb23.ru', primary_email: 'kvs@zb23.ru', source: 'manual' },
};
const realRes = resolveRealContact({
    lead: { lead_id: '002', company: 'ЖЕЛЕЗОБЕТОН', website: 'zb23.ru' },
    query: 'top1',
    registry: realRegistry,
    contactFileDirs: ['D:/AI_WORKSPACE/__nonexistent_dir__'],
});
ok('real registry: ok === true', realRes.ok === true);
ok('real registry: sendable === true', realRes.sendable === true);
ok('real registry: email === kvs@zb23.ru', realRes.email === 'kvs@zb23.ru');
ok('real registry: email_found === true', realRes.email_found === true);
ok('real registry: confidence high', realRes.confidence === 'high');
ok('real registry: source mentions lead_contacts', String(realRes.source).includes('lead_contacts'));

// ---------------------------------------------------------------------------
console.log('\n-- formatter exposes the v1 fields to the operator --');
const text = formatContactResolveResult(realRes);
for (const label of ['company:', 'website:', 'email:', 'email source:', 'confidence:', 'sendable:']) {
    ok(`formatter shows '${label}'`, text.includes(label));
}
ok('formatter shows sendable YES for real', /sendable:\s*YES/.test(text));
const blockedText = formatContactResolveResult(blocked);
ok('formatter shows sendable NO for blocked', /sendable:\s*NO/.test(blockedText));

// ---------------------------------------------------------------------------
console.log(`\n${fail === 0 ? 'ALL GREEN' : 'RED'}: contact resolver v1 contract (${pass} pass / ${fail} fail).`);
if (fail !== 0) process.exit(1);
