// commercial/service.mjs — Integration Wave 1 production adapter.
// Bridges the Master Controller HTTP API to the commercial_core engine over the SINGLE canonical
// writer seam (shared/store_access.updateStoreWithRevision). No second store, no independent JSON
// writer, no separate ledger, no SMTP, no Telegram/IMAP transport, no production queue bypass, no
// localhost fallback, no send capability. Reads project the commercial.* / delivery.* / finance.*
// namespaced sections; commands go through the one writer with revision + idempotency.
//
// Feature gates (env, default OFF): commands and send are never reachable in Wave 1.
import { readStore, updateStoreWithRevision, STORE_PATH } from '../shared/store_access.mjs';
import * as readmodels from '../../../commercial_core/lib/readmodels.mjs';
import * as lifecycle from '../../../commercial_core/lib/lifecycle.mjs';
import { catalog, product as productById, resolvePrice, productsTotal, snapshotProvenance } from '../../../commercial_core/lib/product_catalog_runtime.mjs';

// Feature gates (env, default OFF). Granular split (Gate C1-A):
//   command       — master switch; any command requires this true.
//   commandC1A    — the six safe internal commands (no send, no payment).
//   paymentCommand— recordPayment (Gate C1-B); stays OFF in C1-A.
//   send          — never true in Wave 1 / C1-A.
// A command is reachable only when (command && its specific gate) is true. Payment therefore stays
// blocked even with C1-A enabled, because paymentCommand defaults OFF.
export const FLAGS = () => ({
    read: process.env.COMMERCIAL_READ_API === 'true',
    command: process.env.COMMERCIAL_COMMAND_API === 'true',
    commandC1A: process.env.COMMERCIAL_COMMAND_C1A === 'true',
    paymentCommand: process.env.COMMERCIAL_PAYMENT_COMMAND === 'true',
    send: process.env.COMMERCIAL_SEND === 'true', // never true in Wave 1 / C1-A
});

// Per-command required granular gate. Six C1-A commands require commandC1A; payment requires the
// separate paymentCommand gate (Gate C1-B, OFF here). Used by the route command gate.
export const COMMAND_GATE = {
    createOpportunity: 'commandC1A',
    prepareOffer: 'commandC1A',
    recordOwnerDecision: 'commandC1A',
    createHandoff: 'commandC1A',
    createProject: 'commandC1A',
    createInvoice: 'commandC1A',
    recordPayment: 'paymentCommand',
};

// Standardized product DTOs (maps existing snapshot fields → Android-facing contract names).
// No new product data is invented; missing fields are null/empty, never 0 for unknown price.
function shortDesc(d) {
    const s = String(d || '');
    if (s.length <= 140) return s || null;
    return `${s.slice(0, 137)}…`;
}
function productListDto(p) {
    const pr = resolvePrice(p.product_id);
    return {
        product_id: p.product_id,
        name: p.client_name || p.name,
        status: p.status,
        price: pr.ok ? pr.amount : null,           // null when unknown — never 0
        price_display: pr.ok ? pr.display : 'UNKNOWN',
        currency: pr.ok ? pr.currency : 'RUB',
        short_description: shortDesc(p.description),
        readiness: p.implementation_readiness || null,
        version: p.product_version || null,
        category: p.category || null,
    };
}
function productDetailDto(p) {
    const pr = resolvePrice(p.product_id);
    return {
        product_id: p.product_id,
        name: p.client_name || p.name,
        status: p.status,
        price: pr.ok ? pr.amount : null,
        price_display: pr.ok ? pr.display : 'UNKNOWN',
        currency: pr.ok ? pr.currency : 'RUB',
        scope_included: p.scope_included || [],
        scope_excluded: p.scope_excluded || [],
        inputs_required: p.evidence_required || [],
        deliverables: p.deliverables || [],
        acceptance_criteria: p.acceptance_criteria || [],
        claims: p.claims || [],
        description: p.description || null,
        readiness: p.implementation_readiness || null,
        version: p.product_version || null,
        category: p.category || null,
    };
}

export const SECTIONS = [
    'commercial.opportunities', 'commercial.offers', 'commercial.owner_decisions', 'commercial.deals',
    'delivery.handoffs', 'delivery.projects', 'finance.invoices', 'finance.payments',
];

// Build a read-only engine-shaped view from the canonical store's namespaced sections.
// The engine's read models expect a store object with `sections{}`; we project the canonical
// top-level namespaced maps into that shape WITHOUT copying lead/queue/ledger data.
function projectView(store = readStore(STORE_PATH)) {
    const view = { store_revision: Number(store.store_revision) || 0, sections: {} };
    for (const k of SECTIONS) view.sections[k] = store[k] || {};
    return view;
}

function listSection(section) {
    const view = projectView();
    return Object.values(view.sections[section] || {});
}

