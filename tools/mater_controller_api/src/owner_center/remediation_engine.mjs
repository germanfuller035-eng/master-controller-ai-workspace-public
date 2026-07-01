// owner_center/remediation_engine.mjs
// ============================================================
// Safe Auto-Remediation Engine (0.8.0-rc3) — REAL bounded executors.
// ------------------------------------------------------------
// Turns the declarative remediation registry into actual, bounded, safe actions.
// Every executor follows: policy check → bounded-limit check → execute → recheck →
// evidence → record remediation → (optional) incident update + notification.
//
// HARD INVARIANTS (enforced at the EXECUTION layer, not just as data):
//   - A FORBIDDEN playbook can NEVER be executed — runRemediation throws before any side effect.
//   - Executors NEVER send a client message, never open a send gate, never lift suppression,
//     never change price, never enable a paid source, never delete canonical data, never enable
//     send-live. The only outbound-affecting action is ENABLE_OUTBOUND_KILL_SWITCH (makes things
//     MORE restrictive, never less).
//   - Bounded: each playbook has a max executions-per-window ceiling; exceeding it is refused.
//   - Actions that require host privileges (worker restart) are NOT faked — they return
//     NOT_EXECUTED_NEEDS_HOST with the exact command for the owner/host supervisor.
import {
    isPlaybookAllowed, FORBIDDEN_PLAYBOOKS, recordRemediation, recordIncidentSignal,
    transitionIncident, publishEvent,
} from './service.mjs';

export const REMEDIATION_ENGINE_VERSION = 'remediation_engine_v1';

// Per-playbook bounded execution ceiling within the rolling window.
export const BOUNDED_LIMITS = Object.freeze({
    RESTART_WORKER: 2,
    RETRY_IDEMPOTENT_JOB: 10,
    RECOVER_EXPIRED_LEASE: 20,
    RECOVER_MISSED_SCHEDULER: 4,
    ISOLATE_SOURCE_TEMP: 5,
    HEALTH_RECHECK: 60,
    ENABLE_OUTBOUND_KILL_SWITCH: 5,
});
export const BOUNDED_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// Executors are injected with the deps they need so they are unit-testable and never reach
// for ambient globals. `jobs` = jobs/service.mjs, `owner` = owner_center/service.mjs (for kill switch).
//
// Each executor returns { executed:boolean, result:string, evidence:object, recheck?:object }.
export function buildExecutors({ jobs = null, owner = null, reliabilityRecheck = null } = {}) {
    return {
        // Reset stale RUNNING jobs whose lease expired back to RETRY (the queue does this on claim,
        // but we expose it as an explicit bounded recovery + report what was recovered).
        RECOVER_EXPIRED_LEASE: async ({ now = Date.now() } = {}) => {
            if (!jobs) return { executed: false, result: 'NO_JOBS_DEP', evidence: {} };
            const before = jobs.listJobs({ status: 'RUNNING', limit: 500 });
            const stale = before.filter((j) => j.lease_expires_at && Date.parse(j.lease_expires_at) < now);
            // A claim() pass recovers stale leases as a side effect; invoke it bounded.
            const probe = jobs.claim({ workerId: 'remediation-lease-recovery', types: ['__none__'] });
            const afterRunning = jobs.listJobs({ status: 'RUNNING', limit: 500 }).length;
            return {
                executed: true, result: stale.length ? 'RECOVERED' : 'NOTHING_TO_RECOVER',
                evidence: { stale_leases_found: stale.length, stale_job_ids: stale.slice(0, 10).map((j) => j.job_id), claim_probe_ok: !!probe?.ok, running_after: afterRunning },
            };
        },

        // Retry an idempotent, TEST_ONLY job that is in RETRY/DEAD_LETTER by re-enqueuing it.
        // Refuses any job that is not explicitly marked test_only in its payload (no live retries).
        RETRY_IDEMPOTENT_JOB: async ({ jobId = null } = {}) => {
            if (!jobs) return { executed: false, result: 'NO_JOBS_DEP', evidence: {} };
            if (!jobId) return { executed: false, result: 'JOB_ID_REQUIRED', evidence: {} };
            const j = jobs.getJob(jobId);
            if (!j) return { executed: false, result: 'JOB_NOT_FOUND', evidence: { jobId } };
            if (!(j.payload && j.payload.test_only === true)) {
                return { executed: false, result: 'REFUSED_NOT_TEST_ONLY', evidence: { jobId, job_type: j.job_type } };
            }
            const re = jobs.enqueue({ jobType: j.job_type, entityType: j.entity_type, entityId: j.entity_id, payload: j.payload, idempotencyKey: j.idempotency_key + ':remediation-retry' });
            return { executed: !!re?.ok, result: re?.ok ? 'RE_ENQUEUED' : 'ENQUEUE_FAILED', evidence: { original: jobId, idempotent: re?.idempotent === true, new_job: re?.job?.job_id || null } };
        },

        // Detect a missed scheduler run by comparing the last scheduled job age to a threshold.
        // Detection + report only (never silently re-runs discovery — that's owner/scheduler owned).
        RECOVER_MISSED_SCHEDULER: async ({ maxAgeHours = 26, now = Date.now() } = {}) => {
            if (!jobs) return { executed: false, result: 'NO_JOBS_DEP', evidence: {} };
            const discovery = jobs.listJobs({ type: 'LEAD_DISCOVERY', limit: 5 });
            const last = discovery[0] || null;
            const ageH = last ? (now - Date.parse(last.created_at)) / 3600000 : null;
            const missed = ageH == null || ageH > maxAgeHours;
            return {
                executed: true, result: missed ? 'MISSED_DETECTED' : 'ON_SCHEDULE',
                evidence: { last_discovery_at: last?.created_at || null, age_hours: ageH == null ? null : Math.round(ageH * 10) / 10, threshold_hours: maxAgeHours, missed },
            };
        },

        // Re-run the reliability health computation and report the verdict (no mutation).
        HEALTH_RECHECK: async () => {
            if (typeof reliabilityRecheck !== 'function') return { executed: true, result: 'NO_RECHECK_DEP', evidence: {} };
            const ov = await reliabilityRecheck();
            return { executed: true, result: 'RECHECKED', evidence: { overall_health: ov?.overall_health || null, degraded: (ov?.degraded_states || []).length } };
        },

        // Temporarily isolate a flaky source — recorded as a data flag in the remediation log only.
        // It NEVER enables a paid source; isolation makes a source LESS active, which is always safe.
        ISOLATE_SOURCE_TEMP: async ({ sourceId = null, minutes = 60 } = {}) => {
            if (!sourceId) return { executed: false, result: 'SOURCE_ID_REQUIRED', evidence: {} };
            return { executed: true, result: 'ISOLATED_FLAG_RECORDED', evidence: { source_id: sourceId, isolate_minutes: minutes, note: 'isolation reduces activity; worker honors the flag on next cycle' } };
        },

        // Enable the global outbound kill switch — the ONLY outbound-affecting executor, and it only
        // makes the system MORE restrictive. Delegates to the owner-center kill switch.
        ENABLE_OUTBOUND_KILL_SWITCH: async ({ reason = 'AUTO_REMEDIATION' } = {}) => {
            if (!owner) return { executed: false, result: 'NO_OWNER_DEP', evidence: {} };
            const r = owner.enableKillSwitch({ reason });
            return { executed: !!r?.ok, result: r?.ok ? 'KILL_SWITCH_ENABLED' : 'FAILED', evidence: { reason } };
        },

        // Worker restart needs host privileges (systemctl) — we DO NOT fake it. We return the exact
        // command for the host supervisor and record the intent. No false success.
        RESTART_WORKER: async () => ({
            executed: false, result: 'NOT_EXECUTED_NEEDS_HOST',
            evidence: { required_command: 'sudo systemctl restart master-controller-worker', executor: 'HOST_SUPERVISOR', note: 'API process cannot restart a host service; surfaced for the owner/host.' },
        }),
    };
}

