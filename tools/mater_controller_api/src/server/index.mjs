// server/index.mjs — Master Controller API entrypoint.
// Owner-only Express server over the existing AI_WORKSPACE Mini Audit services.
// No second store/ledger/send path. Autosend always blocked.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    PORT, BIND, API_BASE, ensureDirs, LOG_DIR, PID_FILE, LOCK_FILE, HEARTBEAT_PATH, OWNER_CENTER_STORE_PATH,
} from '../shared/config.mjs';
import { ok, fail, newRequestId, redact } from '../shared/http.mjs';
import * as auth from '../auth/auth.mjs';
import * as projects from '../projects/projects.mjs';
import * as system from '../system/system.mjs';
import * as ma from '../mini_audit/service.mjs';
import * as replies from '../replies/service.mjs';
import * as writes from '../writes/service.mjs';
import * as jobs from '../jobs/service.mjs';
import * as pipeline from '../pipeline/service.mjs';
// Phase 2 (release integration): Campaign Governor backend (no-send; additive).
import * as campaigns from '../campaigns/service.mjs';
// 0.8.0: Owner Command & Autonomy Center (deterministic; never sends).
import * as owner from '../owner_center/service.mjs';
import * as chiefOps from '../owner_center/chief_ops.mjs';
import * as reliability from '../owner_center/reliability.mjs';
import * as costCenter from '../owner_center/cost_center.mjs';
import * as backupCenter from '../owner_center/backup_center.mjs';
import * as fcmPush from '../owner_center/fcm_push.mjs';
import * as remediationEngine from '../owner_center/remediation_engine.mjs';
import * as telegramOwner from '../owner_center/telegram_owner.mjs';
import { buildManualCandidate } from '../leads/manual_intake.mjs';
import { registerCommercialRoutes } from '../commercial/routes.mjs';
import { registerServerFunnelRoutes } from '../server_funnel/routes.mjs';
import conversations from '../commercial/conversations.mjs';
import agents from '../commercial/agents.mjs';
import pipelineRead from '../commercial/pipeline_read.mjs';
import multichannel from '../commercial/multichannel.mjs';
import aiUsage from '../commercial/ai_usage_ledger.mjs';
import offerPreviewSvc from '../commercial/offer_preview.mjs';
import knowledgeRadar from '../commercial/knowledge_radar.mjs';
import providerRegistry from '../commercial/provider_registry.mjs';
import productPresentation from '../commercial/product_presentation.mjs';
import ownerSettings from '../commercial/owner_settings.mjs';
import domainReservoir from '../commercial/domain_reservoir.mjs';
import deliveryReconciliation from '../commercial/delivery_reconciliation.mjs';
import auditArtifact from '../commercial/audit_artifact.mjs';
import ownerTruth from '../commercial/owner_commercial_truth.mjs';
import ownerEvidence from '../commercial/owner_evidence.mjs';
import autonomyRuntime from '../commercial/autonomy_runtime.mjs';
import outreachQueue from '../commercial/outreach_queue.mjs';
import firstTouch from '../commercial/first_touch_service.mjs';
import firstTouchCommands from '../commercial/first_touch_commands.mjs';

ensureDirs();
auth.ensureServerSecret(); // create AI_SECRETS secret on first run (never printed)

const app = express();
app.use(express.json({ limit: '256kb', verify: (req, _res, buf) => { req.rawBody = buf ? buf.toString('utf8') : ''; } }));

// --- request id + safe logging ---
app.use((req, res, next) => {
    res.locals.requestId = newRequestId();
    res.setHeader('X-Request-Id', res.locals.requestId);
    next();
});

// --- naive in-memory rate limiter (per-IP, sliding window) ---
const RL = new Map();
app.use((req, res, next) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const win = 60000, max = 240;
    const arr = (RL.get(key) || []).filter((t) => now - t < win);
    arr.push(now);
    RL.set(key, arr);
    if (arr.length > max) return fail(res, 429, 'RATE_LIMITED', 'Слишком много запросов');
    next();
});

function logLine(obj) {
    try {
        fs.appendFileSync(path.join(LOG_DIR, 'mater_api.log'), `[${new Date().toISOString()}] ${redact(JSON.stringify(obj))}\n`, 'utf8');
    } catch { /* ignore */ }
}

// --- auth middleware (owner-only) ---
function requireAuth(req, res, next) {
    const hdr = String(req.headers.authorization || '');
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
    const device = auth.verifyAccess(token);
    if (!device) return fail(res, 401, 'UNAUTHORIZED', 'Требуется подключение устройства');
    req.device = device;
    next();
}

// --- write/capabilities gate ---
// The API is the canonical writer ONLY when MATER_CANONICAL_WRITER=true. Otherwise
// it is a read-only snapshot (or in maintenance) and rejects mutations with 503 so a
// client can never believe a write persisted. Capabilities are surfaced to clients.
function writeAllowed() {
    return process.env.MATER_CANONICAL_WRITER === 'true' && process.env.MATER_MAINTENANCE !== 'true';
}
function sendAllowed() {
    // send stays BLOCKED unless explicitly armed AND not in no-send test mode (autosend never).
    return writeAllowed() && process.env.EMAIL_REAL_SEND_ENABLED === 'true' && process.env.MATER_NO_SEND !== 'true';
}
function capabilities() {
    return { writeAllowed: writeAllowed(), sendAllowed: sendAllowed(), autosend: 'BLOCKED', canonicalWriter: process.env.MATER_CANONICAL_WRITER === 'true' };
}
function requireWrite(req, res, next) {
    if (process.env.MATER_MAINTENANCE === 'true') return fail(res, 503, 'MAINTENANCE', 'Сервис в режиме обслуживания');
    if (!writeAllowed()) return fail(res, 503, 'READ_ONLY', 'Запись недоступна: этот контур не является каноническим writer');
    next();
}

// --- service auth (worker/telegram) — bearer service token with coarse scopes ---
function requireService(scope) {
    return (req, res, next) => {
        const hdr = String(req.headers.authorization || '');
        const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
        const svc = auth.verifyService(token);
        if (!svc) return fail(res, 401, 'UNAUTHORIZED', 'Требуется service credential');
        if (scope && !svc.scopes.includes(scope)) return fail(res, 403, 'FORBIDDEN', 'Недостаточно прав');
        req.service = svc;
        next();
    };
}

// Accept EITHER an owner device token OR a service token (read endpoints workers also need).
function requireAuthOrService(req, res, next) {
    const hdr = String(req.headers.authorization || '');
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
    if (auth.verifyAccess(token)) { req.device = auth.verifyAccess(token); return next(); }
    const svc = auth.verifyService(token);
    if (svc) { req.service = svc; return next(); }
    return fail(res, 401, 'UNAUTHORIZED', 'Требуется подключение');
}

const r = express.Router();

// ---------- System (health is public; status requires auth) ----------
r.get('/health', (req, res) => ok(res, { status: 'ok', service: 'mater-controller-api', displayName: 'Master Controller', apiVersion: 'v1', time: new Date().toISOString() }));
r.get('/system/status', requireAuth, (req, res) => ok(res, system.getSystemStatus()));
r.get('/system/events', requireAuth, (req, res) => ok(res, { events: system.getRecentEvents() }));
r.post('/system/refresh', requireAuth, (req, res) => ok(res, system.getSystemStatus()));

// ---------- Auth / pairing ----------
r.post('/auth/pairing/start', (req, res) => {
    // Pairing start is allowed without a device token (bootstrap), but is
    // rate-limited and single-use + short-lived. Owner runs this from the PC.
    const out = auth.startPairing(req.body?.deviceName);
    logLine({ evt: 'pairing_start' });
    return ok(res, out);
});
r.post('/auth/pairing/complete', (req, res) => {
    const { code, deviceName } = req.body || {};
    const out = auth.completePairing(String(code || ''), deviceName);
    if (!out.ok) return fail(res, 400, out.code, 'Не удалось завершить подключение');
    logLine({ evt: 'pairing_complete', deviceId: out.deviceId });
    return ok(res, out);
});
r.post('/auth/refresh', (req, res) => {
    const out = auth.refresh(String(req.body?.refreshToken || ''));
    if (!out.ok) return fail(res, 401, out.code, 'Не удалось обновить токен');
    return ok(res, out);
});
r.get('/auth/devices', requireAuth, (req, res) => ok(res, { devices: auth.listDevices() }));
r.delete('/auth/devices/:deviceId', requireAuth, (req, res) => {
    const out = auth.revokeDevice(req.params.deviceId);
    if (!out.ok) return fail(res, 404, out.code, 'Устройство не найдено');
    return ok(res, { revoked: true });
});

// ---------- Projects ----------
r.get('/projects', requireAuth, (req, res) => ok(res, { projects: projects.listProjects() }));
r.get('/projects/:projectId', requireAuth, (req, res) => {
    const p = projects.getProject(req.params.projectId);
    if (!p) return fail(res, 404, 'PROJECT_NOT_FOUND', 'Проект не найден');
    return ok(res, p);
});

// ---------- Mini Audit overview ----------
r.get('/mini-audit/status', requireAuthOrService, (req, res) => ok(res, ma.getStatus()));
r.get('/mini-audit/next-action', requireAuthOrService, (req, res) => ok(res, ma.getNextAction()));
r.get('/mini-audit/metrics', requireAuthOrService, (req, res) => ok(res, ma.getMetrics()));

// ---------- Reconciliation read models (read-only; explain metrics, never mutate) ----------
r.get('/mini-audit/lead-count-definitions', requireAuthOrService, (req, res) => ok(res, ma.getLeadCountReconciliation()));
r.get('/mini-audit/send-reconciliation', requireAuthOrService, (req, res) => ok(res, ma.getSendReconciliation()));
r.get('/mini-audit/delivery-containment', requireAuthOrService, (req, res) => ok(res, ma.getDeliveryContainment()));

