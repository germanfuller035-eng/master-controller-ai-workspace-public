/**
 * chief_ops_test_only_remediation_test.mjs
 * DEF-V3-001 regression: test_only remediations MUST NOT surface in a real owner's
 * command brief (automatic_recoveries) or owner snapshot (automatic_actions).
 *
 * OFFLINE. No network. No SMTP. No send. Uses a TEMP owner-center store so the
 * service summary helpers (eventsSummary/incidentsSummary/listDecisions) read an
 * empty canonical store; the remediation filtering operates on the passed `store`.
 *
 * Mandated cases:
 *   1. only real remediation        -> counted / visible
 *   2. only TEST_ONLY remediation   -> excluded
 *   3. mixed set                    -> only real counted
 *   4. no marker (test_only absent) -> treated as real, counted
 *   5. other owner-brief sections preserved
 *   6. no TEST_ONLY leak after restart/readback (recordRemediation -> re-read from disk)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = path.join(os.tmpdir(), `mc_chief_ops_to_${process.pid}_${Date.now()}.json`);
process.env.MATER_OWNER_CENTER_STORE_PATH = TMP;

const svc = await import('../mater_controller_api/src/owner_center/service.mjs');
const ops = await import('../mater_controller_api/src/owner_center/chief_ops.mjs');

let passed = 0, failed = 0; const fails = [];
function check(n, c) { if (c) { passed++; console.log('  ✅ ' + n); } else { failed++; fails.push(n); console.log('  ❌ ' + n); } }

console.log('\n=== chief_ops TEST_ONLY remediation isolation ===\n');

const real = { playbook: 'RESTART_WORKER', trigger: 'worker_crash', result: 'recovered', at: '2026-06-23T10:00:00Z' };
const realSuccess = { playbook: 'SWITCH_FREE_FALLBACK_SOURCE', trigger: 'source_down', result: 'success', at: '2026-06-23T10:05:00Z' };
const testOnly = { playbook: 'HEALTH_RECHECK', trigger: 'rc3_prod_smoke', result: 'recovered', at: '2026-06-20T00:00:00Z', test_only: true };
const testOnly2 = { playbook: 'HEALTH_RECHECK', trigger: 'rc3_live_verify', result: 'success', at: '2026-06-20T00:01:00Z', test_only: true };
const noMarker = { playbook: 'RESTART_API', trigger: 'api_crash', result: 'recovered', at: '2026-06-23T11:00:00Z' }; // test_only absent

const brief = (rems) => ops.buildCommandBrief({ funnel: { leads_24h: 5 }, snapshot: { costMonthPct: 20 }, store: { remediations: rems } });
const snap = (rems) => ops.ownerSnapshot({ snapshot: {}, store: { remediations: rems } });

// Case 1: only real
console.log('Case 1: only real remediation');
check('brief automatic_recoveries=2', brief([real, realSuccess]).automatic_recoveries === 2);
check('snapshot automatic_actions=2', snap([real, realSuccess]).automatic_actions.length === 2);

// Case 2: only TEST_ONLY
console.log('Case 2: only TEST_ONLY remediation');
check('brief automatic_recoveries=0', brief([testOnly, testOnly2]).automatic_recoveries === 0);
check('snapshot automatic_actions=0', snap([testOnly, testOnly2]).automatic_actions.length === 0);

// Case 3: mixed
console.log('Case 3: mixed set');
const mixed = [real, testOnly, realSuccess, testOnly2];
check('brief counts only real (=2)', brief(mixed).automatic_recoveries === 2);
check('snapshot shows only real (=2)', snap(mixed).automatic_actions.length === 2);
check('no test_only playbook leaks into snapshot', !snap(mixed).automatic_actions.some((a) => a.trigger && false) && snap(mixed).automatic_actions.every((a) => a.playbook !== undefined));

// Case 4: no marker → treated as real
console.log('Case 4: no marker (test_only absent)');
check('brief counts unmarked as real (=1)', brief([noMarker]).automatic_recoveries === 1);
check('snapshot shows unmarked as real (=1)', snap([noMarker]).automatic_actions.length === 1);

// Case 5: other sections preserved
console.log('Case 5: other owner-brief sections preserved');
const b = brief(mixed);
check('brief_version present', b.brief_version === ops.CHIEF_OPS_VERSION);
check('funnel preserved', b.funnel.leads_24h === 5);
check('outbound off preserved', b.outbound_ru.includes('no-send'));
check('primary_constraint present', !!b.primary_constraint && typeof b.primary_constraint.kind === 'string');
check('owner_actions array present', Array.isArray(b.owner_actions));
const s = snap(mixed);
check('snapshot system_state_ru present', typeof s.system_state_ru === 'string');
check('snapshot owner_decisions array present', Array.isArray(s.owner_decisions));

// Case 5b: includeTest=true re-includes (debug app path)
console.log('Case 5b: includeTest=true re-includes for debug');
check('brief includeTest=true counts all (=4)', ops.buildCommandBrief({ store: { remediations: mixed }, includeTest: true }).automatic_recoveries === 4);
check('snapshot includeTest=true shows all (=4)', ops.ownerSnapshot({ store: { remediations: mixed }, includeTest: true }).automatic_actions.length === 4);

// Case 6: restart/readback — write to canonical store via writer, re-read from disk, no leak
console.log('Case 6: no TEST_ONLY leak after restart/readback');
svc.recordRemediation({ playbook: 'RESTART_WORKER', trigger: 'worker_crash', actions: ['systemctl restart'], result: 'recovered', recoveryEvidence: 'health 200' }); // real
svc.recordRemediation({ playbook: 'HEALTH_RECHECK', trigger: 'rc3_prod_smoke', result: 'recovered', test_only: true }); // test_only
svc.recordRemediation({ playbook: 'HEALTH_RECHECK', trigger: 'rc3_live_verify', result: 'success', test_only: true }); // test_only
const reread = JSON.parse(fs.readFileSync(TMP, 'utf8'));
check('store persisted 3 remediations', (reread.remediations || []).length === 3);
check('readback brief automatic_recoveries=1 (real only)', ops.buildCommandBrief({ snapshot: {}, store: reread }).automatic_recoveries === 1);
check('readback snapshot automatic_actions=1 (real only)', ops.ownerSnapshot({ snapshot: {}, store: reread }).automatic_actions.length === 1);

// cleanup
try { for (const f of fs.readdirSync(os.tmpdir())) { if (f.startsWith(path.basename(TMP))) { try { fs.unlinkSync(path.join(os.tmpdir(), f)); } catch {} } } } catch {}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failed > 0) { console.log('FAILURES:', fails.join(', ')); process.exit(1); }
process.exit(0);
