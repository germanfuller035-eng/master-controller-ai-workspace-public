#!/usr/bin/env node
// tools/finance_os/apply_manifest.mjs — Phase 39: proposed-apply manifest for Finance OS docs. Read-only.
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { arg, nowStamp, GENERATED_ROOT } from './lib/common.mjs';

const PROPOSED = path.resolve(process.cwd(), 'docs_canonical_proposed');
const VAULT = path.resolve(arg('--vault', 'D:/AI_WORKSPACE'));
const TS = nowStamp(arg('--ts'));

function walk(dir) { const out = []; if (!existsSync(dir)) return out; for (const e of readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) out.push(...walk(p)); else if (e.name.endsWith('.md')) out.push(p); } return out; }
function targetOf(f) { const m = readFileSync(f, 'utf8').match(/canonical_target:\s*(\S+)/); return m ? m[1] : null; }
function isFinanceDoc(f) { const txt = readFileSync(f, 'utf8').slice(0, 800); const t = targetOf(f) || ''; return /finance/i.test(t) || /related_project:\s*finance-os/.test(txt); }

const rows = [];
for (const f of walk(PROPOSED)) {
  if (!isFinanceDoc(f)) continue;
  const target = targetOf(f);
  const exists = target ? existsSync(path.join(VAULT, target)) : false;
  rows.push({ source_proposed: path.relative(process.cwd(), f).split(path.sep).join('/'), target_path: target, target_exists: exists, change_type: exists ? 'OVERWRITE_WITH_BACKUP' : 'CREATE', conflict_risk: exists ? 'medium' : 'low', owner_review: true });
}
const manifest = { schema: 'finance_os.apply_manifest.v1', generated_ts: TS, vault: VAULT, apply_command: 'AI_HQ_APPLY_OK=1 node tools/ai_hq/apply_canonical.mjs --apply  (post-soak, owner only)', note: 'Proposed docs NOT applied during soak.', total: rows.length, rows };
mkdirSync(path.join(GENERATED_ROOT, 'reports'), { recursive: true });
const o = path.join(GENERATED_ROOT, 'reports', 'proposed_apply_manifest.json');
writeFileSync(o, JSON.stringify(manifest, null, 2));
console.log(`[apply-manifest] ${rows.length} finance docs -> ${o}`);
for (const r of rows) console.log(`  ${r.change_type.padEnd(22)} ${r.target_path} (exists=${r.target_exists})`);
process.exit(0);
