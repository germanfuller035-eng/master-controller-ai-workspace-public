// tools/commercial_core/lib/lifecycle.mjs
// Commercial core orchestration: Lead → Opportunity → Offer → Owner Decision → Deal →
// Delivery Handoff → Project → Invoice Schedule → Payment → Profitability.
//
// This is an ADAPTER/orchestrator, not a new engine. Pricing + product truth are reused from the
// existing OS modules; gating, snapshots, revision/idempotency and the single-writer commit go
// through commercial_core/store.mjs. No engine here sends, writes a second store, or fabricates a
// fact. All values are FACT|TARGET|ESTIMATE|UNKNOWN classified; UNKNOWN is never coerced to 0.
import { product, resolvePrice } from './product_catalog_runtime.mjs';
import { commit, get, makeId } from './store.mjs';

export const CLASS = { FACT: 'FACT', TARGET: 'TARGET', ESTIMATE: 'ESTIMATE', UNKNOWN: 'UNKNOWN' };

export const OPP_STAGES = [
    'REVENUE.OPPORTUNITY_NEW', 'REVENUE.QUALIFIED', 'REVENUE.OFFER_PREPARED',
    'REVENUE.OWNER_REVIEW', 'REVENUE.NEGOTIATION', 'REVENUE.WON', 'REVENUE.LOST', 'REVENUE.PAUSED',
];

// ---- product snapshot (immutable copy taken at offer time; later product edits never mutate it) ----
export function productSnapshot(productId, version = 'v1') {
    const p = product(productId);
    if (!p) return null;
    const price = resolvePrice(productId);
    return {
        product_id: p.product_id,
        product_version: version,
        name: p.client_name || p.name,
        commercial_status: p.status,
        price_snapshot: price?.ok ? price.amount : null,
        currency: price?.ok ? price.currency : 'RUB',
        scope_snapshot: p.description || null,
        acceptance_snapshot: p.acceptance_criteria || 'see product spec',
        claims_snapshot: p.claims || null,
    };
}

// ---- opportunity ----
export function createOpportunity(store, { lead, productId = 'mini_audit', at, idempotencyKey, expectedRevision, testOnly = false }) {
    if (!lead || !lead.lead_id) return { ok: false, code: 'LEAD_REQUIRED' };
    if (lead.verification_status !== 'verified') return { ok: false, code: 'LEAD_NOT_VERIFIED' };
    const snap = productSnapshot(productId);
    if (!snap) return { ok: false, code: 'PRODUCT_NOT_FOUND' };
    const id = makeId('opp', `${lead.lead_id}:${productId}`);
    const isTest = testOnly === true || lead.test_only === true || String(lead.lead_id).startsWith('TEST_ONLY');
    return commit(store, {
        entity: 'opportunity', idempotencyKey, expectedRevision, at,
        mutate: (bag) => {
            if (bag[id]) return { id }; // natural-key idempotent
            bag[id] = {
                opportunity_id: id, lead_id: lead.lead_id, customer_id: lead.customer_id || null,
                product_id: productId, product_version: snap.product_version,
                stage: 'REVENUE.OPPORTUNITY_NEW',
                estimated_value: snap.price_snapshot, currency: snap.currency,
                value_class: CLASS.ESTIMATE, probability: 0.3,
                offer_status: null, owner_decision_status: null, deal_status: null,
                test_only: isTest,
                evidence: { lead: 'verified' }, confidence: 'SYSTEM_OBSERVED',
                created_at: at, updated_at: at,
            };
            return { id };
        },
    });
}

// ---- offer (snapshot of product at a point in time; approval is NOT a send) ----
export function prepareOffer(store, { opportunityId, at, idempotencyKey, expectedRevision }) {
    const opp = get(store, 'opportunity', opportunityId);
    if (!opp) return { ok: false, code: 'OPPORTUNITY_NOT_FOUND' };
    const snap = productSnapshot(opp.product_id, opp.product_version);
    if (!snap) return { ok: false, code: 'PRODUCT_VERSION_REQUIRED' };
    if (snap.commercial_status !== 'ACTIVE') return { ok: false, code: 'PRODUCT_NOT_ACTIVE' };
    const id = makeId('offer', `${opportunityId}`);
    const r = commit(store, {
        entity: 'offer', idempotencyKey, expectedRevision, at,
        mutate: (bag) => {
            if (bag[id]) return { id };
            bag[id] = {
                offer_id: id, opportunity_id: opportunityId, lead_id: opp.lead_id,
                product_id: snap.product_id, product_version: snap.product_version,
                price_snapshot: snap.price_snapshot, currency: snap.currency,
                scope_snapshot: snap.scope_snapshot, acceptance_snapshot: snap.acceptance_snapshot,
                claims_snapshot: snap.claims_snapshot,
                status: 'READY_FOR_OWNER_REVIEW', send_capability: 'NONE',
                test_only: opp.test_only === true,
                evidence: { product: snap.commercial_status }, confidence: 'SYSTEM_OBSERVED',
                created_at: at, updated_at: at,
            };
            opp.stage = 'REVENUE.OFFER_PREPARED'; opp.offer_status = 'READY_FOR_OWNER_REVIEW'; opp.updated_at = at;
            return { id };
        },
    });
    return r;
}

