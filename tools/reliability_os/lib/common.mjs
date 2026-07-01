// tools/reliability_os/lib/common.mjs
// Reliability / Observability / Business Continuity Control Plane — shared constants + helpers.
// Dependency-free, deterministic, OFFLINE, STATIC. NOT a monitoring runtime / scheduler / worker /
// backup service. NEVER installs monitoring, runs live health checks, restarts services, executes
// backup/restore, runs load/chaos tests, connects to a network, sends alerts, mutates production,
// or claims availability/backup-safety/infra-status without live verification. All artifacts SYNTHETIC.
import path from 'node:path';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';

export const REL_ROOT = process.env.RELIABILITY_OS_ROOT || path.resolve(process.cwd(), 'tools/reliability_os');
export const GENERATED_ROOT = process.env.RELIABILITY_OS_GENERATED || path.resolve(process.cwd(), '_generated/reliability_os');
export const DATA_DIR = path.join(REL_ROOT, 'data');
export const FIXTURE_DIR = path.join(REL_ROOT, 'fixtures');

// ---------------------------------------------------------------------------
// SAFETY INVARIANTS — all locked OFF. Imported + asserted by the self-test.
// ---------------------------------------------------------------------------
export const NETWORK_ALLOWED = false;
export const LIVE_HEALTH_ALLOWED = false;
export const PRODUCTION_READ_ALLOWED = false;
export const PRODUCTION_MUTATION_ALLOWED = false;
export const SERVICE_RESTART_ALLOWED = false;
export const DEPLOY_ALLOWED = false;
export const MONITORING_INSTALL_ALLOWED = false;
export const BACKGROUND_PROCESS_ALLOWED = false;
export const SCHEDULED_TASK_ALLOWED = false;
export const LIVE_BACKUP_ALLOWED = false;
export const PRODUCTION_RESTORE_ALLOWED = false;
export const LIVE_LOAD_TEST_ALLOWED = false;
export const LIVE_CHAOS_TEST_ALLOWED = false;
export const ALERT_SEND_ALLOWED = false;
export const MERGE_ALLOWED = false;
export const FILE_DELETE_ALLOWED = false;
export const DOC_APPLY_ALLOWED = false;

// ---------------------------------------------------------------------------
// VOCABULARIES
// ---------------------------------------------------------------------------
export const CRITICALITY = ['TIER_0_CANONICAL', 'TIER_1_CRITICAL', 'TIER_2_IMPORTANT', 'TIER_3_SUPPORTING', 'TIER_4_DEVELOPMENT_ONLY'];
export const HEALTH_STATUS = ['UNKNOWN', 'HEALTHY', 'DEGRADED', 'UNHEALTHY', 'STALE', 'MAINTENANCE', 'NOT_CONNECTED', 'NOT_APPLICABLE'];
export const CHECK_TYPES = ['LIVENESS', 'READINESS', 'DEPENDENCY', 'FRESHNESS', 'INTEGRITY', 'CAPACITY', 'SECURITY_BOUNDARY', 'BUSINESS_PROCESS'];
export const SLO_STATUS = ['PROPOSED', 'INTERNAL_TARGET', 'OWNER_APPROVED', 'LIVE_VALIDATED', 'RETIRED'];
export const DEP_TYPES = ['runtime', 'data', 'authentication', 'network', 'storage', 'scheduling', 'approval', 'operational'];
export const ALERT_SEVERITY = ['P0_CRITICAL', 'P1_HIGH', 'P2_MEDIUM', 'P3_LOW', 'INFO'];
export const ALERT_CATEGORIES = ['availability', 'integrity', 'data_loss', 'queue', 'worker', 'scheduler', 'communication', 'backup', 'certificate', 'capacity', 'dependency', 'security', 'release'];
export const INCIDENT_LIFECYCLE = ['DETECTED', 'TRIAGED', 'OWNER_NOTIFIED_REFERENCE', 'MITIGATING', 'MONITORING', 'RECOVERED', 'ROOT_CAUSE_ANALYSIS', 'CORRECTIVE_ACTION', 'VERIFIED', 'CLOSED'];
export const RPO_RTO_STATUS = ['UNKNOWN', 'PROPOSED', 'OWNER_APPROVED', 'LIVE_TESTED'];
export const CAPACITY_STATUS = ['CONFIRMED', 'SYSTEM_OBSERVED', 'MODEL_ESTIMATE', 'OWNER_TARGET', 'UNKNOWN'];
export const RELEASE_GATE_STATUS = ['NOT_READY', 'BLOCKED', 'READY_FOR_INTERNAL_REVIEW', 'READY_FOR_OWNER_REVIEW', 'OWNER_ACCEPTED_REFERENCE'];
export const LOG_LEVELS = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL', 'AUDIT'];
export const DEPLOY_PHASES = ['PRECHECK', 'BACKUP', 'DEPLOY', 'CONFIG_VERIFY', 'SERVICE_RESTART', 'HEALTH_VERIFY', 'FUNCTIONAL_SMOKE', 'SAFETY_VERIFY', 'OBSERVATION', 'ACCEPT', 'ROLLBACK'];
export const CHANGE_STATUS = ['DRAFT', 'VALIDATED', 'READY_FOR_OWNER_REVIEW'];

// Metric label cardinality control — forbidden + allowed.
export const FORBIDDEN_LABELS = ['canonical_lead_id', 'message_id', 'url', 'error_stack', 'email', 'phone', 'free_text', 'filename_raw'];
export const ALLOWED_LABELS = ['service', 'operation', 'status', 'error_code', 'queue', 'job_type', 'environment', 'product_category'];

// ---------------------------------------------------------------------------
// HELPERS — pure + deterministic.
// ---------------------------------------------------------------------------
export function arg(name, def) { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def; }
export function hasFlag(name) { return process.argv.includes(name); }
export function nowStamp(ts) { return ts || process.env.RELIABILITY_OS_TS || 'UNSTAMPED'; }
export function readJson(p) { return JSON.parse(readFileSync(p, 'utf8')); }
export function loadData(name) { return readJson(path.join(DATA_DIR, name)); }
export function checksum(obj) { const s = typeof obj === 'string' ? obj : JSON.stringify(obj, Object.keys(obj).sort()); return 'sha256:' + crypto.createHash('sha256').update(s).digest('hex').slice(0, 32); }
export function round4(n) { return Math.round(n * 10000) / 10000; }
