// telegram_v1_mini_audit_system_offline_test.mjs
// V1 Telegram-Controlled Mini Audit System — OFFLINE test harness.
//
// SAFETY CONTRACT:
//   - 100% offline. NO Telegram API, NO network, NO PowerShell, NO token read,
//     NO .env / AI_SECRETS read, NO real send, NO real import, NO queue write,
//     NO approval_queue write, NO canonical leads write, NO scheduled task.
//   - Exercises the four pure V1 modules + verifies the master bot wiring and
//     T1/T1B/T2 safety invariants by static source inspection only.
//
// Exit code 0 = all green, 1 = any failure.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    classifyAuditCommand,
    handleAuditCommand,
    getTopLeads,
    findTop1,
    formatNotFound,
} from '../telegram_gateway/telegram_mini_audit_cockpit.mjs';

import {
    classifyDraftCommand,
    handleDraftCommand,
    buildDraft,
    SEND_BLOCKED_MISSING_RECIPIENT,
} from '../telegram_gateway/telegram_outbound_draft_center.mjs';

import {
    classifySendCommand,
    processApproval,
    buildSendLogEntry,
    SEND_ADAPTER_NOT_CONFIGURED,
    SEND_BLOCKED_NO_DRAFT,
    SEND_BLOCKED_NO_PREVIEW,
    SEND_BLOCKED_NOT_OWNER,
    SEND_BLOCKED_AUTOSEND,
    SEND_BLOCKED_RATE_LIMIT,
} from '../telegram_gateway/telegram_approved_send_controller.mjs';

import {
    classifyScoutCommand,
    buildScoutReport,
    handleScoutCommand,
    L1_PROVIDER_NOT_CONFIGURED,
    SCOUT_OUTPUT_DIR,
} from '../telegram_gateway/telegram_daily_lead_scout_l1.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE = path.resolve(__dirname, '..', '..');

const FIXTURE_LEADS = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', 'telegram_v1', 'top_leads.json'), 'utf8'),
);

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond) {
    if (cond) {
        pass++;
        console.log(`  ✅ ${name}`);
    } else {
        fail++;
        failures.push(name);
        console.log(`  ❌ ${name}`);
    }
}

function section(title) {
    console.log(`\n=== ${title} ===`);
}

// ---------------------------------------------------------------------------
// 1. MINI AUDIT COCKPIT
// ---------------------------------------------------------------------------
section('1. Mini Audit Cockpit');

ok('/audit → cockpit', classifyAuditCommand('/audit') === 'cockpit');
ok('/audit_top → top', classifyAuditCommand('/audit_top') === 'top');
ok('"что по лидам" recognized', classifyAuditCommand('что по лидам') === 'leads');
ok('"топ лиды" recognized', classifyAuditCommand('топ лиды') === 'top');
ok('💰 Mini Audit hotkey recognized', classifyAuditCommand('💰 Mini Audit') === 'cockpit');

const cockpitText = handleAuditCommand('cockpit', { leads: FIXTURE_LEADS });
ok('/audit cockpit renders text', typeof cockpitText === 'string' && cockpitText.includes('Cockpit'));

const topText = handleAuditCommand('top', { leads: FIXTURE_LEADS });
ok('/audit_top shows TOP leads', topText.includes('ЖЕЛЕЗОБЕТОН') && topText.includes('zb23.ru'));

const top1 = findTop1({ leads: FIXTURE_LEADS });
ok('TOP-1 found in fixtures (№002 zb23.ru)', !!top1 && top1.lead_id === '002' && top1.website === 'zb23.ru');

const leadsRes = getTopLeads({ leads: FIXTURE_LEADS });
ok('KЖБИ №001 present', leadsRes.leads.some((l) => l.lead_id === '001' && /КЖБИ/.test(l.company)));
ok('ГБИ Ресурс №003 present', leadsRes.leads.some((l) => l.lead_id === '003'));

const emptyRes = getTopLeads({ leads: [] });
ok('empty dataset → NOT_FOUND', emptyRes.ok === false && emptyRes.code === 'NOT_FOUND');
ok('formatNotFound mentions NOT_FOUND', formatNotFound().includes('NOT_FOUND'));

