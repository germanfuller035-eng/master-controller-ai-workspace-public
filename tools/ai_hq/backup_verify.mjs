#!/usr/bin/env node
// tools/ai_hq/backup_verify.mjs
// Backup manifest + checksum + git bundle creation/verify + temp restore proof.
// Read-only against the live workspace except writing into its own backup OUT dir.
// Never copies unencrypted secrets into ordinary backup folders.
//
// Subcommands:
//   manifest   --src DIR --out DIR                 build manifest+sha256 of a dir (md/code only)
//   bundle     --repo DIR --out FILE               create git bundle (all refs)
//   verify-bundle --bundle FILE                    verify bundle integrity
//   restore-test  --bundle FILE --tmp DIR          clone bundle into tmp, assert HEAD readable
//
// Exit: 0 ok, 2 failure, 3 bad invocation.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { GENERATED_ROOT, ensureDir, walk, sha256File, looksLikeSecretFile, stamp } from './lib/common.mjs';

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const CMD = process.argv[2];
const TS = stamp(arg('--ts', process.env.AI_HQ_TS));

function git(args, cwd) {
  return execFileSync('git', args, { cwd: cwd || process.cwd(), encoding: 'utf8' });
}

function cmdManifest() {
  const SRC = path.resolve(arg('--src', ''));
  const OUT = path.resolve(arg('--out', path.join(GENERATED_ROOT, 'backups')));
  if (!SRC || !fs.existsSync(SRC)) { console.error('manifest: --src required'); process.exit(3); }
  ensureDir(OUT);
  const files = walk(SRC).filter((f) => !looksLikeSecretFile(f)); // never checksum secret files into manifest
  const entries = [];
  let total = 0, skippedSecret = 0;
  for (const rel of walk(SRC)) if (looksLikeSecretFile(rel)) skippedSecret++;
  for (const rel of files) {
    const abs = path.join(SRC, rel);
    let stat; try { stat = fs.statSync(abs); } catch { continue; }
    if (stat.size > 64 * 1024 * 1024) continue;
    entries.push({ path: rel, size: stat.size, sha256: sha256File(abs) });
    total += stat.size;
  }
  const manifest = {
    schema: 'ai_hq.backup_manifest.v1', generated_ts: TS, src: SRC,
    file_count: entries.length, total_size: total, excluded_secret_files: skippedSecret,
    git_head: safeHead(SRC), entries,
    restore_instructions: 'Verify with: for each entry sha256sum -c. Restore by copying files; secrets restored separately from D:\\AI_SECRETS encrypted store.',
  };
  const out = path.join(OUT, `manifest_${TS}.json`);
  fs.writeFileSync(out, JSON.stringify(manifest, null, 2));
  console.log(`[backup] manifest files=${entries.length} size=${(total/1048576).toFixed(1)}MB excluded_secrets=${skippedSecret} -> ${out}`);
  process.exit(0);
}

function safeHead(dir) {
  try { return git(['rev-parse', 'HEAD'], dir).trim(); } catch { return null; }
}

function cmdBundle() {
  const REPO = path.resolve(arg('--repo', process.cwd()));
  const OUT = path.resolve(arg('--out', path.join(GENERATED_ROOT, 'backups', `workspace_${TS}.gitbundle`)));
  ensureDir(path.dirname(OUT));
  try {
    git(['bundle', 'create', OUT, '--all'], REPO);
  } catch (e) { console.error(`[backup] bundle failed: ${e.message}`); process.exit(2); }
  const size = fs.statSync(OUT).size;
  console.log(`[backup] bundle created ${(size/1048576).toFixed(1)}MB -> ${OUT}`);
  process.exit(0);
}

function cmdVerifyBundle() {
  const B = path.resolve(arg('--bundle', ''));
  if (!B || !fs.existsSync(B)) { console.error('verify-bundle: --bundle required'); process.exit(3); }
  try {
    const out = git(['bundle', 'verify', B]);
    console.log(`[backup] bundle verify OK`);
    console.log(out.split('\n').slice(0, 3).join('\n'));
    process.exit(0);
  } catch (e) { console.error(`[backup] bundle verify FAILED: ${e.message}`); process.exit(2); }
}

function cmdRestoreTest() {
  const B = path.resolve(arg('--bundle', ''));
  const TMP = path.resolve(arg('--tmp', path.join(GENERATED_ROOT, 'backups', `restore_test_${TS}`)));
  if (!B || !fs.existsSync(B)) { console.error('restore-test: --bundle required'); process.exit(3); }
  fs.rmSync(TMP, { recursive: true, force: true });
  ensureDir(path.dirname(TMP));
  try {
    git(['clone', '--quiet', B, TMP]);
    const head = git(['rev-parse', 'HEAD'], TMP).trim();
    const fileCount = git(['ls-files'], TMP).split('\n').filter(Boolean).length;
    console.log(`[backup] restore-test OK head=${head.slice(0,8)} files=${fileCount} dir=${TMP}`);
    // cleanup
    fs.rmSync(TMP, { recursive: true, force: true });
    process.exit(0);
  } catch (e) { console.error(`[backup] restore-test FAILED: ${e.message}`); process.exit(2); }
}

switch (CMD) {
  case 'manifest': cmdManifest(); break;
  case 'bundle': cmdBundle(); break;
  case 'verify-bundle': cmdVerifyBundle(); break;
  case 'restore-test': cmdRestoreTest(); break;
  default:
    console.error('usage: backup_verify.mjs <manifest|bundle|verify-bundle|restore-test> [...]');
    process.exit(3);
}
