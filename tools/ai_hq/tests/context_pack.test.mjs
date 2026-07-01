#!/usr/bin/env node
// tools/ai_hq/tests/context_pack.test.mjs
// Offline tests for the context pack builder + validator. Deterministic. Real exit codes.
// Run: node tools/ai_hq/tests/context_pack.test.mjs

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', '..'); // worktree root
const FIX_WS = path.join(ROOT, 'tools/ai_hq/fixtures/ws');
const FIX_DOCS_DUP = path.join(ROOT, 'tools/ai_hq/fixtures/docs_dup');
const TMP = path.join(ROOT, '_generated/ai_hq/test_out');
const TS = '20260101_000000';

let pass = 0, fail = 0;
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}

function runPack(args, env = {}) {
  const full = ['tools/ai_hq/context_pack_builder.mjs', ...args, '--workspace', FIX_WS, '--out', path.join(TMP, 'cp'), '--ts', TS];
  try {
    const out = execFileSync('node', full, { cwd: ROOT, env: { ...process.env, AI_HQ_TS: TS, ...env }, encoding: 'utf8' });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || '') + (e.stderr || '') };
  }
}

function readPack(project, agent) {
  const md = path.join(TMP, 'cp', project, `${TS}_${agent}.md`);
  const meta = path.join(TMP, 'cp', project, `${TS}_${agent}.meta.json`);
  return {
    md: fs.existsSync(md) ? fs.readFileSync(md, 'utf8') : '',
    meta: fs.existsSync(meta) ? JSON.parse(fs.readFileSync(meta, 'utf8')) : null,
  };
}

fs.rmSync(TMP, { recursive: true, force: true });

console.log('[test] context pack builder');