ok('cockpit status shows Telegram-controlled only', handleAuditCommand('status').includes('Telegram-controlled only'));
ok('cockpit status shows autosend BLOCKED', handleAuditCommand('status').includes('BLOCKED'));
ok('cockpit status shows import FROZEN', handleAuditCommand('status').includes('FROZEN'));

// ---------------------------------------------------------------------------
// 2. OUTBOUND DRAFT CENTER
// ---------------------------------------------------------------------------
section('2. Outbound Draft Center');

ok('/audit_draft top1 → draft', JSON.stringify(classifyDraftCommand('/audit_draft top1')) === JSON.stringify({ action: 'draft', target: 'top1' }));
ok('/audit_preview top1 → preview', classifyDraftCommand('/audit_preview top1').action === 'preview');
ok('"подготовь письмо топ 1" recognized', classifyDraftCommand('подготовь письмо топ 1').action === 'draft');
ok('"preview топ 1" recognized', classifyDraftCommand('preview топ 1').action === 'preview');

const draftParsed = classifyDraftCommand('/audit_draft top1');
const draftOut = handleDraftCommand(draftParsed, { leads: FIXTURE_LEADS, recipient: 'info@zb23.ru' });
ok('draft creates preview object', draftOut && draftOut.draft && draftOut.draft.ok === true);
ok('draft body contains zb23.ru', draftOut.draft.body.includes('zb23.ru'));
ok('draft has draft_id', typeof draftOut.draft.draft_id === 'string' && draftOut.draft.draft_id.length > 0);
ok('draft subject correct', draftOut.draft.subject === 'Короткий разбор сайта zb23.ru');
ok('draft does NOT send (no send_result)', !('send_result' in draftOut.draft));

// C1 PREVIEW_READY: when a contact is resolved (offline fixture / injected),
// the draft becomes PREVIEW_READY and the recipient is populated. The legacy
// SEND_BLOCKED_MISSING_RECIPIENT must NOT appear in this case.
const draftResolved = buildDraft('top1', { leads: FIXTURE_LEADS });
ok('C1: contact resolved → PREVIEW_READY', draftResolved.send_status === 'PREVIEW_READY');
ok('C1: recipient present after resolve', typeof draftResolved.recipient === 'string' && draftResolved.recipient.length > 0);
ok('C1: PREVIEW_READY is not SEND_BLOCKED_MISSING_RECIPIENT', draftResolved.send_status !== SEND_BLOCKED_MISSING_RECIPIENT);

// Missing-recipient scenario preserved: with resolve:false and no recipient,
// no contact is available, so SEND_BLOCKED_MISSING_RECIPIENT MUST remain.
const draftNoRecipient = buildDraft('top1', { leads: FIXTURE_LEADS, resolve: false });
ok('no-contact → SEND_BLOCKED_MISSING_RECIPIENT', draftNoRecipient.send_status === SEND_BLOCKED_MISSING_RECIPIENT);
ok('preview still renders without recipient', draftOut.text.length > 0);

// ---------------------------------------------------------------------------
// 3. APPROVED SEND CONTROLLER
// ---------------------------------------------------------------------------
section('3. Approved Send Controller');

const validDraft = buildDraft('top1', { leads: FIXTURE_LEADS, recipient: 'info@zb23.ru' });

ok('/audit_send_approve <id> classified', classifySendCommand(`/audit_send_approve ${validDraft.draft_id}`).action === 'approve');
ok('/audit_send_reject <id> classified', classifySendCommand(`/audit_send_reject ${validDraft.draft_id}`).action === 'reject');
ok('"одобряю отправку <id>" classified', classifySendCommand(`одобряю отправку ${validDraft.draft_id}`).action === 'approve');

// approve without draft_id → blocked
const bareApprove = processApproval({ action: 'approve', draft_id: '' }, { isOwner: true });
ok('approve without draft_id blocked', bareApprove.ok === false && bareApprove.code === SEND_BLOCKED_NO_DRAFT);

// non-owner refused
const nonOwner = processApproval({ action: 'approve', draft_id: validDraft.draft_id }, { isOwner: false, draft: validDraft });
ok('non-owner refused', nonOwner.ok === false && nonOwner.code === SEND_BLOCKED_NOT_OWNER);

