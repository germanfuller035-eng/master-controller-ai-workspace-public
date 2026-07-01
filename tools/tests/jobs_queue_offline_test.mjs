// jobs_queue_offline_test.mjs — PURE offline, no network.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n); } };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobq_'));
process.env.MATER_QUEUE_PATH = path.join(dir, 'job_queue.json');
process.env.MATER_API_SECRETS_DIR = path.join(dir, 'sec');

const q = await import('../mater_controller_api/src/jobs/service.mjs');
const { readQueue } = await import('../mater_controller_api/src/jobs/queue_store.mjs');

// 1. enqueue + unknown type
ok('unknown job type rejected', q.enqueue({ jobType: 'NOPE' }).ok === false);
const e1 = q.enqueue({ jobType: 'LEAD_VERIFY', entityId: 'L1', payload: { a: 1 } });
ok('enqueue ok', e1.ok && !e1.idempotent);
// 2. idempotent enqueue (same key)
const e2 = q.enqueue({ jobType: 'LEAD_VERIFY', entityId: 'L1', payload: { a: 1 } });
ok('idempotent enqueue returns same job', e2.idempotent === true && e2.job.job_id === e1.job.job_id);
ok('no duplicate created', Object.keys(readQueue().jobs).length === 1);

// 3. atomic claim — two claims, only one gets the job
const c1 = q.claim({ workerId: 'w1' });
const c2 = q.claim({ workerId: 'w2' });
ok('first claim gets job', c1.job && c1.job.job_id === e1.job.job_id);
ok('second claim gets nothing (single job)', c2.job === null);
ok('claimed job RUNNING + attempts=1', readQueue().jobs[e1.job.job_id].status === 'RUNNING' && readQueue().jobs[e1.job.job_id].attempts === 1);

// 4. heartbeat by leaseholder only
ok('heartbeat by leaseholder ok', q.heartbeat({ jobId: e1.job.job_id, workerId: 'w1' }).ok === true);
ok('heartbeat by non-leaseholder rejected', q.heartbeat({ jobId: e1.job.job_id, workerId: 'w2' }).ok === false);

// 5. fail → retry with backoff
const f1 = q.fail({ jobId: e1.job.job_id, workerId: 'w1', errorCode: 'X' });
ok('fail → RETRY', f1.status === 'RETRY');
ok('next_attempt_at in future', Date.parse(readQueue().jobs[e1.job.job_id].next_attempt_at) > Date.now());

// 6. restart persistence: fresh read sees state
ok('restart persistence', readQueue().jobs[e1.job.job_id].status === 'RETRY');

// 7. dead-letter after max attempts
const e3 = q.enqueue({ jobType: 'AUDIT_GENERATE', entityId: 'L2', maxAttempts: 2 });
const jid = e3.job.job_id;
// force next_attempt now + run attempts
function forceReady(id){ const Q=readQueue(); /* can't mutate via read; use claim loop with backoff bypass */ }
// attempt 1
let cc = q.claim({ workerId: 'w1', types: ['AUDIT_GENERATE'] }); q.fail({ jobId: jid, workerId: 'w1', errorCode: 'E1' });
// manually clear backoff by directly enqueuing claim after setting next_attempt — emulate time by editing file
{ const Q = JSON.parse(fs.readFileSync(process.env.MATER_QUEUE_PATH,'utf8')); Q.jobs[jid].next_attempt_at = new Date(Date.now()-1000).toISOString(); fs.writeFileSync(process.env.MATER_QUEUE_PATH, JSON.stringify(Q)); }
cc = q.claim({ workerId: 'w1', types: ['AUDIT_GENERATE'] }); const f2 = q.fail({ jobId: jid, workerId: 'w1', errorCode: 'E2' });
ok('dead-letter after max attempts', f2.status === 'DEAD_LETTER');

// 8. completed/cancelled cannot rerun
const e4 = q.enqueue({ jobType: 'HEALTH_CHECK' }); const cj = q.claim({ workerId: 'w1', types: ['HEALTH_CHECK'] });
q.complete({ jobId: e4.job.job_id, workerId: 'w1' });
ok('completed job stays completed (idempotent)', q.complete({ jobId: e4.job.job_id, workerId: 'w1' }).idempotent === true);
const e5 = q.enqueue({ jobType: 'METRICS_REFRESH' }); q.cancel({ jobId: e5.job.job_id });
const claimAfterCancel = q.claim({ workerId: 'w1', types: ['METRICS_REFRESH'] });
ok('cancelled job not claimable', claimAfterCancel.job === null);

// 9. counts
const cnt = q.counts();
ok('counts present', typeof cnt === 'object' && cnt.DEAD_LETTER >= 1);

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n==== jobs_queue: ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
