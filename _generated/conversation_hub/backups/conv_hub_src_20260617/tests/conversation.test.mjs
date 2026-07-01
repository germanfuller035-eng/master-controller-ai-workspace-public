#!/usr/bin/env node
// tools/conversation_hub/tests/conversation.test.mjs
// MP40 — comprehensive offline tests. Deterministic. Real exit codes.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeMessage, dedupe, correlateThread, resolveIdentity, classify, route, detectOptOut, classifyDelivery, redactBody } from '../lib/engines.mjs';
import { buildDraft, validateDraft, buildApprovalRequest, approvalRevisionConflict, evaluateRetry, summarize, OUTBOUND_HANDOFF } from '../lib/drafts.mjs';
import { validateAll, validateSafetyInvariants, validateMessage, validateOptOut, validateChannelContract } from '../lib/validators.mjs';
import { buildInbox } from '../lib/inbox.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FIX = JSON.parse(readFileSync(path.join(ROOT, 'fixtures/conversation_fixtures.json'), 'utf8'));
const f = (id) => FIX.scenarios.find((s) => s.id.startsWith(id));
const norm = (id) => normalizeMessage(f(id).envelope);

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; } else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };

// ---- Normalization (MP7) ----
{
  const n = norm('f01');
  ok('normalize: channel preserved', n.channel === 'EMAIL');
  ok('normalize: deterministic checksum', n.checksum === normalizeMessage(f('f01').envelope).checksum);
  ok('normalize: timestamp UTC ISO', /Z$/.test(n.received_at));
  ok('normalize: no raw body stored', n.body_raw === undefined);
  ok('normalize: body_reference present', typeof n.body_reference === 'string');
  ok('normalize: synthetic flag', n.synthetic === true);
  // redaction
  const r = redactBody('my password=supersecret123 and token=abcd1234efgh5678ijkl');
  ok('redact: secret flagged', r.sensitivity === 'SECRET_RISK');
  ok('redact: secret removed', !/supersecret123/.test(r.body_redacted));
  const r2 = redactBody('email me at buyer@synthetic.test or call +7 999 123 45 67');
  ok('redact: PII masked', /\[PII:email\]/.test(r2.body_redacted) && !/buyer@synthetic\.test/.test(r2.body_redacted));
}

// ---- Deduplication (MP8) ----
{
  const cand = norm('f02'); Object.assign(cand, f('f02').duplicate_of);
  const seen = [{ ...cand, message_id: 'prior' }];
  ok('dedupe: exact duplicate', dedupe(cand, seen).outcome === 'EXACT_DUPLICATE');
  ok('dedupe: unique when empty', dedupe(norm('f01'), []).outcome === 'UNIQUE');
  // retry duplicate
  const o = normalizeMessage(f('f31').envelope); o.idempotency_key = 'idem_31';
  const seenR = [{ ...o, message_id: 'prior', checksum: 'different' }];
  ok('dedupe: retry duplicate', dedupe(o, seenR).outcome === 'RETRY_DUPLICATE');
  // conflict: same ext ref, different checksum
  const a = { ...norm('f01'), external_message_ref: '<x@t>', channel: 'EMAIL', checksum: 'sha256:aaa' };
  const b = { ...norm('f01'), external_message_ref: '<x@t>', channel: 'EMAIL', checksum: 'sha256:bbb', message_id: 'm2' };
  ok('dedupe: conflict on ref mismatch', dedupe(a, [b]).outcome === 'CONFLICT');
  // probable
  const p1 = { ...norm('f08'), sender_ref: 's@t', subject: 'Same', received_at: '2026-06-10T09:00:00Z', checksum: 'c1', external_message_ref: 'r1' };
  const p2 = { ...norm('f08'), sender_ref: 's@t', subject: 'Same', received_at: '2026-06-10T09:02:00Z', checksum: 'c2', message_id: 'm9', external_message_ref: 'r2' };
  ok('dedupe: probable duplicate', dedupe(p1, [p2]).outcome === 'PROBABLE_DUPLICATE');
}

// ---- Threading (MP9) ----
{
  const m = { ...f('f01').envelope, body_redacted: f('f01').envelope.body };
  ok('thread: header match', correlateThread(m, ['<sent-001@example.test>'], []).thread_match === 'HEADER');
  ok('thread: web form new', correlateThread({ channel: 'WEB_FORM' }, [], []).thread_match === 'NEW');
  ok('thread: no false correlation', correlateThread({ channel: 'EMAIL', subject: 'Random', sender_ref: 'x@t' }, [], []).thread_match === 'NONE');
  // subject fallback
  const tf = correlateThread({ channel: 'EMAIL', subject: 'Re: Audit', sender_ref: 'a@t' }, [], [{ thread_id: 't1', channel: 'EMAIL', subject: 'Audit', participants: ['a@t'] }]);
  ok('thread: subject fallback', tf.thread_match === 'SUBJECT_FALLBACK' && tf.manual_review === true);
}

