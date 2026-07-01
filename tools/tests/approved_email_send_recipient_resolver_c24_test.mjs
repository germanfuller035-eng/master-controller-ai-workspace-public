/**
 * approved_email_send_recipient_resolver_c24_test.mjs
 *
 * APPROVAL: APPROVE_APPROVED_EMAIL_SEND_RECIPIENT_RESOLVER_C24B_RESUME_2026-05-31
 *
 * Verifies the C2.4 recipient resolver inside approved_email_send_adapter.mjs.
 * DRY-RUN ONLY. No SMTP. No .env. No email sent. No bot restart.
 *
 * Sandbox: tmp/approved_email_send_recipient_resolver_c24_test_workspace/
 */

import fs   from 'fs';
import path from 'path';
import os   from 'os';
import { fileURLToPath } from 'url';

import {
    resolveRecipientEmail,
    validateApprovedEmailSend,
    buildApprovedEmailSendJob,
    dryRunApprovedEmailSend,
    getEmailSendPaths,
} from '../telegram_gateway/approved_email_send_adapter.mjs';

import {
    getApprovalPaths,
    APPROVAL_STATUSES,
} from '../telegram_gateway/approval_queue.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const WORKSPACE  = path.resolve(__dirname, '..', '..');
const SANDBOX    = path.join(WORKSPACE, 'tmp', 'approved_email_send_recipient_resolver_c24_test_workspace');

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

function writeApprovalQueue(approvals) {
    const P = getApprovalPaths(SANDBOX);
    fs.mkdirSync(path.dirname(P.queueFile), { recursive: true });
    fs.writeFileSync(P.queueFile, JSON.stringify({ approvals }, null, 2));
}

function writeLeadQueue(leads) {
    // active_leads_queue_<date>.json under 13_sales/daily_lead_factory/output
    const dir = path.join(SANDBOX, '13_sales', 'daily_lead_factory', 'output');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
        path.join(dir, 'active_leads_queue_2026-05-31.json'),
        JSON.stringify({ active_leads: leads }, null, 2),
    );
}

