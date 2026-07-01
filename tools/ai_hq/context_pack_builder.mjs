#!/usr/bin/env node
// tools/ai_hq/context_pack_builder.mjs
// Builds a compact, secret-free, bounded context pack for an agent + project + task.
// Reads inventory + registry seed + a curated source list per project. Read-only.
//
// Usage:
//   node tools/ai_hq/context_pack_builder.mjs --project master_controller --agent claude \
//        --task "post-release acceptance" [--max-size 16000] [--workspace DIR] [--out DIR] [--ts STAMP]
//
// Exit: 0 ok, 2 unknown project, 3 bad invocation, 4 no inventory.

import fs from 'node:fs';
import path from 'node:path';
import {
  WORKSPACE_ROOT, GENERATED_ROOT, ensureDir, stamp, sha256File, sha256Str,
  isSensitivePath, looksLikeSecretFile,
} from './lib/common.mjs';
import { allSeeds } from './lib/projects.mjs';
import { redactString, scanForSecrets } from './lib/redact.mjs';

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const PROJECT = arg('--project', '');
const AGENT = (arg('--agent', 'claude') || 'claude').toLowerCase();
const TASK = arg('--task', 'general work');
const MAX_SIZE = parseInt(arg('--max-size', '16000'), 10);
const FRESHNESS_DAYS = parseInt(arg('--freshness-days', '7'), 10);
const WS = path.resolve(arg('--workspace', WORKSPACE_ROOT));
const OUT = path.resolve(arg('--out', path.join(GENERATED_ROOT, 'context_packs')));
const TS = stamp(arg('--ts', process.env.AI_HQ_TS));
const NOW = arg('--now', process.env.AI_HQ_NOW || '2026-06-17');

const SAFETY_RULES = [
  'Do NOT modify the VPS, Master Controller API, canonical store, scheduler, worker, or IMAP.',
  'Do NOT deploy, restart production services, or reboot.',
  'Autosend is BLOCKED; client email/Telegram send is OFF. No SMTP calls.',
  'Do NOT move the release tag v0.4.0-rc1 or rewrite release branch history.',
  'Secrets live only in D:\\AI_SECRETS / gitignored .env. Never read or print secret values.',
  'No mass orphan cleanup; no bulk file moves or deletes.',
  'Obsidian = knowledge; VPS = operational truth. No bidirectional sync.',
];