// ---------- Lead lists ----------
r.get('/mini-audit/leads', requireAuthOrService, (req, res) => {
    const { bucket, search, page, pageSize } = req.query;
    return ok(res, ma.getLeads({ bucket, search, page, pageSize }));
});
r.get('/mini-audit/leads/:leadId', requireAuthOrService, (req, res) => {
    const lead = ma.getLead(req.params.leadId);
    if (!lead) return fail(res, 404, 'LEAD_NOT_FOUND', 'Лид не найден');
    return ok(res, lead);
});

// ---------- Audit + previews ----------
r.get('/mini-audit/leads/:leadId/audit', requireAuthOrService, (req, res) => {
    const a = ma.getAudit(req.params.leadId);
    if (!a) return fail(res, 404, 'LEAD_NOT_FOUND', 'Лид не найден');
    return ok(res, a);
});
r.post('/mini-audit/leads/:leadId/audit/prepare', requireAuth, (req, res) => {
    // Preparation is a safe no-op stub in this version (generation handled by core
    // pipeline offline). Returns current audit state + guidance.
    const a = ma.getAudit(req.params.leadId);
    if (!a) return fail(res, 404, 'LEAD_NOT_FOUND', 'Лид не найден');
    return ok(res, { ...a, prepareRequested: true, note: 'Подготовка аудита выполняется в ядре Mini Audit.' });
});
r.get('/mini-audit/leads/:leadId/email-preview', requireAuthOrService, (req, res) => {
    const p = ma.getEmailPreview(req.params.leadId);
    if (!p) return fail(res, 404, 'LEAD_NOT_FOUND', 'Лид не найден');
    return ok(res, p);
});
r.post('/mini-audit/leads/:leadId/email-preview/prepare', requireAuth, (req, res) => {
    const p = ma.getEmailPreview(req.params.leadId);
    if (!p) return fail(res, 404, 'LEAD_NOT_FOUND', 'Лид не найден');
    return ok(res, { ...p, prepareRequested: true });
});

// ---------- Approval + actions ----------
// In-memory approval intents (process lifetime). Real send re-checks eligibility.
const approvals = new Map();
r.post('/mini-audit/leads/:leadId/send/prepare', requireAuth, (req, res) => {
    const check = ma.checkEligibility(req.params.leadId);
    if (!check.found) return fail(res, 404, 'LEAD_NOT_FOUND', 'Лид не найден');
    if (!check.eligibility.sendable) {
        return fail(res, 409, 'LEAD_NOT_SENDABLE', 'Лид не готов к отправке', { reasons: check.eligibility.reasons });
    }
    const approvalId = 'apr_' + newRequestId().slice(4);
    approvals.set(approvalId, { leadId: req.params.leadId, createdAt: Date.now(), status: 'pending' });
    return ok(res, {
        approvalId,
        leadId: req.params.leadId,
        company: check.lead.company || check.lead.lead_id,
        recipient: check.lead.email || check.lead.recipient,
        subject: check.eligibility.subject,
        body: check.eligibility.body,
        warning: 'Это реальная отправка письма клиенту. Требуется подтверждение владельца.',
        autosend: 'BLOCKED',
    });
});
r.post('/mini-audit/approvals/:approvalId/approve', requireAuth, async (req, res) => {
    const intent = approvals.get(req.params.approvalId);
    if (!intent) return fail(res, 404, 'APPROVAL_NOT_FOUND', 'Approval не найден');
    if (intent.status !== 'pending') return fail(res, 409, 'APPROVAL_ALREADY_PROCESSED', 'Уже обработано');
    intent.status = 'approved';
    // dryRun honors MATER_NO_SEND / EMAIL_REAL_SEND_ENABLED; during tests no real SMTP.
    const dryRun = process.env.MATER_NO_SEND === 'true';
    const out = await ma.performApprovedSend(intent.leadId, { dryRun });
    logLine({ evt: 'approval_approve', approvalId: req.params.approvalId, ok: out.ok, dryRun });
    if (!out.ok) return fail(res, 409, out.code || 'SEND_BLOCKED', 'Отправка не выполнена', { reasons: out.reasons || null });
    return ok(res, { sent: true, result: { ok: out.result?.ok, code: out.result?.code, channel: out.result?.channel } });
});
r.post('/mini-audit/approvals/:approvalId/reject', requireAuth, (req, res) => {
    const intent = approvals.get(req.params.approvalId);
    if (!intent) return fail(res, 404, 'APPROVAL_NOT_FOUND', 'Approval не найден');
    intent.status = 'rejected';
    return ok(res, { rejected: true });
});
r.post('/mini-audit/approvals/:approvalId/postpone', requireAuth, (req, res) => {
    const intent = approvals.get(req.params.approvalId);
    if (!intent) return fail(res, 404, 'APPROVAL_NOT_FOUND', 'Approval не найден');
    intent.status = 'postponed';
    return ok(res, { postponed: true });
});

// ---------- Follow-up ----------
r.get('/mini-audit/followups', requireAuthOrService, (req, res) => ok(res, { items: ma.getFollowups() }));
r.get('/mini-audit/followups/:leadId/preview', requireAuthOrService, (req, res) => {
    const p = ma.getFollowupPreview(req.params.leadId);
    if (!p) return fail(res, 404, 'FOLLOWUP_NOT_DUE', 'Follow-up не готов или лид не является due-кандидатом');
    return ok(res, p);
});
r.post('/mini-audit/followups/:leadId/prepare', requireAuth, (req, res) => {
    const p = ma.getFollowupPreview(req.params.leadId);
    if (!p) return fail(res, 404, 'FOLLOWUP_NOT_DUE', 'Follow-up не готов');
    return ok(res, { ...p, prepareRequested: true, autosend: 'BLOCKED' });
});
r.post('/mini-audit/followups/:leadId/postpone', requireAuth, (req, res) => ok(res, { leadId: req.params.leadId, postponed: true }));

// ---------- Send uncertain ----------
r.get('/mini-audit/send-uncertain', requireAuth, (req, res) => ok(res, { items: ma.getSendUncertain() }));
r.post('/mini-audit/send-uncertain/:leadId/check-proof', requireAuth, (req, res) => {
    const lead = ma.getLead(req.params.leadId);
    if (!lead) return fail(res, 404, 'LEAD_NOT_FOUND', 'Лид не найден');
    return ok(res, { leadId: req.params.leadId, proofChecked: true, sendProof: lead.sendProof, note: 'Повторная отправка не выполняется автоматически.' });
});

// ---------- Replies (read-only inbound; never sends, never mutates leads) ----------
r.get('/replies', requireAuthOrService, (req, res) => {
    const { category = null, status = null } = req.query || {};
    return ok(res, replies.listReplies({ category, status }));
});
r.get('/replies/open', requireAuthOrService, (req, res) => ok(res, replies.listOpenReplies()));
r.get('/replies/counts', requireAuthOrService, (req, res) => ok(res, replies.replyCounts()));
r.get('/replies/:replyId', requireAuthOrService, (req, res) => {
    const r2 = replies.getReplyDetail(req.params.replyId);
    if (!r2) return fail(res, 404, 'REPLY_NOT_FOUND', 'Ответ не найден');
    return ok(res, r2);
});

// ---------- Canonical writes (transactional; 2xx ONLY after confirmed persistence) ----------
// Capabilities so clients can hide write actions when this contour is read-only.
r.get('/capabilities', requireAuth, (req, res) => ok(res, capabilities()));
r.get('/store/revision', requireAuth, (req, res) => ok(res, { revision: writes.currentRevision() }));

function writeResult(res, out) {
    if (out.ok && out.written) return ok(res, out);
    if (out.ok && out.idempotent) return ok(res, out); // replay → prior result, no double-apply
    if (out.code === 'LEAD_NOT_FOUND') return fail(res, 404, 'LEAD_NOT_FOUND', 'Лид не найден');
    if (out.code === 'STATUS_NOT_WRITABLE') return fail(res, 400, 'STATUS_NOT_WRITABLE', 'Недопустимый статус');
    if (out.code === 'LEAD_ID_REQUIRED' || out.code === 'DRAFT_REQUIRED') return fail(res, 400, out.code, 'Некорректный запрос');
    return fail(res, 409, out.code || 'WRITE_FAILED', 'Запись не выполнена');
}
function runWrite(res, fn) {
    try { return writeResult(res, fn()); }
    catch (e) {
        if (e && e.code === 'STORE_REVISION_CONFLICT') {
            return fail(res, 409, 'STORE_REVISION_CONFLICT', 'Конфликт ревизии — обновите данные', { currentRevision: e.currentRevision });
        }
        return fail(res, 500, 'WRITE_ERROR', 'Ошибка записи');
    }
}

r.post('/mini-audit/leads/:leadId/status', requireAuth, requireWrite, (req, res) => {
    const { status, operationId = null, expectedRevision = null } = req.body || {};
    return runWrite(res, () => writes.updateLeadStatus({
        leadId: req.params.leadId, status, operationId, expectedRevision, updatedBy: req.device?.deviceId || 'api',
    }));
});
r.post('/mini-audit/leads/:leadId/draft', requireAuth, requireWrite, (req, res) => {
    const { draft, operationId = null, expectedRevision = null } = req.body || {};
    return runWrite(res, () => writes.saveLeadDraft({
        leadId: req.params.leadId, draft, operationId, expectedRevision, updatedBy: req.device?.deviceId || 'api',
    }));
});
r.post('/mini-audit/leads/:leadId/draft/reject', requireAuth, requireWrite, (req, res) => {
    const { reason = '', operationId = null, expectedRevision = null } = req.body || {};
    return runWrite(res, () => writes.rejectLeadDraft({
        leadId: req.params.leadId, reason, operationId, expectedRevision, updatedBy: req.device?.deviceId || 'api',
    }));
});

