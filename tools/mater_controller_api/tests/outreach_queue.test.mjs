// Focused tests for owner outreach queue.
// No network, no real SMTP, no payment, no production DB write.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-outreach-'));
const storePath = path.join(tmp, 'lead_pipeline_store.json');
const ledgerPath = path.join(tmp, 'outbound_send_ledger.jsonl');
process.env.MATER_STORE_PATH = storePath;
process.env.MATER_OUTREACH_LEDGER_PATH = ledgerPath;
process.env.MATER_ALLOW_MOCK_OUTREACH_SEND = 'true';
process.env.MATER_NO_SEND = 'true';
process.env.EMAIL_REAL_SEND_ENABLED = 'false';

fs.writeFileSync(storePath, JSON.stringify({
    version: 1,
    store_revision: 1,
    leads: {
        READY_1: {
            lead_id: 'READY_1',
            status: 'audit_ready',
            company: 'Ready Company',
            website: 'https://ready.example.test',
            industry: 'производство мебели',
            region: 'Краснодар',
            email: 'client@synthetic-mail.ru',
            email_source: 'manual_verified',
            email_verified: true,
            source: 'test',
            discovered_at: '2026-06-30T08:00:00.000Z',
            score: { overall_priority_score: 81 },
        },
        NO_CONTACT: {
            lead_id: 'NO_CONTACT',
            status: 'hold_no_public_email',
            company: 'No Contact',
            website: 'https://nocontact.example.test',
            source: 'test',
        },
        OPT_OUT: {
            lead_id: 'OPT_OUT',
            status: 'audit_ready',
            company: 'Opt Out',
            website: 'https://optout.example.test',
            email: 'stop@synthetic-mail.ru',
            opt_out: true,
            source: 'test',
        },
        BAD_EMAIL: {
            lead_id: 'BAD_EMAIL',
            status: 'audit_ready',
            company: 'Bad Email',
            website: 'https://bad-email.example.test',
            email: 'not-an-email',
            email_source: 'manual_unverified',
            source: 'test',
        },
        ALT_KEY_ONLY: {
            id: 'ALT_ID_ONLY',
            status: 'audit_ready',
            company: 'Alt Key Company',
            website: 'https://alt-key.example.test',
            industry: 'строительные услуги',
            email: 'alt@example.test',
            email_source: 'manual_verified',
            email_verified: true,
            source: 'test',
        },
    },
}, null, 2));
fs.writeFileSync(ledgerPath, '', 'utf8');

const outreach = await import('../src/commercial/outreach_queue.mjs');

let passed = 0;
async function ok(name, fn) {
    await fn();
    passed++;
    console.log(`  PASS  ${name}`);
}

await ok('queue shows ready and blocked leads with owner-readable blockers', () => {
    const q = outreach.queue({ limit: 10 });
    assert.equal(q.total, 5);
    assert.equal(q.ready_count, 2);
    const ready = q.items.find((x) => x.lead_id === 'READY_1');
    const noContact = q.items.find((x) => x.lead_id === 'NO_CONTACT');
    const badEmail = q.items.find((x) => x.lead_id === 'BAD_EMAIL');
    assert.equal(ready.readiness.ready, true);
    assert.equal(ready.draft_subject.includes('Ready Company'), true);
    assert.equal(noContact.readiness.ready, false);
    assert.ok(noContact.readiness.blockers.includes('CONTACT_MISSING'));
    assert.ok(badEmail.readiness.blockers.includes('RECIPIENT_INVALID'));
});

await ok('draft save changes text marker and keeps quality visible', () => {
    const before = outreach.detail('READY_1').draft.text_marker;
    const saved = outreach.saveDraft({
        leadId: 'READY_1',
        subject: 'Короткий разбор сайта Ready Company',
        body: 'Здравствуйте.\n\nПосмотрел сайт. Без обещаний результата: только наблюдения.\nКому удобнее передать разбор?\n\nЕсли обращения не нужны, ответьте одним словом, и я больше не напишу.',
        operationId: 'draft-1',
    });
    assert.equal(saved.ok, true);
    assert.notEqual(saved.draft.text_marker, before);
    assert.equal(saved.draft.quality.status, 'PASS');
});

