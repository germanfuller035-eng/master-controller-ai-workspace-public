#!/usr/bin/env node
// tools/commercial_core/tests/transport_readiness.test.mjs
// Transport-readiness suite: delivery containment, transport approval contract (no send),
// conversation timeline + pre-sale health, send-review decisions that never create a deal,
// TEST_ONLY archive. Pure/offline — no express, no network, no real store.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import os from 'node:os';
import { deliveryContainment, classifyDeliveryRecord } from '../lib/reconciliation.mjs';
import { buildSendApproval, validateApproval, oneMessageLimiter, classifySmtpOutcome, sha256 } from '../lib/transport_approval.mjs';
import { buildTimeline, presaleHealth } from '../lib/conversation_read.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0; const fails = [];
const ok = (n, c) => { if (c) { pass++; } else { fail++; fails.push(n); console.log('FAIL', n); } };

// Seed the command seam against a temp store BEFORE importing service.mjs (ESM hoist).
const DIR = mkdtempSync(path.join(os.tmpdir(), 'tr-'));
const STORE = path.join(DIR, 'store.json');
{
    const seed = { version: 1, store_revision: 200, leads: {} };
    for (const k of ['commercial.opportunities', 'commercial.offers', 'commercial.owner_decisions', 'commercial.deals', 'delivery.handoffs', 'delivery.projects', 'finance.invoices', 'finance.payments']) seed[k] = {};
    writeFileSync(STORE, JSON.stringify(seed));
}
process.env.MATER_STORE_PATH = STORE;
const { commands } = await import('../../mater_controller_api/src/commercial/service.mjs');
const apply = (fn, args, key) => commands._apply(fn, args, { expectedRevision: null, idempotencyKey: key, updatedBy: 'TEST' });

// ===== 1. Delivery containment =====
function delivery() {
    const leads = [
        { lead_id: 'P1', send_proof_status: 'proven', last_send_status: 'success', smtp_response_code: 250, last_sent_at: '2026-06-10T00:00:00Z' },
        { lead_id: 'U1', send_proof_status: 'missing', last_send_status: 'uncertain_no_smtp_proof', last_sent_at: '2026-06-12T00:00:00Z', external_send_by_bot: 'unknown' },
        { lead_id: 'U2', send_proof_status: 'missing', last_send_status: 'uncertain_no_smtp_proof', last_sent_at: '2026-06-12T00:00:00Z' },
        { lead_id: 'U3', send_proof_status: 'missing', last_send_status: 'uncertain_no_smtp_proof', last_sent_at: '2026-06-12T00:00:00Z' },
        { lead_id: 'L1', send_proof_status: 'proven', last_send_status: 'success', last_sent_at: '2026-06-11T00:00:00Z' }, // proven but no ledger row, no smtp
        { lead_id: 'N1', status: 'hold_later' }, // no send signal → skipped
    ];
    const ledger = [{ lead_id: 'P1', result: 'SENT' }];
    const c = deliveryContainment(leads, ledger);
    ok('DC1 P1 confirmed sent', classifyDeliveryRecord(leads[0], new Set(['P1'])).category === 'CONFIRMED_SENT');
    ok('DC2 U1 attempt unproven', classifyDeliveryRecord(leads[1], new Set(['P1'])).category === 'ATTEMPT_UNPROVEN');
    ok('DC3 L1 legacy inconsistency (proven no ledger)', classifyDeliveryRecord(leads[4], new Set(['P1'])).category === 'LEGACY_INCONSISTENCY');
    ok('DC4 owner review queue excludes confirmed', !c.owner_review_queue.some((r) => r.leadId === 'P1'));
    ok('DC5 3 unproven in review queue', c.owner_review_queue.filter((r) => r.category === 'ATTEMPT_UNPROVEN').length === 3);
    ok('DC6 automatic resend forbidden', c.automatic_resend_allowed === false);
    ok('DC7 automatic followup forbidden', c.automatic_followup_allowed === false);
    ok('DC8 every queue record requires owner review', c.owner_review_queue.every((r) => r.ownerReviewRequired === true && r.automaticResendAllowed === false));
}