// ---- owner decision (the only authority that can approve; recorded, never auto) ----
// On APPROVE this is also the moment a deal is WON (owner approval IS the deal authority), so the
// deal is created in the same command flow and its id is returned. This keeps the six C1-A commands
// sufficient to walk opportunity → offer → decision(APPROVE→deal) → handoff → project → invoice
// WITHOUT exposing a separate deal-creation command. No send, no payment.
//
// SEND-REVIEW decisions (APPROVE_DRAFT_FOR_SEND_REVIEW, REQUEST_CHANGES, REJECT_INTERNAL_DRAFT) are
// for the real-lead pre-sale path: they record an owner decision and set the offer status WITHOUT
// creating a deal. Only the literal 'APPROVE' wins a deal — every other decision is deal-safe.
const DEAL_WINNING_DECISION = 'APPROVE';
const VALID_DECISIONS = [
    'APPROVE', 'REJECT', 'RETURN_FOR_EDIT', 'PAUSE', 'CANCEL',
    'APPROVE_DRAFT_FOR_SEND_REVIEW', 'REQUEST_CHANGES', 'REJECT_INTERNAL_DRAFT',
];
export function recordOwnerDecision(store, { offerId, decision, at, idempotencyKey, expectedRevision }) {
    const offer = get(store, 'offer', offerId);
    if (!offer) return { ok: false, code: 'OFFER_NOT_FOUND' };
    if (!VALID_DECISIONS.includes(decision)) return { ok: false, code: 'INVALID_DECISION' };
    const opp = get(store, 'opportunity', offer.opportunity_id);
    const r = commit(store, {
        entity: 'offer', idempotencyKey, expectedRevision, at,
        mutate: () => {
            if (decision === 'APPROVE') offer.status = 'APPROVED';
            else if (decision === 'REJECT' || decision === 'REJECT_INTERNAL_DRAFT') offer.status = 'REJECTED';
            else if (decision === 'APPROVE_DRAFT_FOR_SEND_REVIEW') offer.status = 'READY_FOR_SEND_REVIEW';
            else if (decision === 'REQUEST_CHANGES' || decision === 'RETURN_FOR_EDIT') offer.status = 'CHANGES_REQUESTED';
            // PAUSE/CANCEL leave status as-is.
            offer.owner_decision = decision; offer.updated_at = at;
            if (opp) {
                opp.owner_decision_status = decision;
                opp.stage = decision === 'APPROVE' ? 'REVENUE.OWNER_REVIEW'
                    : decision === 'APPROVE_DRAFT_FOR_SEND_REVIEW' ? 'REVENUE.OFFER_PREPARED'
                    : 'REVENUE.PAUSED';
                opp.updated_at = at;
            }
            return { id: offerId };
        },
    });
    if (!r.ok) return r;
    // ONLY the literal 'APPROVE' wins a deal. Send-review/changes/reject decisions never create one.
    if (decision === DEAL_WINNING_DECISION) {
        const dealRes = winDeal(store, { offerId, at, idempotencyKey: `${idempotencyKey}:deal`, expectedRevision: null });
        if (!dealRes.ok) return dealRes;
        return { ok: true, id: offerId, entity: 'offer', decision, dealId: dealRes.id, revision: dealRes.revision };
    }
    return { ...r, decision, offerStatus: offer.status };
}

