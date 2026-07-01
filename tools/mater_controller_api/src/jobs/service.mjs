// jobs/service.mjs
// Job queue service — the API-owned lifecycle over queue_store. No business logic here;
// workers call these via HTTP. Idempotent enqueue (by idempotency_key), atomic claim
// (lease), heartbeat, complete/fail/retry/cancel, bounded retry + exponential backoff,
// dead-letter, stale-lease recovery.
import crypto from 'node:crypto';
import { updateQueue, readQueue, QUEUE_PATH } from './queue_store.mjs';

export const JOB_TYPES = new Set([
    'HEALTH_CHECK', 'LEAD_DISCOVERY', 'LEAD_VERIFY', 'LEAD_SCORE', 'AUDIT_GENERATE',
    'DRAFT_GENERATE', 'FIRST_TOUCH_DRAFT_GENERATE', 'FOLLOWUP_PLAN', 'REPLY_DRAFT_GENERATE', 'METRICS_REFRESH', 'BACKUP_VERIFY',
]);
const TERMINAL = new Set(['COMPLETED', 'DEAD_LETTER', 'CANCELLED']);
const DEFAULT_MAX_ATTEMPTS = 5;
const LEASE_MS = 120000; // 2 min lease
const BASE_BACKOFF_MS = 5000;

function now() { return Date.now(); }
function iso(ms = now()) { return new Date(ms).toISOString(); }
function hash(obj) { return crypto.createHash('sha256').update(JSON.stringify(obj || {})).digest('hex'); }
function newId() { return 'job_' + crypto.randomBytes(9).toString('hex'); }

// Idempotent enqueue. If idempotency_key already exists (non-terminal or any), return it.
export function enqueue({ jobType, entityType = null, entityId = null, payload = {}, priority = 5, maxAttempts = DEFAULT_MAX_ATTEMPTS, idempotencyKey = null, correlationId = null }) {
    if (!JOB_TYPES.has(jobType)) return { ok: false, code: 'UNKNOWN_JOB_TYPE', jobType };
    const idem = idempotencyKey || `${jobType}:${entityId || ''}:${hash(payload)}`;
    let result = null;
    updateQueue((q) => {
        const existing = Object.values(q.jobs).find((j) => j.idempotency_key === idem && !TERMINAL.has(j.status));
        if (existing) { result = { ok: true, idempotent: true, job: existing }; return null; }
        const id = newId();
        const job = {
            job_id: id, job_type: jobType, entity_type: entityType, entity_id: entityId,
            payload, payload_hash: hash(payload), status: 'QUEUED', priority,
            attempts: 0, max_attempts: maxAttempts, next_attempt_at: iso(),
            locked_by: null, locked_at: null, lease_expires_at: null,
            correlation_id: correlationId || id, operation_id: null, idempotency_key: idem,
            created_at: iso(), started_at: null, completed_at: null, updated_at: iso(),
            last_error_code: null, last_error_message: null, result_ref: null, worker_version: null,
        };
        q.jobs[id] = job;
        result = { ok: true, idempotent: false, job };
        return q;
    });
    return result || { ok: false, code: 'ENQUEUE_FAILED' };
}

// Atomically claim the highest-priority eligible job. Recovers stale leases first.
export function claim({ workerId, types = null, workerVersion = null }) {
    let result = { ok: true, job: null };
    updateQueue((q) => {
        const t = now();
        // recover stale RUNNING leases
        for (const j of Object.values(q.jobs)) {
            if (j.status === 'RUNNING' && j.lease_expires_at && Date.parse(j.lease_expires_at) < t) {
                j.status = 'RETRY'; j.locked_by = null; j.locked_at = null; j.lease_expires_at = null;
                j.last_error_code = 'LEASE_EXPIRED'; j.updated_at = iso(t);
            }
        }
        const eligible = Object.values(q.jobs).filter((j) =>
            (j.status === 'QUEUED' || j.status === 'RETRY') &&
            Date.parse(j.next_attempt_at) <= t &&
            (!types || types.includes(j.job_type)),
        ).sort((a, b) => (a.priority - b.priority) || (Date.parse(a.created_at) - Date.parse(b.created_at)));
        const job = eligible[0];
        if (!job) { result = { ok: true, job: null }; return null; }
        job.status = 'RUNNING'; job.attempts += 1; job.locked_by = String(workerId || 'worker');
        job.locked_at = iso(t); job.lease_expires_at = iso(t + LEASE_MS); job.started_at = job.started_at || iso(t);
        job.worker_version = workerVersion; job.updated_at = iso(t);
        result = { ok: true, job };
        return q;
    });
    return result;
}

