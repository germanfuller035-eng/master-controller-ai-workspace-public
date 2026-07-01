#!/usr/bin/env node
// tools/ai_hq/apply_canonical.mjs
// Applies proposed canonical docs (docs_canonical_proposed/**) into the live vault AFTER the soak.
// DRY-RUN by default. Real apply requires --apply AND AI_HQ_APPLY_OK=1 (owner gate).
// Backs up each existing target before overwrite. The ADDENDUM file is APPENDED, never overwrites.
//
// Usage:
//   node tools/ai_hq/apply_canonical.mjs [--vault DIR] [--apply]
// Exit: 0 ok, 3 bad invocation/guard.

import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, stamp } from './lib/common.mjs';

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const VAULT = path.resolve(arg('--vault', 'D:/AI_WORKSPACE'));
const SRC = path.resolve(process.cwd(), 'docs_canonical_proposed');
const TS = stamp(arg('--ts', process.env.AI_HQ_TS));
const APPLY = process.argv.includes('--apply');
const APPLY_OK = process.env.AI_HQ_APPLY_OK === '1';

function targetOf(file) {
  const text = fs.readFileSync(file, 'utf8');
  const m = text.match(/canonical_target:\s*(\S+)/);
  return m ? m[1] : null;
}
function isAddendum(file) { return /_ADDENDUM\.md$/.test(file); }

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

function main() {
  if (!fs.existsSync(SRC)) { console.error(`no proposed docs at ${SRC}`); process.exit(3); }
  if (APPLY && !APPLY_OK) {
    console.error('REFUSED: --apply requires AI_HQ_APPLY_OK=1 (owner gate, post-soak only).');
    process.exit(3);
  }
  const files = walk(SRC);
  const plan = [];
  for (const f of files) {
    const target = targetOf(f);
    if (!target) { plan.push({ src: f, action: 'SKIP_no_target' }); continue; }
    const abs = path.join(VAULT, target);
    const exists = fs.existsSync(abs);
    const mode = isAddendum(f) ? 'APPEND' : (exists ? 'BACKUP+OVERWRITE' : 'CREATE');
    plan.push({ src: path.relative(process.cwd(), f), target, mode, exists });

    if (APPLY) {
      ensureDir(path.dirname(abs));
      if (mode === 'APPEND') {
        const add = fs.readFileSync(f, 'utf8');
        fs.appendFileSync(abs, `\n\n<!-- AI HQ consolidation addendum ${TS} -->\n` + add);
      } else {
        if (exists) fs.copyFileSync(abs, `${abs}.bak_aihq_${TS}`);
        fs.copyFileSync(f, abs);
      }
    }
  }
  console.log(`[apply] mode=${APPLY ? 'APPLY' : 'DRY_RUN'} vault=${VAULT}`);
  for (const p of plan) console.log(`  ${p.mode || p.action}  ${p.target || p.src}`);
  if (!APPLY) console.log('\n[apply] DRY_RUN only. To apply post-soak: AI_HQ_APPLY_OK=1 node tools/ai_hq/apply_canonical.mjs --apply');
  process.exit(0);
}

main();
