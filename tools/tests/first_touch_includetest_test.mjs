// tools/tests/first_touch_includetest_test.mjs
// SAFE_TEST_ONLY_FIRSTTOUCH contract regression. Verifies the acceptance-only includeTest path:
//   - TEST_ONLY lead is INVISIBLE with includeTest=false (zero KPI leak) and VISIBLE with =true;
//   - a real lead's behavior is unchanged by the new param;
//   - a TEST_ONLY draft is no-send and never touches the send ledger;
//   - mini_audit + owner_commercial_truth never surface the TEST_ONLY lead (real owner KPI/brief);
//   - the seeder/cleanup are idempotent and cleanup removes ALL linked artifacts; real leads untouched.
// Runs against a temp copy of the 62-lead fixture; never sends, never deploys.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, 'fixtures', 'first_touch_recon', 'lead_pipeline_store_62.json');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ftinc'));
const STORE = path.join(tmp, 'store.json');
fs.copyFileSync(FIXTURE, STORE);
process.env.MATER_STORE_PATH = STORE;

const svc = await import('../mater_controller_api/src/commercial/first_touch_service.mjs');
const cmds = (await import('../mater_controller_api/src/commercial/first_touch_commands.mjs')).default;
const truthMod = (await import('../mater_controller_api/src/commercial/owner_commercial_truth.mjs')).default;
const { readStore, updateStoreWithRevision, leadsArray } = await import('../mater_controller_api/src/shared/store_access.mjs');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('FAIL', n); } };
const rev = () => Number(readStore(STORE).store_revision) || 0;

const LEAD_ID = 'TEST_ONLY_FT_ACCEPT_V3';

// ---- baseline (no test lead yet) ----
const realBefore = svc.pilotCandidates(false);
ok('B1 baseline scope real-only', realBefore.scope === 'COMMERCIAL_REAL_ONLY');
const baseConsidered = realBefore.leads_considered;
const baseScored = realBefore.leads_scored;
ok('B2 baseline considered>0', baseConsidered > 0);

// ---- seed a synthetic TEST_ONLY lead (same shape the CLI seeder writes) ----
function syntheticLead() {
    return {
        lead_id: LEAD_ID, company: 'Акцепт-Тест Стройсервис (TEST_ONLY)',
        company_name: 'Акцепт-Тест Стройсервис (TEST_ONLY)', website: 'accept-v3-firsttouch.example',
        email: 'accept-v3-firsttouch@example.test', email_source: 'manual_verified', email_verified: true,
        niche: 'acceptance', region: 'TEST', source: 'site_observation', status: 'needs_check',
        product_route: 'mini_audit', identity_match_status: 'match', website_reachable: true, audit_ready: true,
        audit_observations: [
            'Кнопка отправки заявки не видна на главной странице — путь до обращения неочевиден новому посетителю.',
            'Форма обратной связи требует много полей, что усложняет первичное обращение клиента.',
            'На странице каталога отсутствует явный переход к расчёту или заявке по выбранному товару.',
        ],
        audit_observations_count: 3, audit_observed_at: '2026-06-20T10:00:00.000Z',
        audit_created_at: '2026-06-20T10:00:00.000Z', updated_at: '2026-06-20T10:00:00.000Z',
        created_at: '2026-06-20T10:00:00.000Z', test_only: true, no_send: true,
        outbound_history_checked: true, suppression_checked: true, duplicate_contact_checked: true,
        prior_reply_checked: true, prior_outreach_exists: false, no_reply_after_prior_outreach: false,
        owner_recontact_approved: false,
        excluded_from_commercial_KPI: true, excluded_from_owner_brief: true, fixture_id: 'ACCEPTANCE_V3_FIRSTTOUCH_CANDIDATE',
        created_by_run_id: 'acceptance_v3_firsttouch',
    };
}
function seed() {
    return updateStoreWithRevision((store) => {
        if (leadsArray(store).find((l) => String(l.lead_id) === LEAD_ID)) return null;
        store.leads = Array.isArray(store.leads) ? store.leads : Object.values(store.leads || {});
        store.leads.push(syntheticLead());
        return store;
    }, { updatedBy: 'test_seeder' });
}
const s1 = seed();
ok('S1 seed wrote', s1.written === true);
const s2 = seed();
ok('S2 seed idempotent (no double write)', s2.written === false);
ok('S3 store has exactly one synthetic lead', leadsArray(readStore(STORE)).filter((l) => String(l.lead_id) === LEAD_ID).length === 1);

