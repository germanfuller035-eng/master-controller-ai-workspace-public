#!/usr/bin/env node
/**
 * gen_untracked_inventory.mjs — classify every untracked file under tools/ for the
 * release. Marks runtime-required (in import closure), test, fixture, scratch,
 * secret-risk, generated. Run from MAIN workspace. Writes JSON + MD.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const ROOT = process.argv[2] || process.cwd();
const OUTDIR = process.argv[3] || path.join(ROOT, '_generated', 'release');
fs.mkdirSync(OUTDIR, { recursive: true });

// Runtime closure (from build_import_closure.mjs) — the untracked files that ARE imported.
const RUNTIME_REQUIRED = new Set([
    'tools/telegram_gateway/draft_generator_v2.mjs',
    'tools/telegram_gateway/email_send_policy.mjs',
    'tools/telegram_gateway/followup_engine.mjs',
    'tools/telegram_gateway/mini_audit_draft_quality.mjs',
    'tools/telegram_gateway/mini_audit_operator_mode.mjs',
    'tools/telegram_gateway/osm_overpass_connector.mjs',
    'tools/telegram_gateway/outbound_channel_router.mjs',
    'tools/telegram_gateway/queue_navigation.mjs',
]);

const untracked = execSync('git ls-files --others --exclude-standard tools/', { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 })
    .toString().split(/\r?\n/).filter(Boolean).map((p) => p.replace(/\\/g, '/'));

function sha256(abs) { try { return crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex'); } catch { return null; } }
function classify(rel) {
    if (RUNTIME_REQUIRED.has(rel)) return 'PRODUCTION_RUNTIME_REQUIRED';
    if (/\/tests?\//.test(rel) || /_test\.mjs$/.test(rel)) return 'TEST';
    if (/\/fixtures?\//.test(rel)) return 'FIXTURE';
    if (/\.(env|key|pem|secret)$|secrets?\//i.test(rel)) return 'SECRET_RISK';
    if (/_generated\/|\/data\/|\.bak|\.log$|report|_out\.txt|scratch/i.test(rel)) return 'GENERATED_OR_SCRATCH';
    return 'UNKNOWN_REVIEW';
}

const rows = untracked.map((rel) => {
    const abs = path.join(ROOT, rel);
    let size = null; try { size = fs.statSync(abs).size; } catch { /* */ }
    const cls = classify(rel);
    return {
        path: rel, size, sha256: sha256(abs),
        class: cls,
        production_required: cls === 'PRODUCTION_RUNTIME_REQUIRED',
        recommended_action: cls === 'PRODUCTION_RUNTIME_REQUIRED' ? 'COMMIT_TO_RELEASE'
            : cls === 'TEST' ? 'COMMIT_IF_RELEVANT'
            : cls === 'SECRET_RISK' ? 'NEVER_COMMIT'
            : 'EXCLUDE',
    };
});

const summary = {
    total: rows.length,
    by_class: rows.reduce((a, r) => { a[r.class] = (a[r.class] || 0) + 1; return a; }, {}),
    production_runtime_required: rows.filter((r) => r.production_required).map((r) => r.path),
    secret_risk: rows.filter((r) => r.class === 'SECRET_RISK').map((r) => r.path),
};
fs.writeFileSync(path.join(OUTDIR, 'untracked_inventory.json'), JSON.stringify({ summary, files: rows }, null, 2));
const md = [
    '# Untracked Inventory (release consolidation)', '',
    `Всего untracked под tools/: **${summary.total}**`, '',
    '## По классам', '',
    ...Object.entries(summary.by_class).map(([k, v]) => `- ${k}: ${v}`),
    '', '## PRODUCTION_RUNTIME_REQUIRED (коммитим в релиз)', '',
    ...summary.production_runtime_required.map((p) => `- \`${p}\``),
    '', `## SECRET_RISK (никогда не коммитим): ${summary.secret_risk.length}`, '',
    ...summary.secret_risk.map((p) => `- \`${p}\``),
].join('\n');
fs.writeFileSync(path.join(OUTDIR, 'untracked_inventory.md'), md + '\n');
console.log(JSON.stringify(summary, null, 2));
