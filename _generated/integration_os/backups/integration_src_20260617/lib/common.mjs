// tools/integration_os/lib/common.mjs
// Integration Architecture & Data Contracts Consolidation — shared constants + helpers.
// Dependency-free, deterministic, OFFLINE. This is NOT a new OS or runtime: it is an architecture,
// validation and migration-PLANNING layer. It NEVER mutates production, connects to a network,
// sends, merges branches, applies migrations/docs, or deletes anything. All artifacts TEST_ONLY/SYNTHETIC.
import path from 'node:path';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';

export const INT_ROOT = process.env.INTEGRATION_OS_ROOT || path.resolve(process.cwd(), 'tools/integration_os');
export const GENERATED_ROOT = process.env.INTEGRATION_OS_GENERATED || path.resolve(process.cwd(), '_generated/integration_os');
export const DATA_DIR = path.join(INT_ROOT, 'data');
export const FIXTURE_DIR = path.join(INT_ROOT, 'fixtures');

// ---------------------------------------------------------------------------
// SAFETY INVARIANTS — all locked OFF. Imported + asserted by the security test.
// ---------------------------------------------------------------------------
export const PRODUCTION_MUTATION_ALLOWED = false;
export const LIVE_API_ACCESS_ALLOWED = false;
export const NETWORK_ALLOWED = false;
export const SEND_ALLOWED = false;
export const CANONICAL_WRITE_ALLOWED = false;
export const BRANCH_MERGE_ALLOWED = false;
export const MIGRATION_APPLY_ALLOWED = false;
export const DOC_APPLY_ALLOWED = false;
export const FILE_DELETE_ALLOWED = false;
export const GIT_PUSH_ALLOWED = false;
export const GIT_REMOTE_ALLOWED = false;

// Max migration status reachable in this task.
export const MAX_MIGRATION_STATUS = 'READY';

// ---------------------------------------------------------------------------
// THE SYSTEMS (12) — canonical list with one-line responsibility + canonical role.
// ---------------------------------------------------------------------------
export const SYSTEMS = [
  { id: 'ai_hq', role: 'governance', writes_canonical: false, note: 'Project Registry, context packs, task ledger, source-of-truth governance, backups, validation' },
  { id: 'master_controller', role: 'operational_canonical_writer', writes_canonical: true, note: 'SOLE operational canonical writer: lead identity, pipeline, approval, outbound, reply, follow-up, revision, send ledger' },
  { id: 'lead_hunter', role: 'discovery_recommender', writes_canonical: false, note: 'discovery, candidate intelligence, provenance, score_v2, promotion recommendation; never writes canonical store' },
  { id: 'revenue_os', role: 'commercial_truth', writes_canonical: true, note: 'product-commercial truth, pricing, offer, proposal, deal lifecycle (own store)' },
  { id: 'product_os', role: 'product_truth', writes_canonical: true, note: 'product spec, readiness, claims, versions, pilot evidence (own store)' },
  { id: 'delivery_os', role: 'delivery_truth', writes_canonical: true, note: 'delivery project, milestones, tasks, QA, acceptance, delivery risk (own store)' },
  { id: 'finance_os', role: 'finance_truth', writes_canonical: true, note: 'invoice, payment, expense, P&L, cashflow, profitability (own store)' },
  { id: 'customer_success_os', role: 'cs_truth', writes_canonical: true, note: 'onboarding, adoption, health, support, renewal, churn, permissions (own store)' },
  { id: 'growth_os', role: 'demand_planning', writes_canonical: false, note: 'segments, ICP, campaign definition, content, channel strategy, readiness (planning)' },
  { id: 'conversation_hub', role: 'comms_view_recommender', writes_canonical: false, note: 'normalized conversation view, classification, routing, drafts as requests, opt-out recommendation' },
  { id: 'analytics_os', role: 'derived_observation', writes_canonical: false, note: 'metrics, derived observations, lineage, quality, experiments, reports (derived only)' },
  { id: 'executive_os', role: 'decision_read_model', writes_canonical: true, note: 'owner decisions, priorities, stop/go/pause, owner actions, executive read model (decision store)' },
];