// ---------- Job queue (worker service credential) ----------
// Enqueue is owner OR worker; claim/heartbeat/complete/fail are worker-only.
r.post('/jobs/enqueue', requireService('jobs:read'), requireWrite, (req, res) => {
    const out = jobs.enqueue(req.body || {});
    if (!out.ok) return fail(res, 400, out.code || 'ENQUEUE_FAILED', 'Не удалось поставить job');
    return ok(res, out);
});
// Owner-initiated retry of a dead-lettered/failed job (owner token; re-enqueues idempotently).
// Distinct from the worker's jobs:read enqueue path so the Android owner action does not 401.
r.post('/jobs/:id/retry', requireAuth, requireWrite, (req, res) => {
    const j = jobs.getJob(req.params.id);
    if (!j) return fail(res, 404, 'JOB_NOT_FOUND', 'Задача не найдена');
    const out = jobs.enqueue({ jobType: j.job_type, entityType: j.entity_type, entityId: j.entity_id, payload: j.payload, idempotencyKey: `owner-retry:${j.job_id}` });
    if (!out.ok) return fail(res, 400, out.code || 'ENQUEUE_FAILED', 'Не удалось поставить job');
    return ok(res, out);
});
r.post('/jobs/claim', requireService('jobs:claim'), requireWrite, (req, res) => {
    const out = jobs.claim({ workerId: req.body?.workerId, types: req.body?.types || null, workerVersion: req.body?.workerVersion });
    return ok(res, out);
});
r.post('/jobs/:id/heartbeat', requireService('jobs:heartbeat'), (req, res) => {
    const out = jobs.heartbeat({ jobId: req.params.id, workerId: req.body?.workerId });
    if (!out.ok) return fail(res, 409, out.code, 'Heartbeat отклонён');
    return ok(res, out);
});
r.post('/jobs/:id/complete', requireService('jobs:complete'), requireWrite, (req, res) => {
    const out = jobs.complete({ jobId: req.params.id, workerId: req.body?.workerId, resultRef: req.body?.resultRef || null, operationId: req.body?.operationId || null });
    if (!out.ok) return fail(res, 409, out.code, 'Complete отклонён');
    return ok(res, out);
});
r.post('/jobs/:id/fail', requireService('jobs:fail'), (req, res) => {
    const out = jobs.fail({ jobId: req.params.id, workerId: req.body?.workerId, errorCode: req.body?.errorCode, errorMessage: req.body?.errorMessage, blocked: req.body?.blocked || null });
    if (!out.ok) return fail(res, 409, out.code, 'Fail отклонён');
    return ok(res, out);
});
r.post('/jobs/:id/cancel', requireAuth, requireWrite, (req, res) => {
    const out = jobs.cancel({ jobId: req.params.id });
    if (!out.ok) return fail(res, 404, out.code, 'Job не найден');
    return ok(res, out);
});
r.get('/jobs', requireAuth, (req, res) => ok(res, { jobs: jobs.listJobs({ status: req.query?.status || null, type: req.query?.type || null }) }));
r.get('/jobs/counts', requireAuth, (req, res) => ok(res, jobs.counts()));
r.get('/jobs/:id', requireAuth, (req, res) => {
    const j = jobs.getJob(req.params.id);
    if (!j) return fail(res, 404, 'JOB_NOT_FOUND', 'Job не найден');
    return ok(res, j);
});

// ---------- Lead pipeline (staging via worker; reads via owner) ----------
r.post('/leads/stage', requireService('leads:write'), requireWrite, (req, res) => {
    const out = pipeline.stageCandidate(req.body?.candidate || req.body || {}, { operationId: req.body?.operationId || null });
    if (!out.ok) return fail(res, 400, out.code || 'STAGE_FAILED', 'Не удалось создать candidate');
    return ok(res, out);
});

// ---------- Owner manual lead entry (B2B source: owner targets companies directly) ----------
// The owner adds a company (name + website); it enters the SAME verified pipeline as discovery
// (stage -> auto LEAD_VERIFY -> enrich -> identity -> audit -> first-touch). No scraping, no paid
// sources, no send. Owner-token only (not service). Accepts one item or an array (a small list).
r.post('/leads/manual', requireAuth, requireWrite, (req, res) => {
    const b = req.body || {};
    const rawItems = Array.isArray(b.items) ? b.items : [b];
    if (!rawItems.length || rawItems.length > 50) return fail(res, 400, 'INVALID_BATCH', 'Ожидается от 1 до 50 компаний');
    const idemKey = b.idempotency_key || req.headers['idempotency-key'] || null;
    const results = [];
    for (let i = 0; i < rawItems.length; i++) {
        const built = buildManualCandidate(rawItems[i]);
        if (!built.ok) { results.push({ index: i, ok: false, code: built.code, message: built.message }); continue; }
        const opId = idemKey ? `manual-${idemKey}-${i}` : null;
        const out = pipeline.stageCandidate(built.candidate, { operationId: opId });
        if (!out.ok) { results.push({ index: i, ok: false, code: out.code || 'STAGE_FAILED', company: built.candidate.company_name }); continue; }
        const result = out.duplicate ? 'DUPLICATE_BLOCKED' : (out.idempotent ? 'EVIDENCE_UPDATED' : 'CREATED');
        if (result === 'CREATED') {
            jobs.enqueue({ jobType: 'LEAD_VERIFY', entityType: 'lead', entityId: out.leadId, payload: { leadId: out.leadId }, idempotencyKey: `verify:${out.leadId}` });
        }
        results.push({ index: i, ok: true, company: built.candidate.company_name, result, canonical_lead_id: out.leadId, canonical_revision: out.revision ?? null });
    }
    const created = results.filter((r) => r.ok && r.result === 'CREATED').length;
    return ok(res, { submitted: rawItems.length, created, results, no_send: true });
});

// ---------- Lead Intelligence promotion (Lead Hunter → canonical via API ONLY) ----------
// Accepts a Lead Hunter candidate, maps it to a canonical STAGING lead (with candidate_score
// kept SEPARATE from canonical scoring), dedupes, and auto-enqueues LEAD_VERIFY. Idempotent
// by operation_id. Lead Hunter never writes canonical state — this endpoint is the only path.
r.post('/lead-intelligence/promote', requireService('leads:write'), requireWrite, (req, res) => {
    const b = req.body || {};
    const candidate = {
        candidate_id: b.candidate_id ? ('lh_' + String(b.candidate_id).replace(/^lh_/, '')) : null,
        source: b.source || 'lead_hunter',
        source_url: b.source_url || (b.provenance && b.provenance.ref) || null,
        source_record_id: (b.source_records && b.source_records[0]) || b.source_record_id || null,
        company_name: b.normalized_company || b.company_name,
        region: b.region || null, industry: b.industry || null, address: b.address || null,
        website_candidate: (b.website_candidates && b.website_candidates[0]) || b.website_candidate || null,
        phone_candidates: b.contact_candidates?.filter?.((c) => /\d{7,}/.test(String(c))) || b.phone_candidates || [],
        email_candidates: b.contact_candidates?.filter?.((c) => String(c).includes('@')) || b.email_candidates || [],
        evidence_refs: b.evidence_refs || b.provenance || [],
        risk_flags: b.risk_flags || [],
        candidate_score: b.candidate_score ?? null,
        candidate_score_version: b.candidate_score_version || null,
        candidate_classification: b.candidate_classification || null,
        provenance: b.provenance || null,
        correlation_id: b.correlation_id || null,
    };
    if (!candidate.company_name) return fail(res, 400, 'NO_COMPANY', 'normalized_company required');
    const out = pipeline.stageCandidate(candidate, { operationId: b.operation_id || b.idempotency_key || null });
    if (!out.ok) return fail(res, 400, out.code || 'PROMOTE_FAILED', 'promotion failed');
    // map to promotion result vocabulary + auto-enqueue verification for new leads
    let result = out.duplicate ? 'DUPLICATE_BLOCKED' : (out.idempotent ? 'EVIDENCE_UPDATED' : 'CREATED');
    if (result === 'CREATED') {
        jobs.enqueue({ jobType: 'LEAD_VERIFY', entityType: 'lead', entityId: out.leadId, payload: { leadId: out.leadId }, idempotencyKey: `verify:${out.leadId}` });
    }
    return ok(res, { ...out, promotion_result: result, canonical_lead_id: out.leadId, canonical_revision: out.revision ?? null });
});

r.get('/pipeline/by-status/:status', requireAuthOrService, (req, res) => ok(res, { items: pipeline.listByStatus(req.params.status) }));
r.get('/pipeline/counts', requireAuthOrService, (req, res) => ok(res, pipeline.countByStatus()));

