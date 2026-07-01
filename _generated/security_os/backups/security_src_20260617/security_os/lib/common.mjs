// tools/security_os/lib/common.mjs
// Security / Privacy / Compliance Control Plane — shared constants + helpers.
// Dependency-free, deterministic, OFFLINE, STATIC, READ-ONLY ANALYSIS. NOT a SIEM/firewall/password
// manager/legal advisor. NEVER stores real secret values, uses/rotates credentials, scans live hosts,
// connects to a network, sends, mutates production, deletes files, or asserts legal compliance.
import path from 'node:path';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';

export const SEC_ROOT = process.env.SECURITY_OS_ROOT || path.resolve(process.cwd(), 'tools/security_os');
export const GENERATED_ROOT = process.env.SECURITY_OS_GENERATED || path.resolve(process.cwd(), '_generated/security_os');
export const DATA_DIR = path.join(SEC_ROOT, 'data');
export const FIXTURE_DIR = path.join(SEC_ROOT, 'fixtures');

// ---------------------------------------------------------------------------
// SAFETY INVARIANTS — all locked OFF. Imported + asserted by the security self-test.
// ---------------------------------------------------------------------------
export const NETWORK_ALLOWED = false;
export const LIVE_SCAN_ALLOWED = false;          // no live security/vuln scan
export const LIVE_PENTEST_ALLOWED = false;
export const SECRET_USE_ALLOWED = false;         // never use a credential
export const SECRET_PRINT_ALLOWED = false;       // never print a secret value
export const CREDENTIAL_ROTATION_ALLOWED = false;
export const PRODUCTION_MUTATION_ALLOWED = false;
export const CANONICAL_WRITE_ALLOWED = false;
export const SEND_ALLOWED = false;
export const DEPLOY_ALLOWED = false;
export const MERGE_ALLOWED = false;
export const FILE_DELETE_ALLOWED = false;
export const DOC_APPLY_ALLOWED = false;
export const LEGAL_ASSERTION_ALLOWED = false;    // never claim "GDPR/152-FZ/ISO compliant"

// Max stage reachable for retention/deletion this task.
export const MAX_DELETION_STAGE = 'READY';

// ---------------------------------------------------------------------------
// VOCABULARIES
// ---------------------------------------------------------------------------
// Reuse Integration Architecture data classes (no second model).
export const DATA_CLASSES = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED', 'SECRET_REFERENCE', 'PERSONAL', 'SENSITIVE_SPECIAL_CATEGORY', 'FINANCIAL', 'CLIENT_CONFIDENTIAL'];
export const ROLES = ['OWNER', 'SECURITY_ADMIN_FUTURE', 'DEVELOPER_AGENT', 'READ_ONLY_ANALYST', 'API_SERVICE', 'WORKER_SERVICE', 'TELEGRAM_SERVICE', 'IMAP_READ_ONLY_SERVICE', 'ANDROID_CLIENT', 'BACKUP_SERVICE'];
export const SECRET_TYPES = ['ssh_private_key', 'telegram_bot_token', 'smtp_imap_password', 'api_key', 'android_signing_secret', 'tls_private_key', 'database_credential_future', 'third_party_credential'];
export const CREDENTIAL_LIFECYCLE = ['REQUESTED', 'APPROVED', 'CREATED_EXTERNALLY', 'STORED', 'ACTIVE', 'ROTATION_DUE', 'REVOKED', 'EXPIRED', 'COMPROMISED', 'DESTROYED_CONFIRMED'];
export const DELETION_STAGES = ['REQUESTED', 'VALIDATED', 'LEGAL_HOLD_CHECKED', 'BACKUP_IMPACT_REVIEWED', 'OWNER_APPROVED', 'READY', 'EXECUTED', 'VERIFIED'];
export const SEVERITY = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
export const THREAT_CATEGORIES = ['spoofing', 'tampering', 'repudiation', 'information_disclosure', 'denial_of_service', 'elevation_of_privilege', 'supply_chain_compromise', 'prompt_injection', 'data_exfiltration', 'unsafe_automation'];
export const INCIDENT_LIFECYCLE = ['DETECTED', 'TRIAGED', 'CONTAINMENT_PLANNED', 'OWNER_REVIEW', 'CONTAINED', 'ERADICATION_PLANNED', 'RECOVERY_PLANNED', 'VERIFIED', 'POSTMORTEM', 'CLOSED'];
export const VULN_STATUS = ['NEW', 'VALIDATING', 'CONFIRMED', 'FALSE_POSITIVE', 'MITIGATION_PLANNED', 'OWNER_REVIEW', 'ACCEPTED_RISK', 'FIXED', 'VERIFIED'];
export const COMPLIANCE_STATUS = ['IMPLEMENTED_AND_TESTED', 'DOCUMENTED_ONLY', 'PARTIAL', 'MISSING', 'NOT_APPLICABLE', 'LEGAL_REVIEW_REQUIRED'];
export const RELEASE_GATE_STATUS = ['NOT_READY', 'BLOCKED', 'READY_FOR_OWNER_REVIEW', 'OWNER_ACCEPTED_REFERENCE'];
export const PIA_STATUS = ['INTERNAL_CONTROL', 'OWNER_REVIEW_REQUIRED', 'LEGAL_REVIEW_REQUIRED', 'NOT_ASSESSED'];
export const ENCRYPTION_STATUS = ['CONFIRMED_DOCUMENTED', 'REQUIRES_LIVE_VERIFICATION', 'PLANNED', 'UNKNOWN'];
export const COMM_DISPOSITION = ['KEEP_RESTRICTED', 'KEEP_AUDIT_EVIDENCE', 'REDACT_AND_TRACK', 'MOVE_TO_QUARANTINE', 'MOVE_TO_ARCHIVE', 'DELETE_AFTER_APPROVAL', 'ROTATION_REQUIRED', 'UNKNOWN'];

// ---------------------------------------------------------------------------
// SECRET PATTERNS — for detection only. Never print the matched value (path/type/fingerprint only).
// ---------------------------------------------------------------------------
export const SECRET_PATTERNS = [
  { type: 'private_key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { type: 'telegram_token', re: /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/ },
  { type: 'authorization_header', re: /authorization\s*[:=]\s*['"]?(bearer|basic)\s+[A-Za-z0-9._\-/+=]{12,}/i },
  { type: 'password_assign', re: /(password|smtp_pass|imap_pass|app_password|api_key|secret|keystore_pass)["']?\s*[:=]\s*["'][^\s"'${}()\\|\][]{8,}["']/i },
  { type: 'aws_key', re: /AKIA[0-9A-Z]{16}/ },
  { type: 'generic_high_entropy', re: /\b[A-Za-z0-9+/]{40,}={0,2}\b/ },
];

export function fingerprint(s) { return 'fp:' + crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 12); }

export function arg(name, def) { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def; }
export function hasFlag(name) { return process.argv.includes(name); }
export function nowStamp(ts) { return ts || process.env.SECURITY_OS_TS || 'UNSTAMPED'; }
export function readJson(p) { return JSON.parse(readFileSync(p, 'utf8')); }
export function loadData(name) { return readJson(path.join(DATA_DIR, name)); }
export function checksum(obj) { const s = typeof obj === 'string' ? obj : JSON.stringify(obj, Object.keys(obj).sort()); return 'sha256:' + crypto.createHash('sha256').update(s).digest('hex').slice(0, 32); }