function writeDraft(relPath, body) {
    const full = path.join(SANDBOX, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full,
        `# Draft\n\n## Текст черновика\n${body}\n---\n`);
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

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────

console.log('\n=== C2.4 Recipient Resolver Tests ===\n');

// 1. recipient_email in approval → dry-run pass
(function t1() {
    console.log('Test 1: recipient_email in approval → pass');
    resetSandbox();
    const a = baseApproval({ approval_id: 'A1', recipient_email: 'a1@example.com' });
    writeApprovalQueue([a]);
    const r = dryRunApprovedEmailSend(SANDBOX, 'A1');
    check('1.dry-run ok', r.ok === true);
    check('1.recipient correct', r.send_job && r.send_job.recipient === 'a1@example.com');
    check('1.source = approval.recipient_email', r.send_job && r.send_job.recipient_source === 'approval.recipient_email');
})();

// 2. legacy recipient in approval → pass
(function t2() {
    console.log('Test 2: legacy approval.recipient → pass');
    resetSandbox();
    const a = baseApproval({ approval_id: 'A2', recipient: 'legacy@example.com' });
    writeApprovalQueue([a]);
    const r = dryRunApprovedEmailSend(SANDBOX, 'A2');
    check('2.dry-run ok', r.ok === true);
    check('2.recipient correct', r.send_job && r.send_job.recipient === 'legacy@example.com');
    check('2.source = approval.recipient', r.send_job && r.send_job.recipient_source === 'approval.recipient');
})();

// 3. recipient in lead.email → pass
(function t3() {
    console.log('Test 3: lead.email lookup → pass');
    resetSandbox();
    writeLeadQueue([{ lead_id: 'LEADX', email: 'lead@example.com' }]);
    const a = baseApproval({ approval_id: 'A3', lead_id: 'LEADX' });
    writeApprovalQueue([a]);
    const r = dryRunApprovedEmailSend(SANDBOX, 'A3');
    check('3.dry-run ok', r.ok === true);
    check('3.recipient correct', r.send_job && r.send_job.recipient === 'lead@example.com');
    check('3.source = lead.email', r.send_job && r.send_job.recipient_source === 'lead.email');
})();

// 4. recipient in lead.contacts.email → pass
(function t4() {
    console.log('Test 4: lead.contacts.email lookup → pass');
    resetSandbox();
    writeLeadQueue([{ lead_id: 'LEADY', contacts: { email: 'contact@example.com' } }]);
    const a = baseApproval({ approval_id: 'A4', lead_id: 'LEADY' });
    writeApprovalQueue([a]);
    const r = dryRunApprovedEmailSend(SANDBOX, 'A4');
    check('4.dry-run ok', r.ok === true);
    check('4.recipient correct', r.send_job && r.send_job.recipient === 'contact@example.com');
})();

// 5. recipient nowhere → reject
(function t5() {
    console.log('Test 5: no recipient anywhere → reject');
    resetSandbox();
    writeLeadQueue([{ lead_id: 'LEADZ' }]);
    const a = baseApproval({ approval_id: 'A5', lead_id: 'LEADZ' });
    writeApprovalQueue([a]);
    const r = dryRunApprovedEmailSend(SANDBOX, 'A5');
    check('5.rejected', r.ok === false);
    check('5.safe_to_send false', r.safe_to_send === false);
})();

// 6. invalid email → reject
(function t6() {
    console.log('Test 6: invalid email → reject');
    resetSandbox();
    const a = baseApproval({ approval_id: 'A6', recipient_email: 'not-an-email' });
    writeApprovalQueue([a]);
    const r = dryRunApprovedEmailSend(SANDBOX, 'A6');
    check('6.rejected', r.ok === false);
})();

// 7. pending approval → reject
(function t7() {
    console.log('Test 7: pending approval → reject');
    resetSandbox();
    const a = baseApproval({ approval_id: 'A7', recipient_email: 'a7@example.com', status: APPROVAL_STATUSES.PENDING });
    writeApprovalQueue([a]);
    const r = dryRunApprovedEmailSend(SANDBOX, 'A7');
    check('7.rejected', r.ok === false);
})();

// 8. duplicate send_job → reject
(function t8() {
    console.log('Test 8: duplicate send_job → reject');
    resetSandbox();
    const a = baseApproval({ approval_id: 'A8', recipient_email: 'a8@example.com' });
    writeApprovalQueue([a]);
    const r1 = dryRunApprovedEmailSend(SANDBOX, 'A8');
    const r2 = dryRunApprovedEmailSend(SANDBOX, 'A8');
    check('8.first ok', r1.ok === true);
    check('8.second rejected (duplicate)', r2.ok === false);
})();

// 9 + 10 + 11. email not sent / SMTP not used / .env not read
(function t9to11() {
    console.log('Test 9-11: no email sent, no SMTP, no .env');
    resetSandbox();
    const a = baseApproval({ approval_id: 'A9', recipient_email: 'a9@example.com' });
    writeApprovalQueue([a]);
    const r = dryRunApprovedEmailSend(SANDBOX, 'A9');
    check('9.send_mode dry_run', r.send_job && r.send_job.send_mode === 'dry_run');
    check('10.smtp_used false', r.send_job && r.send_job.safety.smtp_used === false);
    check('10.external_send false', r.send_job && r.send_job.safety.external_send === false);

    // Source must not reference .env / SMTP send.
    const src = fs.readFileSync(path.join(WORKSPACE, 'tools', 'telegram_gateway', 'approved_email_send_adapter.mjs'), 'utf-8');
    check('11.adapter does not read .env', !/\.env/.test(src.replace(/NEVER reads \.env[^\n]*/g, '')) || !/readFileSync\([^)]*\.env/.test(src));
    // Strip comment lines so the safety prose ("NEVER opens SMTP.") is not a false positive.
    const codeOnly = src
        .split('\n')
        .filter(line => !/^\s*(\*|\/\/|\/\*)/.test(line))
        .join('\n');
    check('11.adapter does not import nodemailer/smtp', !/require\(['"]nodemailer|from\s+['"]nodemailer|createTransport\s*\(|net\.connect\s*\(|tls\.connect\s*\(/i.test(codeOnly));
})();

// 12. approval not marked executed
(function t12() {
    console.log('Test 12: approval not marked executed');
    resetSandbox();
    const a = baseApproval({ approval_id: 'A12', recipient_email: 'a12@example.com' });
    writeApprovalQueue([a]);
    dryRunApprovedEmailSend(SANDBOX, 'A12');
    const P = getApprovalPaths(SANDBOX);
    const q = JSON.parse(fs.readFileSync(P.queueFile, 'utf-8'));
    const arr = Array.isArray(q) ? q : q.approvals;
    const after = arr.find(x => x.approval_id === 'A12');
    check('12.status unchanged', after.status === APPROVAL_STATUSES.APPROVED);
    check('12.client_send_executed false', after.client_send_executed !== true);
})();

// 13 + 14. send_job contains recipient + recipient_source
(function t13to14() {
    console.log('Test 13-14: send_job has recipient + recipient_source');
    resetSandbox();
    const a = baseApproval({ approval_id: 'A13', recipient_email: 'a13@example.com' });
    writeApprovalQueue([a]);
    const built = buildApprovedEmailSendJob(SANDBOX, 'A13');
    check('13.send_job has recipient', built.ok && typeof built.job.recipient === 'string' && built.job.recipient.length > 0);
    check('14.send_job has recipient_source', built.ok && typeof built.job.recipient_source === 'string' && built.job.recipient_source.length > 0);
})();

// resolveRecipientEmail unit: priority order
(function tUnit() {
    console.log('Unit: resolveRecipientEmail priority');
    const r1 = resolveRecipientEmail(SANDBOX, { recipient_email: 'x@y.com', recipient: 'legacy@y.com' });
    check('U.recipient_email wins over legacy', r1.ok && r1.source === 'approval.recipient_email');
    const r2 = resolveRecipientEmail(SANDBOX, {});
    check('U.empty approval rejected', r2.ok === false && r2.safe_to_send === false);
})();

// ──────────────────────────────────────────────
console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
    console.log('Failures:', failures.join(', '));
    process.exit(1);
}
process.exit(0);