// worker submits structured results; API persists transactionally (2xx only after commit)
r.post('/pipeline/leads/:id/verify', requireService('leads:write'), requireWrite, (req, res) => {
    const b = req.body || {};
    const out = pipeline.applyVerification({ leadId: req.params.id, ...b, operationId: b.operationId || null });
    if (!out.ok) return fail(res, out.code === 'LEAD_NOT_FOUND' ? 404 : 409, out.code || 'VERIFY_FAILED', 'verify failed');
    return ok(res, out);
});
r.post('/pipeline/leads/:id/score', requireService('leads:write'), requireWrite, (req, res) => {
    const out = pipeline.applyScore({ leadId: req.params.id, operationId: req.body?.operationId || null });
    if (!out.ok) return fail(res, out.code === 'LEAD_NOT_FOUND' ? 404 : 409, out.code || 'SCORE_FAILED', 'score failed');
    return ok(res, out);
});
r.post('/pipeline/leads/:id/audit', requireService('leads:write'), requireWrite, (req, res) => {
    const out = pipeline.applyAudit({ leadId: req.params.id, pageData: req.body?.pageData || {}, operationId: req.body?.operationId || null });
    if (!out.ok) return fail(res, out.code === 'LEAD_NOT_FOUND' ? 404 : 409, out.code || 'AUDIT_FAILED', 'audit failed', { code: out.code });
    return ok(res, out);
});
r.post('/pipeline/leads/:id/draft', requireService('leads:write'), requireWrite, (req, res) => {
    const out = pipeline.applyDraft({ leadId: req.params.id, jobId: req.body?.jobId || null, operationId: req.body?.operationId || null });
    if (!out.ok) return fail(res, out.code === 'LEAD_NOT_FOUND' ? 404 : 409, out.code || 'DRAFT_FAILED', 'draft blocked', { blockers: out.blockers || null });
    return ok(res, out);
});
r.post('/pipeline/leads/:id/followup', requireService('leads:write'), requireWrite, (req, res) => {
    const out = pipeline.applyFollowupPlan({ leadId: req.params.id, operationId: req.body?.operationId || null });
    if (!out.ok) return fail(res, out.code === 'LEAD_NOT_FOUND' ? 404 : 409, out.code || 'FOLLOWUP_FAILED', 'followup failed');
    return ok(res, out);
});
r.post('/pipeline/leads/:id/reply-draft', requireService('leads:write'), requireWrite, (req, res) => {
    const out = pipeline.applyReplyDraft({ leadId: req.params.id, reply: req.body?.reply || {}, operationId: req.body?.operationId || null });
    if (!out.ok) return fail(res, out.code === 'LEAD_NOT_FOUND' ? 404 : (out.code === 'REPLY_DRAFT_BLOCKED' ? 422 : 409), out.code || 'REPLY_DRAFT_FAILED', 'reply draft blocked', { reason: out.reason || null });
    return ok(res, out);
});

// ---------- Campaign Governor (Phase 2; owner-only writes, never sends; additive) ----------
function campaignWrite(res, out) {
    if (out.ok && (out.written || out.idempotent)) return ok(res, out);
    if (out.code === 'CAMPAIGN_NOT_FOUND' || out.code === 'COHORT_NOT_FOUND') return fail(res, 404, out.code, 'Не найдено');
    if (out.code === 'NAME_REQUIRED' || out.code === 'LEAD_IDS_REQUIRED') return fail(res, 400, out.code, 'Некорректный запрос');
    return fail(res, 409, out.code || 'CAMPAIGN_WRITE_FAILED', 'Операция отклонена', { details: out });
}
function runCampaignWrite(res, fn) {
    try { return campaignWrite(res, fn()); }
    catch (e) {
        if (e && e.code === 'STORE_REVISION_CONFLICT') return fail(res, 409, 'STORE_REVISION_CONFLICT', 'Конфликт ревизии', { currentRevision: e.currentRevision });
        return fail(res, 500, 'CAMPAIGN_WRITE_ERROR', 'Ошибка записи кампании');
    }
}
r.get('/campaigns', requireAuthOrService, (req, res) => ok(res, { campaigns: campaigns.listCampaigns({ includeTest: req.query?.includeTest === 'true' }) }));
r.get('/campaigns/:id', requireAuthOrService, (req, res) => {
    const c = campaigns.getCampaign(req.params.id);
    if (!c) return fail(res, 404, 'CAMPAIGN_NOT_FOUND', 'Кампания не найдена');
    return ok(res, c);
});
r.post('/campaigns', requireAuth, requireWrite, (req, res) => {
    const b = req.body || {};
    return runCampaignWrite(res, () => campaigns.createCampaign({ name: b.name, niche: b.niche, region: b.region, cohortSizes: b.cohortSizes, observationHours: b.observationHours, testOnly: b.testOnly === true, operationId: b.operationId || null }));
});
r.post('/campaigns/:id/activate', requireAuth, requireWrite, (req, res) => runCampaignWrite(res, () => campaigns.activateCampaign({ campaignId: req.params.id, operationId: req.body?.operationId || null })));
r.post('/campaigns/:id/pause', requireAuth, requireWrite, (req, res) => runCampaignWrite(res, () => campaigns.pauseCampaign({ campaignId: req.params.id, reason: req.body?.reason, note: req.body?.note, operationId: req.body?.operationId || null })));
r.post('/campaigns/:id/resume', requireAuth, requireWrite, (req, res) => runCampaignWrite(res, () => campaigns.resumeCampaign({ campaignId: req.params.id, operationId: req.body?.operationId || null })));
r.post('/campaigns/:id/complete', requireAuth, requireWrite, (req, res) => runCampaignWrite(res, () => campaigns.completeCampaign({ campaignId: req.params.id, operationId: req.body?.operationId || null })));
r.post('/campaigns/:id/archive', requireAuth, requireWrite, (req, res) => runCampaignWrite(res, () => campaigns.archiveCampaign({ campaignId: req.params.id, operationId: req.body?.operationId || null })));
r.post('/campaigns/:id/advance-cohort', requireAuth, requireWrite, (req, res) => runCampaignWrite(res, () => campaigns.advanceCohort({ campaignId: req.params.id, operationId: req.body?.operationId || null })));
r.post('/campaigns/:id/release-cohort', requireAuth, requireWrite, (req, res) => runCampaignWrite(res, () => campaigns.releaseCohort({ campaignId: req.params.id, leadIds: req.body?.leadIds || [], operationId: req.body?.operationId || null })));
r.post('/campaigns/:id/cohorts/:cohortId/close', requireAuth, requireWrite, (req, res) => runCampaignWrite(res, () => campaigns.closeCohort({ campaignId: req.params.id, cohortId: req.params.cohortId, force: !!req.body?.force, operationId: req.body?.operationId || null })));
r.post('/campaigns/:id/suppress', requireAuth, requireWrite, (req, res) => runCampaignWrite(res, () => campaigns.suppressLead({ campaignId: req.params.id, leadId: req.body?.leadId, reason: req.body?.reason, operationId: req.body?.operationId || null })));
r.post('/campaigns/:id/cohorts/:cohortId/outcome', requireAuthOrService, requireWrite, (req, res) => runCampaignWrite(res, () => campaigns.recordOutcome({ campaignId: req.params.id, cohortId: req.params.cohortId, leadId: req.body?.leadId, outcome: req.body?.outcome || {}, operationId: req.body?.operationId || null })));

// ---------- Owner Command & Autonomy Center (0.8.0; reads + safe owner commands; never sends) ----------
function ownerWrite(res, out) {
    if (out.ok && (out.written || out.idempotent)) return ok(res, out);
    if (/_NOT_FOUND$/.test(out.code || '')) return fail(res, 404, out.code, 'Не найдено');
    if (/^INVALID_|REQUIRED$|_OWNER_ONLY$|FORBIDDEN$|NOT_ALLOWED$/.test(out.code || '')) return fail(res, 400, out.code, 'Некорректный запрос');
    if (out.code === 'DECISION_REVISION_CONFLICT') return fail(res, 409, out.code, 'Конфликт ревизии решения', { currentRevision: out.currentRevision });
    return fail(res, 409, out.code || 'OWNER_WRITE_FAILED', 'Операция отклонена', { details: out });
}
function runOwnerWrite(res, fn) {
    try { return ownerWrite(res, fn()); }
    catch (e) {
        if (e && e.code === 'STORE_REVISION_CONFLICT') return fail(res, 409, 'STORE_REVISION_CONFLICT', 'Конфликт ревизии', { currentRevision: e.currentRevision });
        return fail(res, 500, 'OWNER_WRITE_ERROR', 'Ошибка записи');
    }
}
const incl = (req) => req.query?.includeTest === 'true';
// reads
r.get('/events', requireAuthOrService, (req, res) => ok(res, owner.listEvents({ severity: req.query?.severity || null, includeTest: incl(req) })));
r.get('/events/summary', requireAuthOrService, (req, res) => ok(res, owner.eventsSummary({ includeTest: incl(req) })));
r.get('/notifications', requireAuthOrService, (req, res) => ok(res, owner.listNotifications({ state: req.query?.state || null, includeTest: incl(req) })));
r.get('/notifications/unread-count', requireAuthOrService, (req, res) => ok(res, owner.unreadCount({ includeTest: incl(req) })));
r.get('/owner-decisions', requireAuthOrService, (req, res) => ok(res, owner.listDecisions({ status: req.query?.status || 'OPEN', includeTest: incl(req) })));
r.get('/incidents', requireAuthOrService, (req, res) => ok(res, owner.listIncidents({ activeOnly: req.query?.activeOnly !== 'false', includeTest: incl(req) })));
r.get('/incidents/summary', requireAuthOrService, (req, res) => ok(res, owner.incidentsSummary({ includeTest: incl(req) })));
r.get('/autopilot', requireAuthOrService, (req, res) => ok(res, owner.getAutopilot()));
r.get('/agents/status', requireAuthOrService, (req, res) => ok(res, chiefOps.agentsStatus()));
// brief + next-actions + command center snapshot (deterministic; built from owner store + live counts)
r.get('/command-brief', requireAuthOrService, (req, res) => {
    const snapshot = { pipeline: pipeline.countByStatus(), costMonthPct: 0, services: {} };
    let store = {}; try { store = JSON.parse(fs.readFileSync(OWNER_CENTER_STORE_PATH, 'utf8')); } catch { /* empty */ }
    return ok(res, chiefOps.buildCommandBrief({ funnel: {}, snapshot, store, kind: req.query?.kind || 'morning' }));
});
r.get('/next-actions', requireAuthOrService, (req, res) => {
    const snapshot = { pipeline: pipeline.countByStatus() };
    let store = {}; try { store = JSON.parse(fs.readFileSync(OWNER_CENTER_STORE_PATH, 'utf8')); } catch { /* empty */ }
    return ok(res, chiefOps.ownerSnapshot({ snapshot, store, includeTest: req.query?.includeTest === 'true' }));
});
// reliability overview (deterministic; health + queue + incidents + recovery; never sends)
r.get('/reliability', requireAuthOrService, (req, res) => {
    let sys = {}; try { sys = system.getSystemStatus(); } catch { sys = {}; }
    let counts = null; try { counts = jobs.counts(); } catch { counts = null; }
    let deadLetters = null; try { deadLetters = jobs.listJobs({ status: 'DEAD_LETTER', limit: 10 }); } catch { deadLetters = null; }
    let sources = null; try { sources = multichannel.sourceHealth(); } catch { sources = null; }
    let channels = null; try { channels = multichannel.channelHealth(); } catch { channels = null; }
    let store = {}; try { store = JSON.parse(fs.readFileSync(OWNER_CENTER_STORE_PATH, 'utf8')); } catch { /* empty */ }
    return ok(res, reliability.reliabilityOverview({ system: sys, counts, deadLetters, sources, channels, store }));
});
// commands (owner)
r.post('/notifications/:id/read', requireAuth, requireWrite, (req, res) => runOwnerWrite(res, () => owner.setNotificationState({ notificationId: req.params.id, state: req.body?.state || 'read' }, { operationId: req.body?.operationId || null })));
r.post('/owner-decisions/:id/resolve', requireAuth, requireWrite, (req, res) => runOwnerWrite(res, () => owner.resolveDecision({ decisionId: req.params.id, action: req.body?.action, note: req.body?.note, expectedDecisionRevision: req.body?.expectedDecisionRevision ?? null }, { operationId: req.body?.operationId || null })));
r.post('/incidents/:id/acknowledge', requireAuth, requireWrite, (req, res) => runOwnerWrite(res, () => owner.transitionIncident({ incidentId: req.params.id, state: 'ACKNOWLEDGED' }, { operationId: req.body?.operationId || null })));
r.post('/incidents/:id/mute', requireAuth, requireWrite, (req, res) => runOwnerWrite(res, () => owner.transitionIncident({ incidentId: req.params.id, state: 'MUTED' }, { operationId: req.body?.operationId || null })));
r.post('/operations/kill-switch/enable', requireAuth, requireWrite, (req, res) => runOwnerWrite(res, () => owner.enableKillSwitch({ reason: req.body?.reason || 'OWNER_REQUEST' }, { operationId: req.body?.operationId || null })));
r.post('/autopilot/mode', requireAuth, requireWrite, (req, res) => runOwnerWrite(res, () => owner.setAutopilotMode({ mode: req.body?.mode }, { operationId: req.body?.operationId || null })));
// internal: publish event (service token — used by worker/scheduler/security to feed the bus)
r.post('/events', requireService('jobs:read'), requireWrite, (req, res) => runOwnerWrite(res, () => owner.publishEvent(req.body?.event || req.body || {}, { operationId: req.body?.operationId || null })));