await ok('draft save resolves object-store leads by id, not only lead_id', () => {
    const opened = outreach.detail('ALT_ID_ONLY');
    assert.equal(opened.company_name, 'Alt Key Company');
    const saved = outreach.saveDraft({
        leadId: 'ALT_ID_ONLY',
        subject: 'Короткий разбор сайта Alt Key Company',
        body: 'Здравствуйте.\n\nСохраняю проверенный черновик без отправки клиенту.\n\nЕсли актуально, ответьте на это письмо.',
        operationId: 'draft-alt-id',
    });
    assert.equal(saved.ok, true);
    assert.equal(saved.draft.subject.includes('Alt Key Company'), true);
    assert.match(saved.draft.body, /Если обращения не нужны/);
    assert.equal(saved.draft.quality.status, 'PASS');
});

await ok('unsupported claims block send', async () => {
    const out = await outreach.sendOne({
        leadId: 'READY_1',
        exactRecipient: 'client@synthetic-mail.ru',
        exactSubject: 'Гарантируем x3 ROI',
        exactBody: 'Здравствуйте. Гарантируем 100% рост без риска.',
        ownerConfirmation: true,
        provider: 'mock',
        operationId: 'send-bad',
    });
    assert.equal(out.ok, false);
    assert.equal(out.code, 'QUALITY_BLOCKED');
});

await ok('live provider is blocked when real send flag is off', async () => {
    const d = outreach.detail('READY_1').draft;
    const out = await outreach.sendOne({
        leadId: 'READY_1',
        exactRecipient: 'client@synthetic-mail.ru',
        exactSubject: d.subject,
        exactBody: d.body,
        ownerConfirmation: true,
        provider: 'live',
        operationId: 'send-live-off',
    });
    assert.equal(out.ok, false);
    assert.equal(out.code, 'LIVE_SEND_DISABLED');
});

await ok('mock provider sends exactly one and records duplicate guard in temp ledger', async () => {
    const d = outreach.detail('READY_1').draft;
    const out = await outreach.sendOne({
        leadId: 'READY_1',
        exactRecipient: 'client@synthetic-mail.ru',
        exactSubject: d.subject,
        exactBody: d.body,
        ownerConfirmation: true,
        provider: 'mock',
        operationId: 'send-good',
    });
    assert.equal(out.ok, true);
    assert.equal(out.sent_count, 1);
    const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    assert.equal(store.leads.READY_1.status, 'waiting_reply');
    assert.equal(store.leads.READY_1.outreach.send_status, 'SENT');
    const ledgerLines = fs.readFileSync(ledgerPath, 'utf8').trim().split(/\r?\n/).filter(Boolean);
    assert.equal(ledgerLines.length, 1);
});

await ok('duplicate send is blocked', async () => {
    const d = outreach.detail('READY_1').draft;
    const out = await outreach.sendOne({
        leadId: 'READY_1',
        exactRecipient: 'client@synthetic-mail.ru',
        exactSubject: d.subject,
        exactBody: d.body,
        ownerConfirmation: true,
        provider: 'mock',
        operationId: 'send-dup',
    });
    assert.equal(out.ok, false);
    assert.equal(out.code, 'SEND_BLOCKED');
    assert.ok(out.blockers.includes('ALREADY_SENT'));
});

await ok('invalid email is blocked before provider path', async () => {
    const d = outreach.detail('BAD_EMAIL').draft;
    const out = await outreach.sendOne({
        leadId: 'BAD_EMAIL',
        exactRecipient: 'not-an-email',
        exactSubject: d.subject,
        exactBody: d.body,
        ownerConfirmation: true,
        provider: 'mock',
        operationId: 'send-invalid-email',
    });
    assert.equal(out.ok, false);
    assert.equal(out.code, 'SEND_BLOCKED');
    assert.ok(out.blockers.includes('RECIPIENT_INVALID'));
});

await ok('postpone and reject write owner decisions only', () => {
    const hold = outreach.decide({ leadId: 'NO_CONTACT', decision: 'POSTPONE', reason: 'нет контакта', operationId: 'hold-1' });
    const reject = outreach.decide({ leadId: 'OPT_OUT', decision: 'REJECT', reason: 'do not contact', operationId: 'reject-1' });
    assert.equal(hold.ok, true);
    assert.equal(hold.decision, 'HOLD');
    assert.equal(reject.ok, true);
    assert.equal(reject.decision, 'REJECT');
});

await ok('stats keep live actions explicit', () => {
    const s = outreach.stats();
    assert.equal(s.sent_count, 1);
    assert.equal(s.auto_send, 'OFF');
    assert.equal(s.mass_send, 'OFF');
    assert.equal(s.payments, 'OFF');
    assert.equal(s.production_db_write, 'OFF');
});

console.log(`\noutreach_queue.test: ${passed} passed`);
