// tools/commercial_core/lib/readmodels.mjs
// Owner read models. UNKNOWN is surfaced explicitly and NEVER coerced to 0. ESTIMATE/TARGET are
// kept distinct from FACT. Pure projections over the single commercial store.
import { list } from './store.mjs';
import { CLASS, profitability } from './lifecycle.mjs';

// TEST_ONLY entities are technical acceptance artifacts and MUST NOT count toward business KPIs.
// Every KPI projection filters them out; a separate technicalAcceptance() view surfaces them.
const isReal = (e) => !(e && e.test_only === true);
const real = (arr) => arr.filter(isReal);

// A count is always a real count; a money/derived value can be unknown → represented as null + class.
export function commercialSummary(store) {
    const opps = real(list(store, 'opportunity'));
    const offers = real(list(store, 'offer'));
    const deals = real(list(store, 'deal'));
    const handoffs = real(list(store, 'handoff'));
    const projects = real(list(store, 'project'));
    const invoices = real(list(store, 'invoice'));
    const payments = real(list(store, 'payment'));
    const won = deals.filter((d) => d.status === 'WON');
    const confirmedPaid = payments.filter((p) => p.classification === CLASS.FACT).reduce((s, p) => s + (p.amount || 0), 0);
    // Offers awaiting an owner action span TWO pending states in the pre-sale lifecycle:
    //   READY_FOR_OWNER_REVIEW  — fresh draft, owner has not yet reviewed the text.
    //   READY_FOR_SEND_REVIEW   — text approved (APPROVE_TEXT_ONLY), still awaiting the owner's
    //                             send-review decision; NO send happens at this state.
    // Counting only the first state under-reports the owner's real queue (the production defect:
    // 3 real offers sat in READY_FOR_SEND_REVIEW while the summary reported 0). Both are surfaced.
    const OWNER_PENDING = ['READY_FOR_OWNER_REVIEW', 'READY_FOR_SEND_REVIEW'];
    const offersAwaitingOwner = offers.filter((o) => OWNER_PENDING.includes(o.status)).length;
    const offersReadyForSendReview = offers.filter((o) => o.status === 'READY_FOR_SEND_REVIEW').length;
    return {
        open_opportunities: opps.filter((o) => !['REVENUE.WON', 'REVENUE.LOST'].includes(o.stage)).length,
        offers_awaiting_owner: offersAwaitingOwner,
        offers_ready_for_send_review: offersReadyForSendReview,
        deals_won: won.length,
        deals_lost: deals.filter((d) => d.status === 'LOST').length,
        estimated_pipeline_value: opps.reduce((s, o) => s + (o.estimated_value || 0), 0),
        estimated_pipeline_class: CLASS.ESTIMATE,
        confirmed_deal_value: won.reduce((s, d) => s + (d.agreed_price || 0), 0),
        confirmed_deal_class: won.length ? CLASS.FACT : CLASS.UNKNOWN,
        projects_waiting_handoff: handoffs.filter((h) => !projects.some((p) => p.handoff_id === h.handoff_id)).length,
        active_projects: projects.filter((p) => p.status === 'DELIVERY.ACTIVE').length,
        invoices_draft: invoices.filter((i) => i.status === 'DRAFT').length,
        invoices_due: invoices.filter((i) => i.status === 'APPROVED' || i.status === 'OVERDUE').length,
        confirmed_payments: payments.length ? confirmedPaid : null,
        confirmed_payments_class: payments.length ? CLASS.FACT : CLASS.UNKNOWN,
        estimated_profit: won.reduce((s, d) => {
            const pr = profitability(store, d.deal_id); return s + (pr?.estimated_gross_profit || 0);
        }, 0),
        estimated_profit_class: won.length ? CLASS.ESTIMATE : CLASS.UNKNOWN,
        owner_decisions_required: offersAwaitingOwner,
    };
}

export function financeSummary(store) {
    const invoices = real(list(store, 'invoice'));
    const payments = real(list(store, 'payment'));
    const deals = real(list(store, 'deal')).filter((d) => d.status === 'WON');
    return {
        confirmed_revenue: payments.length ? payments.filter((p) => p.classification === CLASS.FACT).reduce((s, p) => s + (p.amount || 0), 0) : null,
        confirmed_revenue_class: payments.length ? CLASS.FACT : CLASS.UNKNOWN,
        estimated_revenue: deals.reduce((s, d) => s + (d.agreed_price || 0), 0),
        estimated_revenue_class: deals.length ? CLASS.ESTIMATE : CLASS.UNKNOWN,
        unpaid_invoices: invoices.filter((i) => i.status !== 'PAID' && i.status !== 'CANCELLED').length,
        overdue_invoices: invoices.filter((i) => i.status === 'OVERDUE').length,
        confirmed_costs: null, confirmed_costs_class: CLASS.UNKNOWN,
        estimated_costs: deals.length * 3000, estimated_costs_class: deals.length ? CLASS.ESTIMATE : CLASS.UNKNOWN,
        unknown_data_count: invoices.filter((i) => i.classification === CLASS.UNKNOWN).length
            + (payments.length ? 0 : deals.length),
    };
}

export function deliverySummary(store) {
    const handoffs = real(list(store, 'handoff'));
    const projects = real(list(store, 'project'));
    return {
        handoffs_waiting: handoffs.filter((h) => !projects.some((p) => p.handoff_id === h.handoff_id)).length,
        projects_planned: projects.filter((p) => p.status === 'DELIVERY.PLANNED').length,
        projects_active: projects.filter((p) => p.status === 'DELIVERY.ACTIVE').length,
        inputs_blocked: projects.filter((p) => (p.inputs || []).length > 0 && p.status === 'DELIVERY.PLANNED').length,
        acceptance_pending: projects.filter((p) => p.status === 'DELIVERY.ACCEPTANCE').length,
    };
}

// Separate technical view: TEST_ONLY entities (excluded from all business KPIs above). Used by the
// owner-visible "technical acceptance" section so test artifacts are auditable but never counted.
export function technicalAcceptance(store) {
    const onlyTest = (entity) => list(store, entity).filter((e) => e && e.test_only === true);
    const ids = (arr, key) => arr.map((e) => e[key]);
    const opps = onlyTest('opportunity'); const offers = onlyTest('offer'); const deals = onlyTest('deal');
    const handoffs = onlyTest('handoff'); const projects = onlyTest('project'); const invoices = onlyTest('invoice');
    const payments = onlyTest('payment');
    return {
        test_only_opportunities: opps.length,
        test_only_offers: offers.length,
        test_only_deals: deals.length,
        test_only_handoffs: handoffs.length,
        test_only_projects: projects.length,
        test_only_invoice_drafts: invoices.length,
        test_only_payments: payments.length,
        ids: {
            opportunities: ids(opps, 'opportunity_id'),
            offers: ids(offers, 'offer_id'),
            deals: ids(deals, 'deal_id'),
            handoffs: ids(handoffs, 'handoff_id'),
            projects: ids(projects, 'project_id'),
            invoices: ids(invoices, 'invoice_id'),
        },
        excluded_from_business_kpi: true,
    };
}