// ---------- Automation status (owner read) ----------
r.get('/automation/status', requireAuthOrService, (req, res) => {
    const c = jobs.counts();
    const pc = pipeline.countByStatus();
    return ok(res, {
        canonicalWriter: process.env.MATER_CANONICAL_WRITER === 'true',
        autosend: 'BLOCKED',
        sendAllowedLive: sendAllowed(),
        maintenance: process.env.MATER_MAINTENANCE === 'true',
        queue: c,
        pipeline: pc,
        deadLetter: c.DEAD_LETTER || 0,
        running: c.RUNNING || 0,
        queued: c.QUEUED || 0,
        blockedApproval: c.BLOCKED_APPROVAL || 0,
        storeRevision: writes.currentRevision(),
    });
});

// ---- Integration Wave 1: feature-gated commercial read/command routes (additive) ----
// Read gate OFF → FEATURE_DISABLED; command gate OFF → FEATURE_DISABLED with zero mutation; no send.
registerCommercialRoutes(r, { ok, fail, requireAuthOrService, requireAuth });

// ---- Server-connected commercial funnel (read/guard; no hidden send/payment/prod write) ----
registerServerFunnelRoutes(r, { ok, fail, requireAuthOrService, requireAuth });

// ---- Transport-readiness: conversation timeline + pre-sale health (READ-ONLY, gated) ----
const convGate = (handler) => (req, res) => {
    if (process.env.CONVERSATION_READ_API !== 'true') return fail(res, 403, 'FEATURE_DISABLED', 'Чтение диалогов отключено');
    return handler(req, res);
};
const csGate = (handler) => (req, res) => {
    if (process.env.CUSTOMER_SUCCESS_READ_API !== 'true') return fail(res, 403, 'FEATURE_DISABLED', 'Customer Success отключён');
    return handler(req, res);
};
// includeTest is an ACCEPTANCE-ONLY switch (same model as /first-touch): the debug app sends
// includeTest=BuildConfig.DEBUG and a service token may set it. Default false -> REAL_COMMERCIAL_ONLY
// (release / real owner sees no test/internal conversation). Owner production visibility is unchanged.
r.get('/conversations', requireAuthOrService, convGate((req, res) => ok(res, conversations.listConversations({ includeTest: req.query?.includeTest === 'true' }))));
r.get('/conversations/:id', requireAuthOrService, convGate((req, res) => {
    const c = conversations.getConversation(req.params.id); return c ? ok(res, c) : fail(res, 404, 'NOT_FOUND', 'Диалог не найден');
}));
r.get('/conversations/:id/timeline', requireAuthOrService, convGate((req, res) => {
    const t = conversations.getTimeline(req.params.id); return t ? ok(res, t) : fail(res, 404, 'NOT_FOUND', 'Диалог не найден');
}));
r.get('/conversations/:id/replies', requireAuthOrService, convGate((req, res) => ok(res, conversations.getReplies(req.params.id))));
r.get('/conversations/:id/followups', requireAuthOrService, convGate((req, res) => ok(res, conversations.getFollowups(req.params.id))));
r.get('/conversations/:id/presale-health', requireAuthOrService, csGate((req, res) => ok(res, conversations.getPresaleHealth(req.params.id, new Date().toISOString()))));

// ---- Agent shadow control plane (READ-ONLY; no writes, no send) ----
const agentGate = (handler) => (req, res) => {
    if (process.env.AGENT_RUNTIME !== 'true') return fail(res, 403, 'FEATURE_DISABLED', 'Агентский рантайм отключён');
    return handler(req, res);
};
r.get('/agents/status', requireAuthOrService, (req, res) => ok(res, agents.agentStatus()));
r.get('/agents/shadow-wave', requireAuthOrService, agentGate((req, res) => {
    const maxLeads = Math.min(20, Number(req.query.maxLeads) || 20);
    return ok(res, agents.runShadowWave({ maxLeads }));
}));
// ---- Live AI provider (Tokenator) health + bounded provider-backed shadow wave (no-send) ----
r.get('/agents/provider-health', requireAuthOrService, agentGate(async (req, res) => {
    const probe = String(req.query.probe || '') === 'true';
    try { return ok(res, await agents.providerHealth({ probe })); }
    catch (e) { return fail(res, 502, 'PROVIDER_PROBE_FAILED', 'Не удалось проверить провайдера'); }
}));
r.post('/agents/provider-shadow-wave', requireAuthOrService, agentGate(async (req, res) => {
    const maxLeads = Math.min(3, Number(req.body?.maxLeads) || 3); // hard cap 3 for first live run
    const leadIds = Array.isArray(req.body?.leadIds) ? req.body.leadIds.slice(0, 3) : null;
    try { return ok(res, await agents.runProviderShadowWave({ maxLeads, leadIds })); }
    catch (e) { return fail(res, 502, 'PROVIDER_RUN_FAILED', 'Ошибка теневого запуска провайдера'); }
}));
r.get('/pipeline/state-model', requireAuthOrService, (req, res) => ok(res, pipelineRead.stateModel()));
r.get('/owner-queues', requireAuthOrService, (req, res) => ok(res, pipelineRead.ownerQueues()));
r.get('/executive-brief', requireAuthOrService, (req, res) => ok(res, pipelineRead.executiveBrief()));