// 1. Valid project
{
  const r = runPack(['--project', 'obsidian_hq', '--agent', 'claude', '--task', 't']);
  ok('1 valid project exit 0', r.code === 0, `code=${r.code}`);
  const { md, meta } = readPack('obsidian_hq', 'claude');
  ok('1 valid project produces pack', md.length > 0 && meta);
}
// 2. Unknown project
{
  const r = runPack(['--project', 'does_not_exist', '--agent', 'claude', '--task', 't']);
  ok('2 unknown project exit 2', r.code === 2, `code=${r.code}`);
}
// 3. Missing source file (project in seed but paths absent in fixture, e.g. backup_dr)
{
  const r = runPack(['--project', 'backup_dr', '--agent', 'claude', '--task', 't']);
  ok('3 missing-source project still exits 0', r.code === 0, `code=${r.code}`);
  const { meta } = readPack('backup_dr', 'claude');
  ok('3 missing-source pack has 0 sources', meta && meta.source_count === 0);
}
// 4. Stale source warning — must be DETERMINISTIC (content-date driven, not filesystem mtime which
//    resets on every git checkout/worktree). The stale_notes.md fixture carries an explicit old date.
{
  runPack(['--project', 'obsidian_hq', '--agent', 'claude', '--task', 't'], { AI_HQ_NOW: '2026-06-17' });
  const { md, meta } = readPack('obsidian_hq', 'claude');
  const staleSrc = meta && meta.sources.find((s) => s.freshness === 'STALE');
  const hasStale = md.includes('STALE') || !!staleSrc;
  ok('4 stale source flagged', hasStale);
  // 4b. Regression: staleness survives a fresh checkout (mtime ~= NOW) because it is content-dated.
  ok('4b stale flagged from content date, not mtime', !!staleSrc, 'stale_notes.md must be STALE via its updated: marker');
  // 4c. A source WITHOUT an old marker (PROJECT_PASSPORT) must NOT be falsely flagged stale.
  const passport = meta && meta.sources.find((s) => /PROJECT_PASSPORT/.test(s.path));
  ok('4c non-dated source not falsely stale', !passport || passport.freshness !== 'STALE');
}
// 5. Broken Obsidian link (validator)
{
  let code = 0, out = '';
  try { out = execFileSync('node', ['tools/ai_hq/validate.mjs', '--docs', FIX_WS, '--workspace', FIX_WS, '--now', '2026-06-17'], { cwd: ROOT, encoding: 'utf8' }); }
  catch (e) { code = e.status; out = (e.stdout || '') + (e.stderr || ''); }
  ok('5 broken link detected (warn exit 1)', code === 1 && /does_not_exist_xyz/.test(out), `code=${code}`);
}
// 6. Duplicate canonical target (validator error exit 2)
{
  let code = 0, out = '';
  try { execFileSync('node', ['tools/ai_hq/validate.mjs', '--docs', FIX_DOCS_DUP, '--workspace', FIX_WS, '--now', '2026-06-17'], { cwd: ROOT, encoding: 'utf8' }); }
  catch (e) { code = e.status; out = (e.stdout || '') + (e.stderr || ''); }
  ok('6 duplicate canonical_target error (exit 2)', code === 2 && /duplicate canonical_target/.test(out), `code=${code}`);
  ok('6 unknown project_id error reported', /unknown project_id/.test(out));
}
// 6d. Validator is line-ending agnostic: CRLF fixtures (as produced by a git
// checkout with core.autocrlf=true on Windows) must yield identical errors to LF.
// Regression for a determinism defect where the \n-anchored frontmatter regex
// silently skipped project_id validation on CRLF files.
{
  const crlfDir = path.join(TMP, 'docs_dup_crlf');
  fs.mkdirSync(crlfDir, { recursive: true });
  for (const f of fs.readdirSync(FIX_DOCS_DUP)) {
    const lf = fs.readFileSync(path.join(FIX_DOCS_DUP, f), 'utf8').replace(/\r\n/g, '\n');
    fs.writeFileSync(path.join(crlfDir, f), lf.replace(/\n/g, '\r\n'));
  }
  let code = 0, out = '';
  try { execFileSync('node', ['tools/ai_hq/validate.mjs', '--docs', crlfDir, '--workspace', FIX_WS, '--now', '2026-06-17'], { cwd: ROOT, encoding: 'utf8' }); }
  catch (e) { code = e.status; out = (e.stdout || '') + (e.stderr || ''); }
  ok('6d CRLF: duplicate canonical_target error (exit 2)', code === 2 && /duplicate canonical_target/.test(out), `code=${code}`);
  ok('6d CRLF: unknown project_id still reported', /unknown project_id/.test(out), out.slice(0, 200));
}
// 7. Secret-looking value excluded/redacted
{
  runPack(['--project', 'lead_hunter', '--agent', 'claude', '--task', 't']);
  const { md, meta } = readPack('lead_hunter', 'claude');
  const noToken = !/123456789:AAFakeToken/.test(md);
  const noApiKey = !/deadbeefdeadbeef/.test(md);
  ok('7 telegram token not present', noToken);
  ok('7 hex api key not present', noApiKey);
  ok('7 meta reports 0 surviving secrets', meta && meta.secret_findings_in_pack.length === 0);
}
// 8. Sensitive document excluded (container-only)
{
  const r = runPack(['--project', 'legal_documents', '--agent', 'claude', '--task', 't']);
  const { md } = readPack('legal_documents', 'claude');
  ok('8 sensitive container-only', r.code === 0 && /container-only/i.test(md) && !/PRIVATE legal stuff/.test(md));
}
// 9. Oversized context bounded
{
  runPack(['--project', 'obsidian_hq', '--agent', 'claude', '--task', 't', '--max-size', '1200']);
  const { md, meta } = readPack('obsidian_hq', 'claude');
  ok('9 oversized bounded to max-size', md.length <= 1200, `len=${md.length}`);
  ok('9 truncation flagged', meta && meta.truncated === true);
}
// 10. Empty project (no content files) -> backup_dr already covers; use empty by missing paths
{
  const r = runPack(['--project', 'edera_rest_mini_audit', '--agent', 'claude', '--task', 't']);
  ok('10 empty project still produces pack exit 0', r.code === 0);
}
// 11. Archived/placeholder project
{
  const r = runPack(['--project', 'boxon', '--agent', 'claude', '--task', 't']);
  ok('11 placeholder project exit 0', r.code === 0);
}
// 12. Production project includes freeze safety rules
{
  runPack(['--project', 'master_controller', '--agent', 'claude', '--task', 't']);
  const { md } = readPack('master_controller', 'claude');
  ok('12 production pack has freeze safety', /Autosend is BLOCKED/.test(md) && /v0\.4\.0-rc1/.test(md));
}
// 13. Cline context format
{
  runPack(['--project', 'obsidian_hq', '--agent', 'cline', '--task', 't']);
  const { md } = readPack('obsidian_hq', 'cline');
  ok('13 cline format = focused', /Focused file-level/.test(md));
}
// 14. Claude context format
{
  runPack(['--project', 'obsidian_hq', '--agent', 'claude', '--task', 't']);
  const { md } = readPack('obsidian_hq', 'claude');
  ok('14 claude format = implementation block', /Complete implementation block/.test(md));
}
// 15. ChatGPT summary context format
{
  runPack(['--project', 'obsidian_hq', '--agent', 'chatgpt', '--task', 't']);
  const { md } = readPack('obsidian_hq', 'chatgpt');
  ok('15 chatgpt format = strategy/summary', /Strategy\/summary only/.test(md));
}
// Determinism: same inputs -> same content hash
{
  runPack(['--project', 'obsidian_hq', '--agent', 'claude', '--task', 't']);
  const a = readPack('obsidian_hq', 'claude').meta.content_sha256;
  runPack(['--project', 'obsidian_hq', '--agent', 'claude', '--task', 't']);
  const b = readPack('obsidian_hq', 'claude').meta.content_sha256;
  ok('16 deterministic output (stable hash)', a === b, `${a} vs ${b}`);
}

console.log(`\n[test] context pack: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