// ===== 2. Transport approval contract (NO send) =====
function transport() {
    const b = buildSendApproval({ ownerId: 'owner', leadId: 'LEAD1', offerId: 'offer_x', recipient: 'a@b.ru', subject: 'S', body: 'B', productSnapshotHash: 'ph', price: 10000, approvedAt: '2026-06-18T00:00:00Z', ttlSeconds: 3600 });
    ok('TA1 approval built', b.ok && b.approval.single_use === true && b.approval.consumed === false);
    ok('TA2 content hashed (no PII)', b.approval.recipient_hash === sha256('a@b.ru') && !JSON.stringify(b.approval).includes('a@b.ru'));
    // valid against same content + within ttl
    ok('TA3 valid before expiry', validateApproval(b.approval, { recipient: 'a@b.ru', subject: 'S', body: 'B', nowIso: '2026-06-18T00:10:00Z' }).ok === true);
    // body change invalidates
    ok('TA4 body change invalidates', validateApproval(b.approval, { recipient: 'a@b.ru', subject: 'S', body: 'B2', nowIso: '2026-06-18T00:10:00Z' }).code === 'BODY_CHANGED');
    // recipient change invalidates
    ok('TA5 recipient change invalidates', validateApproval(b.approval, { recipient: 'x@b.ru', subject: 'S', body: 'B', nowIso: '2026-06-18T00:10:00Z' }).code === 'RECIPIENT_CHANGED');
    // expiry
    ok('TA6 expired rejected', validateApproval(b.approval, { recipient: 'a@b.ru', subject: 'S', body: 'B', nowIso: '2026-06-18T02:00:00Z' }).code === 'APPROVAL_EXPIRED');
    // consumed (single-use)
    ok('TA7 consumed rejected', validateApproval({ ...b.approval, consumed: true }, { recipient: 'a@b.ru', subject: 'S', body: 'B', nowIso: '2026-06-18T00:10:00Z' }).code === 'APPROVAL_ALREADY_CONSUMED');
    // limiter
    const lim = oneMessageLimiter({ leadId: 'LEAD1', expiresAt: '2026-06-19T00:00:00Z' });
    ok('TA8 one-message limiter', lim.MAX_REAL_SENDS === 1 && lim.ALLOWED_LEAD_ID === 'LEAD1' && lim.FOLLOWUP_AUTOSEND === 'OFF' && lim.active === false);
    // uncertain SMTP outcome → reconciliation, never a blind resend/SENT
    ok('TA9 timeout → reconciliation, not sent', (() => { const o = classifySmtpOutcome({ timedOut: true }); return o.ledger === 'NONE' && o.queue === 'RECONCILIATION' && o.treatAsSent === false && o.resendAllowed === false; })());
    ok('TA10 confirmed delivery → ledger SENT', (() => { const o = classifySmtpOutcome({ delivered: true, smtpMessageId: 'mid' }); return o.ledger === 'SENT' && o.treatAsSent === true; })());
    ok('TA11 unknown outcome → not sent', classifySmtpOutcome({ delivered: null }).treatAsSent === false);
}

// ===== 3. Conversation timeline + pre-sale health =====
function conversation() {
    const ctx = {
        lead: { lead_id: 'LEAD1', created_at: '2026-06-01T00:00:00Z' },
        opportunity: { opportunity_id: 'opp_1', lead_id: 'LEAD1', created_at: '2026-06-02T00:00:00Z', stage: 'REVENUE.OFFER_PREPARED', updated_at: '2026-06-02T00:00:00Z' },
        offer: { offer_id: 'offer_1', lead_id: 'LEAD1', created_at: '2026-06-03T00:00:00Z', status: 'READY_FOR_SEND_REVIEW', owner_decision: 'APPROVE_DRAFT_FOR_SEND_REVIEW', updated_at: '2026-06-03T01:00:00Z' },
        ledgerRows: [], replies: [],
    };
    const tl = buildTimeline(ctx);
    ok('CV1 timeline ordered', tl.events.length === 4 && tl.events[0].type === 'LEAD_CREATED');
    ok('CV2 timeline send capability NONE', tl.send_capability === 'NONE');
    ok('CV3 no MESSAGE_SENT without ledger', !tl.events.some((e) => e.type === 'MESSAGE_SENT_LEDGER'));
    const h = presaleHealth(ctx, '2026-06-10T00:00:00Z');
    ok('CV4 pre-sale state OWNER_REVIEW (ready for send review)', h.state === 'OWNER_REVIEW');
    ok('CV5 delivery confidence NONE (no send)', h.delivery_status_confidence === 'NONE');
    ok('CV6 allowed states pre-sale only', h.allowed_states.includes('PRE_SALE') && !h.allowed_states.includes('RENEWAL'));
}