// ---- Authoritative offer preview (read-only; blockers from offer+ledger, hash on backend) ----
r.get('/offers/:id/preview', requireAuthOrService, (req, res) => {
    const p = offerPreviewSvc.offerPreview(req.params.id);
    return p ? ok(res, p) : fail(res, 404, 'NOT_FOUND', 'Предложение не найдено');
});
// ---- Delivery reconciliation (7 sends; ledger-authoritative effective commercial state) ----
r.get('/commercial/reconciliation', requireAuthOrService, (req, res) => ok(res, deliveryReconciliation.reconcile()));
// ---- Unified owner commercial truth (single source for all owner screens) ----
r.get('/commercial/truth', requireAuthOrService, (req, res) => ok(res, ownerTruth.truth()));
r.get('/commercial/truth/mini-audit', requireAuthOrService, (req, res) => ok(res, ownerTruth.miniAuditUnifiedMetrics()));
// ---- Owner-safe automation runtime. It queues no-send lead preparation only.
// Sending, payments and production writes remain behind separate approvals.
r.get('/commercial/autonomy/status', requireAuthOrService, (req, res) => ok(res, autonomyRuntime.autonomyStatus({ includeTest: req.query?.includeTest === 'true' })));
r.post('/commercial/autonomy/start-leadgen', requireAuth, requireWrite, (req, res) => {
    const out = autonomyRuntime.startLeadgenRound({ body: req.body || {}, includeTest: req.body?.includeTest === true });
    if (!out.ok) return fail(res, 409, out.status || 'LEADGEN_NOT_QUEUED', 'Поиск лидов не поставлен в очередь', out);
    return ok(res, out);
});
// ---- Owner outreach queue: canonical lead store + existing approved-send router.
// Reads are owner-visible; writes require canonical writer. The send route dispatches exactly one
// owner-confirmed message through the configured provider (or explicit mock mode in tests) and
// records the canonical ledger only after provider proof. Autosend/mass send remain blocked.
r.get('/commercial/outreach/queue', requireAuthOrService, (req, res) => ok(res, outreachQueue.queue({
    limit: req.query?.limit || 25,
    includeBlocked: req.query?.includeBlocked !== 'false',
})));
r.get('/commercial/outreach/stats', requireAuthOrService, (req, res) => ok(res, outreachQueue.stats()));
r.get('/commercial/outreach/leads/:leadId', requireAuthOrService, (req, res) => {
    const out = outreachQueue.detail(req.params.leadId);
    if (!out) return fail(res, 404, 'LEAD_NOT_FOUND', 'Лид не найден');
    return ok(res, out);
});
r.post('/commercial/outreach/leads/:leadId/draft', requireAuth, requireWrite, (req, res) => {
    const idempotencyKey = req.headers['idempotency-key'] || req.body?.idempotencyKey || null;
    if (!idempotencyKey) return fail(res, 400, 'MISSING_IDEMPOTENCY', 'Требуется ключ идемпотентности');
    const out = outreachQueue.saveDraft({
        leadId: req.params.leadId,
        subject: req.body?.subject,
        body: req.body?.body,
        operationId: idempotencyKey,
        expectedRevision: req.body?.expectedRevision ?? null,
        updatedBy: req.device?.deviceId || 'owner_outreach',
    });
    if (!out.ok) return fail(res, out.code === 'LEAD_NOT_FOUND' ? 404 : 422, out.code || 'DRAFT_NOT_SAVED', 'Черновик не сохранён', out);
    return ok(res, outreachQueue.detail(req.params.leadId) || out);
});
r.post('/commercial/outreach/leads/:leadId/send', requireAuth, requireWrite, async (req, res) => {
    const idempotencyKey = req.headers['idempotency-key'] || req.body?.idempotencyKey || null;
    if (!idempotencyKey) return fail(res, 400, 'MISSING_IDEMPOTENCY', 'Требуется ключ идемпотентности');
    try {
        const out = await outreachQueue.sendOne({
            leadId: req.params.leadId,
            exactRecipient: req.body?.exactRecipient,
            exactSubject: req.body?.exactSubject,
            exactBody: req.body?.exactBody,
            ownerConfirmation: req.body?.ownerConfirmation === true,
            provider: req.body?.provider || 'live',
            operationId: idempotencyKey,
            expectedRevision: req.body?.expectedRevision ?? null,
            updatedBy: req.device?.deviceId || 'owner_outreach',
        });
        if (!out.ok) return fail(res, 409, out.code || 'SEND_BLOCKED', 'Отправка не выполнена', out);
        return ok(res, out);
    } catch (e) {
        return fail(res, 500, 'SEND_FAILED', 'Отправка не выполнена', { reason: String(e?.message || e) });
    }
});
function outreachDecisionRoute(decision) {
    return (req, res) => {
        const idempotencyKey = req.headers['idempotency-key'] || req.body?.idempotencyKey || null;
        if (!idempotencyKey) return fail(res, 400, 'MISSING_IDEMPOTENCY', 'Требуется ключ идемпотентности');
        const out = outreachQueue.decide({
            leadId: req.params.leadId,
            decision,
            reason: req.body?.reason || '',
            operationId: idempotencyKey,
            expectedRevision: req.body?.expectedRevision ?? null,
            updatedBy: req.device?.deviceId || 'owner_outreach',
        });
        if (!out.ok) return fail(res, out.code === 'LEAD_NOT_FOUND' ? 404 : 422, out.code || 'DECISION_REJECTED', 'Решение не сохранено', out);
        return ok(res, out);
    };
}
r.post('/commercial/outreach/leads/:leadId/skip', requireAuth, requireWrite, outreachDecisionRoute('SKIP'));
r.post('/commercial/outreach/leads/:leadId/postpone', requireAuth, requireWrite, outreachDecisionRoute('POSTPONE'));
r.post('/commercial/outreach/leads/:leadId/reject', requireAuth, requireWrite, outreachDecisionRoute('REJECT'));
// ---- First Touch Strategist (read-only; no send, no transport) ----
// includeTest is an ACCEPTANCE-ONLY switch: the debug app sends includeTest=BuildConfig.DEBUG and a
// service token may set it. Default false -> COMMERCIAL_REAL_ONLY (release/real owner sees no test lead).
r.get('/first-touch/summary', requireAuthOrService, (req, res) => ok(res, firstTouch.summary(req.query?.includeTest === 'true')));
r.get('/first-touch/candidates', requireAuthOrService, (req, res) => {
    const p = firstTouch.pilotCandidates(req.query?.includeTest === 'true');
    // Surface blocked-but-scored leads (had no missing-data/test exclusion, only a safety hard gate) so
    // the owner sees WHY a plausible lead is not a safe pilot — never presenting them as sendable.
    const SAFETY = new Set(['BLOCKED_IDENTITY_MISMATCH', 'BLOCKED_CONTACT_UNVERIFIED', 'BLOCKED_UNCERTAIN_PRIOR_SEND', 'BLOCKED_PRIOR_SEND', 'CONTACT_NOT_EVIDENCED']);
    const blocked = p.all.filter((r) => !r.eligible && r.excluded_reasons.some((e) => SAFETY.has(e)))
        .map((r) => ({ lead_id: r.lead_id, company: r.company, blocked_reasons: r.excluded_reasons.filter((e) => SAFETY.has(e)) }));
    return ok(res, { leads_considered: p.leads_considered, leads_scored: p.leads_scored, pilot_eligible: p.pilot_eligible, top_5: p.top_5, top_3: p.top_3, recommended_pilot: p.recommended_pilot, blocked, no_send: true });
});
r.get('/first-touch/candidates/:leadId', requireAuthOrService, (req, res) => {
    const a = firstTouch.buildArtifact(req.params.leadId);
    return a ? ok(res, a) : fail(res, 404, 'NOT_FOUND', 'Лид не найден');
});
r.get('/first-touch/pilot-readiness', requireAuthOrService, (req, res) => {
    const p = firstTouch.pilotCandidates();
    const rec = p.recommended_pilot;
    return ok(res, {
        recommended_pilot: rec ? rec.lead_id : null,
        controlled_send_gate: 'DISABLED', transport_enabled: false, send_allowed_live: false,
        approval_token_issued: false, no_send: true,
        readiness: rec ? {
            contact_evidenced: rec.contact_evidenced, no_commercial_send: true, real_audit: rec.audit_ready,
            hook_confirmed: !!rec.hook_type, quality_ok: (rec.quality_score || 0) >= 85,
            owner_text_approved: false, transport_disabled: true,
        } : null,
    });
});
// ---- First Touch owner COMMAND layer (no-send; owner-auth + expectedRevision + idempotency).
// approve-text-only != approve-send. No route here issues a send token or enables transport. ----
function ftCmd(req, res, fn, extra) {
    const idempotencyKey = req.headers['idempotency-key'] || req.body?.idempotencyKey || null;
    if (!idempotencyKey) return fail(res, 400, 'MISSING_IDEMPOTENCY', 'Требуется ключ идемпотентности');
    const expectedRevision = req.body?.expectedRevision ?? null;
    const updatedBy = req.device?.deviceId || 'first_touch_owner';
    return runWrite(res, () => fn({ ...extra(req), idempotencyKey, expectedRevision, updatedBy }));
}
r.post('/first-touch/generate-draft', requireAuth, requireWrite, (req, res) =>
    ftCmd(req, res, firstTouchCommands.generateDraft, (q) => ({ leadId: q.body?.leadId })));
r.post('/first-touch/select-subject', requireAuth, requireWrite, (req, res) =>
    ftCmd(req, res, firstTouchCommands.selectSubject, (q) => ({ draftId: q.body?.draftId, subjectId: q.body?.subjectId })));
r.post('/first-touch/select-body', requireAuth, requireWrite, (req, res) =>
    ftCmd(req, res, firstTouchCommands.selectBody, (q) => ({ draftId: q.body?.draftId, bodyId: q.body?.bodyId })));
r.post('/first-touch/request-changes', requireAuth, requireWrite, (req, res) =>
    ftCmd(req, res, firstTouchCommands.requestChanges, (q) => ({ draftId: q.body?.draftId, note: q.body?.note })));
r.post('/first-touch/approve-text-only', requireAuth, requireWrite, (req, res) =>
    ftCmd(req, res, firstTouchCommands.approveTextOnly, (q) => ({ draftId: q.body?.draftId })));
r.post('/first-touch/reject', requireAuth, requireWrite, (req, res) =>
    ftCmd(req, res, firstTouchCommands.reject, (q) => ({ draftId: q.body?.draftId, reason: q.body?.reason })));
r.post('/first-touch/return-to-audit', requireAuth, requireWrite, (req, res) =>
    ftCmd(req, res, firstTouchCommands.returnToAudit, (q) => ({ draftId: q.body?.draftId })));
r.post('/first-touch/select-pilot', requireAuth, requireWrite, (req, res) =>
    ftCmd(req, res, firstTouchCommands.selectPilot, (q) => ({ leadId: q.body?.leadId })));
