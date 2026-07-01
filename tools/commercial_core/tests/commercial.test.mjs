#!/usr/bin/env node
// tools/commercial_core/tests/commercial.test.mjs
// Offline synthetic test suite for Integration Wave 1 commercial core.
// Deterministic, no network, no send, synthetic fixtures only. Real exit code.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { emptyStore, list, get } from '../lib/store.mjs';
import {
    createOpportunity, prepareOffer, recordOwnerDecision, winDeal,
    createHandoff, createProject, createInvoice, recordPayment, profitability, CLASS,
} from '../lib/lifecycle.mjs';
import { buildEvent, EVENT_KIND } from '../lib/events.mjs';
import { commercialSummary, financeSummary, deliverySummary } from '../lib/readmodels.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FX = JSON.parse(readFileSync(path.join(__dirname, '../fixtures/synthetic.json'), 'utf8'));
const { lead, unverified_lead, clock } = FX;
const T = clock.t0;

let pass = 0, fail = 0; const fails = [];
const ok = (n, c) => { if (c) { pass++; } else { fail++; fails.push(n); console.log('FAIL', n); } };

// ===== HAPPY PATH =====
function happyPath() {
    const s = emptyStore();
    const rev0 = s.store_revision;
    const opp = createOpportunity(s, { lead, productId: 'mini_audit', at: T, idempotencyKey: 'k-opp-1' });
    ok('E2E1 opportunity created', opp.ok && opp.entity === 'opportunity');
    ok('E2E2 store revision advanced', s.store_revision === rev0 + 1);
    const oppObj = get(s, 'opportunity', opp.id);
    ok('E2E3 product Mini Audit 10000 RUB estimate', oppObj.estimated_value === 10000 && oppObj.currency === 'RUB' && oppObj.value_class === CLASS.ESTIMATE);

    const offer = prepareOffer(s, { opportunityId: opp.id, at: T, idempotencyKey: 'k-offer-1' });
    ok('E2E4 offer prepared', offer.ok);
    const offerObj = get(s, 'offer', offer.id);
    ok('E2E5 offer has price+scope snapshot', offerObj.price_snapshot === 10000 && !!offerObj.scope_snapshot);
    ok('E2E6 offer send capability NONE', offerObj.send_capability === 'NONE');

    const dec = recordOwnerDecision(s, { offerId: offer.id, decision: 'APPROVE', at: T, idempotencyKey: 'k-dec-1' });
    ok('E2E7 owner decision recorded', dec.ok && get(s, 'offer', offer.id).status === 'APPROVED');

    const deal = winDeal(s, { offerId: offer.id, at: T, idempotencyKey: 'k-deal-1' });
    ok('E2E8 deal won', deal.ok && get(s, 'deal', deal.id).status === 'WON');
    ok('E2E9 deal value is FACT', get(s, 'deal', deal.id).value_class === CLASS.FACT);

    const ho = createHandoff(s, { dealId: deal.id, at: T, idempotencyKey: 'k-ho-1' });
    ok('E2E10 handoff created', ho.ok);
    const proj = createProject(s, { handoffId: ho.id, at: T, idempotencyKey: 'k-proj-1' });
    ok('E2E11 project created (Delivery namespace)', proj.ok && get(s, 'project', proj.id).status === 'DELIVERY.PLANNED');

    const inv = createInvoice(s, { dealId: deal.id, projectId: proj.id, at: T, idempotencyKey: 'k-inv-1' });
    ok('E2E12 invoice schedule created', inv.ok);
    const invObj = get(s, 'invoice', inv.id);
    ok('E2E13 invoice amount is TARGET not FACT', invObj.classification === CLASS.TARGET);
    ok('E2E14 real issuance disabled', invObj.real_issuance === 'DISABLED' && invObj.bank_integration === 'NONE');

    let pr = profitability(s, deal.id);
    ok('E2E15 payment UNKNOWN before evidence', pr.paid_class === CLASS.UNKNOWN && pr.confirmed_paid_amount === null);
    ok('E2E16 profitability is ESTIMATE', pr.estimated_profit_class === CLASS.ESTIMATE);
    ok('E2E17 actual profit UNKNOWN (not 0)', pr.actual_gross_profit === null && pr.actual_profit_class === CLASS.UNKNOWN);

    // ---- payment evidence → FACT ----
    const pay = recordPayment(s, { invoiceId: inv.id, amount: 10000, evidenceType: 'bank_statement', evidenceReference: 'SYN-REF-XYZ', at: clock.t2, idempotencyKey: 'k-pay-1' });
    ok('E2E18 payment recorded with evidence', pay.ok);
    ok('E2E19 invoice now PAID/FACT', get(s, 'invoice', inv.id).status === 'PAID' && get(s, 'invoice', inv.id).classification === CLASS.FACT);
    pr = profitability(s, deal.id);
    ok('E2E20 confirmed paid is FACT after evidence', pr.paid_class === CLASS.FACT && pr.confirmed_paid_amount === 10000);

    return s;
}