// ===== 4. Send-review decision never creates a deal =====
function sendReview() {
    const lead = { lead_id: 'REAL_LEAD_TR', verification_status: 'verified', customer_id: 'c1' };
    const opp = apply('createOpportunity', { lead, productId: 'mini_audit' }, 'tr-opp');
    ok('SR1 real opportunity created', opp.ok && opp.id);
    const offer = apply('prepareOffer', { opportunityId: opp.id }, 'tr-offer');
    ok('SR2 offer draft created', offer.ok && offer.id);
    const dec = apply('recordOwnerDecision', { offerId: offer.id, decision: 'APPROVE_DRAFT_FOR_SEND_REVIEW' }, 'tr-dec');
    ok('SR3 send-review decision ok', dec.ok);
    ok('SR4 send-review does NOT create a deal', !dec.dealId);
    ok('SR5 offer status READY_FOR_SEND_REVIEW', dec.offerStatus === 'READY_FOR_SEND_REVIEW');
    const store = JSON.parse(readFileSync(STORE, 'utf8'));
    ok('SR6 zero deals in store', Object.keys(store['commercial.deals']).length === 0);
    // REQUEST_CHANGES / REJECT_INTERNAL_DRAFT also no deal
    const rc = apply('recordOwnerDecision', { offerId: offer.id, decision: 'REQUEST_CHANGES' }, 'tr-rc');
    ok('SR7 request-changes ok no deal', rc.ok && !rc.dealId);
}

// ===== 5. TEST_ONLY archive governance =====
function testOnlyArchive() {
    // fresh temp store with only TEST_ONLY entities
    const dir2 = mkdtempSync(path.join(os.tmpdir(), 'tr2-'));
    const store2 = path.join(dir2, 'store.json');
    const seed = { version: 1, store_revision: 10, leads: {} };
    for (const k of ['commercial.opportunities', 'commercial.offers', 'commercial.owner_decisions', 'commercial.deals', 'delivery.handoffs', 'delivery.projects', 'finance.invoices', 'finance.payments']) seed[k] = {};
    seed['commercial.opportunities']['opp_t'] = { opportunity_id: 'opp_t', test_only: true };
    seed['commercial.deals']['deal_t'] = { deal_id: 'deal_t', test_only: true };
    writeFileSync(store2, JSON.stringify(seed));
    // direct lifecycle archive (pure) — archive marks both
    const work = { sections: {} };
    for (const k of ['commercial.opportunities', 'commercial.offers', 'commercial.deals', 'delivery.handoffs', 'delivery.projects', 'finance.invoices', 'finance.payments']) work.sections[k] = seed[k];
    return import('../lib/lifecycle.mjs').then(({ archiveTestOnlyAcceptanceRun }) => {
        const r1 = archiveTestOnlyAcceptanceRun(work, { at: '2026-06-18T00:00:00Z' });
        ok('TO1 archived 2 test-only', r1.ok && r1.archived === 2);
        ok('TO2 entity marked archived', work.sections['commercial.opportunities']['opp_t'].archived_status === 'TEST_ONLY_ARCHIVED');
        const r2 = archiveTestOnlyAcceptanceRun(work, { at: '2026-06-18T00:00:00Z' });
        ok('TO3 idempotent re-run archives 0', r2.ok && r2.archived === 0);
        // refuse if a real entity present
        work.sections['commercial.offers']['offer_r'] = { offer_id: 'offer_r', test_only: false };
        const r3 = archiveTestOnlyAcceptanceRun(work, { at: '2026-06-18T00:00:00Z' });
        ok('TO4 refuse with real entity present', r3.ok === false && r3.code === 'REAL_ENTITIES_PRESENT');
    });
}

delivery();
transport();
conversation();
sendReview();
await testOnlyArchive();

console.log(`\n==== transport_readiness: ${pass} passed, ${fail} failed ====`);
if (fail > 0) { console.log('FAILURES:', fails.join('; ')); process.exit(1); }