// no preview → blocked
const noPreview = processApproval({ action: 'approve', draft_id: validDraft.draft_id }, { isOwner: true });
ok('no preview → blocked', noPreview.ok === false && noPreview.code === SEND_BLOCKED_NO_PREVIEW);

// no recipient → blocked (resolve:false forces a genuine no-contact case)
const noRecipientDraft = buildDraft('top1', { leads: FIXTURE_LEADS, resolve: false });
const noRecipient = processApproval({ action: 'approve', draft_id: noRecipientDraft.draft_id }, { isOwner: true, draft: noRecipientDraft });
ok('no recipient → blocked', noRecipient.ok === false && noRecipient.code === SEND_BLOCKED_MISSING_RECIPIENT);

// no adapter → SEND_ADAPTER_NOT_CONFIGURED
const noAdapter = processApproval({ action: 'approve', draft_id: validDraft.draft_id }, { isOwner: true, draft: validDraft });
ok('no adapter → SEND_ADAPTER_NOT_CONFIGURED', noAdapter.ok === false && noAdapter.code === SEND_ADAPTER_NOT_CONFIGURED);
ok('log_entry prepared but not written', noAdapter.log_entry && noAdapter.log_entry.send_result === SEND_ADAPTER_NOT_CONFIGURED);

// max one message per approval
const rateLimited = processApproval(
    { action: 'approve', draft_id: validDraft.draft_id },
    { isOwner: true, draft: validDraft, alreadySentInThisApproval: true },
);
ok('max one message per approval', rateLimited.ok === false && rateLimited.code === SEND_BLOCKED_RATE_LIMIT);

// autosend blocked
const autosend = processApproval(
    { action: 'approve', draft_id: validDraft.draft_id },
    { isOwner: true, draft: validDraft, autosend: true },
);
ok('autosend blocked', autosend.ok === false && autosend.code === SEND_BLOCKED_AUTOSEND);

// reject works with draft_id
const rejectOut = processApproval({ action: 'reject', draft_id: validDraft.draft_id }, { isOwner: true });
ok('reject with draft_id ok', rejectOut.ok === true && rejectOut.code === 'REJECTED');

// buildSendLogEntry shape
const logEntry = buildSendLogEntry(validDraft, {});
ok('buildSendLogEntry has required fields', logEntry && logEntry.timestamp && 'lead_id' in logEntry && 'body_hash' in logEntry && logEntry.approved_by === 'Dmitry');

// ---------------------------------------------------------------------------
// 4. DAILY 100 LEAD SCOUT L1
// ---------------------------------------------------------------------------
section('4. Daily 100 Lead Scout L1');

ok('/lead_scout_100 → scout100', classifyScoutCommand('/lead_scout_100') === 'scout100');
ok('/daily100 → scout100', classifyScoutCommand('/daily100') === 'scout100');
ok('"найди 100 лидов" → scout100', classifyScoutCommand('найди 100 лидов') === 'scout100');
ok('/lead_scout → scout', classifyScoutCommand('/lead_scout') === 'scout');

const scoutNoProvider = buildScoutReport('scout100', {});
ok('no provider → L1_REPORT_ONLY_PROVIDER_NOT_CONFIGURED', scoutNoProvider.ok === false && scoutNoProvider.code === L1_PROVIDER_NOT_CONFIGURED);
ok('scout mode report-only', scoutNoProvider.mode === 'report-only');
ok('no import performed', scoutNoProvider.import_performed === false);
ok('no send performed', scoutNoProvider.send_performed === false);
ok('no canonical write', scoutNoProvider.canonical_write === false);
ok('output dir is scout_reports only', SCOUT_OUTPUT_DIR === '13_sales/daily_lead_factory/output/scout_reports');

const scoutWithFixture = buildScoutReport('scout100', {
    rows: [{ company: 'Test ЖБИ', website: 'test.ru', niche: 'ЖБИ', region: 'РФ', score: 70 }],
    dateStamp: '2026-06-06',
});
ok('fixture rows force import_allowed=false', scoutWithFixture.rows[0].import_allowed === false);
ok('fixture rows force send_allowed=false', scoutWithFixture.rows[0].send_allowed === false);
ok('suggested output path under scout_reports', scoutWithFixture.suggested_output_file.startsWith(SCOUT_OUTPUT_DIR));

