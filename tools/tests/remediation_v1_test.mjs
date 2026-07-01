/**
 * remediation_v1_test.mjs — Safe Auto-Remediation Engine scenario lab.
 *
 * OFFLINE. No network. No SMTP. No send. TEMP owner-center store + injected fake jobs dep.
 * Verifies: forbidden playbooks fail closed BEFORE any side effect, bounded limits, real bounded
 * executors (lease recovery, TEST_ONLY-only retry, missed-scheduler detect, health recheck,
 * kill switch enables = more restrictive, worker restart NOT faked), evidence recorded.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = path.join(os.tmpdir(), `mc_remediation_${process.pid}_${Date.now()}.json`);
process.env.MATER_OWNER_CENTER_STORE_PATH = TMP;

const owner = await import('../mater_controller_api/src/owner_center/service.mjs');
const eng = await import('../mater_controller_api/src/owner_center/remediation_engine.mjs');

let passed = 0, failed = 0; const fails = [];
function check(n, c) { if (c) { passed++; console.log('  ✅ ' + n); } else { failed++; fails.push(n); console.log('  ❌ ' + n); } }

console.log('\n=== Safe Auto-Remediation Engine — Scenario Lab ===\n');

// Fake jobs dep (in-memory) to exercise executors deterministically.
const fakeJobsState = {
    jobs: {
        j_test: { job_id: 'j_test', job_type: 'METRICS_REFRESH', status: 'DEAD_LETTER', payload: { test_only: true }, idempotency_key: 'k1', entity_type: null, entity_id: null, created_at: new Date().toISOString() },
        j_live: { job_id: 'j_live', job_type: 'LEAD_VERIFY', status: 'DEAD_LETTER', payload: { test_only: false }, idempotency_key: 'k2', created_at: new Date().toISOString() },
        j_run_stale: { job_id: 'j_run_stale', job_type: 'AUDIT_GENERATE', status: 'RUNNING', lease_expires_at: new Date(Date.now() - 60000).toISOString(), created_at: new Date().toISOString() },
    },
    enqueued: [],
};
const fakeJobs = {
    listJobs: ({ status = null, type = null } = {}) => Object.values(fakeJobsState.jobs).filter((j) => (!status || j.status === status) && (!type || j.job_type === type)),
    getJob: (id) => fakeJobsState.jobs[id] || null,
    enqueue: ({ jobType, idempotencyKey }) => { const id = 'new_' + fakeJobsState.enqueued.length; fakeJobsState.enqueued.push({ id, jobType, idempotencyKey }); return { ok: true, idempotent: false, job: { job_id: id } }; },
    claim: () => ({ ok: true, job: null }),
    counts: () => ({ DEAD_LETTER: 2, RUNNING: 1 }),
};
let recheckCalls = 0;
const executors = eng.buildExecutors({ jobs: fakeJobs, owner, reliabilityRecheck: async () => { recheckCalls += 1; return { overall_health: 'HEALTHY', degraded_states: [] }; } });
const readStore = () => { try { return JSON.parse(fs.readFileSync(TMP, 'utf8')); } catch { return {}; } };
const run = (body) => eng.runRemediation(body, { executors, readStore });

// 1. forbidden playbooks fail closed (NO side effect)
console.log('Scenario: forbidden playbooks fail closed');
for (const fb of ['SEND_CLIENT', 'SEND_FOLLOWUP', 'LIFT_SUPPRESSION', 'CHANGE_PRICE', 'ENABLE_PAID_SOURCE', 'DELETE_CANONICAL', 'ENABLE_SEND_LIVE', 'RETRY_SMTP_UNKNOWN']) {
    const r = await run({ playbook: fb });
    check(`${fb} forbidden+not executed`, r.ok === false && r.executed === false && r.code === 'PLAYBOOK_FORBIDDEN');
}

// 2. lease recovery executes
console.log('Scenario: recover expired lease');
const lease = await run({ playbook: 'RECOVER_EXPIRED_LEASE' });
check('lease recovery executed', lease.ok && lease.executed === true);
check('stale lease found in evidence', lease.evidence.stale_leases_found >= 1);

// 3. retry TEST_ONLY job only
console.log('Scenario: retry idempotent job (TEST_ONLY only)');
const retryTest = await run({ playbook: 'RETRY_IDEMPOTENT_JOB', params: { jobId: 'j_test' }, test_only: true });
check('TEST_ONLY job re-enqueued', retryTest.ok && retryTest.executed === true && retryTest.result === 'RE_ENQUEUED');
const retryLive = await run({ playbook: 'RETRY_IDEMPOTENT_JOB', params: { jobId: 'j_live' } });
check('LIVE job refused (not test_only)', retryLive.executed === false && retryLive.result === 'REFUSED_NOT_TEST_ONLY');
const retryMissing = await run({ playbook: 'RETRY_IDEMPOTENT_JOB', params: { jobId: 'nope' } });
check('missing job not executed', retryMissing.executed === false && retryMissing.result === 'JOB_NOT_FOUND');

// 4. missed scheduler detection
console.log('Scenario: missed scheduler detection');
const sched = await run({ playbook: 'RECOVER_MISSED_SCHEDULER', params: { maxAgeHours: 0 } });
check('missed scheduler detected (age>0)', sched.executed === true && sched.result === 'MISSED_DETECTED');

// 5. health recheck calls the recheck dep
console.log('Scenario: health recheck');
const hc = await run({ playbook: 'HEALTH_RECHECK' });
check('health recheck executed', hc.executed === true && hc.result === 'RECHECKED');
check('recheck dep invoked', recheckCalls >= 1);

// 6. source isolation (safe, reduces activity)
console.log('Scenario: source isolation');
const iso = await run({ playbook: 'ISOLATE_SOURCE_TEMP', params: { sourceId: 'flaky_src', minutes: 30 } });
check('source isolation recorded', iso.executed === true && iso.evidence.source_id === 'flaky_src');

// 7. kill switch (only outbound-affecting, more restrictive)
console.log('Scenario: kill switch (more restrictive only)');
const ks = await run({ playbook: 'ENABLE_OUTBOUND_KILL_SWITCH', params: { reason: 'test' } });
check('kill switch enabled', ks.executed === true);
check('owner kill switch state true', owner.getAutopilot().kill_switch.enabled === true);

// 8. worker restart NOT faked
console.log('Scenario: worker restart not faked');
const wr = await run({ playbook: 'RESTART_WORKER' });
check('worker restart not executed (needs host)', wr.executed === false && wr.result === 'NOT_EXECUTED_NEEDS_HOST');
check('worker restart exposes exact command', /systemctl restart master-controller-worker/.test(wr.evidence.required_command));

// 9. bounded limit
console.log('Scenario: bounded limit enforcement');
// HEALTH_RECHECK limit is 60; ENABLE_OUTBOUND_KILL_SWITCH limit 5. Fire kill switch to the cap.
let lastKs;
for (let i = 0; i < 6; i++) lastKs = await run({ playbook: 'ENABLE_OUTBOUND_KILL_SWITCH', params: { reason: 'bound-test' } });
check('bounded limit eventually refuses', lastKs.ok === false && lastKs.code === 'BOUNDED_LIMIT_REACHED');

// 10. evidence recorded in remediation log
console.log('Scenario: evidence recorded');
const store = readStore();
check('remediations recorded', Array.isArray(store.remediations) && store.remediations.length >= 5);
check('recovered remediations present', store.remediations.some((r) => r.result === 'recovered'));

// 11. no-send invariant in source
console.log('Scenario: no-send invariant');
const src = fs.readFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\//, ''), '..', 'mater_controller_api', 'src', 'owner_center', 'remediation_engine.mjs'), 'utf8');
check('no nodemailer/smtp in engine', !/nodemailer|createTransport|tls\.connect/i.test(src));
check('engine never writes canonical', !/updateStoreWithRevision.*canonical|STORE_PATH/.test(src));

// cleanup
try { for (const f of fs.readdirSync(os.tmpdir())) { if (f.startsWith('mc_remediation_')) { try { fs.unlinkSync(path.join(os.tmpdir(), f)); } catch {} } } } catch {}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failed > 0) { console.log('FAILURES:', fails.join(', ')); process.exit(1); }
process.exit(0);
