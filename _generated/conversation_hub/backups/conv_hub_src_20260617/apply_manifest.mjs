#!/usr/bin/env node
// tools/conversation_hub/apply_manifest.mjs — proposed-apply manifest + registry proposal (MP41). Read-only.
// Lists proposed conversation-hub docs + targets. Does NOT apply.
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
  if (m.project !== 'conversation-hub') continue;
  const exists = m.target ? existsSync(path.join(VAULT, m.target)) : false;
  rows.push({ source_proposed: path.relative(process.cwd(), f).split(path.sep).join('/'), target_path: m.target, target_exists: exists, change_type: exists ? 'OVERWRITE_WITH_BACKUP' : 'CREATE', conflict_risk: exists ? 'medium' : 'low', owner_review: true });
}

const manifest = { schema: 'conversation_hub.apply_manifest.v1', generated_ts: TS, vault: VAULT, apply_command: 'AI_HQ_APPLY_OK=1 node tools/ai_hq/apply_canonical.mjs --apply  (owner only, post-review)', note: 'Proposed conversation-hub docs NOT applied. Production freeze in effect.', canonical_docs_applied: 0, total: rows.length, rows };
mkdirSync(path.join(GENERATED_ROOT, 'reports'), { recursive: true });
writeFileSync(path.join(GENERATED_ROOT, 'reports', 'proposed_apply_manifest.json'), JSON.stringify(manifest, null, 2));

const registry = { schema: 'conversation_hub.registry_proposal.v1', generated_ts: TS, note: 'Proposed Project Registry addition; NOT applied.', target: '00_MASTER_CONTEXT/PROJECT_REGISTRY.md (owner-applied)', conversation_hub_project_entry: { project_id: 'conversation-hub', name: 'Conversation Hub / Omnichannel Communication Control Plane', status: 'ACTIVE_DEVELOPMENT', priority: 'P2_COMMS', source_of_truth: 'tools/conversation_hub + docs_canonical_proposed/13_conversation_hub/', note: 'Normalization/routing/draft-request planning layer; never sends, connects to a network, mutates canonical state, or runs unofficial channel automation. Master Controller remains the sole canonical communication writer.' } };
writeFileSync(path.join(GENERATED_ROOT, 'reports', 'registry_proposal.json'), JSON.stringify(registry, null, 2));

console.log(`[apply-manifest] ${rows.length} conversation-hub proposed docs (applied=0)`);