// ---- includeTest=false: zero leak ----
const realAfter = svc.pilotCandidates(false);
ok('L1 real path scope unchanged', realAfter.scope === 'COMMERCIAL_REAL_ONLY');
ok('L2 leads_considered unchanged (no leak)', realAfter.leads_considered === baseConsidered);
ok('L3 leads_scored unchanged (no leak)', realAfter.leads_scored === baseScored);
ok('L4 test lead NOT in top_5', !realAfter.top_5.some((r) => r.lead_id === LEAD_ID));
ok('L5 test lead NOT in all rows', !realAfter.all.some((r) => r.lead_id === LEAD_ID));
ok('L6 no TEST_ONLY exclusion appears (it is skipped, not excluded)', !(realAfter.exclusion_breakdown.TEST_ONLY > 0));

// ---- includeTest=true: visible + eligible ----
const acc = svc.pilotCandidates(true);
ok('A1 acceptance scope marked', acc.scope === 'COMMERCIAL_REAL_PLUS_TEST_ACCEPTANCE');
// includeTest=true considers EVERY lead in the store (real + any test-pattern lead + our synthetic
// one). The fixture already contains 2 test-pattern leads, so the delta vs the real-only count is
// "fixture test leads + 1". The robust invariant: with includeTest=true, considered == total leads.
const totalInStore = leadsArray(readStore(STORE)).length;
ok('A2 considered(true) == all leads in store', acc.leads_considered === totalInStore);
ok('A2b considered(true) > considered(false)', acc.leads_considered > realAfter.leads_considered);
const accRow = acc.all.find((r) => r.lead_id === LEAD_ID);
ok('A3 test lead present in rows', !!accRow);
ok('A4 test lead eligible (passes all other gates)', accRow && accRow.eligible === true);
ok('A5 test lead in top_5', acc.top_5.some((r) => r.lead_id === LEAD_ID));
ok('A5b test lead is FIRST in top_5 (harness opens it, not a real lead)', acc.top_5[0] && acc.top_5[0].lead_id === LEAD_ID);

// ---- summary mirrors the flag ----
ok('A6 summary(true) scope', svc.summary(true).scope === 'COMMERCIAL_REAL_PLUS_TEST_ACCEPTANCE');
ok('A7 summary(false) scope', svc.summary(false).scope === 'COMMERCIAL_REAL_ONLY');
ok('A8 summary(false) leads_scored unchanged', svc.summary(false).leads_scored === baseScored);

// ---- buildArtifact for the synthetic lead yields subject/body variants (post-draft controls work) ----
const art = svc.buildArtifact(LEAD_ID);
ok('D0 artifact built', !!art && art.lead_id === LEAD_ID);
ok('D0b subject variants present', art.subject_variants.length > 0);
ok('D0c body variants present', art.body_variants.length > 0);

// ---- generate a TEST_ONLY draft (no-send) + post-draft commands ----
const g = cmds.generateDraft({ leadId: LEAD_ID, idempotencyKey: 'ft-acc-gen', expectedRevision: rev() });
ok('D1 generate draft ok', g.ok && !!g.draft_id);
ok('D2 generate no-send', g.no_send === true && g.transport_enabled === false);
const draftId = g.draft_id;
const draftRec = readStore(STORE)[ 'first_touch.drafts'][draftId];
ok('D3 draft linked to test lead', draftRec && String(draftRec.lead_id) === LEAD_ID);

