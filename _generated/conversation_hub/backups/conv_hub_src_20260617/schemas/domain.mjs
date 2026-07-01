// tools/conversation_hub/schemas/domain.mjs
// MP4 — Conversation Hub domain model. Pure validation predicates over plain objects.
// No live stores. Every entity carries synthetic/test_only markers and (where applicable)
// send_allowed=false. These predicates back the validators + tests.
import {
  CHANNELS, CONVERSATION_STATUS, THREAD_STATUS, MESSAGE_DIRECTION, MESSAGE_TYPE,
  DRAFT_STATUS, APPROVAL_STATUS, DEDUPE_OUTCOME, IDENTITY_STATE, DELIVERY_STATE,
  PRIMARY_INTENT, ROUTE_TARGETS, OPT_OUT_SCOPE, CONSENT_STATUS, PRIORITY,
  CHANNEL_HEALTH_STATE, SENSITIVITY, SCAN_STATUS,
} from '../lib/common.mjs';

const isStr = (v) => typeof v === 'string' && v.length > 0;
const isArr = (v) => Array.isArray(v);
const inSet = (set, v) => set.includes(v);

export const SCHEMAS = {
  conversation: {
    required: ['conversation_id', 'status', 'primary_channel', 'thread_ids', 'revision', 'test_only'],
    validate(o) {
      const e = [];
      if (!isStr(o.conversation_id)) e.push('conversation_id required');
      if (!inSet(CONVERSATION_STATUS, o.status)) e.push(`status invalid: ${o.status}`);
      if (!inSet(CHANNELS, o.primary_channel)) e.push(`primary_channel invalid: ${o.primary_channel}`);
      if (!isArr(o.thread_ids)) e.push('thread_ids must be array');
      if (typeof o.revision !== 'number') e.push('revision must be number');
      if (o.test_only !== true) e.push('test_only must be true');
      // canonical_lead_id is optional but, when present, must be a reference string (never minted by Hub)
      if (o.canonical_lead_id != null && !isStr(o.canonical_lead_id)) e.push('canonical_lead_id must be a reference string');
      return e;
    },
  },
  thread: {
    required: ['thread_id', 'conversation_id', 'channel', 'status', 'synthetic'],
    validate(o) {
      const e = [];
      if (!isStr(o.thread_id)) e.push('thread_id required');
      if (!isStr(o.conversation_id)) e.push('conversation_id required');
      if (!inSet(CHANNELS, o.channel)) e.push(`channel invalid: ${o.channel}`);
      if (!inSet(THREAD_STATUS, o.status)) e.push(`status invalid: ${o.status}`);
      if (o.synthetic !== true) e.push('synthetic must be true');
      return e;
    },
  },
  message: {
    required: ['message_id', 'conversation_id', 'thread_id', 'channel', 'direction', 'message_type', 'delivery_state', 'checksum', 'revision', 'synthetic'],
    validate(o) {
      const e = [];
      if (!isStr(o.message_id)) e.push('message_id required');
      if (!isStr(o.thread_id)) e.push('thread_id required');
      if (!inSet(CHANNELS, o.channel)) e.push(`channel invalid: ${o.channel}`);
      if (!inSet(MESSAGE_DIRECTION, o.direction)) e.push(`direction invalid: ${o.direction}`);
      if (!inSet(MESSAGE_TYPE, o.message_type)) e.push(`message_type invalid: ${o.message_type}`);
      if (!inSet(DELIVERY_STATE, o.delivery_state)) e.push(`delivery_state invalid: ${o.delivery_state}`);
      if (!isStr(o.checksum)) e.push('checksum required');
      if (o.synthetic !== true) e.push('synthetic must be true');
      // raw body must NOT be stored; only a reference + redacted form
      if (o.body_raw != null) e.push('body_raw must not be stored (use body_reference + body_redacted)');
      if (o.attachments != null && !isArr(o.attachments)) e.push('attachments must be array');
      return e;
    },
  },
  draft: {
    required: ['draft_id', 'conversation_id', 'message_type', 'channel', 'status', 'approval_required', 'send_allowed', 'revision', 'synthetic'],
    validate(o) {
      const e = [];
      if (!isStr(o.draft_id)) e.push('draft_id required');
      if (!inSet(MESSAGE_TYPE, o.message_type)) e.push(`message_type invalid: ${o.message_type}`);
      if (!inSet(CHANNELS, o.channel)) e.push(`channel invalid: ${o.channel}`);
      if (!inSet(DRAFT_STATUS, o.status)) e.push(`status invalid: ${o.status}`);
      if (o.send_allowed !== false) e.push('send_allowed must be false');
      if (o.synthetic !== true) e.push('synthetic must be true');
      if (!isArr(o.claims)) e.push('claims must be array');
      return e;
    },
  },
  approval_request: {
    required: ['approval_request_id', 'draft_id', 'status', 'revision'],
    validate(o) {
      const e = [];
      if (!isStr(o.approval_request_id)) e.push('approval_request_id required');
      if (!isStr(o.draft_id)) e.push('draft_id required');
      if (!inSet(APPROVAL_STATUS, o.status)) e.push(`status invalid: ${o.status}`);
      // Hub may only hold reference statuses for owner decisions, never decide approval
      if (['OWNER_APPROVED_REFERENCE', 'OWNER_REJECTED_REFERENCE'].includes(o.status) && !isStr(o.owner_decision_reference)) e.push('owner_decision_reference required for reference statuses');
      return e;
    },
  },
  consent: {
    required: ['consent_id', 'channel', 'purpose', 'status', 'source'],
    validate(o) {
      const e = [];
      if (!isStr(o.consent_id)) e.push('consent_id required');
      if (!inSet(CHANNELS, o.channel)) e.push(`channel invalid: ${o.channel}`);
      if (!inSet(CONSENT_STATUS, o.status)) e.push(`status invalid: ${o.status}`);
      if (!isStr(o.source)) e.push('source (evidence) required');
      return e;
    },
  },
  opt_out: {
    required: ['opt_out_id', 'channel', 'scope', 'status', 'evidence'],
    validate(o) {
      const e = [];
      if (!isStr(o.opt_out_id)) e.push('opt_out_id required');
      if (!inSet(CHANNELS, o.channel) && o.channel !== 'ALL') e.push(`channel invalid: ${o.channel}`);
      if (!inSet(OPT_OUT_SCOPE, o.scope)) e.push(`scope invalid: ${o.scope}`);
      if (!isStr(o.evidence)) e.push('evidence required (no automatic legal conclusion)');
      // Hub opt-out is a recommendation; canonical mutation belongs to Master Controller
      if (o.canonical_applied === true) e.push('Hub must not mark opt-out canonically applied');
      return e;
    },
  },
  attachment: {
    required: ['attachment_ref_id', 'message_id', 'mime_type', 'hash', 'sensitivity', 'scan_status', 'synthetic'],
    validate(o) {
      const e = [];
      if (!isStr(o.attachment_ref_id)) e.push('attachment_ref_id required');
      if (!isStr(o.hash)) e.push('hash required');
      if (!inSet(SENSITIVITY, o.sensitivity)) e.push(`sensitivity invalid: ${o.sensitivity}`);
      if (!inSet(SCAN_STATUS, o.scan_status)) e.push(`scan_status invalid: ${o.scan_status}`);
      if (o.synthetic !== true) e.push('synthetic must be true');
      if (o.binary != null || o.content_base64 != null) e.push('no binary duplication in conversation store');
      return e;
    },
  },
  classification: {
    required: ['classification_id', 'message_id', 'primary_intent', 'confidence', 'rules_triggered'],
    validate(o) {
      const e = [];
      if (!isStr(o.classification_id)) e.push('classification_id required');
      if (!inSet(PRIMARY_INTENT, o.primary_intent)) e.push(`primary_intent invalid: ${o.primary_intent}`);
      if (typeof o.confidence !== 'number' || o.confidence < 0 || o.confidence > 1) e.push('confidence must be 0..1');
      if (!isArr(o.rules_triggered)) e.push('rules_triggered must be array');
      return e;
    },
  },
  routing: {
    required: ['routing_id', 'message_id', 'target_system', 'reason_codes', 'priority'],
    validate(o) {
      const e = [];
      if (!isStr(o.routing_id)) e.push('routing_id required');
      if (!inSet(ROUTE_TARGETS, o.target_system)) e.push(`target_system invalid: ${o.target_system}`);
      if (!isArr(o.reason_codes)) e.push('reason_codes must be array');
      if (!inSet(PRIORITY, o.priority)) e.push(`priority invalid: ${o.priority}`);
      return e;
    },
  },
  channel_health: {
    required: ['channel_id', 'status', 'read_only'],
    validate(o) {
      const e = [];
      if (!inSet(CHANNELS, o.channel_id)) e.push(`channel_id invalid: ${o.channel_id}`);
      if (!inSet(CHANNEL_HEALTH_STATE, o.status)) e.push(`status invalid: ${o.status}`);
      if (o.read_only !== true) e.push('read_only must be true in this task');
      // never "healthy" — that state does not exist in this task's vocabulary
      return e;
    },
  },
};

export function validateEntity(kind, obj) {
  const s = SCHEMAS[kind];
  if (!s) return [`unknown entity kind: ${kind}`];
  return s.validate(obj);
}
