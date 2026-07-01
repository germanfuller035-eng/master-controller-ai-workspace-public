#!/usr/bin/env node
// tools/reliability_os/apply_manifest.mjs — proposed-apply manifest + registry proposal (MP53). Read-only.
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { arg, nowStamp, GENERATED_ROOT } from './lib/common.mjs';

const PROPOSED = path.resolve(process.cwd(), 'docs_canonical_proposed');
const VAULT = path.resolve(arg('--vault', 'D:/AI_WORKSPACE'));
const TS = nowStamp(arg('--ts'));

function walk(dir) { const out = []; if (!existsSync(dir)) return out; for (const e of readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) out.push(...walk(p)); else if (e.name.endsWith('.md')) out.push(p); } return out; }
function meta(f) { const t = readFileSync(f, 'utf8'); const ct = t.match(/canonical_target:\s*(\S+)/); const rp = t.match(/related_project:\s*(\S+)/); return { target: ct ? ct[1] : null, project: rp ? rp[1] : null }; }

const rows = [];
for (const f of walk(PROPOSED)) {
  const m = meta(f);
  if (m.project !== 'reliability-observability') continue;
  const exists = m.target ? existsSync(path.join(VAULT, m.target)) : false;
  rows.push({ source_proposed: path.relative(process.cwd(), f).split(path.sep).join('/'), target_path: m.target, target_exists: exists, change_type: exists ? 'OVERWRITE_WITH_BACKUP' : 'CREATE', conflict_risk: exists ? 'medium' : 'low', owner_review: true });
}

const manifest = { schema: 'reliability_os.apply_manifest.v1', generated_ts: TS, vault: VAULT, apply_command: 'AI_HQ_APPLY_OK=1 node tools/ai_hq/apply_canonical.mjs --apply  (owner only, post-review)', note: 'Proposed reliability docs NOT applied. Production freeze in effect.', canonical_docs_applied: 0, total: rows.length, rows };
mkdirSync(path.join(GENERATED_ROOT, 'reports'), { recursive: true });
writeFileSync(path.join(GENERATED_ROOT, 'reports', 'proposed_apply_manifest.json'), JSON.stringify(manifest, null, 2));

const registry = { schema: 'reliability_os.registry_proposal.v1', generated_ts: TS, note: 'Proposed Project Registry addition; NOT applied.', target: '00_MASTER_CONTEXT/PROJECT_REGISTRY.md (owner-applied)', reliability_observability_project_entry: { project_id: 'reliability-observability', name: 'Reliability / Observability / Business Continuity Control Plane', status: 'ACTIVE_DEVELOPMENT', priority: 'P1_RELIABILITY', source_of_truth: 'tools/reliability_os + docs_canonical_proposed/17_reliability/', note: 'Reliability governance + health/SLO/alert/runbook/backup/DR/release standards. Static/offline; never installs monitoring, runs live checks, restarts services, executes backup/restore, or claims live status without verification.' } };
writeFileSync(path.join(GENERATED_ROOT, 'reports', 'registry_proposal.json'), JSON.stringify(registry, null, 2));

console.log(`[apply-manifest] ${rows.length} reliability proposed docs (applied=0)`);