const scoutOut = handleScoutCommand('scout100', {});
ok('scout report-only text shows status', scoutOut.text.includes('report-only'));

// ---------------------------------------------------------------------------
// 5. SAFETY INVARIANTS (static source inspection)
// ---------------------------------------------------------------------------
section('5. Safety invariants (static source inspection)');

const TG_DIR = path.join(WORKSPACE, 'tools', 'telegram_gateway');
const botSrc = fs.readFileSync(path.join(TG_DIR, 'telegram_master_bot.mjs'), 'utf8');

const v1Modules = [
    'telegram_mini_audit_cockpit.mjs',
    'telegram_outbound_draft_center.mjs',
    'telegram_approved_send_controller.mjs',
    'telegram_daily_lead_scout_l1.mjs',
];
const v1Src = v1Modules.map((m) => fs.readFileSync(path.join(TG_DIR, m), 'utf8')).join('\n');

// V1 pure modules must not import network/telegram/secrets.
ok('V1 modules: no fetch(', !/\bfetch\s*\(/.test(v1Src));
ok('V1 modules: no node-telegram / bot token', !/getMe|sendMessage|api\.telegram\.org|TELEGRAM_BOT_TOKEN/.test(v1Src));
ok('V1 modules: no process.env read', !/process\.env/.test(v1Src));
ok('V1 modules: no child_process', !/child_process/.test(v1Src));
ok('V1 modules: no .env / AI_SECRETS read', !/AI_SECRETS|readFileSync\([^)]*\.env/.test(v1Src));

// Master bot must still route core commands and not be hijacked.
ok('bot still handles /ping', /\/ping/.test(botSrc));
ok('bot still handles /health', /\/health/.test(botSrc));
ok('bot still handles /today', /\/today/.test(botSrc));
ok('bot references /lead_import_prepare (still gated)', /lead_import_prepare/.test(botSrc));

// V1 audit/scout routes are owner-gated in the bot.
ok('bot owner-gates v1 audit', /v1_audit_owner_blocked/.test(botSrc));
ok('bot owner-gates v1 scout', /v1_scout_owner_blocked/.test(botSrc));

// D3C freeze marker still present in bot source.
ok('D3C freeze marker present', /D3|freeze|disabled by safety gate/i.test(botSrc));

// V1 modules must not write canonical leads / approval_queue / lead_contacts.
// We inspect a comment-stripped copy of the source so that safety-contract
// comments (which legitimately mention these names while DECLARING the ban)
// do not produce false positives. Only real code references are checked.
const v1Code = v1Src
  .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // line comments (keep url-ish ://)
ok('V1 modules: no approval_queue write', !/approval_queue/.test(v1Code));
ok('V1 modules: no lead_contacts write', !/lead_contacts/.test(v1Code));

ok('V1 modules: no canonical leads write path', !/canonical.*\.json/i.test(v1Src) || !/writeFileSync/.test(v1Src));

// T1/T1B/T2 protected files exist and are imported (not rewritten by this build).
const protectedFiles = [
    'telegram_hotkey_menu.mjs',
    'telegram_text_voice_intent_router.mjs',
    'telegram_ops_executor.mjs',
];
for (const f of protectedFiles) {
    ok(`protected file present: ${f}`, fs.existsSync(path.join(TG_DIR, f)));
}

// scout_reports output dir exists (allowed write target), but test writes nothing there.
const scoutDirAbs = path.join(WORKSPACE, '13_sales', 'daily_lead_factory', 'output', 'scout_reports');
ok('scout_reports dir exists (allowed target)', fs.existsSync(scoutDirAbs));

// ---------------------------------------------------------------------------
// SUMMARY
// ---------------------------------------------------------------------------
section('SUMMARY');
console.log(`\nPASS: ${pass}  FAIL: ${fail}`);
if (fail > 0) {
    console.log('FAILURES:');
    failures.forEach((f) => console.log(`  - ${f}`));
    console.log('\nRESULT: RED');
    process.exit(1);
}
console.log('\nRESULT: GREEN');
process.exit(0);