// ---- Identity (MP10) ----
{
  ok('identity: canonical match', resolveIdentity({ canonical_lead_id: 'l1' }).state === 'CANONICAL_MATCH');
  ok('identity: strong (unique email)', resolveIdentity(f('f17') && { verified_email: 'u@t', candidates: [{ canonical_lead_id: 'l1', verified_email: 'u@t' }] }).state === 'STRONG_MATCH');
  ok('identity: probable', resolveIdentity(f('f16').signals).state === 'PROBABLE_MATCH');
  ok('identity: conflict', resolveIdentity(f('f17').signals).state === 'CONFLICT');
  ok('identity: no match', resolveIdentity({ candidates: [] }).state === 'NO_MATCH');
  ok('identity: never mints canonical', resolveIdentity({ candidates: [] }).canonical_lead_id === null);
}

// ---- Classification (MP11) ----
{
  const cases = [['f08', 'price_question'], ['f06', 'opt_out'], ['f10', 'support'], ['f12', 'billing'], ['f36', 'complaint'], ['f04', 'bounce'], ['f05', 'auto_reply'], ['f13', 'referral'], ['f09', 'meeting_request']];
  for (const [id, intent] of cases) ok(`classify: ${id} -> ${intent}`, classify(norm(id)).primary_intent === intent, `got ${classify(norm(id)).primary_intent}`);
  ok('classify: unknown low confidence + review', (() => { const c = classify({ message_id: 'x', subject: '', body_redacted: 'zzz qqq' }); return c.primary_intent === 'unknown' && c.manual_review === true; })());
}

// ---- Routing (MP12) ----
{
  ok('route: price -> Revenue', route(classify(norm('f08')), { state: 'NO_MATCH' }).target_system === 'REVENUE_OS');
  ok('route: support -> CS', route(classify(norm('f10')), { state: 'NO_MATCH' }).target_system === 'CUSTOMER_SUCCESS_OS');
  ok('route: billing -> Finance', route(classify(norm('f12')), { state: 'NO_MATCH' }).target_system === 'FINANCE_OS');
  ok('route: incident -> Executive', route(classify(norm('f11')), { state: 'NO_MATCH' }).target_system === 'EXECUTIVE_OS');
  ok('route: opt-out -> MC reply queue', route(classify(norm('f06')), { state: 'NO_MATCH' }).target_system === 'MASTER_CONTROLLER_REPLY_QUEUE');
  ok('route: identity conflict blocks', route(classify(norm('f08')), { state: 'CONFLICT' }).blocked === true);
  ok('route: recommendation only (no mutation field)', /recommendation only/.test(route(classify(norm('f08')), {}).note));
}

// ---- Opt-out / consent (MP13) ----
{
  const n = norm('f06'); const oo = detectOptOut(n, classify(n));
  ok('opt-out: detected', oo && oo.scope === 'ALL_COMMERCIAL');
  ok('opt-out: recommendation only', oo.canonical_applied === false && oo.owner_review_required === true);
  const na = norm('f07'); const ooa = detectOptOut(na, classify(na));
  ok('opt-out: channel-only scope', ooa && ooa.scope === 'CHANNEL_ONLY');
  ok('opt-out: none for non-opt-out', detectOptOut(norm('f08'), classify(norm('f08'))) === null);
}

// ---- Bounce / delivery (MP14) ----
{
  ok('delivery: soft bounce', classifyDelivery({ smtp_code: 451 }).delivery_state === 'BOUNCED_SOFT');
  ok('delivery: hard bounce', classifyDelivery({ smtp_code: 550 }).delivery_state === 'BOUNCED_HARD');
  ok('delivery: 250 != delivered', classifyDelivery({ smtp_code: 250 }).delivery_state === 'TRANSPORT_ACCEPTED');
  ok('delivery: ambiguous unknown', classifyDelivery({}).delivery_state === 'UNKNOWN');
}

// ---- Drafts (MP15-16) ----
{
  const d = buildDraft(f('f25').draft_request); const v = validateDraft(d, f('f25').draft_context);
  ok('draft: valid -> ready', v.ok && v.status === 'READY_FOR_OWNER_REVIEW');
  ok('draft: send_allowed false', d.send_allowed === false);
  ok('draft: guessed recipient blocked', validateDraft(buildDraft(f('f26').draft_request), f('f26').draft_context).errors.some((e) => /guessed/.test(e)));
  ok('draft: unsupported claim blocked', validateDraft(buildDraft(f('f27').draft_request), f('f27').draft_context).errors.some((e) => /unsupported claim/.test(e)));
  ok('draft: opt-out blocked', validateDraft(buildDraft(f('f28').draft_request), f('f28').draft_context).errors.some((e) => /opt-out/.test(e)));
}

