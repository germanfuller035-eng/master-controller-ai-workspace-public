// tools/orchestrator_os/lib/common.mjs
// Agent Automation & Orchestration Control Plane — shared constants + helpers.
// Dependency-free, deterministic, OFFLINE. This is NOT a production worker/scheduler and NOT a
// replacement for the Master Controller job queue. It NEVER starts real agents, schedulers,
// background processes, networks, sends, or mutates production. All artifacts TEST_ONLY/SYNTHETIC.
import path from 'node:path';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';

export const ORC_ROOT = process.env.ORCHESTRATOR_OS_ROOT || path.resolve(process.cwd(), 'tools/orchestrator_os');
export const GENERATED_ROOT = process.env.ORCHESTRATOR_OS_GENERATED || path.resolve(process.cwd(), '_generated/orchestrator_os');
export const DATA_DIR = path.join(ORC_ROOT, 'data');
export const FIXTURE_DIR = path.join(ORC_ROOT, 'fixtures');

// ---------------------------------------------------------------------------
// SAFETY INVARIANTS — all locked OFF. Imported + asserted by the security test.
// ---------------------------------------------------------------------------
export const PRODUCTION_MUTATION_ALLOWED = false;
export const LIVE_AGENT_EXECUTION_ALLOWED = false;   // no real Claude/Cline runs
export const BACKGROUND_PROCESS_ALLOWED = false;     // no daemon/worker
export const SCHEDULER_CREATION_ALLOWED = false;     // no cron/systemd/Windows task
export const NETWORK_ALLOWED = false;
export const SEND_ALLOWED = false;
export const CANONICAL_WRITE_ALLOWED = false;
export const PRODUCTION_QUEUE_WRITE_ALLOWED = false; // never writes Master Controller queue
export const SECRET_ACCESS_ALLOWED = false;
export const DEPLOY_ALLOWED = false;
export const MERGE_ALLOWED = false;
export const DOC_APPLY_ALLOWED = false;
export const FILE_DELETE_ALLOWED = false;

// Max risk level executable in this block.
export const MAX_RISK_THIS_BLOCK = 'R2_ISOLATED_CODE';

// ---------------------------------------------------------------------------
// VOCABULARIES
// ---------------------------------------------------------------------------
export const TASK_STATUS = ['DRAFT', 'VALIDATING', 'READY', 'WAITING_DEPENDENCY', 'WAITING_OWNER', 'QUEUED', 'LEASED', 'RUNNING', 'CHECKPOINTED', 'VERIFYING', 'COMPLETED', 'COMPLETED_WITH_NOTES', 'FAILED_RETRYABLE', 'FAILED_TERMINAL', 'DEAD_LETTER', 'PAUSED', 'CANCELLED', 'SUPERSEDED'];
export const TASK_TYPES = ['ANALYSIS', 'DOCUMENTATION', 'CODE_CHANGE', 'TESTING', 'DATA_MIGRATION_PLAN', 'DEPLOYMENT_PLAN', 'SECURITY_REVIEW', 'RESEARCH', 'CONTENT_DRAFT', 'REPORT', 'MAINTENANCE', 'INCIDENT_RESPONSE_PLAN'];
export const EXECUTION_MODES = ['READ_ONLY', 'LOCAL_WRITE', 'ISOLATED_WORKTREE', 'SYNTHETIC', 'DRY_RUN', 'OWNER_GATED', 'PRODUCTION_PROHIBITED'];
export const RISK_LEVELS = ['R0_READ_ONLY', 'R1_LOCAL_REVERSIBLE', 'R2_ISOLATED_CODE', 'R3_SENSITIVE_LOCAL', 'R4_PRODUCTION_PREPARATION', 'R5_PRODUCTION_MUTATION', 'R6_EXTERNAL_COMMUNICATION'];
export const AGENT_TYPES = ['CLAUDE_CODE', 'CLINE', 'DETERMINISTIC_NODE', 'DETERMINISTIC_PYTHON', 'HUMAN_OWNER', 'FUTURE_LOCAL_MODEL'];
export const APPROVAL_GATE_CATEGORIES = ['owner_decision', 'production_mutation', 'external_communication', 'secret_access', 'cost_purchase', 'irreversible_delete', 'migration_apply', 'branch_merge', 'proposed_doc_apply', 'release_tag', 'legal_compliance'];
export const BUDGET_TYPES = ['token', 'monetary', 'elapsed_time', 'file_changes', 'commands', 'retries', 'concurrent_runs', 'context_size'];
export const BUDGET_STATUS = ['UNKNOWN', 'OWNER_TARGET', 'ESTIMATED', 'OBSERVED', 'EXCEEDED'];
export const RETRY_CLASSES = ['TRANSIENT_TOOL', 'TRANSIENT_RESOURCE', 'VALIDATION', 'DEPENDENCY', 'REVISION_CONFLICT', 'POLICY_BLOCK', 'OWNER_REQUIRED', 'TERMINAL_CODE', 'AMBIGUOUS_RESULT'];
export const ANTILOOP_ACTIONS = ['CONTINUE', 'RESUME', 'REUSE', 'SUPERSEDE', 'BLOCK_DUPLICATE', 'REQUIRE_NEW_EVIDENCE', 'OWNER_REVIEW'];
export const LEASE_STATUS = ['ACTIVE', 'EXPIRED', 'RELEASED', 'REVOKED'];
export const COST_STATUS = ['UNKNOWN', 'ESTIMATED', 'CONFIRMED'];
export const VERIFICATION_GATES = ['syntax', 'unit', 'integration', 'security', 'privacy', 'no-network', 'no-send', 'no-production', 'backup', 'restore', 'source-match', 'owner-acceptance'];

// ---------------------------------------------------------------------------
// HELPERS — pure + deterministic.
// ---------------------------------------------------------------------------
export function arg(name, def) { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def; }
export function hasFlag(name) { return process.argv.includes(name); }
export function nowStamp(ts) { return ts || process.env.ORCHESTRATOR_OS_TS || 'UNSTAMPED'; }
export function readJson(p) { return JSON.parse(readFileSync(p, 'utf8')); }
export function loadData(name) { return readJson(path.join(DATA_DIR, name)); }
export function checksum(obj) { const s = typeof obj === 'string' ? obj : JSON.stringify(obj, Object.keys(obj).sort()); return 'sha256:' + crypto.createHash('sha256').update(s).digest('hex').slice(0, 32); }
export function riskIndex(r) { return RISK_LEVELS.indexOf(r); }
export function exceedsMaxRisk(r) { return riskIndex(r) > RISK_LEVELS.indexOf(MAX_RISK_THIS_BLOCK); }
