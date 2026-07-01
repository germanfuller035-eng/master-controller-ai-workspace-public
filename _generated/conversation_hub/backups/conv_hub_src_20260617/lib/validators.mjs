// tools/conversation_hub/lib/validators.mjs
// MP39 — validators across all entities + safety guarantees. Pure, offline.
import { validateEntity } from '../schemas/domain.mjs';
import {
  SEND_ALLOWED, NETWORK_ALLOWED, SMTP_ALLOWED, IMAP_ALLOWED, TELEGRAM_API_ALLOWED,
  WHATSAPP_API_ALLOWED, MAX_API_ALLOWED, CANONICAL_WRITE_ALLOWED, PRODUCTION_READ_ALLOWED,
  UNOFFICIAL_CHANNEL_AUTOMATION_ALLOWED,
} from './common.mjs';

// Entity validators delegate to schema predicates.
export function validateConversation(o) { return validateEntity('conversation', o); }
export function validateThread(o) { return validateEntity('thread', o); }
export function validateMessage(o) { return validateEntity('message', o); }
export function validateDraftEntity(o) { return validateEntity('draft', o); }
export function validateApproval(o) { return validateEntity('approval_request', o); }
export function validateConsent(o) { return validateEntity('consent', o); }
export function validateOptOut(o) { return validateEntity('opt_out', o); }
export function validateAttachment(o) { return validateEntity('attachment', o); }
export function validateClassification(o) { return validateEntity('classification', o); }
export function validateRouting(o) { return validateEntity('routing', o); }
export function validateChannelHealth(o) { return validateEntity('channel_health', o); }

// Safety invariant validator — locked OFF flags.
export function validateSafetyInvariants() {
  const e = [];
  const must = {
    SEND_ALLOWED, NETWORK_ALLOWED, SMTP_ALLOWED, IMAP_ALLOWED, TELEGRAM_API_ALLOWED,
    WHATSAPP_API_ALLOWED, MAX_API_ALLOWED, CANONICAL_WRITE_ALLOWED, PRODUCTION_READ_ALLOWED,
    UNOFFICIAL_CHANNEL_AUTOMATION_ALLOWED,
  };
  for (const [k, v] of Object.entries(must)) if (v !== false) e.push(`${k} must be false`);
  return e;
}

// Channel contract validator — no forbidden method names, no live transports.
export function validateChannelContract(channel) {
  const e = [];
  if (channel.implemented_here === true) e.push(`${channel.channel}: must not be implemented in this task`);
  if (channel.live_state !== 'NOT_CONNECTED') e.push(`${channel.channel}: live_state must be NOT_CONNECTED`);
  return e;
}

// Adapter contract validator — forbidden method names must be absent from the allowed lists.
export function validateAdapterContract(adapter) {
  const e = [];
  const FORBIDDEN = ['sendMessage', 'sendEmail', 'postTelegram', 'sendSmtp', 'deliver', 'receiveLive', 'startPoller', 'openWebhook', 'ingestProduction'];
  const inbound = adapter.inbound?.allowed_method_names || [];
  const outbound = adapter.outbound?.allowed_method_names || [];
  for (const m of [...inbound, ...outbound]) if (FORBIDDEN.includes(m)) e.push(`forbidden method in allowed list: ${m}`);
  return e;
}

// Aggregate validate-all over a loaded dataset. Returns { blockers, dimensions }.
export function validateAll(ds) {
  const dims = {};
  const add = (name, errs) => { dims[name] = errs.length === 0 ? 'PASS' : `FAIL(${errs.length})`; return errs; };
  let blockers = 0;
  blockers += add('safety_invariants', validateSafetyInvariants()).length;
  blockers += add('channel_contracts', (ds.channels?.channels || []).flatMap(validateChannelContract)).length;
  blockers += add('adapter_contract', validateAdapterContract(ds.channels?.adapter_interface || {})).length;

  // Validate every fixture-derived entity if present
  const scen = ds.fixtures?.scenarios || [];
  let convErr = [], msgErr = [], drErr = [], ooErr = [];
  for (const s of scen) {
    if (s.conversation) convErr.push(...validateConversation(s.conversation));
    if (s.message) msgErr.push(...validateMessage(s.message));
    if (s.normalized) msgErr.push(...validateMessage(s.normalized));
    if (s.draft) drErr.push(...validateDraftEntity(s.draft));
    if (s.opt_out) ooErr.push(...validateOptOut(s.opt_out));
  }
  blockers += add('fixture_conversations', convErr).length;
  blockers += add('fixture_messages', msgErr).length;
  blockers += add('fixture_drafts', drErr).length;
  blockers += add('fixture_opt_outs', ooErr).length;

  // SoT extension: every communication entity must declare a non-Hub canonical writer where required
  const sotErr = [];
  const hubForbidden = ['canonical_identity', 'approval', 'reply', 'opt_out', 'delivery_receipt', 'bounce'];
  for (const ent of ds.sot?.entities || []) {
    if (hubForbidden.includes(ent.entity) && (ent.writers || []).includes('Conversation Hub')) sotErr.push(`${ent.entity}: Conversation Hub must not be a writer`);
  }
  blockers += add('source_of_truth', sotErr).length;

  return { blockers, dimensions: dims };
}