export function heartbeat({ jobId, workerId }) {
    let result = { ok: false, code: 'NOT_FOUND' };
    updateQueue((q) => {
        const j = q.jobs[jobId];
        if (!j) { result = { ok: false, code: 'NOT_FOUND' }; return null; }
        if (j.status !== 'RUNNING' || j.locked_by !== workerId) { result = { ok: false, code: 'NOT_LEASEHOLDER' }; return null; }
        j.lease_expires_at = iso(now() + LEASE_MS); j.updated_at = iso();
        result = { ok: true, leaseExpiresAt: j.lease_expires_at };
        return q;
    });
    return result;
}

export function complete({ jobId, workerId, resultRef = null, operationId = null }) {
    let result = { ok: false, code: 'NOT_FOUND' };
    updateQueue((q) => {
        const j = q.jobs[jobId];
        if (!j) { result = { ok: false, code: 'NOT_FOUND' }; return null; }
        if (TERMINAL.has(j.status)) { result = { ok: true, idempotent: true, status: j.status }; return null; }
        if (j.locked_by && workerId && j.locked_by !== workerId) { result = { ok: false, code: 'NOT_LEASEHOLDER' }; return null; }
        j.status = 'COMPLETED'; j.completed_at = iso(); j.result_ref = resultRef; j.operation_id = operationId;
        j.locked_by = null; j.lease_expires_at = null; j.updated_at = iso();
        result = { ok: true, status: 'COMPLETED' };
        return q;
    });
    return result;
}

// Fail: schedule retry with backoff, or dead-letter when attempts exhausted.
export function fail({ jobId, workerId, errorCode = 'ERROR', errorMessage = '', blocked = null }) {
    let result = { ok: false, code: 'NOT_FOUND' };
    updateQueue((q) => {
        const j = q.jobs[jobId];
        if (!j) { result = { ok: false, code: 'NOT_FOUND' }; return null; }
        if (TERMINAL.has(j.status)) { result = { ok: true, idempotent: true, status: j.status }; return null; }
        j.last_error_code = String(errorCode); j.last_error_message = String(errorMessage || '').slice(0, 500);
        j.locked_by = null; j.lease_expires_at = null;
        if (blocked === 'APPROVAL') { j.status = 'BLOCKED_APPROVAL'; }
        else if (blocked === 'DEPENDENCY') { j.status = 'BLOCKED_DEPENDENCY'; }
        else if (j.attempts >= j.max_attempts) { j.status = 'DEAD_LETTER'; }
        else {
            j.status = 'RETRY';
            const backoff = BASE_BACKOFF_MS * Math.pow(2, j.attempts - 1);
            j.next_attempt_at = iso(now() + Math.min(backoff, 3600000));
        }
        j.updated_at = iso();
        result = { ok: true, status: j.status };
        return q;
    });
    return result;
}

export function cancel({ jobId }) {
    let result = { ok: false, code: 'NOT_FOUND' };
    updateQueue((q) => {
        const j = q.jobs[jobId];
        if (!j) { result = { ok: false, code: 'NOT_FOUND' }; return null; }
        if (TERMINAL.has(j.status)) { result = { ok: true, idempotent: true, status: j.status }; return null; }
        j.status = 'CANCELLED'; j.locked_by = null; j.lease_expires_at = null; j.updated_at = iso();
        result = { ok: true, status: 'CANCELLED' };
        return q;
    });
    return result;
}

export function getJob(jobId) { return readQueue().jobs[jobId] || null; }
export function listJobs({ status = null, type = null, limit = 100 } = {}) {
    let rows = Object.values(readQueue().jobs);
    if (status) rows = rows.filter((j) => j.status === status);
    if (type) rows = rows.filter((j) => j.job_type === type);
    rows.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    return rows.slice(0, limit);
}
export function counts() {
    const c = {}; for (const j of Object.values(readQueue().jobs)) c[j.status] = (c[j.status] || 0) + 1;
    return c;
}

export default { JOB_TYPES, enqueue, claim, heartbeat, complete, fail, cancel, getJob, listJobs, counts, QUEUE_PATH };
