// commercial/routes.mjs — Integration Wave 1 route registration.
// Registers feature-gated commercial read + command endpoints onto the existing API router using
// the existing auth/envelope/writer seams. Read gate OFF → FEATURE_DISABLED; command gate OFF →
// FEATURE_DISABLED with zero mutation. No send path exists. Called once from server/index.mjs.
import { reads, commands, FLAGS, COMMAND_GATE } from './service.mjs';

export function registerCommercialRoutes(r, { ok, fail, requireAuthOrService, requireAuth }) {
    const readGate = (handler) => (req, res) => {
        if (!FLAGS().read) return fail(res, 403, 'FEATURE_DISABLED', 'Коммерческий API отключён');
        return handler(req, res);
    };
    // Command gate (Gate C1-A granular). A command is reachable only when BOTH the master
    // command flag AND the command's specific granular flag are true. Payment maps to
    // paymentCommand (OFF in C1-A), so it returns FEATURE_DISABLED even with C1-A enabled.
    const commandGate = (fnName, argsFrom) => (req, res) => {
        const f = FLAGS();
        const requiredGate = COMMAND_GATE[fnName] || 'commandC1A';
        if (!f.command || !f[requiredGate]) return fail(res, 403, 'FEATURE_DISABLED', 'Коммерческие команды отключены');
        const idempotencyKey = req.headers['idempotency-key'] || req.body?.idempotencyKey || null;
        if (!idempotencyKey) return fail(res, 400, 'MISSING_IDEMPOTENCY', 'Требуется ключ идемпотентности');
        const expectedRevision = req.body?.expectedRevision ?? null;
        const out = commands._apply(fnName, argsFrom(req), { expectedRevision, idempotencyKey, updatedBy: req.device?.deviceId || 'commercial' });
        if (out.ok) return ok(res, out);
        if (out.code === 'REVISION_CONFLICT') return fail(res, 409, 'REVISION_CONFLICT', 'Данные изменились на сервере', { actual: out.actual });
        return fail(res, 422, out.code || 'COMMAND_FAILED', 'Команда отклонена');
    };

    // ---- READ endpoints (16) ----
    r.get('/commercial/summary', requireAuthOrService, readGate((req, res) => ok(res, reads.commercialSummary())));
    r.get('/commercial/integration-status', requireAuthOrService, readGate((req, res) => ok(res, reads.integrationStatus())));
    r.get('/commercial/technical-acceptance', requireAuthOrService, readGate((req, res) => ok(res, reads.technicalAcceptance())));
    r.get('/opportunities', requireAuthOrService, readGate((req, res) => ok(res, reads.opportunities())));
    r.get('/opportunities/:id', requireAuthOrService, readGate((req, res) => {
        const d = reads.opportunity(req.params.id); return d ? ok(res, d) : fail(res, 404, 'NOT_FOUND', 'Возможность не найдена');
    }));
    r.get('/products', requireAuthOrService, readGate((req, res) => ok(res, reads.productsView())));
    r.get('/products/:id', requireAuthOrService, readGate((req, res) => {
        const d = reads.product(req.params.id); return d ? ok(res, d) : fail(res, 404, 'NOT_FOUND', 'Продукт не найден');
    }));
    r.get('/offers', requireAuthOrService, readGate((req, res) => ok(res, reads.offers())));
    r.get('/offers/:id', requireAuthOrService, readGate((req, res) => {
        const d = reads.offer(req.params.id); return d ? ok(res, d) : fail(res, 404, 'NOT_FOUND', 'Предложение не найдено');
    }));
    r.get('/deals', requireAuthOrService, readGate((req, res) => ok(res, reads.deals())));
    r.get('/deals/:id', requireAuthOrService, readGate((req, res) => {
        const d = reads.deal(req.params.id); return d ? ok(res, d) : fail(res, 404, 'NOT_FOUND', 'Сделка не найдена');
    }));
    r.get('/delivery/handoffs', requireAuthOrService, readGate((req, res) => ok(res, reads.handoffs())));
    r.get('/delivery/projects', requireAuthOrService, readGate((req, res) => ok(res, reads.projects())));
    r.get('/delivery/projects/:id', requireAuthOrService, readGate((req, res) => {
        const d = reads.project(req.params.id); return d ? ok(res, d) : fail(res, 404, 'NOT_FOUND', 'Проект не найден');
    }));
    r.get('/finance/summary', requireAuthOrService, readGate((req, res) => ok(res, reads.financeSummary())));
    r.get('/finance/invoices', requireAuthOrService, readGate((req, res) => ok(res, reads.invoices())));
    r.get('/finance/invoices/:id', requireAuthOrService, readGate((req, res) => {
        const d = reads.invoice(req.params.id); return d ? ok(res, d) : fail(res, 404, 'NOT_FOUND', 'Счёт не найден');
    }));

    // ---- COMMAND endpoints (7) — require owner auth + write; gated OFF in Wave 1 ----
    r.post('/opportunities', requireAuth, commandGate('createOpportunity', (req) => ({ lead: req.body?.lead, productId: req.body?.productId, testOnly: req.body?.testOnly === true })));
    r.post('/opportunities/:id/prepare-offer', requireAuth, commandGate('prepareOffer', (req) => ({ opportunityId: req.params.id })));
    r.post('/offers/:id/decision', requireAuth, commandGate('recordOwnerDecision', (req) => ({ offerId: req.params.id, decision: req.body?.decision })));
    r.post('/deals/:id/delivery-handoff', requireAuth, commandGate('createHandoff', (req) => ({ dealId: req.params.id })));
    r.post('/delivery/handoffs/:id/create-project', requireAuth, commandGate('createProject', (req) => ({ handoffId: req.params.id })));
    r.post('/finance/invoices', requireAuth, commandGate('createInvoice', (req) => ({ dealId: req.body?.dealId, projectId: req.body?.projectId })));
    r.post('/finance/payments/record', requireAuth, commandGate('recordPayment', (req) => ({ invoiceId: req.body?.invoiceId, amount: req.body?.amount, evidenceType: req.body?.evidenceType, evidenceReference: req.body?.evidenceReference })));

    // ---- TEST_ONLY governance: archive acceptance run (C1-A gated; no deletion; idempotent) ----
    r.post('/commercial/test-only/archive', requireAuth, (req, res) => {
        const f = FLAGS();
        if (!f.command || !f.commandC1A) return fail(res, 403, 'FEATURE_DISABLED', 'Коммерческие команды отключены');
        const idempotencyKey = req.headers['idempotency-key'] || req.body?.idempotencyKey || null;
        if (!idempotencyKey) return fail(res, 400, 'MISSING_IDEMPOTENCY', 'Требуется ключ идемпотентности');
        const out = commands.archiveTestOnly({ idempotencyKey, expectedRevision: req.body?.expectedRevision ?? null, updatedBy: req.device?.deviceId || 'test_only_governance' });
        if (out.ok) return ok(res, out);
        if (out.code === 'REVISION_CONFLICT') return fail(res, 409, 'REVISION_CONFLICT', 'Данные изменились на сервере', { actual: out.actual });
        return fail(res, 422, out.code || 'ARCHIVE_FAILED', 'Архивация отклонена');
    });
}