// Extract an explicit content date marker (deterministic, checkout-independent).
// Looks for front-matter or inline `updated:`/`date:`/`last_updated:` ISO dates, or an
// HTML comment `<!-- updated: YYYY-MM-DD -->`. Returns ms epoch or null.
function contentDateMs(raw) {
  if (!raw) return null;
  const head = raw.slice(0, 1200);
  const m = head.match(/(?:^|\n)\s*(?:updated|last_updated|date)\s*[:=]\s*["']?(\d{4}-\d{2}-\d{2})/i)
    || head.match(/<!--\s*(?:updated|date)\s*[:=]?\s*(\d{4}-\d{2}-\d{2})\s*-->/i);
  if (!m) return null;
  const t = Date.parse(m[1]);
  return Number.isNaN(t) ? null : t;
}

// Freshness from an explicit content date when present (deterministic), else filesystem mtime.
// mtime is unreliable after a git checkout/worktree (all files get the checkout time), so an
// in-content date is authoritative when available.
function freshnessOf(mtimeMs, raw) {
  const declared = contentDateMs(raw);
  const basis = declared != null ? declared : mtimeMs;
  if (!basis) return { status: 'unknown', days: null, basis: 'none' };
  const ageDays = Math.round((Date.parse(NOW) - basis) / 86400000);
  return { status: ageDays > FRESHNESS_DAYS ? 'STALE' : 'fresh', days: ageDays, basis: declared != null ? 'content_date' : 'mtime' };
}

// Curated, bounded source selection for a project (excludes sensitive/secret/binary/large).
function selectSources(seed) {
  const sources = [];
  const excludedSensitive = [];
  const PER_PROJECT_CAP = 14;
  const FILE_BYTES_CAP = 64 * 1024;
  const ALLOW_EXT = new Set(['.md', '.mjs', '.js', '.json', '.txt', '.yaml', '.yml']);

  for (const p of seed.paths_present || seed.paths || []) {
    const abs = path.join(WS, p);
    if (!fs.existsSync(abs)) continue;
    let stat;
    try { stat = fs.statSync(abs); } catch { continue; }

    const candidates = [];
    if (stat.isDirectory()) {
      let entries = [];
      try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { /* ignore */ }
      for (const e of entries) {
        if (!e.isFile()) continue;
        candidates.push(path.join(p, e.name).split(path.sep).join('/'));
      }
    } else {
      candidates.push(p);
    }

    for (const rel of candidates) {
      if (isSensitivePath(rel) || looksLikeSecretFile(rel)) { excludedSensitive.push(rel); continue; }
      const ext = path.extname(rel).toLowerCase();
      if (!ALLOW_EXT.has(ext)) continue;
      const fabs = path.join(WS, rel);
      let fstat;
      try { fstat = fs.statSync(fabs); } catch { continue; }
      if (fstat.size > FILE_BYTES_CAP * 4) continue; // skip very large
      sources.push({ rel, size: fstat.size, mtime: fstat.mtimeMs });
      if (sources.length >= PER_PROJECT_CAP) break;
    }
    if (sources.length >= PER_PROJECT_CAP) break;
  }
  // Prefer README/passport/context/index/architecture files first, then newest.
  sources.sort((a, b) => {
    const score = (s) => /(readme|passport|context|index|architecture|runbook|operating)/i.test(s.rel) ? 0 : 1;
    return score(a) - score(b) || b.mtime - a.mtime;
  });
  return { sources: sources.slice(0, 12), excludedSensitive };
}

function main() {
  if (!PROJECT) { console.error('[context-pack] --project required'); process.exit(3); }

  const seed = allSeeds().find((p) => p.project_id === PROJECT);
  if (!seed) {
    console.error(`[context-pack] unknown project: ${PROJECT}`);
    process.exit(2);
  }
  if (seed.sensitive) {
    // Sensitive projects: emit a minimal container-only pack, no content.
    ensureDir(path.join(OUT, PROJECT));
    const out = path.join(OUT, PROJECT, `${TS}_${AGENT}.md`);
    fs.writeFileSync(out, [
      `# Context Pack — ${seed.name} (SENSITIVE, container-only)`, '',
      `Generated: ${TS} · Agent: ${AGENT}`, '',
      'This project is SENSITIVE_READ_ONLY. No content, summaries, or file lists are included.',
      'Access requires explicit owner approval. Do not read or index contents.', '',
    ].join('\n'));
    console.log(`[context-pack] sensitive container-only pack: ${out}`);
    process.exit(0);
  }

  // Try to enrich from latest inventory (optional).
  let invProject = null;
  const invPath = path.join(GENERATED_ROOT, 'inventory', 'inventory_latest.json');
  if (fs.existsSync(invPath)) {
    try {
      const inv = JSON.parse(fs.readFileSync(invPath, 'utf8'));
      invProject = (inv.projects || []).find((p) => p.project_id === PROJECT) || null;
    } catch { /* ignore */ }
  }
  const merged = { ...seed, ...(invProject || {}) };

  const { sources, excludedSensitive } = selectSources(merged);

  // Build sections.
  const lines = [];
  lines.push(`# Context Pack — ${merged.name}`);
  lines.push('');
  lines.push(`- project_id: ${merged.project_id}`);
  lines.push(`- agent: ${AGENT}`);
  lines.push(`- task: ${TASK}`);
  lines.push(`- generated_ts: ${TS}`);
  lines.push(`- status: ${merged.status} · priority: ${merged.priority} · production: ${merged.production_state}`);
  lines.push(`- branch: feature/master-controller-lead-hunter-integration · release: v0.4.0-rc1`);
  lines.push(`- source_of_truth: ${merged.source_of_truth}`);
  lines.push('');

  lines.push('## Goal & current verified status');
  lines.push(`- Next major action: ${merged.next_major_action}`);
  lines.push(`- Risk: ${merged.risk}`);
  lines.push(`- Blockers: ${(merged.blockers && merged.blockers.length) ? merged.blockers.join('; ') : 'none recorded'}`);
  lines.push('');

  lines.push('## Architecture constraints');
  lines.push('- VPS is the sole canonical writer. One send seam, one ledger, one store.');
  lines.push('- Telegram + Android are API-only. Single Overpass implementation.');
  lines.push('');

  lines.push('## Files that must NOT be changed');
  lines.push('- Anything under tools/telegram_gateway, tools/mater_controller_api, tools/master_controller, apps/mater_controller_android, dist/mater_controller_android');
  lines.push('- 13_sales ledgers; release tag v0.4.0-rc1; soak timer.');
  lines.push('');

  lines.push('## Safety rules');
  for (const r of SAFETY_RULES) lines.push(`- ${r}`);
  lines.push('');

  lines.push('## Relevant sources (curated, secret-free)');
  const sourceMeta = [];
  let secretHitTotal = 0;
  for (const s of sources) {
    const abs = path.join(WS, s.rel);
    let raw = '';
    try { raw = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    // Hard secret scan; if a real secret appears, exclude the file body entirely.
    const findings = scanForSecrets(raw);
    const f = freshnessOf(s.mtime, raw);
    if (findings.some((x) => x.severity === 'critical')) {
      lines.push(`### ${s.rel}  [EXCLUDED: contains secret-like content]`);
      lines.push('');
      sourceMeta.push({ path: s.rel, sha256: sha256File(abs), excluded: 'secret', freshness: f.status });
      continue;
    }
    const snippet = raw.slice(0, 1600);
    const { text, hits } = redactString(snippet);
    secretHitTotal += hits.length;
    lines.push(`### ${s.rel}  [${f.status}${f.days != null ? `, ${f.days}d` : ''}]`);
    if (f.status === 'STALE') lines.push('> ⚠️ STALE source — verify before relying on it.');
    lines.push('```');
    lines.push(text.trim());
    lines.push('```');
    lines.push('');
    sourceMeta.push({ path: s.rel, sha256: sha256File(abs), redactions: hits.length, freshness: f.status });
  }

  lines.push('## Expected output format');
  lines.push(AGENT === 'cline'
    ? '- Focused file-level change(s) only. Report files touched + tests. No architecture rewrite.'
    : AGENT === 'chatgpt'
    ? '- Strategy/summary only. No code execution. Reference evidence by path.'
    : '- Complete implementation block + tests + commit. Live verification only when explicitly permitted.');
  lines.push('');

  // Assemble + enforce size bound.
  let body = lines.join('\n');
  let truncated = false;
  if (body.length > MAX_SIZE) {
    body = body.slice(0, MAX_SIZE - 80) + '\n\n> [TRUNCATED to max-size]\n';
    truncated = true;
  }

  // Final defense: redact assembled pack again, then scan the ACTUAL written content.
  const { text: safeBody } = redactString(body);
  const finalScan = scanForSecrets(safeBody);

  ensureDir(path.join(OUT, PROJECT));
  const outFile = path.join(OUT, PROJECT, `${TS}_${AGENT}.md`);
  fs.writeFileSync(outFile, safeBody);

  const meta = {
    schema: 'ai_hq.context_pack.v1',
    project_id: PROJECT,
    agent: AGENT,
    task: TASK,
    generated_ts: TS,
    max_size: MAX_SIZE,
    actual_size: safeBody.length,
    truncated,
    estimated_tokens: Math.ceil(safeBody.length / 4),
    sources: sourceMeta,
    source_count: sourceMeta.length,
    sensitive_excluded: excludedSensitive,
    secret_findings_in_pack: finalScan,
    content_sha256: sha256Str(safeBody),
    freshness_days: FRESHNESS_DAYS,
  };
  fs.writeFileSync(path.join(OUT, PROJECT, `${TS}_${AGENT}.meta.json`), JSON.stringify(meta, null, 2));

  console.log(`[context-pack] project=${PROJECT} agent=${AGENT} size=${safeBody.length}/${MAX_SIZE} sources=${sourceMeta.length} secrets=${finalScan.length} sensitive_excluded=${excludedSensitive.length}`);
  console.log(`[context-pack] out: ${outFile}`);
  if (finalScan.length > 0) { console.error('[context-pack] ERROR: secret-like content survived in pack'); process.exit(5); }
  process.exit(0);
}

main();
