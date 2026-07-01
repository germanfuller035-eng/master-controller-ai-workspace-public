// tools/consolidation_os/lib/common.mjs
// Canonical Consolidation & Release Candidate Factory — shared constants + helpers.
// Dependency-free, deterministic, OFFLINE. This is NOT a new OS, NOT a production deployment, NOT a
// second registry. It consolidates the existing linear chain into one reproducible candidate branch.
// NEVER touches production: no network, no VPS, no canonical production writes, no send, no tag,
// no push, no branch/worktree/file deletion. Documentation is applied ONLY inside this branch tree.
import path from 'node:path';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';

export const CONS_ROOT = process.env.CONSOLIDATION_ROOT || path.resolve(process.cwd(), 'tools/consolidation_os');
export const GENERATED_ROOT = process.env.CONSOLIDATION_GENERATED || path.resolve(process.cwd(), '_generated/consolidation');
export const DATA_DIR = path.join(CONS_ROOT, 'data');
export const FIXTURE_DIR = path.join(CONS_ROOT, 'fixtures');
// The consolidation branch's own working tree (NOT the production vault D:/AI_WORKSPACE).
export const BRANCH_VAULT = process.env.CONSOLIDATION_BRANCH_VAULT || process.cwd();
export const PROPOSED_DIR = path.resolve(process.cwd(), 'docs_canonical_proposed');

// ---------------------------------------------------------------------------
// SAFETY INVARIANTS — all locked OFF. Asserted by the self-test.
// ---------------------------------------------------------------------------
export const NETWORK_ALLOWED = false;
export const PRODUCTION_ACCESS_ALLOWED = false;
export const PRODUCTION_CANONICAL_WRITE_ALLOWED = false;   // writing D:/AI_WORKSPACE vault is forbidden
export const LIVE_CANONICAL_READ_ALLOWED = false;
export const SEND_ALLOWED = false;
export const DEPLOY_ALLOWED = false;
export const PRODUCTION_BRANCH_MERGE_ALLOWED = false;
export const TAG_CREATE_ALLOWED = false;
export const TAG_MOVE_ALLOWED = false;
export const GIT_PUSH_ALLOWED = false;
export const GIT_REMOTE_ALLOWED = false;
export const BRANCH_DELETE_ALLOWED = false;
export const WORKTREE_DELETE_ALLOWED = false;
export const FILE_DELETE_ALLOWED = false;
// The ONE thing allowed: applying validated proposed docs into THIS branch's tree.
export const DOC_APPLY_IN_BRANCH_ALLOWED = true;

// ---------------------------------------------------------------------------
// VOCABULARIES
// ---------------------------------------------------------------------------
export const SYSTEM_STATUS = ['IMPLEMENTED_OFFLINE', 'DOCUMENTED', 'TESTED', 'NOT_DEPLOYED', 'OWNER_REVIEW_REQUIRED', 'PRODUCTION_NOT_ACTIVATED', 'ACTIVE_IN_PRODUCTION'];
export const DOC_OPERATION = ['CREATE', 'UPDATE', 'MERGE_ADDITIVE', 'APPEND'];
export const FILE_DISPOSITION = ['TRACK_REQUIRED', 'TRACK_SANITIZED', 'KEEP_UNTRACKED_RESTRICTED', 'ARCHIVE_AFTER_APPROVAL', 'DELETE_AFTER_APPROVAL', 'GENERATED_IGNORE', 'SECRET_NEVER_TRACK', 'REAL_DATA_NEVER_TRACK', 'UNKNOWN'];
export const DECISION_STATUS = ['PENDING', 'OWNER_DECISION_REQUIRED', 'LEGAL_REVIEW_REQUIRED', 'RESOLVED'];
export const CANDIDATE_STATUS = ['CANONICAL_CONSOLIDATION_CANDIDATE'];

export function arg(name, def) { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def; }
export function hasFlag(name) { return process.argv.includes(name); }
export function nowStamp(ts) { return ts || process.env.CONSOLIDATION_TS || 'UNSTAMPED'; }
export function readJson(p) { return JSON.parse(readFileSync(p, 'utf8')); }
export function loadData(name) { return readJson(path.join(DATA_DIR, name)); }
export function checksum(obj) { const s = typeof obj === 'string' ? obj : JSON.stringify(obj, Object.keys(obj).sort()); return 'sha256:' + crypto.createHash('sha256').update(s).digest('hex').slice(0, 32); }
// Refuse to ever resolve a path into the production vault.
export function isProductionVault(p) { const r = path.resolve(p); return r === path.resolve('D:/AI_WORKSPACE') || r.startsWith(path.resolve('D:/AI_WORKSPACE') + path.sep) && !r.includes('WORKTREES'); }
