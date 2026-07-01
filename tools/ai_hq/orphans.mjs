#!/usr/bin/env node
// tools/ai_hq/orphans.mjs
// Classifies orphan/duplicate/stale files. Produces a manifest with recommendations.
// NEVER deletes. NEVER moves beyond a small bounded fixture sample. Read-only by default.
//
// Usage:
//   node tools/ai_hq/orphans.mjs [--workspace DIR] [--out DIR] [--ts STAMP] [--now YYYY-MM-DD]
// Exit: 0 ok.

import fs from 'node:fs';
import path from 'node:path';
import {
  WORKSPACE_ROOT, GENERATED_ROOT, ensureDir, walk, fileMeta, sha256File,
  isSensitivePath, classifyCategory, stamp,
} from './lib/common.mjs';
import { allSeeds } from './lib/projects.mjs';

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const WS = path.resolve(arg('--workspace', WORKSPACE_ROOT));
const OUT = path.resolve(arg('--out', path.join(GENERATED_ROOT, 'orphans')));
const TS = stamp(arg('--ts', process.env.AI_HQ_TS));
const NOW = arg('--now', process.env.AI_HQ_NOW || '2026-06-17');
const STALE_DAYS = 120;
const HASH_LIMIT_BYTES = 8 * 1024 * 1024; // don't hash huge files

// Known project path prefixes: a file under one of these is LINKED, not orphaned.
const PROJECT_PREFIXES = [...new Set(allSeeds().flatMap((s) => s.paths || []))]
  .map((p) => p.replace(/\\/g, '/').toLowerCase());

function isUnderProject(rel) {
  const r = rel.toLowerCase();
  return PROJECT_PREFIXES.some((p) => r === p || r.startsWith(p + '/'));
}

function classifyOrphan(rel, meta) {
  const r = rel.toLowerCase();
  if (isSensitivePath(r)) return { classification: 'sensitive_unknown', action: 'SENSITIVE_REVIEW', risk: 'high' };
  if (/\.bak(_|\.|$)|\.bak_\d|~$/.test(r) || r.includes('.bak')) return { classification: 'backup_copy', action: 'ARCHIVE_LATER', risk: 'low' };
  if (/(^|\/)tmp\/|\.tmp$|_tmp\.|scratch/.test(r)) return { classification: 'temporary_file', action: 'DELETE_CANDIDATE', risk: 'low' };
  if (r.startsWith('_generated/') || /generated|_results\.json|_report_tmp/.test(r)) return { classification: 'generated_artifact', action: 'KEEP', risk: 'low' };
  if (r.startsWith('99_archive') || r.includes('/archive')) return { classification: 'historical_orphan', action: 'KEEP', risk: 'low' };
  if (r.startsWith('node_modules/') || r.startsWith('tools/') || r.startsWith('apps/') || r.startsWith('dist/')) {
    return { classification: 'project_code', action: 'KEEP', risk: 'low' };
  }
  if (isUnderProject(rel)) return { classification: 'linked_project_file', action: 'KEEP', risk: 'low' };
  const ageDays = Math.round((Date.parse(NOW) - meta.mtime) / 86400000);
  if (r.endsWith('.md') && ageDays > STALE_DAYS) return { classification: 'stale_report', action: 'REVIEW', risk: 'low' };
  if (/report.*\d{4}-\d{2}-\d{2}/.test(r)) return { classification: 'superseded_report_candidate', action: 'REVIEW', risk: 'low' };
  return { classification: 'operational_orphan', action: 'LINK', risk: 'low' };
}

function main() {
  if (!fs.existsSync(WS)) { console.error(`[orphans] workspace not found: ${WS}`); process.exit(2); }
  ensureDir(OUT);

  const files = walk(WS);
  const metas = files.map((rel) => fileMeta(WS, rel)).filter(Boolean);

  // Duplicate detection by (size -> sha256). Only hash files sharing a size, under limit.
  const bySize = new Map();
  for (const m of metas) {
    if (m.size === 0 || m.size > HASH_LIMIT_BYTES) continue;
    if (!bySize.has(m.size)) bySize.set(m.size, []);
    bySize.get(m.size).push(m);
  }
  const hashGroups = new Map();
  for (const [, group] of bySize) {
    if (group.length < 2) continue; // unique size => not a content dup
    for (const m of group) {
      let h;
      try { h = sha256File(path.join(WS, m.path)); } catch { continue; }
      if (!hashGroups.has(h)) hashGroups.set(h, []);
      hashGroups.get(h).push(m.path);
    }
  }
  const duplicates = [];
  for (const [h, paths] of hashGroups) {
    if (paths.length > 1) duplicates.push({ sha256: h, count: paths.length, paths: paths.slice(0, 20) });
  }

  // Classification manifest (sample bounded for huge trees; full counts retained).
  const counts = {};
  const manifest = [];
  for (const m of metas) {
    const c = classifyOrphan(m.path, m);
    counts[c.classification] = (counts[c.classification] || 0) + 1;
    // Keep manifest bounded + focused on items needing a human decision.
    const NEEDS_REVIEW = new Set(['operational_orphan', 'stale_report', 'superseded_report_candidate', 'sensitive_unknown', 'temporary_file', 'backup_copy']);
    if (!NEEDS_REVIEW.has(c.classification)) continue;
    if (manifest.length < 3000) {
      manifest.push({
        path: m.path, classification: c.classification, hash: null,
        size: m.size, last_modified: new Date(m.mtime).toISOString().slice(0, 10),
        related_project: null, canonical_replacement: null,
        recommended_action: c.action, risk: c.risk,
      });
    }
  }

  const report = {
    schema: 'ai_hq.orphans.v1', generated_ts: TS, workspace_root: WS,
    totals: {
      files: metas.length,
      duplicate_groups: duplicates.length,
      duplicate_files: duplicates.reduce((s, d) => s + d.count, 0),
      new_operational_orphans: counts.operational_orphan || 0,
      historical_orphans_indexed: (counts.historical_orphan || 0) + (counts.backup_copy || 0),
    },
    counts_by_classification: counts,
    duplicates: duplicates.slice(0, 200),
    manifest_sample: manifest.slice(0, 500),
    safety: { mass_deletion: 'NO', files_deleted: 0, files_moved: 0 },
  };

  fs.writeFileSync(path.join(OUT, `orphans_${TS}.json`), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(OUT, 'orphans_latest.json'), JSON.stringify(report, null, 2));
  console.log(`[orphans] files=${report.totals.files} dup_groups=${report.totals.duplicate_groups} dup_files=${report.totals.duplicate_files} new_operational_orphans=${report.totals.new_operational_orphans} MASS_DELETION=NO`);
  process.exit(0);
}

main();