// ---- Approval (MP17) ----
{
  const d = buildDraft(f('f25').draft_request); const v = validateDraft(d, f('f25').draft_context);
  const ap = buildApprovalRequest(d, v);
  ok('approval: requested', ap.status === 'REQUESTED');
  ok('approval: package send_allowed false', ap.package.send_allowed === false);
  ok('approval: has idempotency key', /^idem_/.test(ap.package.idempotency_key));
  const rc = approvalRevisionConflict(f('f29').approval, f('f29').current_draft_revision);
  ok('approval: revision conflict', rc.conflict && rc.status === 'REVISION_CONFLICT');
  ok('approval: hub never decides (no owner ref initially)', ap.owner_decision_reference === null);
}

// ---- Handoff (MP18) ----
{
  ok('handoff: outbound terminates at MC seam', OUTBOUND_HANDOFF.path.includes('Master Controller approved-send seam'));
  ok('handoff: hub must never bypass approval', OUTBOUND_HANDOFF.hub_must_never.includes('bypass approval'));
  ok('handoff: hub must never write send ledger', OUTBOUND_HANDOFF.hub_must_never.includes('write send ledger'));
}

// ---- Retry / idempotency (MP20) ----
{
  ok('retry: safe idempotent', evaluateRetry({ idempotency_key: 'k', canonical_approved: true, last_result: 'DEFERRED', retry_count: 0 }).action === 'RETRY_SAME_KEY');
  ok('retry: ambiguous -> reconcile', evaluateRetry(f('f30').retry_attempt).action === 'RECONCILE');
  ok('retry: missing key blocked', evaluateRetry({ canonical_approved: true, last_result: 'DEFERRED' }).action === 'BLOCK');
  ok('retry: not approved blocked', evaluateRetry({ idempotency_key: 'k', canonical_approved: false }).action === 'BLOCK');
  ok('retry: terminal stop', evaluateRetry({ idempotency_key: 'k', canonical_approved: true, last_result: 'DELIVERED_CONFIRMED' }).terminal === true);
}

// ---- Summary (MP25) ----
{
  const n = norm('f01'); n.classification = classify(n);
  const sum = summarize(f('f01').conversation, [n]);
  ok('summary: references source messages', sum.source_message_refs.includes(n.message_id));
  ok('summary: no fabrication note', /no fabricated content/.test(sum.note));
  ok('summary: tied to revision', sum.based_on_revision === f('f01').conversation.revision);
}

// ---- Owner inbox (MP26) ----
{
  const inbox = buildInbox([
    { conversation: { conversation_id: 'a', status: 'ACTIVE' }, classification: { primary_intent: 'incident' }, routing: { target_system: 'EXECUTIVE_OS' } },
    { conversation: { conversation_id: 'b', status: 'ACTIVE' }, classification: { primary_intent: 'opt_out' }, routing: { target_system: 'MASTER_CONTROLLER_REPLY_QUEUE' } },
  ]);
  ok('inbox: incident queued', inbox.queues.incident.includes('a'));
  ok('inbox: opt-out queued', inbox.queues.opt_out_review.includes('b'));
  ok('inbox: never mutates canonical', inbox.mutates_canonical === false);
}

// ---- Safety invariants + validate-all ----
{
  ok('safety: invariants locked', validateSafetyInvariants().length === 0);
  const ds = { channels: JSON.parse(readFileSync(path.join(ROOT, 'data/channel_contracts.json'), 'utf8')), policies: JSON.parse(readFileSync(path.join(ROOT, 'data/policies.json'), 'utf8')), sot: JSON.parse(readFileSync(path.join(ROOT, 'data/source_of_truth_extension.json'), 'utf8')), fixtures: FIX };
  const r = validateAll(ds);
  ok('validate-all: 0 blockers', r.blockers === 0, JSON.stringify(r.dimensions));
  ok('channel contract: all NOT_CONNECTED', ds.channels.channels.every((c) => validateChannelContract(c).length === 0));
}

// ---- Cross-system references (MP33) ----
{
  const pol = JSON.parse(readFileSync(path.join(ROOT, 'data/policies.json'), 'utf8'));
  const ints = pol.domain_integrations;
  for (const sys of ['AI_HQ', 'GROWTH_OS', 'REVENUE_OS', 'DELIVERY_OS', 'FINANCE_OS', 'CUSTOMER_SUCCESS_OS', 'PRODUCT_OS', 'ANALYTICS_OS', 'EXECUTIVE_OS', 'MASTER_CONTROLLER']) {
    ok(`integration: ${sys} contract present`, !!ints[sys]);
  }
  ok('integration: MC never mutated', /never mutates/.test(ints.MASTER_CONTROLLER.provides[0]));
  ok('analytics: contract only no emitter', /no emitter/i.test(pol.analytics_contract.note));
}

console.log(`\nconversation.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
