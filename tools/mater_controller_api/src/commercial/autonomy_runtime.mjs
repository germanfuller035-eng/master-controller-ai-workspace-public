// commercial/autonomy_runtime.mjs
// Owner-controlled automation runtime. It may enqueue lead discovery and
// no-send preparation jobs, but it never sends, never pays, and never writes
// production DB.

import * as jobs from '../jobs/service.mjs';
import * as pipeline from '../pipeline/service.mjs';
import firstTouch from './first_touch_service.mjs';

export const AUTONOMY_FLAGS = Object.freeze({
    LEAD_DISCOVERY_ENABLED: true,
    VERIFY_ENABLED: true,
    AUDIT_AND_DRAFT_ENABLED: true,
    OWNER_APPROVAL_REQUIRED_FOR_SEND: true,
    AUTO_SEND_ENABLED: false,
    AUTO_REPLY_ENABLED: false,
    MASS_SEND_ENABLED: false,
    PAYMENT_LIVE_ENABLED: false,
    PRODUCTION_DB_WRITE_ENABLED: false,
});

const DEFAULT_BBOX = Object.freeze([44.95, 38.85, 45.15, 39.10]);
const DEFAULT_NICHES = Object.freeze([
    'construction',
    'shop=doityourself',
    'shop=hardware',
    'craft=metal_construction',
    'shop=trade',
]);

function isoHour(now = new Date()) {
    const d = now instanceof Date ? now : new Date(now);
    return d.toISOString().slice(0, 13);
}

function boundedLimit(value) {
    const n = Number(value || 20);
    if (!Number.isFinite(n)) return 20;
    return Math.max(1, Math.min(50, Math.floor(n)));
}

function chooseNiche(body = {}, now = new Date()) {
    if (typeof body.niche === 'string' && body.niche.trim()) return body.niche.trim();
    const d = now instanceof Date ? now : new Date(now);
    return DEFAULT_NICHES[d.getUTCDate() % DEFAULT_NICHES.length];
}

function chooseBbox(body = {}) {
    const raw = Array.isArray(body.bbox) ? body.bbox : DEFAULT_BBOX;
    const parsed = raw.map(Number);
    if (parsed.length !== 4 || parsed.some((x) => !Number.isFinite(x))) return [...DEFAULT_BBOX];
    return parsed;
}

function queuedCount(type) {
    return jobs.listJobs({ type, limit: 500 })
        .filter((j) => ['QUEUED', 'RETRY', 'RUNNING', 'BLOCKED_APPROVAL', 'BLOCKED_DEPENDENCY'].includes(j.status))
        .length;
}

function recentJobs(type, limit = 5) {
    return jobs.listJobs({ type, limit }).map((j) => ({
        job_id: j.job_id,
        job_type: j.job_type,
        status: j.status,
        created_at: j.created_at,
        updated_at: j.updated_at,
        last_error_code: j.last_error_code || null,
    }));
}

