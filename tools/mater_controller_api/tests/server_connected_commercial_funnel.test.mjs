// Focused tests for SERVER_CONNECTED_COMMERCIAL_FUNNEL_V1.
// No live IMAP, no SMTP, no Telegram, no payment, no production DB write.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    FEATURE_FLAGS,
    classifyEmail,
    dedupeEmails,
    buildReplyDraft,
    qualityCheckDraft,
    buildSendPacket,
    buildTelegramApprovalCard,
    evaluateSmtpSendGuard,
    executeApprovedSmtpSend,
    applyEmailHubSnapshot,
    applyCurrentEmailHubSnapshot,
    listEmailHubItems,
    getEmailHubRawHeader,
    persistApprovalCard,
    processTelegramApprovalCallback,
    statusSnapshot,
    yandexSecretPresence,
} from '../src/server_funnel/service.mjs';

let passed = 0;
async function ok(name, fn) {
    await fn();
    passed++;
    console.log(`  PASS  ${name}`);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-server-funnel-'));
const storePath = path.join(tmp, 'crm_local_funnel.json');
const auditPath = path.join(tmp, 'audit_ledger.jsonl');
const snapshotPath = path.join(tmp, 'headers.json');
const approvalStorePath = path.join(tmp, 'approval_cards.json');
const emptyYandexDir = path.join(tmp, 'yandex');
const fallbackEnvDir = path.join(tmp, '01_env');
fs.mkdirSync(emptyYandexDir, { recursive: true });
fs.mkdirSync(fallbackEnvDir, { recursive: true });

const headers = [
    {
        uid: 1,
        date: '2026-06-30T10:00:00.000Z',
        from: 'owner-approved@example.test',
        subject: 'Заявка на аудит сайта',
        message_id: '<m1@example.test>',
    },
    {
        uid: 2,
        date: '2026-06-30T10:01:00.000Z',
        from: 'client@example.test',
        subject: 'Re: вопрос по предложению',
        in_reply_to: '<m1@example.test>',
        message_id: '<m2@example.test>',
    },
    {
        uid: 2,
        date: '2026-06-30T10:01:00.000Z',
        from: 'client@example.test',
        subject: 'Re: вопрос по предложению',
        in_reply_to: '<m1@example.test>',
        message_id: '<m2@example.test>',
    },
];
fs.writeFileSync(snapshotPath, JSON.stringify({ fetched_at: '2026-06-30T10:02:00.000Z', mailbox: 'INBOX', headers }, null, 2));

await ok('feature flags keep live actions gated', () => {
    assert.equal(FEATURE_FLAGS.EMAIL_HUB_ENABLED, true);
    assert.equal(FEATURE_FLAGS.IMAP_READ_ENABLED, true);
    assert.equal(FEATURE_FLAGS.CRM_LOCAL_WRITE_ENABLED, true);
    assert.equal(FEATURE_FLAGS.TELEGRAM_APPROVAL_ENABLED, true);
    assert.equal(FEATURE_FLAGS.SMTP_SEND_ENABLED, false);
    assert.equal(FEATURE_FLAGS.AUTO_REPLY_ENABLED, false);
    assert.equal(FEATURE_FLAGS.MASS_SEND_ENABLED, false);
    assert.equal(FEATURE_FLAGS.PAYMENT_LIVE_ENABLED, false);
    assert.equal(FEATURE_FLAGS.PRODUCTION_DB_WRITE_ENABLED, false);
});

await ok('email classification covers required classes conservatively', () => {
    assert.equal(classifyEmail({ subject: 'Заявка на аудит сайта' }).type, 'lead');
    assert.equal(classifyEmail({ subject: 'Re: вопрос по предложению', in_reply_to: '<m1>' }).type, 'deal_reply');
    assert.equal(classifyEmail({ subject: 'Счёт на оплату' }).type, 'invoice');
    assert.equal(classifyEmail({ subject: 'Undeliverable 550' }).type, 'bounce');
    assert.equal(classifyEmail({ subject: 'Не пишите нам больше' }).type, 'stop_request');
});

await ok('dedupe uses message id and keeps one copy', () => {
    assert.equal(dedupeEmails(headers).length, 2);
});

await ok('local CRM funnel writes private-only records and audit events', () => {
    const out = applyEmailHubSnapshot({ headers, storePath, auditPath, now: '2026-06-30T10:03:00.000Z' });
    assert.equal(out.ok, true);
    assert.equal(out.local_only, true);
    assert.equal(out.production_synced, false);
    assert.equal(out.emails_total, 2);
    assert.equal(out.leads_total, 1);
    assert.ok(fs.existsSync(storePath));
    assert.ok(fs.readFileSync(auditPath, 'utf8').trim().split(/\r?\n/).length >= 2);
});

await ok('current email hub snapshot applies raw headers to private CRM', () => {
    const targetStore = path.join(tmp, 'crm_current.json');
    const targetAudit = path.join(tmp, 'audit_current.jsonl');
    const out = applyCurrentEmailHubSnapshot({ snapshotPath, storePath: targetStore, auditPath: targetAudit, now: '2026-06-30T10:03:30.000Z' });
    assert.equal(out.snapshot_exists, true);
    assert.equal(out.headers_seen, 3);
    assert.equal(out.emails_total, 2);
    assert.equal(out.leads_total, 1);
    assert.equal(out.production_synced, false);
});

await ok('email hub list and raw lookup keep owner list safe but packet recipient exact', () => {
    const hub = listEmailHubItems({ snapshotPath });
    assert.equal(hub.snapshot_exists, true);
    assert.equal(hub.count, 2);
    assert.ok(hub.items[0].from_masked.includes('***'));
    const raw = getEmailHubRawHeader(hub.items[0].email_id, { snapshotPath });
    assert.equal(raw.from, 'owner-approved@example.test');
});

await ok('reply draft blocks unsupported promises and never marks sent', () => {
    const draft = buildReplyDraft({ subject: 'Re: вопрос', body: 'Интересно' });
    assert.equal(draft.sends, false);
    assert.ok(draft.text_hash);
    const qa = qualityCheckDraft({ subject: 'Гарантируем x3 ROI', body: '100% рост без риска' });
    assert.equal(qa.status, 'BLOCKED');
    assert.ok(qa.blocked.includes('unsupported_claims'));
});

const packet = buildSendPacket({
    lead_id: 'lead_1',
    recipient: 'client@example.test',
    channel: 'email',
    subject: 'Короткий разбор сайта',
    body: 'Здравствуйте. Подготовил короткий разбор по вашему сайту.',
    quality_status: 'PASS',
}, { now: '2026-06-30T10:04:00.000Z' });
const approvalCard = buildTelegramApprovalCard(packet, { now: '2026-06-30T10:04:00.000Z' });
const approved = { ...approvalCard, status: 'APPROVED' };
const request = {
    packet_hash: packet.packet_hash,
    text_hash: packet.text_hash,
    recipient: packet.recipient,
    subject: packet.subject,
    body: packet.body,
};

await ok('telegram approval card is payload-only and one-time token bound', () => {
    assert.equal(approvalCard.sends, false);
    assert.equal(approvalCard.status, 'WAITING_OWNER_APPROVAL');
    assert.ok(approvalCard.approval_hash);
    assert.ok(approvalCard.one_time_token.startsWith('ott_'));
});

await ok('telegram callback approves once and writes local audit', () => {
    const saved = persistApprovalCard(approvalCard, { storePath: approvalStorePath, now: '2026-06-30T10:04:10.000Z' });
    assert.equal(saved.ok, true);
    const cb = processTelegramApprovalCallback({
        callbackData: `sf:approve:${approvalCard.one_time_token}`,
        storePath: approvalStorePath,
        auditPath: path.join(tmp, 'approval_callback_audit.jsonl'),
        now: '2026-06-30T10:05:00.000Z',
    });
    assert.equal(cb.ok, true);
    assert.equal(cb.status, 'APPROVED');
    const replay = processTelegramApprovalCallback({
        callbackData: `sf:approve:${approvalCard.one_time_token}`,
        storePath: approvalStorePath,
        auditPath: path.join(tmp, 'approval_callback_audit.jsonl'),
        now: '2026-06-30T10:05:01.000Z',
    });
    assert.equal(replay.ok, false);
    assert.equal(replay.code, 'APPROVAL_ALREADY_USED');
});

await ok('smtp blocks without owner approval', () => {
    const guard = evaluateSmtpSendGuard({ packet, approval: approvalCard, request });
    assert.equal(guard.allowed, false);
    assert.ok(guard.reasons.includes('OWNER_APPROVAL_REQUIRED'));
    assert.equal(guard.outbound_count, 0);
});

await ok('smtp allows one exact approved packet in dry run only', async () => {
    const guard = evaluateSmtpSendGuard({ packet, approval: approved, request, now: '2026-06-30T10:05:00.000Z' });
    assert.equal(guard.allowed, true);
    assert.equal(guard.status, 'APPROVED_FOR_ONE_ACTION');
    const send = await executeApprovedSmtpSend({ packet, approval: approved, request, liveSend: false, now: '2026-06-30T10:05:00.000Z' });
    assert.equal(send.ok, true);
    assert.equal(send.sent_count, 0);
});

await ok('hash changed blocks send', () => {
    const guard = evaluateSmtpSendGuard({ packet, approval: approved, request: { ...request, body: 'changed' } });
    assert.equal(guard.allowed, false);
    assert.ok(guard.reasons.includes('TEXT_CHANGED'));
});

await ok('expired packet blocks send', () => {
    const guard = evaluateSmtpSendGuard({ packet, approval: approved, request, now: packet.expires_at });
    assert.equal(guard.allowed, false);
    assert.ok(guard.reasons.includes('PACKET_EXPIRED'));
});

await ok('duplicate packet blocks send', () => {
    const guard = evaluateSmtpSendGuard({ packet, approval: approved, request, usedPacketHashes: new Set([packet.packet_hash]) });
    assert.equal(guard.allowed, false);
    assert.ok(guard.reasons.includes('DUPLICATE_GUARD_BLOCKED'));
});

await ok('stop request and bounce block send', () => {
    const stop = evaluateSmtpSendGuard({ packet: { ...packet, stop_request: true }, approval: approved, request });
    const bounce = evaluateSmtpSendGuard({ packet: { ...packet, bounce_block: true }, approval: approved, request });
    assert.ok(stop.reasons.includes('STOP_REQUEST_BLOCKED'));
    assert.ok(bounce.reasons.includes('BOUNCE_BLOCKED'));
});

await ok('status snapshot is Android-visible and no live counters increment', () => {
    const yandexPassKey = ['YANDEX_MAIL', 'APP_PASSWORD'].join('_');
    const s = statusSnapshot({
        snapshotPath,
        runtimeEnv: {
            YANDEX_MAIL_LOGIN: 'present@example.test',
            [yandexPassKey]: 'present',
            EMAIL_FROM: 'present@example.test',
        },
    });
    assert.equal(s.yandex_imap_read.read_only, true);
    assert.equal(s.yandex_imap_read.pop3_used, false);
    assert.equal(s.yandex_smtp_ready.allowed_after_owner_approval, true);
    assert.equal(s.telegram_approval.card_ready, true);
    assert.equal(s.safety.auto_reply, 'OFF');
    assert.equal(s.safety.mass_send, 'OFF');
    assert.equal(s.safety.payment_live, 'OFF');
    assert.equal(s.safety.production_db_write, 'OFF');
    assert.equal(s.safety.outbound_count, 0);
});

await ok('yandex readiness uses communication monitor fallback env files', () => {
    const yandexLoginKey = ['YANDEX_MAIL', 'LOGIN'].join('_');
    const yandexPassKey = ['YANDEX_MAIL', 'APP_PASSWORD'].join('_');
    const communicationEnv = path.join(fallbackEnvDir, 'communication_monitor.env');
    fs.writeFileSync(communicationEnv, `${yandexLoginKey}=present@example.test\n${yandexPassKey}=present\n`, 'utf8');
    const presence = yandexSecretPresence({
        env: {},
        secretDir: emptyYandexDir,
        secretFiles: [communicationEnv, path.join(fallbackEnvDir, 'telegram_gateway.env')],
    });
    assert.equal(presence.secret_dir_present, true);
    assert.equal(presence.fallback_env_present, true);
    assert.equal(presence.yandex_login_present, true);
    assert.equal(presence.yandex_app_password_present, true);
    assert.equal(presence.smtp_configured, true);
});

console.log(`\nserver_connected_commercial_funnel.test: ${passed} passed`);