const ss = cmds.selectSubject({ draftId, subjectId: art.recommended_subject_id, idempotencyKey: 'ft-acc-ss', expectedRevision: rev() });
ok('D4 select subject', ss.ok);
const sb = cmds.selectBody({ draftId, bodyId: art.recommended_body_id, idempotencyKey: 'ft-acc-sb', expectedRevision: rev() });
ok('D5 select body', sb.ok);
const at = cmds.approveTextOnly({ draftId, idempotencyKey: 'ft-acc-at', expectedRevision: rev() });
ok('D6 approve-text-only != approve-send', at.ok && at.send_allowed_live === false && at.approval_token_issued === false && at.no_send === true);
const rta = cmds.returnToAudit({ draftId, idempotencyKey: 'ft-acc-rta', expectedRevision: rev() });
ok('D7 return-to-audit', rta.ok && rta.status === 'RETURNED_TO_AUDIT');
const rj = cmds.reject({ draftId, reason: 'accept-test', idempotencyKey: 'ft-acc-rj', expectedRevision: rev() });
ok('D8 reject', rj.ok && rj.status === 'REJECTED');
const sp = cmds.selectPilot({ leadId: LEAD_ID, idempotencyKey: 'ft-acc-sp', expectedRevision: rev() });
ok('D9 select-pilot (no transport)', sp.ok && sp.selected_pilot === LEAD_ID && sp.send_allowed_live === false);

// ---- no send seam touched ----
const finStore = readStore(STORE);
ok('N1 no send ledger key added to store', !finStore.outbound_send_ledger);
ok('N2 all ft decisions no_send', Object.values(finStore['first_touch.decisions'] || {}).every((d) => d.no_send === true));

// ---- owner_commercial_truth excludes the test lead (real owner KPI) ----
const t = truthMod.truth();
ok('T1 truth total_leads excludes test lead', !t.per_lead.some((p) => p.lead_id === LEAD_ID));
ok('T2 truth scope real-only', t.scope === 'COMMERCIAL_REAL_ONLY');

// ---- cleanup removes lead + ALL linked artifacts, leaves real leads untouched ----
const realLeadsBeforeCleanup = leadsArray(readStore(STORE)).filter((l) => l.test_only !== true && !/^TEST_ONLY/i.test(String(l.lead_id || ''))).length;
function cleanup() {
    return updateStoreWithRevision((store) => {
        let changed = false;
        if (Array.isArray(store.leads)) { const n = store.leads.length; store.leads = store.leads.filter((l) => String(l.lead_id) !== LEAD_ID); if (store.leads.length !== n) changed = true; }
        for (const [id, d] of Object.entries(store['first_touch.drafts'] || {})) if (String(d.lead_id) === LEAD_ID) { delete store['first_touch.drafts'][id]; changed = true; }
        for (const [id, d] of Object.entries(store['first_touch.decisions'] || {})) if (String(d.lead_id) === LEAD_ID) { delete store['first_touch.decisions'][id]; changed = true; }
        if (store['first_touch.pilot'] && String(store['first_touch.pilot'].selected_lead_id) === LEAD_ID) { delete store['first_touch.pilot'].selected_lead_id; changed = true; }
        for (const [k, v] of Object.entries(store['_first_touch_idem'] || {})) if (v && String(v.lead_id) === LEAD_ID) { delete store['_first_touch_idem'][k]; changed = true; }
        return changed ? store : null;
    }, { updatedBy: 'test_cleanup' });
}
const c1 = cleanup();
ok('C1 cleanup wrote', c1.written === true);
const c2 = cleanup();
ok('C2 cleanup idempotent (nothing left)', c2.written === false);
const post = readStore(STORE);
ok('C3 synthetic lead gone', !leadsArray(post).some((l) => String(l.lead_id) === LEAD_ID));
ok('C4 no linked drafts', !Object.values(post['first_touch.drafts'] || {}).some((d) => String(d.lead_id) === LEAD_ID));
ok('C5 no linked decisions', !Object.values(post['first_touch.decisions'] || {}).some((d) => String(d.lead_id) === LEAD_ID));
ok('C6 no linked idem', !Object.values(post['_first_touch_idem'] || {}).some((v) => v && String(v.lead_id) === LEAD_ID));
ok('C7 pilot not test lead', !(post['first_touch.pilot'] && String(post['first_touch.pilot'].selected_lead_id) === LEAD_ID));
ok('C8 real leads untouched', leadsArray(post).filter((l) => l.test_only !== true && !/^TEST_ONLY/i.test(String(l.lead_id || ''))).length === realLeadsBeforeCleanup);
ok('C9 candidates back to baseline after cleanup', svc.pilotCandidates(false).leads_considered === baseConsidered);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n==== first_touch_includetest: ${pass} passed, ${fail} failed ====`);
process.exit(fail === 0 ? 0 : 1);
