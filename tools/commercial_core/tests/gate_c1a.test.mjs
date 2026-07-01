#!/usr/bin/env node
// tools/commercial_core/tests/gate_c1a.test.mjs
// Gate C1-A boundary suite: granular flags, no-send/no-payment, TEST_ONLY KPI exclusion,
// reconciliation read models. Pure/offline — no express, no network, no real store.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { emptyStore, list, get } from '../lib/store.mjs';
import {
    createOpportunity, prepareOffer, recordOwnerDecision, winDeal,
    createHandoff, createProject, createInvoice,
} from '../lib/lifecycle.mjs';
import { commercialSummary, financeSummary, technicalAcceptance } from '../lib/readmodels.mjs';
import { leadCountReconciliation, sendReconciliation, classifyLeadSend } from '../lib/reconciliation.mjs';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';

// Point the canonical writer at a throwaway store BEFORE service.mjs (and config.mjs) load, so the
// real command seam can be exercised without touching any real store. ESM hoists static imports, so
// service.mjs is pulled in via top-level dynamic import AFTER this env is set.
const SEAM_DIR = mkdtempSync(path.join(os.tmpdir(), 'c1a-seam-'));
const SEAM_STORE = path.join(SEAM_DIR, 'store.json');
{
    const seed = { version: 1, store_revision: 100, leads: {} };
    for (const k of ['commercial.opportunities', 'commercial.offers', 'commercial.owner_decisions', 'commercial.deals', 'delivery.handoffs', 'delivery.projects', 'finance.invoices', 'finance.payments']) seed[k] = {};
    writeFileSync(SEAM_STORE, JSON.stringify(seed));
}
process.env.MATER_STORE_PATH = SEAM_STORE;
const { COMMAND_GATE, commands } = await import('../../mater_controller_api/src/commercial/service.mjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FX = JSON.parse(readFileSync(path.join(__dirname, '../fixtures/synthetic.json'), 'utf8'));
const { lead, clock } = FX;
const T = clock.t0;

let pass = 0, fail = 0; const fails = [];
const ok = (n, c) => { if (c) { pass++; } else { fail++; fails.push(n); console.log('FAIL', n); } };

// ===== 1. Granular command-gate mapping =====
function gateMapping() {
    const c1a = ['createOpportunity', 'prepareOffer', 'recordOwnerDecision', 'createHandoff', 'createProject', 'createInvoice'];
    for (const fn of c1a) ok(`GATE ${fn} -> commandC1A`, COMMAND_GATE[fn] === 'commandC1A');
    ok('GATE recordPayment -> paymentCommand', COMMAND_GATE.recordPayment === 'paymentCommand');
    ok('GATE payment NOT commandC1A', COMMAND_GATE.recordPayment !== 'commandC1A');
    // Simulate the route gate decision for C1-A active, payment OFF.
    const flags = { command: true, commandC1A: true, paymentCommand: false };
    const reachable = (fn) => flags.command && flags[COMMAND_GATE[fn] || 'commandC1A'];
    for (const fn of c1a) ok(`REACHABLE ${fn} under C1-A`, reachable(fn) === true);
    ok('BLOCKED recordPayment under C1-A', reachable('recordPayment') === false);
    // Master command OFF blocks everything.
    const off = { command: false, commandC1A: true, paymentCommand: true };
    ok('MASTER off blocks C1-A', !(off.command && off[COMMAND_GATE.createOpportunity]));
}

// ===== 2. TEST_ONLY excluded from business KPI but visible technically =====
function testOnlyExclusion() {
    const s = emptyStore();
    // One real chain + one TEST_ONLY chain.
    const realLead = { ...lead, lead_id: 'SYN_REAL_1' };
    const testLead = { ...lead, lead_id: 'TEST_ONLY_SYN_1' };
    const ro = createOpportunity(s, { lead: realLead, productId: 'mini_audit', at: T, idempotencyKey: 'r-opp' });
    const to = createOpportunity(s, { lead: testLead, productId: 'mini_audit', at: T, idempotencyKey: 't-opp', testOnly: true });
    ok('TO1 both opps created', ro.ok && to.ok);
    ok('TO2 real opp not test_only', get(s, 'opportunity', ro.id).test_only === false);
    ok('TO3 test opp marked test_only', get(s, 'opportunity', to.id).test_only === true);

    const sum = commercialSummary(s);
    ok('TO4 KPI open_opportunities counts only real (1)', sum.open_opportunities === 1);

    const tech = technicalAcceptance(s);
    ok('TO5 technical view sees 1 test opportunity', tech.test_only_opportunities === 1);
    ok('TO6 technical view excluded_from_business_kpi', tech.excluded_from_business_kpi === true);

    // Drive the TEST_ONLY chain through to invoice draft; KPIs must stay real-only.
    const offer = prepareOffer(s, { opportunityId: to.id, at: T, idempotencyKey: 't-offer' });
    const dec = recordOwnerDecision(s, { offerId: offer.id, decision: 'APPROVE', at: T, idempotencyKey: 't-dec' });
    const deal = winDeal(s, { offerId: offer.id, at: T, idempotencyKey: 't-deal' });
    const handoff = createHandoff(s, { dealId: deal.id, at: T, idempotencyKey: 't-handoff' });
    const project = createProject(s, { handoffId: handoff.id, at: T, idempotencyKey: 't-project' });
    const inv = createInvoice(s, { dealId: deal.id, projectId: project.id, at: T, idempotencyKey: 't-inv' });
    ok('TO7 full test chain ok', offer.ok && dec.ok && deal.ok && handoff.ok && project.ok && inv.ok);
    ok('TO8 test deal carries test_only', get(s, 'deal', deal.id).test_only === true);
    ok('TO9 test invoice carries test_only', get(s, 'invoice', inv.id).test_only === true);

    const sum2 = commercialSummary(s);
    ok('TO10 deals_won KPI stays 0 (only test deal won)', sum2.deals_won === 0);
    const fin = financeSummary(s);
    ok('TO11 finance unpaid_invoices excludes test draft', fin.unpaid_invoices === 0);
    const tech2 = technicalAcceptance(s);
    ok('TO12 technical view sees test deal+invoice', tech2.test_only_deals === 1 && tech2.test_only_invoice_drafts === 1);
}

// ===== 3. Revision + idempotency on the real seam =====
function revisionIdempotency() {
    const s = emptyStore();
    const rev0 = s.store_revision;
    const o1 = createOpportunity(s, { lead, productId: 'mini_audit', at: T, idempotencyKey: 'idem-1' });
    ok('RI1 created, revision+1', o1.ok && s.store_revision === rev0 + 1);
    const o2 = createOpportunity(s, { lead, productId: 'mini_audit', at: T, idempotencyKey: 'idem-1' });
    ok('RI2 idempotent replay, no second revision bump', o2.ok && s.store_revision === rev0 + 1);
    ok('RI3 single opportunity entity', list(s, 'opportunity').length === 1);
    // Stale revision rejected.
    const stale = createOpportunity(s, { lead: { ...lead, lead_id: 'SYN_2' }, productId: 'mini_audit', at: T, idempotencyKey: 'idem-2', expectedRevision: rev0 });
    ok('RI4 stale expectedRevision rejected', stale.ok === false && stale.code === 'REVISION_CONFLICT');
}

// ===== 4. No send / no payment side effects in the C1-A chain =====
function noSendNoPayment() {
    const s = emptyStore();
    const o = createOpportunity(s, { lead, productId: 'mini_audit', at: T, idempotencyKey: 'ns-opp' });
    const offer = prepareOffer(s, { opportunityId: o.id, at: T, idempotencyKey: 'ns-offer' });
    ok('NS1 offer send_capability NONE', get(s, 'offer', offer.id).send_capability === 'NONE');
    // No payment entity is ever created by C1-A commands.
    ok('NS2 no payment entity from C1-A chain', list(s, 'payment').length === 0);
    // Invoice draft never becomes PAID and has issuance disabled.
    const dec = recordOwnerDecision(s, { offerId: offer.id, decision: 'APPROVE', at: T, idempotencyKey: 'ns-dec' });
    const deal = winDeal(s, { offerId: offer.id, at: T, idempotencyKey: 'ns-deal' });
    const inv = createInvoice(s, { dealId: deal.id, at: T, idempotencyKey: 'ns-inv' });
    const invObj = get(s, 'invoice', inv.id);
    ok('NS3 invoice DRAFT', invObj.status === 'DRAFT');
    ok('NS4 invoice real_issuance DISABLED', invObj.real_issuance === 'DISABLED');
    ok('NS5 invoice bank_integration NONE', invObj.bank_integration === 'NONE');
}

// ===== 5. Lead-count reconciliation (set difference) =====
function leadCount() {
    const all = [
        { lead_id: 'A', status: 'waiting_reply' },
        { lead_id: 'B', status: 'rejected' },
        { lead_id: 'C', status: 'hold_later' },
        { lead_id: 'D', status: 'send_uncertain' },
    ];
    const operational = ['A', 'C', 'D']; // B rejected/archived excluded
    const rec = leadCountReconciliation(all, operational);
    ok('LC1 canonical total 4', rec.canonical_total_leads === 4);
    ok('LC2 operational 3', rec.mini_audit_operational_leads === 3);
    ok('LC3 excluded 1', rec.excluded_from_mini_audit === 1);
    ok('LC4 excluded breakdown rejected:1', rec.excluded_breakdown_by_status.rejected === 1);
    ok('LC5 definitions present', !!rec.count_definitions.canonical_total_leads);
}

// ===== 6. Send reconciliation never invents a send =====
function sendRecon() {
    const leads = [
        { lead_id: 'P1', send_proof_status: 'proven', last_send_status: 'success', last_sent_at: '2026-06-10T00:00:00Z' },
        { lead_id: 'U1', send_proof_status: 'missing', last_send_status: 'uncertain_no_smtp_proof', last_sent_at: '2026-06-12T00:00:00Z' },
        { lead_id: 'U2', send_proof_status: 'missing', last_send_status: 'uncertain_no_smtp_proof', last_sent_at: '2026-06-12T00:00:00Z' },
        { lead_id: 'U3', send_proof_status: 'missing', last_send_status: 'uncertain_no_smtp_proof', last_sent_at: '2026-06-12T00:00:00Z' },
        { lead_id: 'N1', status: 'hold_later' },
    ];
    const ledger = [
        { lead_id: 'P1', result: 'SENT' }, { lead_id: 'X', result: 'SENT' }, { lead_id: 'Y', result: 'SENT' },
        { lead_id: 'Z', result: 'SENT' }, { lead_id: 'Q', result: 'SENT' }, { lead_id: 'R', result: 'SENT' }, { lead_id: 'S', result: 'SENT' },
    ];
    const rec = sendReconciliation(leads, ledger);
    ok('SR1 authoritative sends = ledger count (7)', rec.authoritative_successful_sends === 7);
    ok('SR2 three records require reconciliation', rec.records_requiring_reconciliation === 3);
    ok('SR3 unauthorized sends 0', rec.unauthorized_sends === 0);
    ok('SR4 unknown sends 0', rec.unknown_sends === 0);
    ok('SR5 P1 confirmed ledger-backed', classifyLeadSend(leads[0], new Set(['P1'])) === 'CONFIRMED_SENT_LEDGER_BACKED');
    ok('SR6 U1 delivery-status-unknown', classifyLeadSend(leads[1], new Set(['P1'])) === 'DELIVERY_STATUS_UNKNOWN');
    ok('SR7 N1 not sent', classifyLeadSend(leads[4], new Set(['P1'])) === 'NOT_SENT');
    ok('SR8 proven-without-ledger flagged', classifyLeadSend(leads[0], new Set()) === 'PROVEN_NO_LEDGER_MATCH');
}

// ===== 7. Real command seam (commands._apply → single writer) end-to-end on the temp seam store =====
async function applySeam() {
    const apply = (fn, args, key) => commands._apply(fn, args, { expectedRevision: null, idempotencyKey: key, updatedBy: 'TEST' });
    const lead = { lead_id: 'TEST_ONLY_SEAM', verification_status: 'verified', customer_id: 'c1' };
    const opp = apply('createOpportunity', { lead, productId: 'mini_audit', testOnly: true }, 's-opp');
    ok('AS1 opportunity via _apply', opp.ok && opp.id?.startsWith('opp_'));
    ok('AS2 revision bumped to 101', opp.revision === 101);
    const offer = apply('prepareOffer', { opportunityId: opp.id }, 's-offer');
    ok('AS3 offer via _apply (correct arg order)', offer.ok && offer.id?.startsWith('offer_'));
    const dec = apply('recordOwnerDecision', { offerId: offer.id, decision: 'APPROVE' }, 's-dec');
    ok('AS4 decision APPROVE wins deal', dec.ok && !!dec.dealId);
    const handoff = apply('createHandoff', { dealId: dec.dealId }, 's-handoff');
    ok('AS5 handoff via _apply', handoff.ok && handoff.id?.startsWith('handoff_'));
    const project = apply('createProject', { handoffId: handoff.id }, 's-project');
    ok('AS6 project via _apply', project.ok && project.id?.startsWith('proj_'));
    const inv = apply('createInvoice', { dealId: dec.dealId, projectId: project.id }, 's-inv');
    ok('AS7 invoice draft via _apply', inv.ok && inv.id?.startsWith('inv_'));
    const revAfter = inv.revision;
    // Idempotent replay must NOT bump revision and must NOT create a duplicate.
    const replay = apply('createOpportunity', { lead, productId: 'mini_audit', testOnly: true }, 's-opp');
    ok('AS8 replay ok', replay.ok);
    ok('AS9 replay does NOT bump revision', replay.revision === revAfter);
    const final = JSON.parse(readFileSync(SEAM_STORE, 'utf8'));
    ok('AS10 single opportunity (no duplicate)', Object.keys(final['commercial.opportunities']).length === 1);
    ok('AS11 invoice is DRAFT (no payment/send from C1-A chain)', Object.values(final['finance.invoices'])[0]?.status === 'DRAFT');
    ok('AS12 no payment created by C1-A chain', Object.keys(final['finance.payments'] || {}).length === 0);
    ok('AS13 created entities carry test_only', Object.values(final['commercial.opportunities'])[0]?.test_only === true);
}

gateMapping();
testOnlyExclusion();
revisionIdempotency();
noSendNoPayment();
leadCount();
sendRecon();
await applySeam();

console.log(`\n==== gate_c1a: ${pass} passed, ${fail} failed ====`);
if (fail > 0) { console.log('FAILURES:', fails.join('; ')); process.exit(1); }