// Internal auto-fill: worker pre-generates a no-send first-touch package once a lead is pilot-eligible,
// so the owner's approval queue is always populated without a manual generate-draft command. Service-token
// only. Generates ONLY if the lead passes the SAME pilotCandidates hard-gate (identity/contact/audit/quality/
// compliance). Stable idempotency key -> repeat calls are no-ops. Never sends, never approves.
r.post('/first-touch/auto-generate/:leadId', requireService('leads:write'), requireWrite, (req, res) => {
    const leadId = req.params.leadId;
    const cand = firstTouch.pilotCandidates();
    const row = (cand.all || []).find((r) => String(r.lead_id) === String(leadId));
    if (!row || !row.eligible) {
        return ok(res, { ok: true, generated: false, reason: row ? ('NOT_ELIGIBLE:' + (row.excluded_reasons || []).join(',')) : 'LEAD_NOT_FOUND', no_send: true });
    }
    const out = firstTouchCommands.generateDraft({ leadId, idempotencyKey: `auto-ftd:${leadId}`, expectedRevision: null, updatedBy: 'auto_queue_filler' });
    if (!out.ok) return fail(res, 409, out.code || 'AUTO_DRAFT_FAILED', 'auto draft failed');
    return ok(res, { ...out, generated: !out.idempotent, no_send: true });
});
r.get('/commercial/audit-queue', requireAuthOrService, (req, res) => ok(res, ownerEvidence.auditQueue()));
r.get('/commercial/contacts/reconciliation', requireAuthOrService, (req, res) => ok(res, ownerEvidence.contactReconciliation()));
r.get('/leads/:id/contact-state', requireAuthOrService, (req, res) => {
    const s = ownerEvidence.contactState(req.params.id);
    return s ? ok(res, s) : fail(res, 404, 'NOT_FOUND', 'Лид не найден');
});
r.get('/commercial/dialogs', requireAuthOrService, (req, res) => ok(res, ownerEvidence.dialogs({ ownerMode: String(req.query.mode || 'owner') !== 'all' })));
r.get('/diagnostics/test-entities', requireAuthOrService, (req, res) => ok(res, ownerEvidence.diagnosticsTestEntities()));
r.get('/commercial/product-routing', requireAuthOrService, (req, res) => ok(res, ownerEvidence.productRouting()));
// ---- Lead artifacts: strict audit/email separation (audit is NEVER the email) ----
r.get('/leads/:id/artifacts', requireAuthOrService, (req, res) => {
    const a = auditArtifact.leadArtifacts(req.params.id);
    return a ? ok(res, a) : fail(res, 404, 'NOT_FOUND', 'Лид не найден');
});
r.get('/leads/:id/audit', requireAuthOrService, (req, res) => {
    const a = auditArtifact.miniAudit(req.params.id);
    return a ? ok(res, a) : fail(res, 404, 'NOT_FOUND', 'Лид не найден');
});
// ---- AI usage / cost dashboard (read-only; aggregated from the persistent usage ledger) ----
r.get('/ai/usage', requireAuthOrService, (req, res) => ok(res, aiUsage.usageSummary()));
r.get('/ai/usage/cumulative', requireAuthOrService, (req, res) => ok(res, { cumulative_calculated_units: aiUsage.cumulativeUnits(), entries: aiUsage.readUsageRows().length }));
r.get('/ai/usage/reconciliation', requireAuthOrService, (req, res) => ok(res, aiUsage.usageReconciliation()));
r.get('/ai/providers', requireAuthOrService, (req, res) => ok(res, providerRegistry.registry()));
// ---- Cost & Capacity Center (0.8.0; read-only aggregate; honest UNKNOWN; never spends) ----
r.get('/costs', requireAuthOrService, (req, res) => {
    let usageSummary = null; try { usageSummary = aiUsage.usageSummary(); } catch { usageSummary = null; }
    let reconciliation = null; try { reconciliation = aiUsage.usageReconciliation(); } catch { reconciliation = null; }
    let settings = null; try { settings = ownerSettings.getSettings(); } catch { settings = null; }
    let reg = null; try { reg = providerRegistry.registry(); } catch { reg = null; }
    let telemetry = null; try { telemetry = multichannel.sourceTelemetry(); } catch { telemetry = null; }
    return ok(res, costCenter.costOverview({ usageSummary, reconciliation, settings, providerRegistry: reg, sourceTelemetry: telemetry }));
});
// ---- Backup & Recovery Center (0.8.0; read + non-destructive drill; never restores live) ----
r.get('/backups/status', requireAuthOrService, (req, res) => ok(res, backupCenter.backupStatus()));
r.get('/backups/inventory', requireAuthOrService, (req, res) => ok(res, { items: backupCenter.protectedInventory().map((i) => ({ key: i.key, name_ru: i.name_ru, kind: i.kind, critical: i.critical })) }));
// Non-destructive restore verification (drill): reads backups into a temp file, validates, deletes temp.
r.get('/backups/restore-drill', requireAuthOrService, (req, res) => {
    const key = req.query?.key || null;
    return ok(res, key ? backupCenter.restoreDrill(String(key)) : backupCenter.restoreDrillAll());
});
// Rollback INSTRUCTIONS only (owner-executed manually; this endpoint never restores).
r.get('/backups/:key/rollback-instructions', requireAuthOrService, (req, res) => {
    const out = backupCenter.rollbackInstructions(req.params.key);
    return out.ok ? ok(res, out) : fail(res, 404, out.code || 'UNKNOWN_KEY', 'Неизвестный набор данных');
});
// ---- FCM Push (0.8.0; owner-facing operational push; DISABLED by default; never client outbound) ----
r.get('/push/status', requireAuthOrService, (req, res) => ok(res, fcmPush.status()));
r.get('/telegram-owner/status', requireAuthOrService, (req, res) => ok(res, telegramOwner.status()));
r.get('/push/preferences', requireAuth, (req, res) => ok(res, fcmPush.getPreferences(req.device?.deviceId || 'owner')));
// Device registers/refreshes its own push token (owner-auth; bound to the calling device).
r.post('/push/register', requireAuth, requireWrite, (req, res) => runOwnerWrite(res, () => fcmPush.registerToken({ deviceId: req.device?.deviceId || req.body?.deviceId, token: req.body?.token, platform: req.body?.platform || 'android', appVersion: req.body?.appVersion || null, prefs: req.body?.prefs || null }, { operationId: req.body?.operationId || null })));
r.post('/push/unregister', requireAuth, requireWrite, (req, res) => runOwnerWrite(res, () => fcmPush.unregisterToken({ deviceId: req.device?.deviceId || req.body?.deviceId, token: req.body?.token || null }, { operationId: req.body?.operationId || null })));
r.post('/push/preferences', requireAuth, requireWrite, (req, res) => runOwnerWrite(res, () => fcmPush.setPreferences({ deviceId: req.device?.deviceId || req.body?.deviceId, prefs: req.body?.prefs || {} }, { operationId: req.body?.operationId || null })));
// Internal: a routed notification asks push to deliver (service token). Suppressed unless LIVE.
r.post('/push/deliver', requireService('jobs:read'), requireWrite, async (req, res) => {
    try { return ok(res, await fcmPush.deliver({ event: req.body?.event || req.body || {} }, { operationId: req.body?.operationId || null })); }
    catch (e) { return fail(res, 500, 'PUSH_DELIVER_ERROR', 'Ошибка доставки'); }
});
// ---- Safe Auto-Remediation (0.8.0-rc3; bounded executors; forbidden playbooks fail closed) ----
function reliabilityOverviewNow() {
    let sys = {}; try { sys = system.getSystemStatus(); } catch { sys = {}; }
    let counts = null; try { counts = jobs.counts(); } catch { counts = null; }
    let deadLetters = null; try { deadLetters = jobs.listJobs({ status: 'DEAD_LETTER', limit: 10 }); } catch { deadLetters = null; }
    let store = {}; try { store = JSON.parse(fs.readFileSync(OWNER_CENTER_STORE_PATH, 'utf8')); } catch { /* empty */ }
    return reliability.reliabilityOverview({ system: sys, counts, deadLetters, store });
}
const remediationExecutors = remediationEngine.buildExecutors({ jobs, owner, reliabilityRecheck: async () => reliabilityOverviewNow() });
function readOwnerStoreSafe() { try { return JSON.parse(fs.readFileSync(OWNER_CENTER_STORE_PATH, 'utf8')); } catch { return {}; } }
// Read: allowed/forbidden playbooks + bounded limits (owner visibility).
r.get('/remediation/playbooks', requireAuthOrService, (req, res) => ok(res, {
    version: remediationEngine.REMEDIATION_ENGINE_VERSION,
    allowed: owner.ALLOWED_PLAYBOOKS, forbidden: owner.FORBIDDEN_PLAYBOOKS,
    bounded_limits: remediationEngine.BOUNDED_LIMITS, window_ms: remediationEngine.BOUNDED_WINDOW_MS,
}));
// Execute a bounded safe remediation. Owner-auth + requireWrite. Forbidden → 400. Never sends.
r.post('/remediation/run', requireAuth, requireWrite, async (req, res) => {
    try {
        const out = await remediationEngine.runRemediation(
            { playbook: req.body?.playbook, trigger: req.body?.trigger || 'OWNER_MANUAL', params: req.body?.params || {}, test_only: req.body?.test_only === true, incidentId: req.body?.incidentId || null, emitEvent: req.body?.emitEvent === true },
            { executors: remediationExecutors, readStore: readOwnerStoreSafe },
        );
        if (out.ok) return ok(res, out);
        if (out.code === 'PLAYBOOK_FORBIDDEN' || out.code === 'PLAYBOOK_NOT_ALLOWED') return fail(res, 400, out.code, 'Плейбук запрещён', { details: out });
        if (out.code === 'BOUNDED_LIMIT_REACHED') return fail(res, 429, out.code, 'Достигнут лимит авто-восстановления', { details: out });
        return fail(res, 409, out.code || 'REMEDIATION_FAILED', 'Восстановление не выполнено', { details: out });
    } catch (e) { return fail(res, 500, 'REMEDIATION_ERROR', 'Ошибка восстановления'); }
});
// ---- Product presentation (RU localization, read-only) ----
r.get('/products/presentation', requireAuthOrService, (req, res) => ok(res, productPresentation.allPresentations()));
r.get('/products/:code/presentation', requireAuthOrService, (req, res) => {
    const p = productPresentation.productPresentation(req.params.code);
    return p ? ok(res, p) : fail(res, 404, 'NOT_FOUND', 'Продукт не найден');
});
// ---- Source telemetry (normalized states, read-only) ----
r.get('/sources/telemetry', requireAuthOrService, (req, res) => ok(res, multichannel.sourceTelemetry()));
// ---- Owner automation settings (read + safe command) ----
r.get('/owner/settings', requireAuthOrService, (req, res) => ok(res, ownerSettings.getSettings()));
r.get('/owner/settings/audit', requireAuthOrService, (req, res) => ok(res, ownerSettings.getAuditHistory()));
r.post('/owner/settings', requireAuth, requireWrite, (req, res) => {
    const out = ownerSettings.updateSettings(req.body || {}, { ownerIdentity: req.device?.deviceId || 'owner' });
    if (out.ok) return ok(res, out);
    if (out.code === 'REVISION_CONFLICT') return fail(res, 409, 'REVISION_CONFLICT', 'Настройки изменились на сервере', { actual: out.actual });
    return fail(res, 422, out.code || 'SETTINGS_REJECTED', out.message || 'Настройки отклонены', { errors: out.errors });
});
// ---- Domain Reservoir + Free-First pipeline (read-only + bounded TEST_ONLY collection) ----
r.get('/reservoir/summary', requireAuthOrService, (req, res) => ok(res, domainReservoir.summary()));
r.get('/reservoir/funnel', requireAuthOrService, (req, res) => ok(res, domainReservoir.funnel()));
r.get('/reservoir/counters', requireAuthOrService, (req, res) => ok(res, domainReservoir.counters()));
r.get('/reservoir/domains', requireAuthOrService, (req, res) => ok(res, domainReservoir.list()));
r.get('/reservoir/domains/:id', requireAuthOrService, (req, res) => {
    const d = domainReservoir.detail(req.params.id);
    return d ? ok(res, d) : fail(res, 404, 'NOT_FOUND', 'Домен не найден');
});
r.get('/reservoir/common-crawl/probe', requireAuthOrService, (req, res) => ok(res, domainReservoir.commonCrawlProbe()));
r.post('/reservoir/common-crawl/test-run', requireAuthOrService, agentGate(async (req, res) => {
    try { return ok(res, await domainReservoir.commonCrawlTestRun({ maxHosts: Math.min(1000, Number(req.body?.maxHosts) || 1000) })); }
    catch (e) { return fail(res, 502, 'CC_RUN_FAILED', 'Ошибка тестового импорта Common Crawl'); }
}));
// ---- Knowledge Radar (read-only; proposals never change production) ----
r.get('/knowledge/status', requireAuthOrService, (req, res) => ok(res, knowledgeRadar.status()));
r.get('/knowledge/radar-status', requireAuthOrService, (req, res) => ok(res, knowledgeRadar.radarStatus()));
r.get('/knowledge/sources', requireAuthOrService, (req, res) => ok(res, knowledgeRadar.sources()));
r.get('/knowledge/digest', requireAuthOrService, (req, res) => ok(res, knowledgeRadar.digest(String(req.query.window || 'weekly'))));
r.post('/knowledge/collect', requireAuthOrService, agentGate(async (req, res) => {
    try { return ok(res, await knowledgeRadar.runCollection({ window: req.body?.window || 'weekly', live: false })); }
    catch (e) { return fail(res, 502, 'RADAR_RUN_FAILED', 'Ошибка сбора Радара знаний'); }
}));