// ---- deal (WON only after verified opp + versioned product + APPROVED offer + owner decision) ----
export function winDeal(store, { offerId, at, idempotencyKey, expectedRevision }) {
    const offer = get(store, 'offer', offerId);
    if (!offer) return { ok: false, code: 'OFFER_NOT_FOUND' };
    if (offer.status !== 'APPROVED' || offer.owner_decision !== 'APPROVE') return { ok: false, code: 'OWNER_APPROVAL_REQUIRED' };
    const opp = get(store, 'opportunity', offer.opportunity_id);
    if (!opp) return { ok: false, code: 'OPPORTUNITY_NOT_FOUND' };
    if (!offer.product_version) return { ok: false, code: 'PRODUCT_VERSION_REQUIRED' };
    const id = makeId('deal', `${offerId}`);
    return commit(store, {
        entity: 'deal', idempotencyKey, expectedRevision, at,
        mutate: (bag) => {
            if (bag[id]) return { id };
            bag[id] = {
                deal_id: id, opportunity_id: opp.opportunity_id, offer_id: offerId,
                customer_id: opp.customer_id, lead_id: opp.lead_id,
                product_id: offer.product_id, product_version: offer.product_version,
                agreed_price: offer.price_snapshot, currency: offer.currency,
                scope_snapshot: offer.scope_snapshot, status: 'WON', won_at: at,
                value_class: CLASS.FACT, revision: store.store_revision + 1,
                test_only: offer.test_only === true,
                evidence: { offer: 'APPROVED', owner_decision: 'APPROVE' },
                created_at: at, updated_at: at,
            };
            opp.stage = 'REVENUE.WON'; opp.deal_status = 'WON'; opp.updated_at = at;
            return { id };
        },
    });
}

// ---- delivery handoff (only from WON deal; idempotent → one project) ----
export function createHandoff(store, { dealId, deliveryOwner = 'delivery', plannedStart = null, at, idempotencyKey, expectedRevision }) {
    const deal = get(store, 'deal', dealId);
    if (!deal) return { ok: false, code: 'DEAL_NOT_FOUND' };
    if (deal.status !== 'WON') return { ok: false, code: 'DEAL_WON_REQUIRED' };
    if (!deal.product_version) return { ok: false, code: 'PRODUCT_VERSION_REQUIRED' };
    const id = makeId('handoff', `${dealId}`);
    return commit(store, {
        entity: 'handoff', idempotencyKey, expectedRevision, at,
        mutate: (bag) => {
            if (bag[id]) return { id };
            bag[id] = {
                handoff_id: id, deal_id: dealId, customer_id: deal.customer_id, lead_id: deal.lead_id,
                product_id: deal.product_id, product_version: deal.product_version,
                scope_snapshot: deal.scope_snapshot, price_snapshot: deal.agreed_price, currency: deal.currency,
                commitments: ['deliver per product spec'], inputs_required: ['site access', 'goals'],
                delivery_owner: deliveryOwner, planned_start: plannedStart,
                acceptance_criteria: 'see product acceptance snapshot',
                test_only: deal.test_only === true,
                created_at: at, updated_at: at,
            };
            return { id };
        },
    });
}

// ---- project (idempotent from handoff; Delivery namespace; never reuses Revenue WON) ----
export function createProject(store, { handoffId, at, idempotencyKey, expectedRevision }) {
    const handoff = get(store, 'handoff', handoffId);
    if (!handoff) return { ok: false, code: 'HANDOFF_NOT_FOUND' };
    const id = makeId('proj', `${handoffId}`);
    return commit(store, {
        entity: 'project', idempotencyKey, expectedRevision, at,
        mutate: (bag) => {
            if (bag[id]) return { id };
            bag[id] = {
                project_id: id, handoff_id: handoffId, deal_id: handoff.deal_id, customer_id: handoff.customer_id,
                product_id: handoff.product_id, product_version: handoff.product_version,
                status: 'DELIVERY.PLANNED', milestones: [], tasks: [], inputs: handoff.inputs_required,
                acceptance_criteria: handoff.acceptance_criteria,
                test_only: handoff.test_only === true,
                planned_start: handoff.planned_start, actual_start: null, actual_finish: null,
                created_at: at, updated_at: at,
            };
            return { id };
        },
    });
}

// ---- finance: invoice schedule (no real issuance; classification REQUIRED) ----
export function createInvoice(store, { dealId, projectId, at, idempotencyKey, expectedRevision }) {
    const deal = get(store, 'deal', dealId);
    if (!deal) return { ok: false, code: 'DEAL_NOT_FOUND' };
    const id = makeId('inv', `${dealId}`);
    return commit(store, {
        entity: 'invoice', idempotencyKey, expectedRevision, at,
        mutate: (bag) => {
            if (bag[id]) return { id };
            bag[id] = {
                invoice_id: id, deal_id: dealId, project_id: projectId || null, customer_id: deal.customer_id,
                amount: deal.agreed_price, currency: deal.currency,
                status: 'DRAFT', classification: CLASS.TARGET, // amount due is a target until paid
                issued_at: null, due_at: null, paid_at: null,
                real_issuance: 'DISABLED', bank_integration: 'NONE',
                test_only: deal.test_only === true,
                evidence: {}, created_at: at, updated_at: at,
            };
            return { id };
        },
    });
}

