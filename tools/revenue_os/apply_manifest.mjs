#!/usr/bin/env node
// tools/revenue_os/apply_manifest.mjs
// Phase 30: Generate a proposed-apply manifest for Revenue OS canonical docs.
// Read-only against the frozen vault. Does NOT apply anything.
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { arg, nowStamp, GENERATED_ROOT } from './lib/common.mjs';

const PROPOSED = path.resolve(process.cwd(), 'docs_canonical_proposed');
const VAULT = path.resolve(arg('--vault', 'D:/AI_WORKSPACE'));
const TS = nowStamp(arg('--ts'));

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

function targetOf(file) {
  const m = readFileSync(file, 'utf8').match(/canonical_target:\s*(\S+)/);
  return m ? m[1] : null;
}
function isAddendum(f) { return /_ADDENDUM\.md$/.test(f) || /addendum/i.test(readFileSync(f, 'utf8').slice(0, 400)); }

// Only Revenue OS-relevant proposed docs (this task). Detect by target path or related_project.
function isRevenueDoc(file) {
  const txt = readFileSync(file, 'utf8').slice(0, 600);
  const t = targetOf(file) || '';
  return /revenue/i.test(t) || /related_project:\s*revenue_os/.test(txt) || /revenue_command|conversation_hub|master_controller_integration/i.test(t);
}

const rows = [];
for (const f of walk(PROPOSED)) {
  if (!isRevenueDoc(f)) continue;
  const target = targetOf(f);
  const rel = path.relative(process.cwd(), f).split(path.sep).join('/');
  const targetAbs = target ? path.join(VAULT, target) : null;
  const exists = targetAbs ? existsSync(targetAbs) : false;
  const change_type = isAddendum(f) ? 'APPEND' : (exists ? 'OVERWRITE_WITH_BACKUP' : 'CREATE');
  const conflict_risk = change_type === 'OVERWRITE_WITH_BACKUP' ? 'medium' : 'low';
  rows.push({
    source_proposed: rel,
    target_real_path: target,
    target_exists: exists,
    change_type,
    conflict_risk,
    owner_review_required: true,
  });
}

const manifest = {
  schema: 'revenue_os.apply_manifest.v1',
  generated_ts: TS,
  vault: VAULT,
  apply_command: 'AI_HQ_APPLY_OK=1 node tools/ai_hq/apply_canonical.mjs --apply  (post-soak, owner only)',
  note: 'Proposed docs are NOT applied during soak. This manifest is for owner review.',
  total: rows.length,
  rows,
};

mkdirSync(path.join(GENERATED_ROOT, 'reports'), { recursive: true });
const out = path.join(GENERATED_ROOT, 'reports', 'proposed_apply_manifest.json');
writeFileSync(out, JSON.stringify(manifest, null, 2));
console.log(`[apply-manifest] ${rows.length} revenue docs -> ${out}`);
for (const r of rows) console.log(`  ${r.change_type.padEnd(22)} ${r.target_real_path} (exists=${r.target_exists})`);
process.exit(0);
