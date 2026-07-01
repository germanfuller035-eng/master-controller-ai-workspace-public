// pipeline_followup_reply_offline_test.mjs — PURE offline.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n); } };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fur_'));
const storePath = path.join(dir, 'store.json');
process.env.MATER_STORE_PATH = storePath;
process.env.MATER_API_SECRETS_DIR = path.join(dir, 'sec');
const p = await import('../mater_controller_api/src/pipeline/service.mjs');
const { readStore } = await import('../mater_controller_api/src/shared/store_access.mjs');

const now = new Date('2026-06-20T00:00:00Z');
const sent8d = new Date(now.getTime() - 8 * 86400000).toISOString(); // 8 days ago → D5 due, D10 not
const sent1d = new Date(now.getTime() - 1 * 86400000).toISOString();
const base = { email: 'info@x.ru', email_status: 'OFFICIAL_PAGE', send_proof_status: 'proven', last_sent_at: sent8d, status: 'waiting_reply', followup_step: 0, original_send_id: 'snd1' };

// pure planFollowup
ok('eligible at D2 (8d, step0)', p.planFollowup(base, now).status === 'ELIGIBLE' && p.planFollowup(base, now).step === 1);
ok('not due (1d, step0)', p.planFollowup({ ...base, last_sent_at: sent1d }, now).status === 'NOT_DUE');
ok('reply blocks', p.planFollowup({ ...base, reply_received: true }, now).status === 'BLOCKED_REPLY');
ok('opt-out blocks', p.planFollowup({ ...base, opt_out: true }, now).status === 'BLOCKED_OPT_OUT');
ok('bounce blocks', p.planFollowup({ ...base, email_status: 'BOUNCED' }, now).status === 'BLOCKED_BOUNCE');
ok('send-uncertain blocks', p.planFollowup({ ...base, status: 'send_uncertain' }, now).status === 'BLOCKED_SEND_UNCERTAIN');
ok('no proof blocks', p.planFollowup({ ...base, send_proof_status: null, sendProof: null }, now).status === 'BLOCKED_MISSING_PROVIDER_PROOF');
ok('history exhausted blocks', p.planFollowup({ ...base, followup_step: 3 }, now).status === 'BLOCKED_HISTORY');

// applyFollowupPlan persists DRAFT_READY + idempotent
fs.writeFileSync(storePath, JSON.stringify({ version: 1, store_revision: 1, leads: { L1: { lead_id: 'L1', company: 'X', ...base } } }, null, 2));
const f1 = p.applyFollowupPlan({ leadId: 'L1', now });
ok('followup draft_ready', f1.ok && f1.written && f1.status === 'DRAFT_READY' && f1.draft === true);
ok('followup persisted w/ draft (no send field)', !!readStore(storePath).leads.L1.followup.draft && readStore(storePath).leads.L1.followup.draft.approval_status === 'APPROVAL_PENDING');
const f2 = p.applyFollowupPlan({ leadId: 'L1', now });
ok('followup idempotent', f2.idempotent === true);

// reply draft eligibility
ok('interested eligible', p.replyDraftEligibility({ lead_id: 'L1', category: 'interested', reply_id: 'r1' }).eligible === true);
ok('opt_out blocked', p.replyDraftEligibility({ lead_id: 'L1', category: 'opt_out', reply_id: 'r2' }).eligible === false);
ok('unmatched blocked', p.replyDraftEligibility({ lead_id: 'UNMATCHED:x', category: 'interested', reply_id: 'r3' }).eligible === false);
ok('unknown blocked', p.replyDraftEligibility({ lead_id: 'L1', category: 'unknown', reply_id: 'r4' }).eligible === false);

// applyReplyDraft persists + idempotent; price for asks_price
const rd1 = p.applyReplyDraft({ leadId: 'L1', reply: { reply_id: 'r10', category: 'asks_price', subject: 'вопрос', confidence: 0.8 } });
ok('reply draft created', rd1.ok && rd1.written);
ok('reply draft has price', /₽/.test(readStore(storePath).leads.L1.reply_drafts[0].body));
ok('reply draft approval pending', readStore(storePath).leads.L1.reply_drafts[0].approval_status === 'APPROVAL_PENDING');
const rd2 = p.applyReplyDraft({ leadId: 'L1', reply: { reply_id: 'r10', category: 'asks_price', subject: 'вопрос' } });
ok('reply draft idempotent', rd2.idempotent === true);
const rdBlocked = p.applyReplyDraft({ leadId: 'L1', reply: { reply_id: 'r11', category: 'spam' } });
ok('spam reply → no draft', rdBlocked.ok === false && rdBlocked.code === 'REPLY_DRAFT_BLOCKED');

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n==== pipeline_followup_reply: ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
