// tools/ai_hq/lib/common.mjs
// Shared helpers + safety constants for AI HQ tooling.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// The LIVE main vault (read-only for this task). Override via AI_HQ_WORKSPACE for tests/fixtures.
export const WORKSPACE_ROOT = process.env.AI_HQ_WORKSPACE || 'D:/AI_WORKSPACE';

// Where this tool writes generated artifacts (inside the worktree, never the live vault).
export const GENERATED_ROOT =
  process.env.AI_HQ_GENERATED || path.resolve(process.cwd(), '_generated/ai_hq');

// Paths that must NEVER be written by HQ tooling (production freeze). Read-only allowed.
export const PROTECTED_PREFIXES = [
  'tools/mater_controller_api',
  'tools/telegram_gateway',
  'tools/master_controller',
  'tools/lead_hunter',
  '13_sales/outbound_send_ledger.jsonl',
  '13_sales/outbound_email_ledger.jsonl',
  '13_sales/reply_ledger',
  '13_sales/followup',
  'apps/mater_controller_android',
  'dist/mater_controller_android',
];

// Directory/category names considered SENSITIVE — index/container only, no content summaries.
export const SENSITIVE_HINTS = [
  'vvk', 'military', 'медиц', 'medical', 'legal', 'юридич', 'паспорт', 'passport',
  'identity', 'удостоверение', 'financ', 'банк', 'bank', 'credential', 'secret',
  'red_docs', 'личн', 'personal', 'voenkomat', 'военк', 'health', 'диагноз',
];

export const SECRET_FILE_HINTS = ['.env', 'secret', 'token', 'credential', 'signing', 'id_rsa', 'id_ed25519', '.pem', '.key'];

export function isSensitivePath(p) {
  const low = p.toLowerCase();
  return SENSITIVE_HINTS.some((h) => low.includes(h));
}

export function looksLikeSecretFile(p) {
  const low = p.toLowerCase();
  return SECRET_FILE_HINTS.some((h) => low.includes(h));
}

export function sha256File(absPath) {
  const buf = fs.readFileSync(absPath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export function sha256Str(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

export function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

export function readSafe(absPath, maxBytes = 512 * 1024) {
  try {
    const stat = fs.statSync(absPath);
    if (stat.size > maxBytes) {
      const fd = fs.openSync(absPath, 'r');
      const buf = Buffer.alloc(maxBytes);
      fs.readSync(fd, buf, 0, maxBytes, 0);
      fs.closeSync(fd);
      return buf.toString('utf8');
    }
    return fs.readFileSync(absPath, 'utf8');
  } catch {
    return '';
  }
}

// Deterministic timestamp: passed in, never Date.now() (keeps tools reproducible/testable).
export function stamp(ts) {
  return ts || process.env.AI_HQ_TS || 'UNSTAMPED';
}

// Walk a directory tree, returning relative file paths. Skips heavy/noise dirs.
const SKIP_DIRS = new Set([
  '.git', 'node_modules', '.obsidian', '$RECYCLE.BIN', 'System Volume Information',
  '_generated', '.vscode',
]);

export function walk(root, { maxEntries = 200000 } = {}) {
  const out = [];
  const stack = [root];
  let count = 0;
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      const rel = path.relative(root, abs).split(path.sep).join('/');
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        stack.push(abs);
      } else if (e.isFile()) {
        out.push(rel);
        if (++count >= maxEntries) return out;
      }
    }
  }
  return out;
}

export function fileMeta(root, rel) {
  const abs = path.join(root, rel);
  let stat;
  try { stat = fs.statSync(abs); } catch { return null; }
  return {
    path: rel,
    size: stat.size,
    mtime: stat.mtimeMs,
    ext: path.extname(rel).toLowerCase(),
  };
}

export function classifyCategory(rel) {
  const r = rel.toLowerCase();
  if (isSensitivePath(r)) return 'sensitive';
  if (r.startsWith('tools/') || r.startsWith('apps/')) return 'code';
  if (r.startsWith('dist/')) return 'release_artifact';
  if (r.includes('backup')) return 'backup';
  if (r.includes('archive') || r.startsWith('99_archive')) return 'archive';
  if (r.endsWith('.md')) return 'knowledge';
  if (r.endsWith('.json') || r.endsWith('.jsonl')) return 'data';
  return 'other';
}
