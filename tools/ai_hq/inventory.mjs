#!/usr/bin/env node
// tools/ai_hq/inventory.mjs
// Read-only workspace inventory. Produces machine-readable JSON + Markdown summary.
// Never writes to the live vault; never prints secret values.
//
// Usage:
//   node tools/ai_hq/inventory.mjs [--workspace DIR] [--out DIR] [--ts STAMP]

import fs from 'node:fs';
import path from 'node:path';
import {
  WORKSPACE_ROOT, GENERATED_ROOT, ensureDir, walk, fileMeta,
  classifyCategory, isSensitivePath, looksLikeSecretFile, stamp,
} from './lib/common.mjs';
import { allSeeds } from './lib/projects.mjs';

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const WS = path.resolve(arg('--workspace', WORKSPACE_ROOT));
const TS = stamp(arg('--ts', process.env.AI_HQ_TS));
const OUT = path.resolve(arg('--out', path.join(GENERATED_ROOT, 'inventory')));

const LARGE_FILE_BYTES = 25 * 1024 * 1024;
const ARTIFACT_EXTS = new Set(['.zip', '.apk', '.aab', '.gitbundle', '.bundle', '.7z', '.tar', '.gz']);

function newest(metas) {
  return metas.reduce((m, f) => (f && f.mtime > m ? f.mtime : m), 0);
}

function main() {
  if (!fs.existsSync(WS)) {
    console.error(`[inventory] workspace not found: ${WS}`);
    process.exit(2);
  }
  ensureDir(OUT);

  const files = walk(WS);
  const metas = files.map((rel) => fileMeta(WS, rel)).filter(Boolean);

  // Top-level dirs
  const topDirs = {};
  for (const m of metas) {
    const top = m.path.split('/')[0];
    topDirs[top] = (topDirs[top] || 0) + 1;
  }

  // Aggregate facts
  const large = metas.filter((m) => m.size >= LARGE_FILE_BYTES);
  const artifacts = metas.filter((m) => ARTIFACT_EXTS.has(m.ext));
  const sensitiveFiles = metas.filter((m) => isSensitivePath(m.path));
  const secretContours = metas.filter((m) => looksLikeSecretFile(m.path));
  const byCategory = {};
  for (const m of metas) {
    const c = classifyCategory(m.path);
    byCategory[c] = (byCategory[c] || 0) + 1;
  }

  // Resolve project facts from seeds against the filesystem.
  const projects = allSeeds().map((seed) => {
    const present = [];
    let lastMod = 0;
    for (const p of seed.paths) {
      const abs = path.join(WS, p);
      if (fs.existsSync(abs)) {
        present.push(p);
        const sub = metas.filter((m) => m.path === p || m.path.startsWith(p + '/'));
        const n = newest(sub);
        if (n > lastMod) lastMod = n;
      }
    }
    return {
      project_id: seed.project_id,
      name: seed.name,
      category: seed.category,
      status: seed.status,
      priority: seed.priority,
      production_state: seed.production_state,
      paths_declared: seed.paths,
      paths_present: present,
      exists: present.length > 0,
      source_of_truth: seed.source_of_truth,
      agent_owner: seed.agent_owner,
      risk: seed.risk,
      blockers: seed.blockers || [],
      secrets_required: !!seed.secrets_required,
      sensitive: !!seed.sensitive,
      next_major_action: seed.next_major_action,
      last_modified_ms: lastMod || null,
      archive_candidate: seed.status === 'ARCHIVED' || seed.priority === 'P5_ARCHIVE',
    };
  });

  const inventory = {
    schema: 'ai_hq.inventory.v1',
    generated_ts: TS,
    workspace_root: WS,
    is_fixture: WS !== WORKSPACE_ROOT,
    totals: {
      files: metas.length,
      top_level_dirs: Object.keys(topDirs).length,
      large_files: large.length,
      release_artifacts: artifacts.length,
      sensitive_files: sensitiveFiles.length,
      secret_contour_files: secretContours.length,
    },
    by_category: byCategory,
    top_dirs: Object.fromEntries(Object.entries(topDirs).sort((a, b) => b[1] - a[1])),
    large_files: large.map((m) => ({ path: m.path, size: m.size })).slice(0, 100),
    release_artifacts: artifacts.map((m) => ({ path: m.path, size: m.size })),
    // sensitive/secret: COUNT + path only, never content.
    sensitive_paths_sample: sensitiveFiles.map((m) => m.path).slice(0, 50),
    secret_contour_paths: secretContours.map((m) => m.path).slice(0, 100),
    projects,
  };

  const jsonPath = path.join(OUT, `inventory_${TS}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(inventory, null, 2));
  // Stable "latest" pointer for downstream tools.
  fs.writeFileSync(path.join(OUT, 'inventory_latest.json'), JSON.stringify(inventory, null, 2));

  const mdPath = path.join(OUT, `inventory_${TS}.md`);
  fs.writeFileSync(mdPath, renderMarkdown(inventory));

  console.log(`[inventory] files=${inventory.totals.files} projects=${projects.length} present=${projects.filter((p) => p.exists).length}`);
  console.log(`[inventory] json: ${jsonPath}`);
  console.log(`[inventory] md:   ${mdPath}`);
  process.exit(0);
}

function renderMarkdown(inv) {
  const L = [];
  L.push(`# AI_WORKSPACE Inventory — ${inv.generated_ts}`, '');
  L.push(`Workspace: \`${inv.workspace_root}\`${inv.is_fixture ? ' (FIXTURE)' : ''}`, '');
  L.push('## Totals', '');
  for (const [k, v] of Object.entries(inv.totals)) L.push(`- ${k}: ${v}`);
  L.push('', '## By category', '');
  for (const [k, v] of Object.entries(inv.by_category)) L.push(`- ${k}: ${v}`);
  L.push('', '## Top-level dirs (file counts)', '');
  for (const [k, v] of Object.entries(inv.top_dirs)) L.push(`- \`${k}\`: ${v}`);
  L.push('', '## Projects', '');
  L.push('| Project | Status | Priority | Present | Risk | Owner | Next action |');
  L.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const p of inv.projects) {
    L.push(`| ${p.project_id} | ${p.status} | ${p.priority} | ${p.exists ? 'yes' : 'NO'} | ${p.risk} | ${p.agent_owner} | ${p.next_major_action} |`);
  }
  L.push('', '## Release artifacts', '');
  for (const a of inv.release_artifacts) L.push(`- \`${a.path}\` (${(a.size / 1048576).toFixed(1)} MB)`);
  L.push('', '## Sensitive contours (count only)', '');
  L.push(`- sensitive files: ${inv.totals.sensitive_files}`);
  L.push(`- secret-contour files: ${inv.totals.secret_contour_files} (values never read/printed)`);
  L.push('');
  return L.join('\n');
}

main();
