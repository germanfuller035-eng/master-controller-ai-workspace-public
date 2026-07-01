/**
 * campaign_governor_v1_test.mjs
 *
 * Verifies the Phase 2 Campaign Governor
 * (tools/mater_controller_api/src/campaigns/service.mjs).
 *
 * OFFLINE. No network. No SMTP. No send. Operates on a TEMP campaigns store
 * (MATER_CAMPAIGNS_STORE_PATH) — never touches canonical lead store.
 *
 * Coverage:
 *   1.  createCampaign → DRAFT with planned cohorts (10, 20)
 *   2.  release before activate → blocked
 *   3.  activate → ACTIVE; first cohort owner_approved by default
 *   4.  releaseCohort attaches lead_ids + starts observation; respects planned_size
 *   5.  suppression blocks a lead from release
 *   6.  recordOutcome accounting (accepted vs delivered vs bounced) + auto-suppress on bounce
 *   7.  closeCohort blocked until observation window elapsed; force closes
 *   8.  advanceCohort owner gate: blocked until prev cohort CLOSED, then approves cohort 20
 *   9.  pause/resume transitions + illegal transition rejected
 *   10. idempotency by operationId-free re-calls (advance/suppress idempotent)
 *   11. canTransition / observationElapsed pure helpers
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = path.join(os.tmpdir(), `mc_campaign_test_${process.pid}_${Date.now()}.json`);
process.env.MATER_CAMPAIGNS_STORE_PATH = TMP;

const svc = await import('../mater_controller_api/src/campaigns/service.mjs');

let passed = 0, failed = 0;
const failures = [];
function check(name, cond) {
    if (cond) { passed++; console.log(`  ✅ ${name}`); }
    else { failed++; failures.push(name); console.log(`  ❌ ${name}`); }
}

console.log('\n=== campaign_v1 Campaign Governor Tests ===\n');

console.log('Test 1: createCampaign → DRAFT with cohorts 10,20');
const c1 = svc.createCampaign({ name: 'Москва автосервисы', niche: 'autoservice', region: 'RU-MOW', cohortSizes: [10, 20], observationHours: 48 });
check('1.created+written', c1.ok && c1.written);
check('1.draft', svc.getCampaign(c1.campaignId).status === 'DRAFT');
check('1.two cohorts', svc.getCampaign(c1.campaignId).cohorts.length === 2);
check('1.sizes 10,20', svc.getCampaign(c1.campaignId).cohorts.map((x) => x.planned_size).join(',') === '10,20');
const CID = c1.campaignId;

console.log('Test 2: release before activate → blocked');
const r2 = svc.releaseCohort({ campaignId: CID, leadIds: ['L1'] });
check('2.blocked not active', !r2.ok && r2.code === 'CAMPAIGN_NOT_ACTIVE');

console.log('Test 3: activate → ACTIVE, first cohort approved');
const a3 = svc.activateCampaign({ campaignId: CID });
check('3.active', a3.ok && svc.getCampaign(CID).status === 'ACTIVE');
check('3.first cohort approved', svc.getCampaign(CID).cohorts[0].owner_approved === true);
check('3.second cohort not approved', svc.getCampaign(CID).cohorts[1].owner_approved === false);

console.log('Test 4: release cohort attaches leads + respects planned_size');
const manyLeads = Array.from({ length: 15 }, (_, i) => `L${i + 1}`);
const r4 = svc.releaseCohort({ campaignId: CID, leadIds: manyLeads });
check('4.released', r4.ok && r4.released === 10);
check('4.requested recorded', r4.requested === 15);
const coh0 = svc.getCampaign(CID).cohorts[0];
check('4.status RELEASED', coh0.status === 'RELEASED');
check('4.released_at set', !!coh0.released_at);

console.log('Test 5: suppression blocks a lead from release (new campaign)');
const c5 = svc.createCampaign({ name: 'supp test', cohortSizes: [5] });
svc.activateCampaign({ campaignId: c5.campaignId });
svc.suppressLead({ campaignId: c5.campaignId, leadId: 'BAD1', reason: 'OWNER_REQUEST' });
const r5 = svc.releaseCohort({ campaignId: c5.campaignId, leadIds: ['BAD1', 'OK1', 'OK2'] });
check('5.suppressed excluded', r5.ok && r5.released === 2);
check('5.no BAD1 in cohort', !svc.getCampaign(c5.campaignId).cohorts[0].lead_ids.includes('BAD1'));

console.log('Test 6: recordOutcome accounting + auto-suppress on bounce');
const cohId0 = svc.getCampaign(CID).cohorts[0].cohort_id;
svc.recordOutcome({ campaignId: CID, cohortId: cohId0, leadId: 'L1', outcome: { smtp_accepted: true, delivered: true, replied: true } });
svc.recordOutcome({ campaignId: CID, cohortId: cohId0, leadId: 'L2', outcome: { smtp_accepted: true, bounced: true } });
const sum6 = svc.summarizeCohort(svc.getCampaign(CID).cohorts[0]);
check('6.accepted=2', sum6.accepted === 2);
check('6.delivered=1', sum6.delivered === 1);
check('6.bounced=1', sum6.bounced === 1);
check('6.replied=1', sum6.replied === 1);
check('6.auto-suppressed L2', svc.getCampaign(CID).cohorts && (svc.getCampaign(CID).suppression || []).some((s) => s.lead_id === 'L2'));

console.log('Test 7: closeCohort blocked until observation elapsed; force closes');
const cl7 = svc.closeCohort({ campaignId: CID, cohortId: cohId0 });
check('7.blocked not elapsed', !cl7.ok && cl7.code === 'OBSERVATION_NOT_ELAPSED');
const cl7b = svc.closeCohort({ campaignId: CID, cohortId: cohId0, force: true });
check('7.force closed', cl7b.ok && svc.getCampaign(CID).cohorts[0].status === 'CLOSED');
check('7.final_summary set', !!svc.getCampaign(CID).cohorts[0].final_summary);

console.log('Test 8: advanceCohort owner gate (cohort 10 → 20)');
const adv8 = svc.advanceCohort({ campaignId: CID });
check('8.advanced after close', adv8.ok && adv8.cohortIndex === 1);
check('8.cohort2 approved', svc.getCampaign(CID).cohorts[1].owner_approved === true);
const adv8b = svc.advanceCohort({ campaignId: CID });
check('8.idempotent advance', adv8b.ok && adv8b.idempotent === true);

console.log('Test 9: pause/resume + illegal transition');
const p9 = svc.pauseCampaign({ campaignId: CID, reason: 'LOW_RESPONSE' });
check('9.paused', p9.ok && svc.getCampaign(CID).status === 'PAUSED');
check('9.pause_history', svc.getCampaign(CID).pause_history.some((h) => h.reason === 'LOW_RESPONSE'));
const res9 = svc.resumeCampaign({ campaignId: CID });
check('9.resumed', res9.ok && svc.getCampaign(CID).status === 'ACTIVE');
svc.archiveCampaign({ campaignId: CID });
const il9 = svc.activateCampaign({ campaignId: CID });
check('9.illegal from ARCHIVED', !il9.ok && il9.code === 'ILLEGAL_TRANSITION');

console.log('Test 10: suppress idempotent');
const s10a = svc.suppressLead({ campaignId: c5.campaignId, leadId: 'DUP', reason: 'OWNER_REQUEST' });
const s10b = svc.suppressLead({ campaignId: c5.campaignId, leadId: 'DUP', reason: 'OWNER_REQUEST' });
check('10.first suppress', s10a.ok && !s10a.idempotent);
check('10.second idempotent', s10b.ok && s10b.idempotent === true);

console.log('Test 11: pure helpers');
check('11.canTransition DRAFT→ACTIVE', svc.canTransition('DRAFT', 'ACTIVE') === true);
check('11.canTransition COMPLETED→ACTIVE false', svc.canTransition('COMPLETED', 'ACTIVE') === false);
check('11.observation not elapsed', svc.observationElapsed({ released_at: new Date().toISOString(), observation_hours: 48 }, new Date()) === false);
const old = new Date(Date.now() - 49 * 3600000).toISOString();
check('11.observation elapsed', svc.observationElapsed({ released_at: old, observation_hours: 48 }, new Date()) === true);

console.log('Test 12: no-send governor posture');
check('12.GOVERNOR_MODE ACTIVE_NO_SEND', svc.GOVERNOR_MODE === 'ACTIVE_NO_SEND');
check('12.COHORT_SEND_EXECUTION_ENABLED false', svc.COHORT_SEND_EXECUTION_ENABLED === false);
check('12.no send/enqueue export', !('sendCohort' in svc) && !('executeCohortSend' in svc));

console.log('Test 13: TEST_ONLY isolation from owner KPI');
const ct = svc.createCampaign({ name: 'TEST_ONLY smoke', cohortSizes: [3], testOnly: true });
check('13.created test_only', ct.ok && ct.testOnly === true);
check('13.hidden from default list', !svc.listCampaigns().some((c) => c.campaign_id === ct.campaignId));
check('13.visible with includeTest', svc.listCampaigns({ includeTest: true }).some((c) => c.campaign_id === ct.campaignId));
check('13.real campaign still listed', svc.listCampaigns().some((c) => c.campaign_id === c5.campaignId));

// cleanup
try {
    for (const f of fs.readdirSync(os.tmpdir())) {
        if (f.startsWith(path.basename(TMP))) { try { fs.unlinkSync(path.join(os.tmpdir(), f)); } catch {} }
    }
} catch {}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failed > 0) { console.log('FAILURES:', failures.join(', ')); process.exit(1); }
process.exit(0);
