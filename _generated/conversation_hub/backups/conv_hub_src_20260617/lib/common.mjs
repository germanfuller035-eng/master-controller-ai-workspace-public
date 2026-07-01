// tools/conversation_hub/lib/common.mjs
// Shared constants + helpers for Conversation Hub / Omnichannel Communication Control Plane.
// Dependency-free, deterministic, OFFLINE. The Hub is a NORMALIZATION + ROUTING + DRAFT-REQUEST
// PLANNING layer. It NEVER sends, connects to a network, reads/writes canonical production state,
// imports real conversations, creates live drafts, or talks to any channel API. All artifacts are
// INTERNAL / TEST_ONLY / SYNTHETIC / NO_SEND / NO_NETWORK / NO_PRODUCTION.
import path from 'node:path';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';

export const HUB_ROOT = process.env.CONV_HUB_ROOT || path.resolve(process.cwd(), 'tools/conversation_hub');
export const GENERATED_ROOT = process.env.CONV_HUB_GENERATED || path.resolve(process.cwd(), '_generated/conversation_hub');
export const DATA_DIR = path.join(HUB_ROOT, 'data');
export const FIXTURE_DIR = path.join(HUB_ROOT, 'fixtures');

// ---------------------------------------------------------------------------
// GLOBAL SAFETY INVARIANTS — Conversation Hub prepares + normalizes, never executes.
// These are imported by the security test and asserted to be locked OFF.
// ---------------------------------------------------------------------------
export const SEND_ALLOWED = false;            // never send a message
export const NETWORK_ALLOWED = false;         // never open a socket / fetch / http
export const SMTP_ALLOWED = false;            // never connect SMTP
export const IMAP_ALLOWED = false;            // never connect IMAP
export const TELEGRAM_API_ALLOWED = false;    // never call Telegram Bot API
export const WHATSAPP_API_ALLOWED = false;    // official WhatsApp Business — future only
export const MAX_API_ALLOWED = false;         // MAX — future only
export const WEB_FORM_SUBMIT_ALLOWED = false; // never submit a web form
export const CANONICAL_WRITE_ALLOWED = false; // Master Controller is the only canonical writer
export const PRODUCTION_READ_ALLOWED = false; // no live canonical reads
export const LIVE_CHANNEL_CONNECT_ALLOWED = false;
export const UNOFFICIAL_CHANNEL_AUTOMATION_ALLOWED = false; // no userbot/browser/scrape automation
export const REAL_MESSAGE_INGEST_ALLOWED = false;
export const REAL_DRAFT_CREATE_ALLOWED = false;

// In this task every live channel is NOT_CONNECTED. Channel health is never "healthy" from
// contract tests alone.
export const LIVE_CHANNEL_DEFAULT_STATE = 'NOT_CONNECTED';

// ---------------------------------------------------------------------------
// CANONICAL SOURCE REFERENCES (read-only; the Hub is a reader, and only of synthetic/local data).
// These point at OTHER systems that OWN the truth. The Hub never writes them.
// ---------------------------------------------------------------------------
export const SOURCE_OWNERS = {
  canonical_identity: 'Master Controller',
  pipeline_status: 'Master Controller',
  approval_state: 'Master Controller',
  reply_state: 'Master Controller (reply_monitor)',
  outbound_send_state: 'Master Controller (outbound_send_ledger.jsonl)',
  deal_state: 'Revenue OS',
  project_state: 'Delivery OS',
  billing_state: 'Finance OS',
  support_lifecycle: 'Customer Success OS',
  product_claims: 'Product OS',
  conversation_metrics: 'Analytics OS',
  owner_priority: 'Executive OS',
  campaign_intent: 'Growth OS',
  normalized_conversation_view: 'Conversation Hub',
};

// ---------------------------------------------------------------------------
// VOCABULARIES (schemas import these; validators enforce membership).
// ---------------------------------------------------------------------------
export const CHANNELS = ['EMAIL', 'TELEGRAM', 'WEB_FORM', 'MAX_FUTURE', 'WHATSAPP_OFFICIAL_FUTURE', 'PHONE_MANUAL_REFERENCE', 'INTERNAL'];
export const FUTURE_CHANNELS = ['MAX_FUTURE', 'WHATSAPP_OFFICIAL_FUTURE'];

export const CONVERSATION_STATUS = ['NEW', 'ACTIVE', 'WAITING_OWNER', 'WAITING_CONTACT', 'WAITING_APPROVAL', 'WAITING_CHANNEL', 'RESOLVED', 'CLOSED', 'OPTED_OUT', 'ARCHIVED'];
export const THREAD_STATUS = ['OPEN', 'WAITING', 'CLOSED', 'ARCHIVED'];
export const MESSAGE_DIRECTION = ['INBOUND', 'OUTBOUND', 'INTERNAL', 'SYSTEM'];
export const MESSAGE_TYPE = ['PLAIN', 'REPLY', 'AUTO_REPLY', 'BOUNCE', 'DELIVERY_RECEIPT', 'OPT_OUT', 'UNSUBSCRIBE', 'COMPLAINT', 'SUPPORT', 'BILLING', 'REFERRAL', 'SYSTEM_EVENT', 'UNKNOWN'];