// ---- READ projections (no mutation) ----
export const reads = {
    commercialSummary: () => readmodels.commercialSummary(projectView()),
    financeSummary: () => readmodels.financeSummary(projectView()),
    deliverySummary: () => readmodels.deliverySummary(projectView()),
    technicalAcceptance: () => readmodels.technicalAcceptance(projectView()),
    opportunities: () => ({ items: listSection('commercial.opportunities') }),
    opportunity: (id) => projectView().sections['commercial.opportunities'][id] || null,
    offers: () => ({ items: listSection('commercial.offers') }),
    offer: (id) => projectView().sections['commercial.offers'][id] || null,
    deals: () => ({ items: listSection('commercial.deals') }),
    deal: (id) => projectView().sections['commercial.deals'][id] || null,
    handoffs: () => ({ items: listSection('delivery.handoffs') }),
    projects: () => ({ items: listSection('delivery.projects') }),
    project: (id) => projectView().sections['delivery.projects'][id] || null,
    invoices: () => ({ items: listSection('finance.invoices') }),
    invoice: (id) => projectView().sections['finance.invoices'][id] || null,
    productsView: () => {
        const items = catalog().map(productListDto);
        const by = { ACTIVE: 0, DRAFT: 0, PLANNED: 0 };
        for (const p of items) by[p.status] = (by[p.status] || 0) + 1;
        return {
            items,
            total: items.length,
            counts: by,
            provenance: snapshotProvenance(),
            count_definitions: {
                total: 'Всего продуктов в каталоге Product OS.',
                ACTIVE: 'Продукты, готовые к продаже.',
                DRAFT: 'Продукты в подготовке.',
                PLANNED: 'Запланированные продукты.',
            },
        };
    },
    product: (id) => { const p = productById(id); return p ? productDetailDto(p) : null; },
    integrationStatus: () => {
        const f = FLAGS();
        return {
            revenueOs: 'integrated', productOs: 'integrated', deliveryOs: 'integrated', financeOs: 'integrated',
            singleWriter: true, commercialApiEnabled: f.read,
            commercialCommandsEnabled: f.command && f.commandC1A,
            c1aCommandsEnabled: f.command && f.commandC1A,
            paymentCommandEnabled: f.command && f.paymentCommand,
            sendCapability: 'NONE',
        };
    },
};

// ---- COMMANDS (gated OFF in Wave 1). When enabled later, each runs through the single writer
// with expectedRevision + idempotency. In Wave 1 the route layer returns FEATURE_DISABLED before
// reaching here, so these are defined for completeness and future activation only. ----
export const commands = {
    // Each command maps to a commercial_core lifecycle fn applied INSIDE updateStoreWithRevision so the
    // canonical writer owns revision/idempotency. mutate() projects sections, runs the engine against a
    // working copy, then writes the changed sections back onto the canonical store object.
    _apply(fnName, args, { expectedRevision, idempotencyKey, updatedBy }) {
        if (!idempotencyKey) return { ok: false, code: 'MISSING_IDEMPOTENCY' };
        let engineResult = null;
        const res = updateStoreWithRevision((store) => {
            const work = { store_revision: Number(store.store_revision) || 0, sections: {}, _idem: store._commercial_idem || {} };
            for (const k of SECTIONS) work.sections[k] = store[k] || {};
            // lifecycle signature is (store, args): the working store-shaped object FIRST, then the
            // command args. expectedRevision is matched against the working copy's revision.
            engineResult = lifecycle[fnName](work, { ...args, idempotencyKey, expectedRevision: work.store_revision, at: new Date().toISOString() });
            if (!engineResult || !engineResult.ok) return null; // abort write on engine rejection
            // Idempotent replay: the engine returned a prior result without mutating. Do NOT write or
            // bump the global revision — return null so updateStoreWithRevision reports written:false.
            if (engineResult.replayed === true) return null;
            for (const k of SECTIONS) store[k] = work.sections[k];
            store._commercial_idem = work._idem;
            return store;
        }, { expectedRevision, idempotencyKey, updatedBy: updatedBy || 'commercial' });
        if (!res.written) {
            // Either an engine rejection, or an idempotent replay (engineResult.ok && replayed).
            if (engineResult && engineResult.ok) return { ok: true, ...engineResult, revision: res.revision };
            return engineResult || { ok: false, code: 'ABORTED' };
        }
        return { ok: true, ...engineResult, revision: res.revision };
    },

    // TEST_ONLY governance: archive the acceptance run across ALL sections (no deletion). Idempotent —
    // a run that archives nothing does not bump the revision. Refuses if any real entity/payment exists.
    archiveTestOnly({ idempotencyKey, expectedRevision, updatedBy }) {
        if (!idempotencyKey) return { ok: false, code: 'MISSING_IDEMPOTENCY' };
        let engineResult = null;
        const res = updateStoreWithRevision((store) => {
            const work = { store_revision: Number(store.store_revision) || 0, sections: {} };
            for (const k of SECTIONS) work.sections[k] = store[k] || {};
            engineResult = lifecycle.archiveTestOnlyAcceptanceRun(work, { at: new Date().toISOString() });
            if (!engineResult.ok) return null;
            if (engineResult.archived === 0) return null; // nothing to do → no revision bump
            for (const k of SECTIONS) store[k] = work.sections[k];
            return store;
        }, { expectedRevision, idempotencyKey, updatedBy: updatedBy || 'test_only_governance' });
        if (!res.written) {
            if (engineResult && engineResult.ok) return { ok: true, ...engineResult, revision: res.revision };
            return engineResult || { ok: false, code: 'ABORTED' };
        }
        return { ok: true, ...engineResult, revision: res.revision };
    },
};