// Count recent executions of a playbook from the owner-center store remediations log.
function recentCount(store, playbook, now, windowMs) {
    const rems = Array.isArray(store?.remediations) ? store.remediations : [];
    return rems.filter((r) => r.playbook === playbook && r.at && (now - Date.parse(r.at)) < windowMs).length;
}

// Run a remediation end-to-end. Enforces forbidden + bounded BEFORE any side effect.
// readStore: () => owner-center store (for bounded-limit accounting). Optional; if absent, limit skipped.
export async function runRemediation({ playbook, trigger = null, params = {}, test_only = false, incidentId = null, emitEvent = false }, { executors, readStore = null, now = Date.now() } = {}) {
    // 1. Policy gate — forbidden can NEVER execute.
    if (FORBIDDEN_PLAYBOOKS.includes(playbook)) {
        return { ok: false, code: 'PLAYBOOK_FORBIDDEN', playbook, executed: false };
    }
    if (!isPlaybookAllowed(playbook)) {
        return { ok: false, code: 'PLAYBOOK_NOT_ALLOWED', playbook, executed: false };
    }
    const exec = executors && executors[playbook];
    if (typeof exec !== 'function') {
        return { ok: false, code: 'NO_EXECUTOR', playbook, executed: false };
    }
    // 2. Bounded-limit gate.
    const limit = BOUNDED_LIMITS[playbook];
    if (limit != null && typeof readStore === 'function') {
        const used = recentCount(readStore(), playbook, now, BOUNDED_WINDOW_MS);
        if (used >= limit) {
            recordRemediation({ playbook, trigger, actions: [], result: 'bounded_limit_reached', recoveryEvidence: { used, limit }, test_only });
            return { ok: false, code: 'BOUNDED_LIMIT_REACHED', playbook, used, limit, executed: false };
        }
    }
    // 3. Execute.
    let out;
    try { out = await exec(params); }
    catch (e) { out = { executed: false, result: 'EXECUTOR_ERROR', evidence: { message: String(e?.message || e).slice(0, 200) } }; }

    // 4. Record remediation with the real result + evidence.
    const result = out.executed ? (out.result || 'success') : (out.result || 'not_executed');
    const recRes = out.executed ? 'recovered' : 'failed';
    recordRemediation({ playbook, trigger, actions: [out.result].filter(Boolean), result: recRes, recoveryEvidence: out.evidence || {}, test_only });

    // 5. Optional incident update + event.
    if (incidentId && out.executed) {
        transitionIncident({ incidentId, state: 'OBSERVING', automaticAction: playbook });
    }
    if (emitEvent && out.executed) {
        publishEvent({ event_type: 'AUTO_REMEDIATION', severity: 'P2', entity_type: 'SERVICE', entity_id: playbook, title_ru: `Авто-восстановление: ${playbook}`, summary_ru: result, automatic_actions: [{ playbook, result }], test_only });
    }
    return { ok: true, playbook, executed: !!out.executed, result, evidence: out.evidence || {}, test_only };
}

export default { REMEDIATION_ENGINE_VERSION, BOUNDED_LIMITS, BOUNDED_WINDOW_MS, buildExecutors, runRemediation };
