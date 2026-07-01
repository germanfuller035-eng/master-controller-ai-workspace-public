/**
 * lead_contact_registry_c25_test.mjs
 *
 * APPROVAL: APPROVE_UNIVERSAL_LEAD_CONTACT_REGISTRY_C25C_TESTS_ONLY_2026-05-31
 *
 * Verifies the C2.5 Universal Lead Contact Registry module
 * (tools/telegram_gateway/lead_contact_registry.mjs) AND its integration into
 * the recipient resolver inside approved_email_send_adapter.mjs.
 *
 * DRY-RUN ONLY. No SMTP. No .env. No email sent. No bot restart. No git.
 *
 * Sandbox: tmp/lead_contact_registry_c25_test_workspace/
 *
 * Coverage (12 checks):
 *   1.  registry created if missing
 *   2.  upsertLeadEmail adds email
 *   3.  duplicate email not duplicated
 *   4.  invalid email rejected
 *   5.  ZB23 registry email resolves
 *   6.  dry-run approval WITHOUT recipient but WITH registry email passes
 *   7.  send_job.recipient_source === 'lead_contact_registry.primary_email'
 *   8.  missing registry email still rejects
 *   9.  email not sent (send_mode === 'dry_run')
 *   10. SMTP not used (safety.smtp_used === false)
 *   11. .env not read (source-scan adapter + registry module)
 *   12. approval not marked executed
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
    getLeadContactRegistryPaths,
    loadLeadContactRegistry,
    saveLeadContactRegistry,
    normalizeLeadId,
    isValidEmail,
    upsertLeadEmail,
    resolveLeadEmailFromContactRegistry,
} from '../telegram_gateway/lead_contact_registry.mjs';

import {
    dryRunApprovedEmailSend,
    buildApprovedEmailSendJob,
} from '../telegram_gateway/approved_email_send_adapter.mjs';

import {
    getApprovalPaths,
    APPROVAL_STATUSES,
} from '../telegram_gateway/approval_queue.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const WORKSPACE  = path.resolve(__dirname, '..', '..');
const SANDBOX    = path.join(WORKSPACE, 'tmp', 'lead_contact_registry_c25_test_workspace');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond) {
    if (cond) { passed++; console.log(`  ✅ ${name}`); }
    else { failed++; failures.push(name); console.log(`  ❌ ${name}`); }
}

// ──────────────────────────────────────────────
// Sandbox helpers
// ──────────────────────────────────────────────

function resetSandbox() {
    fs.rmSync(SANDBOX, { recursive: true, force: true });
    fs.mkdirSync(SANDBOX, { recursive: true });
}

function writeContactRegistry(obj) {
    // Writes 13_sales/lead_contacts.json inside the sandbox.
    const P = getLeadContactRegistryPaths(SANDBOX);
    fs.mkdirSync(P.root, { recursive: true });
    fs.writeFileSync(P.registryFile, JSON.stringify(obj, null, 2) + '\n', 'utf-8');
    return P.registryFile;
}

function writeApprovalQueue(approvals) {
    const P = getApprovalPaths(SANDBOX);
    fs.mkdirSync(path.dirname(P.queueFile), { recursive: true });
    fs.writeFileSync(P.queueFile, JSON.stringify({ approvals }, null, 2));
}

function writeDraft(relPath, body) {
    const full = path.join(SANDBOX, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, `# Draft\n\n## Текст черновика\n${body}\n---\n`);
    return relPath;
}

function baseApproval(extra = {}) {
    const draftRel = path.join('13_sales', 'approval_queue', 'drafts', `${extra.approval_id || 'A'}.md`);
    writeDraft(draftRel, 'Здравствуйте! Это тестовое письмо для dry-run.');
    return {
        approval_id: 'A-TEST',
        lead_id: 'ZB23',
        channel: 'email',
        action_type: 'email_followup',
        status: APPROVAL_STATUSES.APPROVED,
        subject: 'Тестовая тема',
        draft_path: draftRel,
        send_policy: 'manual_or_phase_c_only',
        client_send_executed: false,
        ...extra,
    };
}

// Seed a sandbox contact registry that mirrors the production ZB23 record
// (data only — never relies on the real 13_sales/lead_contacts.json).
function seedZB23() {
    writeContactRegistry({
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
    });
}

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────

console.log('\n=== C2.5 Universal Lead Contact Registry Tests ===\n');

// 1. registry created if missing
(function t1() {
    console.log('Test 1: registry created if missing');
    resetSandbox();
    const P = getLeadContactRegistryPaths(SANDBOX);
    check('1.no file at start', !fs.existsSync(P.registryFile));
    const reg = loadLeadContactRegistry(SANDBOX);
    check('1.load missing → empty object', reg && typeof reg === 'object' && Object.keys(reg).length === 0);
    saveLeadContactRegistry(SANDBOX, reg);
    check('1.save creates file', fs.existsSync(P.registryFile));
})();

// 2. upsertLeadEmail adds email
(function t2() {
    console.log('Test 2: upsertLeadEmail adds email');
    resetSandbox();
    const r = upsertLeadEmail(SANDBOX, 'lead1', 'lead1@example.com', { source: 'test' });
    check('2.upsert ok', r.ok === true);
    check('2.lead_id normalized UPPER', r.leadId === 'LEAD1');
    const reg = loadLeadContactRegistry(SANDBOX);
    check('2.entry exists', !!reg.LEAD1);
    check('2.primary_email set', reg.LEAD1 && reg.LEAD1.primary_email === 'lead1@example.com');
    check('2.email in emails[]', reg.LEAD1 && reg.LEAD1.emails.includes('lead1@example.com'));
})();

// 3. duplicate email not duplicated
(function t3() {
    console.log('Test 3: duplicate email not duplicated');
    resetSandbox();
    upsertLeadEmail(SANDBOX, 'lead2', 'dup@example.com');
    upsertLeadEmail(SANDBOX, 'lead2', 'dup@example.com');
    upsertLeadEmail(SANDBOX, 'lead2', 'DUP@example.com'); // case-insensitive dup
    const reg = loadLeadContactRegistry(SANDBOX);
    const count = reg.LEAD2.emails.filter(e => e.toLowerCase() === 'dup@example.com').length;
    check('3.email stored once', count === 1);
    check('3.emails length 1', reg.LEAD2.emails.length === 1);
})();

// 4. invalid email rejected
(function t4() {
    console.log('Test 4: invalid email rejected');
    resetSandbox();
    const r = upsertLeadEmail(SANDBOX, 'lead3', 'not-an-email');
    check('4.rejected', r.ok === false);
    check('4.has reason', typeof r.reason === 'string' && r.reason.length > 0);
    check('4.isValidEmail false', isValidEmail('not-an-email') === false);
    check('4.isValidEmail true for valid', isValidEmail('ok@example.com') === true);
    const P = getLeadContactRegistryPaths(SANDBOX);
    const reg = fs.existsSync(P.registryFile) ? loadLeadContactRegistry(SANDBOX) : {};
    check('4.no entry created', !reg.LEAD3);
})();

// 5. ZB23 registry email resolves
(function t5() {
    console.log('Test 5: ZB23 registry email resolves');
    resetSandbox();
    seedZB23();
    const r = resolveLeadEmailFromContactRegistry(SANDBOX, 'ZB23');
    check('5.resolved ok', r.ok === true);
    check('5.email = kvs@zb23.ru', r.email === 'kvs@zb23.ru');
    check('5.source = primary_email', r.source === 'lead_contact_registry.primary_email');
    // lead_id normalization: lowercase input still resolves
    const r2 = resolveLeadEmailFromContactRegistry(SANDBOX, 'zb23');
    check('5.case-insensitive resolve', r2.ok === true && r2.email === 'kvs@zb23.ru');
    check('5.normalizeLeadId', normalizeLeadId(' zb23 ') === 'ZB23');
})();

// 6. dry-run approval WITHOUT recipient but WITH registry email passes
(function t6() {
    console.log('Test 6: dry-run without recipient but with registry email passes');
    resetSandbox();
    seedZB23();
    const a = baseApproval({ approval_id: 'A6', lead_id: 'ZB23' }); // no recipient_email/recipient
    writeApprovalQueue([a]);
    const r = dryRunApprovedEmailSend(SANDBOX, 'A6');
    check('6.dry-run ok', r.ok === true);
    check('6.recipient = kvs@zb23.ru', r.send_job && r.send_job.recipient === 'kvs@zb23.ru');
})();

// 7. send_job recipient_source === lead_contact_registry.primary_email
(function t7() {
    console.log('Test 7: send_job recipient_source = lead_contact_registry.primary_email');
    resetSandbox();
    seedZB23();
    const a = baseApproval({ approval_id: 'A7', lead_id: 'ZB23' });
    writeApprovalQueue([a]);
    const built = buildApprovedEmailSendJob(SANDBOX, 'A7');
    check('7.build ok', built.ok === true);
    check('7.recipient_source correct',
        built.ok && built.job.recipient_source === 'lead_contact_registry.primary_email');
})();

// 8. missing registry email still rejects
(function t8() {
    console.log('Test 8: missing registry email still rejects');
    resetSandbox();
    writeContactRegistry({}); // empty registry, no ZB23
    const a = baseApproval({ approval_id: 'A8', lead_id: 'NOLEAD' });
    writeApprovalQueue([a]);
    const r = dryRunApprovedEmailSend(SANDBOX, 'A8');
    check('8.rejected', r.ok === false);
    check('8.safe_to_send false', r.safe_to_send === false);
    check('8.reason mentions registry',
        typeof r.reason === 'string' && /Add email to lead contact registry/.test(r.reason));
})();

// 9 + 10 + 11. email not sent / SMTP not used / .env not read
(function t9to11() {
    console.log('Test 9-11: no email sent, no SMTP, no .env');
    resetSandbox();
    seedZB23();
    const a = baseApproval({ approval_id: 'A9', lead_id: 'ZB23' });
    writeApprovalQueue([a]);
    const r = dryRunApprovedEmailSend(SANDBOX, 'A9');
    check('9.send_mode dry_run', r.send_job && r.send_job.send_mode === 'dry_run');
    check('10.smtp_used false', r.send_job && r.send_job.safety.smtp_used === false);
    check('10.external_send false', r.send_job && r.send_job.safety.external_send === false);

    // Source-scan: registry module + adapter must not read .env or open SMTP.
    function codeOnly(file) {
        const src = fs.readFileSync(file, 'utf-8');
        return src
            .split('\n')
            .filter(line => !/^\s*(\*|\/\/|\/\*)/.test(line))
            .join('\n');
    }
    const regSrc = codeOnly(path.join(WORKSPACE, 'tools', 'telegram_gateway', 'lead_contact_registry.mjs'));
    const adpSrc = codeOnly(path.join(WORKSPACE, 'tools', 'telegram_gateway', 'approved_email_send_adapter.mjs'));

    check('11.registry does not read .env', !/readFileSync\([^)]*\.env|process\.env|dotenv/i.test(regSrc));
    check('11.adapter does not read .env', !/readFileSync\([^)]*\.env|process\.env|dotenv/i.test(adpSrc));
    check('11.registry no smtp', !/require\(['"]nodemailer|from\s+['"]nodemailer|createTransport\s*\(|net\.connect\s*\(|tls\.connect\s*\(/i.test(regSrc));
    check('11.adapter no smtp', !/require\(['"]nodemailer|from\s+['"]nodemailer|createTransport\s*\(|net\.connect\s*\(|tls\.connect\s*\(/i.test(adpSrc));
})();

// 12. approval not marked executed
(function t12() {
    console.log('Test 12: approval not marked executed');
    resetSandbox();
    seedZB23();
    const a = baseApproval({ approval_id: 'A12', lead_id: 'ZB23' });
    writeApprovalQueue([a]);
    dryRunApprovedEmailSend(SANDBOX, 'A12');
    const P = getApprovalPaths(SANDBOX);
    const q = JSON.parse(fs.readFileSync(P.queueFile, 'utf-8'));
    const arr = Array.isArray(q) ? q : q.approvals;
    const after = arr.find(x => x.approval_id === 'A12');
    check('12.status unchanged (APPROVED)', after.status === APPROVAL_STATUSES.APPROVED);
    check('12.client_send_executed not true', after.client_send_executed !== true);
})();

// ──────────────────────────────────────────────
console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
    console.log('Failures:', failures.join(', '));
    process.exit(1);
}
process.exit(0);