export function autonomyStatus({ includeTest = false } = {}) {
    const jobCounts = jobs.counts();
    const pipelineCounts = pipeline.countByStatus();
    const firstTouchSummary = firstTouch.summary(includeTest);
    const activeDiscovery = queuedCount('LEAD_DISCOVERY');
    const activeVerify = queuedCount('LEAD_VERIFY') + queuedCount('LEAD_SCORE');
    const activePrep = queuedCount('AUDIT_GENERATE') + queuedCount('DRAFT_GENERATE') + queuedCount('FIRST_TOUCH_DRAFT_GENERATE');
    const readyForOwner = Number(firstTouchSummary?.approval_pending || firstTouchSummary?.ready || firstTouchSummary?.pilot_eligible || 0);
    const working = activeDiscovery + activeVerify + activePrep;

    return {
        version: 'owner_safe_autonomy_v1',
        enabled: true,
        mode: 'OWNER_APPROVES_SEND_ONLY',
        flags: AUTONOMY_FLAGS,
        job_counts: jobCounts,
        pipeline_counts: pipelineCounts,
        active: {
            lead_discovery_jobs: activeDiscovery,
            verification_jobs: activeVerify,
            preparation_jobs: activePrep,
            total_working_jobs: working,
        },
        first_touch: {
            leads_considered: firstTouchSummary?.leads_considered || 0,
            pilot_eligible: firstTouchSummary?.pilot_eligible || 0,
            approval_pending: firstTouchSummary?.approval_pending || 0,
        },
        recent_discovery_jobs: recentJobs('LEAD_DISCOVERY', 5),
        owner_visible_ru: {
            status: working > 0
                ? 'Автоподготовка работает. Система ищет и готовит лиды без отправки.'
                : 'Автоподготовка готова, но сейчас нет активных задач поиска.',
            next_action: readyForOwner > 0
                ? 'Откройте готовые черновики и подтвердите одну отправку.'
                : 'Запустите поиск лидов или дождитесь планировщика.',
            blocker: working > 0
                ? null
                : 'Если после запуска лиды не появляются, проверьте, что серверный воркер запущен.',
        },
        safety: {
            auto_send: 'OFF',
            auto_reply: 'OFF',
            mass_send: 'OFF',
            payment_live: 'OFF',
            production_db_write: 'OFF',
            outbound_count: 0,
            payment_count: 0,
            production_db_writes: 0,
        },
    };
}

export function startLeadgenRound({ body = {}, includeTest = false, now = new Date() } = {}) {
    const limit = boundedLimit(body.limit);
    const niche = chooseNiche(body, now);
    const bbox = chooseBbox(body);
    const region = typeof body.region === 'string' && body.region.trim() ? body.region.trim() : null;
    const idempotencyKey = body.idempotencyKey || `owner-leadgen:${isoHour(now)}:${niche}`;
    const discovery = jobs.enqueue({
        jobType: 'LEAD_DISCOVERY',
        payload: { niche, bbox, limit, region },
        idempotencyKey,
        priority: Number.isFinite(Number(body.priority)) ? Number(body.priority) : 4,
    });

    const candidates = firstTouch.pilotCandidates(includeTest);
    const eligible = (candidates?.top_5 || []).map((x) => x.lead_id).filter(Boolean);
    const prepared = [];
    for (const leadId of eligible) {
        const q = jobs.enqueue({
            jobType: 'FIRST_TOUCH_DRAFT_GENERATE',
            entityType: 'lead',
            entityId: leadId,
            payload: { leadId },
            idempotencyKey: `ftdraft:${leadId}`,
            priority: 3,
        });
        prepared.push({ lead_id: leadId, queued: q.ok === true, idempotent: q.idempotent === true });
    }

    return {
        ok: discovery.ok === true,
        status: discovery.ok === true ? 'LEADGEN_QUEUED' : 'LEADGEN_NOT_QUEUED',
        discovery_job: discovery.job || null,
        idempotent: discovery.idempotent === true,
        requested: { niche, bbox, limit, region },
        prepared_existing_leads: prepared,
        owner_visible_ru: {
            status: discovery.ok === true
                ? 'Поиск лидов поставлен в очередь. Система продолжит проверку и подготовку сама.'
                : 'Поиск лидов не поставлен в очередь.',
            next_action: 'Оставьте приложение открытым или вернитесь позже: готовые черновики появятся в решениях владельца.',
            blocker: discovery.ok === true ? null : (discovery.code || 'QUEUE_ERROR'),
        },
        safety: {
            auto_send: 'OFF',
            auto_reply: 'OFF',
            mass_send: 'OFF',
            payment_live: 'OFF',
            production_db_write: 'OFF',
            outbound_count: 0,
            payment_count: 0,
            production_db_writes: 0,
        },
        after: autonomyStatus({ includeTest }),
    };
}

export default { AUTONOMY_FLAGS, autonomyStatus, startLeadgenRound };