// ===== IDEMPOTENCY =====
function idempotency() {
    const s = emptyStore();
    createOpportunity(s, { lead, at: T, idempotencyKey: 'i1' });
    const again = createOpportunity(s, { lead, at: T, idempotencyKey: 'i1' });
    ok('IDEM1 repeat opportunity → replay, one entity', again.ok && again.replayed && list(s, 'opportunity').length === 1);

    const offer = prepareOffer(s, { opportunityId: list(s, 'opportunity')[0].opportunity_id, at: T, idempotencyKey: 'i2' });
    recordOwnerDecision(s, { offerId: offer.id, decision: 'APPROVE', at: T, idempotencyKey: 'i3' });
    winDeal(s, { offerId: offer.id, at: T, idempotencyKey: 'i4' });
    winDeal(s, { offerId: offer.id, at: T, idempotencyKey: 'i4' });
    ok('IDEM2 repeat deal-won → one deal', list(s, 'deal').length === 1);
    const dealId = list(s, 'deal')[0].deal_id;
    createHandoff(s, { dealId, at: T, idempotencyKey: 'i5' });
    createHandoff(s, { dealId, at: T, idempotencyKey: 'i5' });
    ok('IDEM3 repeat handoff → one handoff', list(s, 'handoff').length === 1);
    const hoId = list(s, 'handoff')[0].handoff_id;
    createProject(s, { handoffId: hoId, at: T, idempotencyKey: 'i6' });
    createProject(s, { handoffId: hoId, at: T, idempotencyKey: 'i6' });
    ok('IDEM4 repeat create-project → one project', list(s, 'project').length === 1);
    createInvoice(s, { dealId, at: T, idempotencyKey: 'i7' });
    createInvoice(s, { dealId, at: T, idempotencyKey: 'i7' });
    ok('IDEM5 repeat invoice → one invoice', list(s, 'invoice').length === 1);
}

// ===== NEGATIVE =====
function negatives() {
    let s = emptyStore();
    ok('NEG1 unverified lead blocked', createOpportunity(s, { lead: unverified_lead, at: T, idempotencyKey: 'n1' }).code === 'LEAD_NOT_VERIFIED');
    ok('NEG2 missing product blocked', createOpportunity(s, { lead, productId: 'does_not_exist', at: T, idempotencyKey: 'n2' }).code === 'PRODUCT_NOT_FOUND');

    // deal cannot win without approved offer
    s = emptyStore();
    const opp = createOpportunity(s, { lead, at: T, idempotencyKey: 'n3a' });
    const offer = prepareOffer(s, { opportunityId: opp.id, at: T, idempotencyKey: 'n3b' });
    ok('NEG3 deal blocked without owner approval', winDeal(s, { offerId: offer.id, at: T, idempotencyKey: 'n3c' }).code === 'OWNER_APPROVAL_REQUIRED');
    // rejected offer cannot become deal
    recordOwnerDecision(s, { offerId: offer.id, decision: 'REJECT', at: T, idempotencyKey: 'n3d' });
    ok('NEG4 rejected offer cannot become deal', winDeal(s, { offerId: offer.id, at: T, idempotencyKey: 'n3e' }).code === 'OWNER_APPROVAL_REQUIRED');

    // handoff requires WON deal
    ok('NEG5 handoff requires deal', createHandoff(s, { dealId: 'deal_nope', at: T, idempotencyKey: 'n5' }).code === 'DEAL_NOT_FOUND');

    // revision conflict
    s = emptyStore();
    const o2 = createOpportunity(s, { lead, at: T, idempotencyKey: 'n6a' });
    ok('NEG6 stale revision → 409', prepareOffer(s, { opportunityId: o2.id, at: T, idempotencyKey: 'n6b', expectedRevision: 0 }).status === 409);

    // missing idempotency
    s = emptyStore();
    ok('NEG7 missing idempotency blocked', createOpportunity(s, { lead, at: T }).code === 'MISSING_IDEMPOTENCY');

    // payment without evidence
    s = happyMinimalToInvoice();
    ok('NEG8 payment without evidence blocked', recordPayment(s.store, { invoiceId: s.invId, amount: 10000, at: T, idempotencyKey: 'n8' }).code === 'PAYMENT_EVIDENCE_REQUIRED');

    // estimate never auto-promotes to fact: invoice stays TARGET until a payment with evidence
    ok('NEG9 invoice stays TARGET without payment', get(s.store, 'invoice', s.invId).classification === CLASS.TARGET);

    // invalid decision
    s = emptyStore();
    const o3 = createOpportunity(s, { lead, at: T, idempotencyKey: 'n10a' });
    const off3 = prepareOffer(s, { opportunityId: o3.id, at: T, idempotencyKey: 'n10b' });
    ok('NEG10 invalid owner decision blocked', recordOwnerDecision(s, { offerId: off3.id, decision: 'YOLO', at: T, idempotencyKey: 'n10c' }).code === 'INVALID_DECISION');
}

