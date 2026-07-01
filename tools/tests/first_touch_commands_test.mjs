// tools/tests/first_touch_commands_test.mjs
// First Touch command API (no-send) regression: idempotency, stale-revision 409, approve-text-only !=
// approve-send, no send-ledger/transport side effects. Runs against a temp copy of the 62-lead fixture.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, 'fixtures', 'first_touch_recon', 'lead_pipeline_store_62.json');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcmd'));
const STORE = path.join(tmp, 'store.json');
fs.copyFileSync(FIXTURE, STORE);
process.env.MATER_STORE_PATH = STORE;

const cmds = (await import('../mater_controller_api/src/commercial/first_touch_commands.mjs')).default;
const { readStore } = await import('../mater_controller_api/src/shared/store_access.mjs');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('FAIL', n); } };
const rev = () => Number(readStore(STORE).store_revision) || 0;

const g = cmds.generateDraft({ leadId: 'BETON-MASTERS_RU', idempotencyKey: 'k-gen-1', expectedRevision: rev() });
ok('C1 generate draft ok', g.ok && !!g.draft_id);
ok('C2 generate no-send', g.no_send === true && g.transport_enabled === false);
const draftId = g.draft_id;

const g2 = cmds.generateDraft({ leadId: 'BETON-MASTERS_RU', idempotencyKey: 'k-gen-1', expectedRevision: null });
ok('C3 idempotent replay (same draft, no double-apply)', g2.ok && g2.draft_id === draftId && g2.idempotent === true);

let conflict = false;
try { cmds.selectSubject({ draftId, subjectId: 'subj_a', idempotencyKey: 'k-ss-stale', expectedRevision: 0 }); }
catch (e) { conflict = e.code === 'STORE_REVISION_CONFLICT'; }
ok('C4 stale revision -> 409 conflict', conflict);

const ss = cmds.selectSubject({ draftId, subjectId: 'subj_a', idempotencyKey: 'k-ss-1', expectedRevision: rev() });
ok('C5 select subject', ss.ok && ss.selected_subject_id === 'subj_a');
const sb = cmds.selectBody({ draftId, bodyId: 'body_a', idempotencyKey: 'k-sb-1', expectedRevision: rev() });
ok('C6 select body', sb.ok && sb.selected_body_id === 'body_a');

const rc = cmds.requestChanges({ draftId, note: 'короче', idempotencyKey: 'k-rc-1', expectedRevision: rev() });
ok('C7 request changes', rc.ok && rc.status === 'CHANGES_REQUESTED');

const at = cmds.approveTextOnly({ draftId, idempotencyKey: 'k-at-1', expectedRevision: rev() });
ok('C8 approve-text-only', at.ok && at.text_approved === true);
ok('C9 approve-text-only != approve-send', at.send_allowed_live === false && at.approval_token_issued === false && at.no_send === true);

const sp = cmds.selectPilot({ leadId: 'BETON-MASTERS_RU', idempotencyKey: 'k-sp-1', expectedRevision: rev() });
ok('C10 select-pilot (no transport)', sp.ok && sp.selected_pilot === 'BETON-MASTERS_RU' && sp.send_allowed_live === false);

const rj = cmds.reject({ draftId, reason: 'не то', idempotencyKey: 'k-rj-1', expectedRevision: rev() });
ok('C11 reject', rj.ok && rj.status === 'REJECTED');
const rta = cmds.returnToAudit({ draftId, idempotencyKey: 'k-rta-1', expectedRevision: rev() });
ok('C12 return-to-audit', rta.ok && rta.status === 'RETURNED_TO_AUDIT');

const mi = cmds.generateDraft({ leadId: 'DKBI_RU', expectedRevision: null });
ok('C13 missing idempotency rejected', mi.ok === false && mi.code === 'MISSING_IDEMPOTENCY');

const nf = cmds.generateDraft({ leadId: 'NO_SUCH_LEAD', idempotencyKey: 'k-nf-1', expectedRevision: rev() });
ok('C14 unknown lead rejected', nf.ok === false && nf.code === 'LEAD_NOT_FOUND');

const finStore = readStore(STORE);
ok('C15 no send ledger key added to store', !finStore.outbound_send_ledger);
ok('C16 decisions recorded as no_send', Object.values(finStore['first_touch.decisions'] || {}).every((d) => d.no_send === true));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n==== first_touch_commands: ${pass} passed, ${fail} failed ====`);
process.exit(fail === 0 ? 0 : 1);
