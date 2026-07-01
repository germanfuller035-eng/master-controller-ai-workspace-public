#!/usr/bin/env node
// tools/ai_hq/validate.mjs
// Validates canonical docs: broken links, missing files, duplicate canonicals,
// stale dates, unknown project IDs. Read-only. Deterministic. Real exit codes.
//
// Usage:
//   node tools/ai_hq/validate.mjs [--docs DIR] [--workspace DIR] [--max-age-days N]
// Exit: 0 = pass, 1 = warnings, 2 = errors, 3 = bad invocation.

import fs from 'node:fs';
import path from 'node:path';
import { WORKSPACE_ROOT, walk } from './lib/common.mjs';
import { allSeeds } from './lib/projects.mjs';

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const DOCS = path.resolve(arg('--docs', path.join(process.cwd(), 'docs_canonical_proposed')));
const WS = path.resolve(arg('--workspace', WORKSPACE_ROOT));
const MAX_AGE = parseInt(arg('--max-age-days', '7'), 10);
// Deterministic "now" for staleness: pass --now YYYY-MM-DD (else uses freshness metadata only).
const NOW = arg('--now', process.env.AI_HQ_NOW || '2026-06-17');

const knownIds = new Set(allSeeds().map((p) => p.project_id));
const errors = [];
const warnings = [];

function listDocs(dir) {
  if (!fs.existsSync(dir)) return [];
  return walk(dir).filter((f) => f.endsWith('.md')).map((f) => path.join(dir, f));
}

// Build a set of resolvable wikilink targets: vault-relative paths (with/without .md), basenames.
function buildTargetIndex() {
  const idx = new Set();
  if (fs.existsSync(WS)) {
    for (const rel of walk(WS)) {
      if (!rel.endsWith('.md')) continue;
      idx.add(rel.replace(/\.md$/, ''));
      idx.add(path.basename(rel).replace(/\.md$/, ''));
    }
  }
  // Also include proposed docs (their canonical targets count as resolvable post-apply).
  for (const seed of allSeeds()) idx.add(seed.project_id);
  return idx;
}

function daysBetween(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

function checkDoc(file, targetIdx) {
  // Normalize line endings: git checkout may apply CRLF (core.autocrlf=true on
  // Windows clones). Frontmatter/registry regexes anchor on \n, so without this
  // the same content validates differently per-platform — a determinism defect.
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const rel = path.relative(DOCS, file).split(path.sep).join('/');

  // Wikilinks [[...]]
  const links = [...text.matchAll(/\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g)].map((m) => m[1].trim());
  for (const l of links) {
    const base = path.basename(l).replace(/\.md$/, '');
    const full = l.replace(/\.md$/, '');
    if (!targetIdx.has(full) && !targetIdx.has(base)) {
      warnings.push(`${rel}: link target not found: [[${l}]]`);
    }
  }

  // Frontmatter checks
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (fm) {
    const body = fm[1];
    const lu = body.match(/last_updated:\s*([0-9-]+)/);
    const fresh = body.match(/freshness_days:\s*(\d+)/);
    if (lu && fresh && NOW) {
      const age = daysBetween(lu[1], NOW);
      if (age > parseInt(fresh[1], 10)) {
        warnings.push(`${rel}: stale (last_updated ${lu[1]}, age ${age}d > freshness ${fresh[1]}d)`);
      }
    }
    const ids = [...body.matchAll(/project_id:\s*([a-z0-9_]+)/g)].map((m) => m[1]);
    for (const id of ids) {
      if (!knownIds.has(id)) errors.push(`${rel}: unknown project_id in frontmatter: ${id}`);
    }
  }

  // Unknown project IDs referenced in registry-style tables (first column id-like tokens).
  if (/type:\s*project_registry/.test(text)) {
    const idCells = [...text.matchAll(/^\|\s*([a-z][a-z0-9_]{2,})\s*\|/gm)].map((m) => m[1]);
    for (const id of idCells) {
      if (!knownIds.has(id) && !['project', 'project_id'].includes(id)) {
        warnings.push(`${rel}: registry row id not in seed model: ${id}`);
      }
    }
  }
}

function checkDuplicateCanonicals(files) {
  const byTarget = {};
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    const m = text.match(/canonical_target:\s*(\S+)/);
    if (m) {
      byTarget[m[1]] = byTarget[m[1]] || [];
      byTarget[m[1]].push(path.relative(DOCS, f));
    }
  }
  for (const [target, fs_] of Object.entries(byTarget)) {
    if (fs_.length > 1) errors.push(`duplicate canonical_target ${target}: ${fs_.join(', ')}`);
  }
}

function main() {
  const files = listDocs(DOCS);
  if (!files.length) {
    console.error(`[validate] no docs found in ${DOCS}`);
    process.exit(3);
  }
  const targetIdx = buildTargetIndex();
  for (const f of files) checkDoc(f, targetIdx);
  checkDuplicateCanonicals(files);

  console.log(`[validate] docs=${files.length} errors=${errors.length} warnings=${warnings.length}`);
  for (const e of errors) console.log(`  ERROR  ${e}`);
  for (const w of warnings.slice(0, 50)) console.log(`  WARN   ${w}`);
  if (warnings.length > 50) console.log(`  ... +${warnings.length - 50} more warnings`);

  if (errors.length) process.exit(2);
  if (warnings.length) process.exit(1);
  process.exit(0);
}

main();