export const DRAFT_STATUS = ['INTERNAL_DRAFT', 'VALIDATION_FAILED', 'READY_FOR_OWNER_REVIEW', 'OWNER_APPROVED_REFERENCE_ONLY', 'REJECTED', 'SUPERSEDED', 'EXPIRED'];
export const APPROVAL_STATUS = ['NOT_REQUESTED', 'REQUESTED', 'OWNER_APPROVED_REFERENCE', 'OWNER_REJECTED_REFERENCE', 'EXPIRED', 'SUPERSEDED', 'REVISION_CONFLICT'];

export const DEDUPE_OUTCOME = ['UNIQUE', 'EXACT_DUPLICATE', 'PROBABLE_DUPLICATE', 'RETRY_DUPLICATE', 'CONFLICT', 'MANUAL_REVIEW'];
export const IDENTITY_STATE = ['CANONICAL_MATCH', 'STRONG_MATCH', 'PROBABLE_MATCH', 'AMBIGUOUS', 'NO_MATCH', 'CONFLICT'];

export const DELIVERY_STATE = ['DRAFT', 'QUEUED_REFERENCE', 'TRANSPORT_ACCEPTED', 'DELIVERED_CONFIRMED', 'DEFERRED', 'BOUNCED_SOFT', 'BOUNCED_HARD', 'REJECTED', 'UNKNOWN'];

export const PRIMARY_INTENT = [
  'interest', 'price_question', 'details_question', 'meeting_request', 'not_now', 'rejection',
  'opt_out', 'unsubscribe', 'support', 'incident', 'billing', 'complaint', 'referral',
  'testimonial_permission', 'case_permission', 'auto_reply', 'bounce', 'delivery_receipt',
  'spam', 'unknown',
];

export const ROUTE_TARGETS = ['REVENUE_OS', 'DELIVERY_OS', 'FINANCE_OS', 'CUSTOMER_SUCCESS_OS', 'EXECUTIVE_OS', 'MASTER_CONTROLLER_REPLY_QUEUE', 'OWNER_MANUAL_REVIEW', 'BLOCKED_UNKNOWN'];

export const OPT_OUT_SCOPE = ['ALL_COMMERCIAL', 'CHANNEL_ONLY', 'CAMPAIGN_ONLY', 'PRODUCT_ONLY', 'SUPPORT_EXCLUDED', 'UNKNOWN'];
export const CONSENT_STATUS = ['GRANTED', 'REVOKED', 'PENDING', 'UNKNOWN'];

export const PRIORITY = ['P0_CRITICAL', 'P1_HIGH', 'P2_NORMAL', 'P3_LOW', 'REVIEW_REQUIRED'];
export const CHANNEL_HEALTH_STATE = ['NOT_CONNECTED', 'CONFIGURED_REFERENCE_ONLY', 'DEGRADED', 'FAILED', 'UNKNOWN'];

export const SENSITIVITY = ['NONE', 'PII', 'SECRET_RISK', 'SPECIAL_CATEGORY', 'UNKNOWN'];
export const SCAN_STATUS = ['NOT_SCANNED', 'SCAN_CONTRACT_PENDING', 'CLEAN_REFERENCE', 'FLAGGED_REFERENCE'];

export const DATA_STATUS = ['CONFIRMED', 'OWNER_TARGET', 'MODEL_ESTIMATE', 'UNKNOWN'];

// ---------------------------------------------------------------------------
// HELPERS — all pure + deterministic. No Date.now()/Math.random() (would break determinism).
// ---------------------------------------------------------------------------
export function arg(name, def) { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def; }
export function hasFlag(name) { return process.argv.includes(name); }
export function nowStamp(ts) { return ts || process.env.CONV_HUB_TS || 'UNSTAMPED'; }
export function readJson(p) { return JSON.parse(readFileSync(p, 'utf8')); }
export function round4(n) { return Math.round(n * 10000) / 10000; }
export function pct(n, d) { return d === 0 || d == null ? null : round4(n / d); }

// Deterministic checksum over normalized content (stable across runs).
export function checksum(obj) {
  const s = typeof obj === 'string' ? obj : JSON.stringify(obj, Object.keys(obj).sort());
  return 'sha256:' + crypto.createHash('sha256').update(s).digest('hex').slice(0, 32);
}

// UTC-normalize a timestamp string to ISO (no wall-clock dependence; parses given input only).
export function normalizeTs(ts) {
  if (!ts) return null;
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
}