// ---------------------------------------------------------------------------
// SHARED ENUMS (MP9) — only cross-cutting enums; domain-only enums stay in their domain.
// ---------------------------------------------------------------------------
export const CONFIDENCE = ['CONFIRMED', 'SYSTEM_OBSERVED', 'CUSTOMER_REPORTED', 'OWNER_CONFIRMED', 'MODEL_ESTIMATE', 'INFERENCE', 'IMPORTED_UNVERIFIED', 'UNKNOWN'];
export const EVIDENCE_STATUS = ['VERIFIED', 'UNVERIFIED', 'STALE', 'MISSING'];
export const APPROVAL_REFERENCE = ['NOT_REQUESTED', 'REQUESTED', 'OWNER_APPROVED_REFERENCE', 'OWNER_REJECTED_REFERENCE', 'EXPIRED', 'SUPERSEDED', 'REVISION_CONFLICT'];
export const SEVERITY = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
export const DATA_CLASS = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED', 'SECRET_REFERENCE', 'PERSONAL', 'SENSITIVE_SPECIAL_CATEGORY', 'FINANCIAL', 'CLIENT_CONFIDENTIAL'];
export const ENVIRONMENT = ['PRODUCTION', 'STAGING', 'TEST', 'SYNTHETIC'];
export const CHANNEL = ['EMAIL', 'TELEGRAM', 'WEB_FORM', 'MAX_FUTURE', 'WHATSAPP_OFFICIAL_FUTURE', 'PHONE_MANUAL_REFERENCE', 'INTERNAL'];
export const DIRECTION = ['INBOUND', 'OUTBOUND', 'INTERNAL', 'SYSTEM'];
export const RECOMMENDATION_STATUS = ['RECOMMENDED', 'ACCEPTED_REFERENCE', 'REJECTED_REFERENCE', 'SUPERSEDED'];

// ---------------------------------------------------------------------------
// STANDARD ERROR TAXONOMY (MP15)
// ---------------------------------------------------------------------------
export const ERROR_CODES = [
  'VALIDATION_ERROR', 'NOT_FOUND', 'CONFLICT', 'FORBIDDEN', 'APPROVAL_REQUIRED', 'OPT_OUT_BLOCK',
  'IDENTITY_CONFLICT', 'STALE_EVIDENCE', 'UNSUPPORTED_CLAIM', 'PRODUCT_NOT_READY', 'CAPACITY_BLOCK',
  'DEPENDENCY_UNAVAILABLE', 'RATE_LIMITED', 'IDEMPOTENCY_CONFLICT', 'DUPLICATE', 'TEMPORARY_FAILURE',
  'PERMANENT_FAILURE', 'INTERNAL_ERROR',
];

// Contract + migration vocabularies
export const CONTRACT_TYPES = ['READ_MODEL', 'WRITE_COMMAND', 'EVENT', 'SNAPSHOT', 'FILE_HANDOFF', 'UI_VIEW', 'ADAPTER', 'APPROVAL', 'MIGRATION', 'ANALYTICS'];
export const MIGRATION_STAGES = ['INVENTORY', 'MAPPING', 'DRY_RUN', 'VALIDATED', 'OWNER_REVIEW', 'READY', 'APPLIED', 'VERIFIED', 'ROLLED_BACK'];
export const LEGACY_DISPOSITION = ['KEEP_ACTIVE', 'KEEP_REFERENCE', 'MOVE_TO_ARCHIVE', 'DISABLE', 'REPLACE', 'DELETE_AFTER_APPROVAL', 'UNKNOWN'];
export const LEGACY_CLASS = ['ACTIVE_PRODUCTION', 'ACTIVE_TOOLING', 'TEST_ONLY', 'HISTORICAL', 'OBSOLETE', 'DANGEROUS_UNUSED', 'UNKNOWN'];

// Standard temporal field names (MP7)
export const TEMPORAL_FIELDS = ['created_at', 'updated_at', 'observed_at', 'effective_at', 'received_at', 'sent_at', 'accepted_at', 'generated_at', 'source_timestamp'];

// ---------------------------------------------------------------------------
// HELPERS — pure + deterministic (no Date.now/Math.random).
// ---------------------------------------------------------------------------
export function arg(name, def) { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def; }
export function hasFlag(name) { return process.argv.includes(name); }
export function nowStamp(ts) { return ts || process.env.INTEGRATION_OS_TS || 'UNSTAMPED'; }
export function readJson(p) { return JSON.parse(readFileSync(p, 'utf8')); }
export function loadData(name) { return readJson(path.join(DATA_DIR, name)); }
export function checksum(obj) { const s = typeof obj === 'string' ? obj : JSON.stringify(obj, Object.keys(obj).sort()); return 'sha256:' + crypto.createHash('sha256').update(s).digest('hex').slice(0, 32); }
export function isIsoUtc(ts) { return typeof ts === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(ts); }