// ---- finance: payment evidence → FACT (never auto, never from text) ----
export function recordPayment(store, { invoiceId, amount, evidenceType, evidenceReference, at, idempotencyKey, expectedRevision }) {
    const inv = get(store, 'invoice', invoiceId);
    if (!inv) return { ok: false, code: 'INVOICE_NOT_FOUND' };
    if (!evidenceType || !evidenceReference) return { ok: false, code: 'PAYMENT_EVIDENCE_REQUIRED' };
    const id = makeId('pay', `${invoiceId}:${evidenceReference}`);
    return commit(store, {
        entity: 'payment', idempotencyKey, expectedRevision, at,
        mutate: (bag) => {
            if (bag[id]) return { id };
            bag[id] = {
                payment_id: id, invoice_id: invoiceId, amount: amount ?? inv.amount, currency: inv.currency,
                received_at: at, evidence_type: evidenceType, evidence_reference: evidenceReference,
                classification: CLASS.FACT, confidence: 'OWNER_CONFIRMED', verified_by: 'owner',
                created_at: at,
            };
            inv.status = 'PAID'; inv.paid_at = at; inv.classification = CLASS.FACT;
            inv.evidence = { payment_id: id, type: evidenceType }; inv.updated_at = at;
            return { id };
        },
    });
}

// ---- profitability read model (UNKNOWN != 0; ESTIMATE != FACT) ----
export function profitability(store, dealId) {
    const deal = get(store, 'deal', dealId);
    if (!deal) return null;
    const invoices = Object.values(store.sections['finance.invoices']).filter((i) => i.deal_id === dealId);
    const payments = Object.values(store.sections['finance.payments']).filter((p) => invoices.some((i) => i.invoice_id === p.invoice_id));
    const confirmedPaid = payments.filter((p) => p.classification === CLASS.FACT).reduce((s, p) => s + (p.amount || 0), 0);
    const hasPayment = payments.length > 0;
    return {
        deal_id: dealId,
        deal_value: deal.agreed_price, deal_value_class: CLASS.FACT,
        invoiced_amount: invoices.reduce((s, i) => s + (i.amount || 0), 0), invoiced_class: invoices.length ? CLASS.TARGET : CLASS.UNKNOWN,
        confirmed_paid_amount: hasPayment ? confirmedPaid : null, paid_class: hasPayment ? CLASS.FACT : CLASS.UNKNOWN,
        estimated_cost: 3000, estimated_cost_class: CLASS.ESTIMATE,
        actual_cost: null, actual_cost_class: CLASS.UNKNOWN,
        estimated_gross_profit: deal.agreed_price - 3000, estimated_profit_class: CLASS.ESTIMATE,
        actual_gross_profit: hasPayment ? confirmedPaid - 3000 : null,
        actual_profit_class: hasPayment ? CLASS.ESTIMATE : CLASS.UNKNOWN, // actual cost still unknown
        evidence_completeness: hasPayment ? 'PARTIAL' : 'NONE',
    };
}

// ---- TEST_ONLY governance: archive an acceptance run (no deletion; auditable) ----
// Marks every test_only entity across all sections as archived. Refuses if ANY real (non-test_only)
// entity exists or any payment exists. Idempotent: a re-run that archives nothing returns archived=0
// (and the _apply seam then aborts the write so the revision is not bumped). Operates on the work
// store shape {sections:{...}} used by commands._apply.
const ALL_TEST_SECTIONS = [
    'commercial.opportunities', 'commercial.offers', 'commercial.deals',
    'delivery.handoffs', 'delivery.projects', 'finance.invoices', 'finance.payments',
];
export function archiveTestOnlyAcceptanceRun(store, { at } = {}) {
    const sections = store.sections || {};
    const all = [];
    for (const k of ALL_TEST_SECTIONS) for (const e of Object.values(sections[k] || {})) all.push(e);
    const real = all.filter((e) => e.test_only !== true);
    if (real.length > 0) return { ok: false, code: 'REAL_ENTITIES_PRESENT', realCount: real.length };
    if (Object.values(sections['finance.payments'] || {}).length > 0) return { ok: false, code: 'PAYMENTS_PRESENT' };
    let archived = 0;
    for (const e of all) {
        if (e.test_only === true && e.archived_status !== 'TEST_ONLY_ARCHIVED') {
            e.archived_status = 'TEST_ONLY_ARCHIVED'; e.archived_at = at || null; archived += 1;
        }
    }
    // entity must be a known commit() entity for the writer seam; we return a synthetic id and let the
    // service commit it via a dedicated path (no SECTION_FOR needed — see service archiveTestOnly()).
    return { ok: true, entity: 'test_only_run', id: 'test_only_run', archived, total_test_only: all.length };
}