// ---- Multichannel read models (read-only) ----
r.get('/sources', requireAuthOrService, (req, res) => ok(res, multichannel.sources()));
r.get('/sources/health', requireAuthOrService, (req, res) => ok(res, multichannel.sourceHealth()));
r.get('/sources/:id', requireAuthOrService, (req, res) => { const s = multichannel.sourceById(req.params.id); return s ? ok(res, s) : fail(res, 404, 'NOT_FOUND', 'Источник не найден'); });
r.get('/channels', requireAuthOrService, (req, res) => ok(res, multichannel.channels()));
r.get('/channels/health', requireAuthOrService, (req, res) => ok(res, multichannel.channelHealth()));
r.get('/identities/:companyId', requireAuthOrService, (req, res) => { const i = multichannel.identities(req.params.companyId); return i ? ok(res, i) : fail(res, 404, 'NOT_FOUND', 'Компания не найдена'); });
r.get('/identities-conflicts', requireAuthOrService, (req, res) => ok(res, multichannel.identityConflicts()));
r.get('/contact-policy/:leadId', requireAuthOrService, (req, res) => ok(res, multichannel.contactPolicy(req.params.leadId)));
r.get('/inbound', requireAuthOrService, (req, res) => ok(res, multichannel.inboundList()));
r.get('/inbound/:id', requireAuthOrService, (req, res) => { const s = multichannel.inboundById(req.params.id); return s ? ok(res, s) : fail(res, 404, 'NOT_FOUND', 'Заявка не найдена'); });
r.get('/owner-queues/multichannel', requireAuthOrService, (req, res) => ok(res, multichannel.multichannelOwnerQueue()));

// ---- Public intake (no auth; validated, rate-limited at edge; never sends) ----
r.post('/public/intake', (req, res) => {
    if (process.env.WEB_INTAKE === 'false') return fail(res, 403, 'FEATURE_DISABLED', 'Приём заявок отключён');
    const v = multichannel.validateIntake(req.body || {});
    if (!v.ok) return fail(res, 400, 'INVALID_SUBMISSION', 'Заявка не прошла проверку', { errors: v.errors });
    // Staging only in this build: accepted + echoed; canonical promotion is owner/worker-gated.
    const record = multichannel.buildIntakeRecord(req.body || {}, 'web_intake', new Date().toISOString());
    return ok(res, { accepted: true, submission_id: record.id, status: 'STAGED', note: 'Заявка принята на модерацию. Сообщений не отправляется.' });
});
r.post('/public/mini-audit-request', (req, res) => {
    if (process.env.WEB_INTAKE === 'false') return fail(res, 403, 'FEATURE_DISABLED', 'Приём заявок отключён');
    const v = multichannel.validateIntake({ ...req.body, product_interest: 'mini_audit' });
    if (!v.ok) return fail(res, 400, 'INVALID_SUBMISSION', 'Заявка не прошла проверку', { errors: v.errors });
    return ok(res, { accepted: true, status: 'STAGED', product: 'mini_audit' });
});

// ---- Webhooks (signature-verified; never dispatch; quarantine unknown) ----
const webhookHandler = (channel, flagEnv, secretEnv) => (req, res) => {
    if (process.env[flagEnv] !== 'true') return fail(res, 403, 'FEATURE_DISABLED', 'Канал не активирован');
    const v = multichannel.verifyWebhook({
        rawBody: req.rawBody, signatureHeader: req.headers['x-signature'] || req.headers['x-hub-signature-256'] || null,
        secret: process.env[secretEnv] || null, timestamp: req.headers['x-timestamp'], nowMs: Date.now(),
        seenIds: globalThis.__webhookSeen || (globalThis.__webhookSeen = new Set()), eventId: req.body?.event_id,
    });
    if (v.state === 'VERIFIED') { if (req.body?.event_id) globalThis.__webhookSeen.add(req.body.event_id); return ok(res, { channel, state: 'PROCESSED', sent: false }); }
    if (v.state === 'DUPLICATE') return ok(res, { channel, state: 'DUPLICATE', sent: false });
    return fail(res, 400, v.state, `webhook ${v.reason}`);
};
r.post('/webhooks/vk', webhookHandler('VK', 'VK_INBOUND', 'VK_WEBHOOK_SECRET'));
r.post('/webhooks/max', webhookHandler('MAX', 'MAX_INBOUND', 'MAX_WEBHOOK_SECRET'));
r.post('/webhooks/telegram-client', webhookHandler('TELEGRAM', 'CLIENT_TELEGRAM_INBOUND', 'CLIENT_TELEGRAM_SECRET'));

app.use(API_BASE, r);

// 404 + error handlers (safe — no stack traces in responses)
app.use((req, res) => fail(res, 404, 'NOT_FOUND', 'Маршрут не найден'));
app.use((err, req, res, next) => {
    logLine({ evt: 'error', msg: redact(String(err && err.message || err)) });
    return fail(res, 500, 'INTERNAL', 'Внутренняя ошибка');
});

// --- single-instance lock + heartbeat ---
function writeHeartbeat() {
    try {
        fs.writeFileSync(HEARTBEAT_PATH, JSON.stringify({
            pid: process.pid, startedAt: globalThis.__startedAt, lastBeat: new Date().toISOString(),
            bind: BIND, port: PORT, status: 'running',
        }, null, 2), 'utf8');
    } catch { /* ignore */ }
}

export function startServer() {
    globalThis.__startedAt = new Date().toISOString();
    try { fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, startedAt: globalThis.__startedAt }), 'utf8'); } catch { /* ignore */ }
    try { fs.writeFileSync(PID_FILE, String(process.pid), 'utf8'); } catch { /* ignore */ }
    const server = app.listen(PORT, BIND, () => {
        writeHeartbeat();
        // eslint-disable-next-line no-console
        console.log(`Master Controller API listening on ${BIND}:${PORT} (${API_BASE})`);
    });
    const hb = setInterval(writeHeartbeat, 15000);
    const shutdown = () => { clearInterval(hb); try { fs.unlinkSync(LOCK_FILE); } catch {} try { fs.unlinkSync(PID_FILE); } catch {} server.close(() => process.exit(0)); };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return server;
}

// Export app for tests; start only when run directly.
export { app };
// Cross-platform "run directly" detection (Windows + Linux). The earlier
// new URL(...).pathname hack mangled POSIX paths; fileURLToPath is correct on both.
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (process.env.MATER_API_AUTOSTART !== 'false' && (isMain || process.env.MATER_API_AUTOSTART === 'true')) {
    startServer();
}