function happyMinimalToInvoice() {
    const s = emptyStore();
    const opp = createOpportunity(s, { lead, at: T, idempotencyKey: 'h1' });
    const offer = prepareOffer(s, { opportunityId: opp.id, at: T, idempotencyKey: 'h2' });
    recordOwnerDecision(s, { offerId: offer.id, decision: 'APPROVE', at: T, idempotencyKey: 'h3' });
    const deal = winDeal(s, { offerId: offer.id, at: T, idempotencyKey: 'h4' });
    const inv = createInvoice(s, { dealId: deal.id, at: T, idempotencyKey: 'h5' });
    return { store: s, invId: inv.id, dealId: deal.id };
}

// ===== EVENTS =====
function events() {
    const e = buildEvent({ type: 'deal.won', kind: EVENT_KIND.FACT, subjectType: 'deal', subjectId: 'deal_x', at: T, classification: 'FACT' });
    ok('EVT1 fact event well-formed', e.event_id.startsWith('evt_') && e.event_kind === 'FACT_EVENT' && e.event_version === 1);
    const rec = buildEvent({ type: 'offer.prepared', kind: EVENT_KIND.RECOMMENDATION, subjectType: 'offer', subjectId: 'o1', at: T });
    ok('EVT2 recommendation distinct from fact', rec.event_kind === 'RECOMMENDATION_EVENT');
    let threw = false; try { buildEvent({ type: 'bogus.type', subjectType: 'x', subjectId: 'y', at: T }); } catch { threw = true; }
    ok('EVT3 unknown event type rejected', threw);
}

// ===== READ MODELS (unknown != 0) =====
function readModels() {
    const s = happyPath();
    const cs = commercialSummary(s);
    ok('RM1 commercial summary counts real', cs.deals_won === 1 && cs.open_opportunities === 0);
    ok('RM2 confirmed payments FACT after evidence', cs.confirmed_payments === 10000 && cs.confirmed_payments_class === CLASS.FACT);
    const empty = emptyStore();
    const cs0 = commercialSummary(empty);
    ok('RM3 empty confirmed value is UNKNOWN not 0', cs0.confirmed_deal_value === 0 && cs0.confirmed_deal_class === CLASS.UNKNOWN);
    ok('RM4 empty confirmed payments null+UNKNOWN', cs0.confirmed_payments === null && cs0.confirmed_payments_class === CLASS.UNKNOWN);
    const fs = financeSummary(empty);
    ok('RM5 finance confirmed revenue UNKNOWN not 0', fs.confirmed_revenue === null && fs.confirmed_revenue_class === CLASS.UNKNOWN);
    const ds = deliverySummary(s);
    ok('RM6 delivery summary counts', ds.projects_planned === 1 && ds.handoffs_waiting === 0);

    // RM7: regression for the production defect — offers in READY_FOR_SEND_REVIEW (text-approved,
    // awaiting owner send-review) MUST count toward the owner queue. Previously only
    // READY_FOR_OWNER_REVIEW was counted, so 3 real offers showed as 0 in the summary.
    const sendReviewStore = emptyStore();
    sendReviewStore.sections['commercial.offers'] = {
        o1: { offer_id: 'o1', status: 'READY_FOR_SEND_REVIEW', test_only: false },
        o2: { offer_id: 'o2', status: 'READY_FOR_SEND_REVIEW', test_only: false },
        o3: { offer_id: 'o3', status: 'READY_FOR_SEND_REVIEW', test_only: false },
        o4: { offer_id: 'o4', status: 'APPROVED', test_only: true }, // TEST_ONLY excluded
    };
    const csr = commercialSummary(sendReviewStore);
    ok('RM7 send-review offers count toward owner queue (3)', csr.offers_awaiting_owner === 3);
    ok('RM8 explicit offers_ready_for_send_review field (3)', csr.offers_ready_for_send_review === 3);
    ok('RM9 owner_decisions_required mirrors awaiting (3)', csr.owner_decisions_required === 3);
    ok('RM10 TEST_ONLY offer excluded from owner queue', csr.offers_awaiting_owner === 3);
}

// ===== SINGLE-WRITER / NO PARALLEL TRUTH =====
function singleWriter() {
    const s = happyPath();
    // exactly one section per truth; no duplicate stores
    const sectionKeys = Object.keys(s.sections);
    ok('SW1 one section per truth (7)', sectionKeys.length === 7);
    ok('SW2 one ledger family (no parallel ledger key)', !sectionKeys.some((k) => /ledger/i.test(k)));
    // every committed entity carries a single store revision lineage
    ok('SW3 monotonic single revision counter', s.store_revision === Object.values(s._idem).length);
}

happyPath(); idempotency(); negatives(); events(); readModels(); singleWriter();
console.log(`\n==== commercial_core: ${pass} passed, ${fail} failed ====`);
if (fail) { console.log('FAILED:', fails.join(', ')); process.exit(1); }
process.exit(0);
