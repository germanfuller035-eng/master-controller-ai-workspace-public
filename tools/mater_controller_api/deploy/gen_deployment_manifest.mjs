#!/usr/bin/env node
/**
 * gen_deployment_manifest.mjs — produce a FROZEN deployment allowlist from the
 * runtime import closure (build_import_closure.mjs) plus required deploy configs.
 * Only files in this manifest may be copied to production. Replaces "rsync the
 * whole tree". Run from the release worktree root. Writes JSON + .sha256.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const ROOT = process.argv[2] || process.cwd();
const OUTDIR = path.join(ROOT, '_generated', 'release');
fs.mkdirSync(OUTDIR, { recursive: true });

// Entry points (same as closure analyzer) + known computed-dynamic targets.
const ENTRYPOINTS = [
    'tools/mater_controller_api/src/server/index.mjs',
    'tools/mater_controller_api/src/worker/index.mjs',
    'tools/mater_controller_api/src/scheduler/daily_discovery.mjs',
    'tools/telegram_gateway/contact_site_crawler.mjs',
    'tools/telegram_gateway/contact_site_crawler_live_smoke.mjs',
    'tools/mater_controller_api/src/campaigns/service.mjs',
    'tools/lead_hunter/src/adapters/index.mjs',
    'tools/telegram_gateway/mini_audit_operator_mode.mjs',
    'tools/telegram_gateway/queue_navigation.mjs',
    'tools/telegram_gateway/outbound_channel_router.mjs',
    'tools/telegram_gateway/reply_monitor.mjs',
    'tools/telegram_gateway/osm_overpass_connector.mjs',
];
const STATIC_RE = /import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const DYN_RE = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const tracked = new Set(execSync('git ls-files', { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString().split(/\r?\n/).filter(Boolean).map((p) => p.replace(/\\/g, '/')));

function rel(abs) { return path.relative(ROOT, abs).replace(/\\/g, '/'); }
function resolveSpec(spec, fromFile) {
    if (!spec.startsWith('.') && !spec.startsWith('/')) return null;
    const target = path.resolve(path.dirname(fromFile), spec);
    for (const c of [target, target + '.mjs', target + '.js', path.join(target, 'index.mjs'), path.join(target, 'index.js')]) {
        try { if (fs.statSync(c).isFile()) return c; } catch { /* */ }
    }
    return null;
}
const visited = new Set();
function walk(abs) {
    const r = rel(abs);
    if (visited.has(r)) return;
    visited.add(r);
    let src; try { src = fs.readFileSync(abs, 'utf8'); } catch { return; }
    const specs = new Set();
    let m;
    STATIC_RE.lastIndex = 0; while ((m = STATIC_RE.exec(src))) specs.add(m[1]);
    DYN_RE.lastIndex = 0; while ((m = DYN_RE.exec(src))) specs.add(m[1]);
    for (const s of specs) { const f = resolveSpec(s, abs); if (f) walk(f); }
}
for (const ep of ENTRYPOINTS) { const abs = path.resolve(ROOT, ep); try { fs.statSync(abs); walk(abs); } catch { /* */ } }

// Required deploy configs (not imported, but needed to run the service).
const DEPLOY_CONFIGS = [
    'tools/mater_controller_api/package.json',
    'tools/mater_controller_api/deploy/master-controller-api.service',
    'tools/mater_controller_api/deploy/master-controller-worker.service',
];

const PROD_ROOT = '/opt/master-controller';
function sha256(abs) { return crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex'); }
function entry(relPath, role, restartOwner) {
    const abs = path.join(ROOT, relPath);
    return {
        source_path: relPath,
        target_path: `${PROD_ROOT}/${relPath}`,
        sha256: sha256(abs),
        mode: '0644',
        runtime_role: role,
        restart_owner: restartOwner,
    };
}
function roleFor(p) {
    if (p.includes('/worker/')) return 'worker';
    if (p.includes('/scheduler/')) return 'scheduler';
    if (p.includes('contact_site_crawler')) return 'worker';
    if (p.includes('/campaigns/') || p.includes('/server/')) return 'api';
    return 'shared';
}
function restartFor(role) { return role === 'worker' ? 'worker' : role === 'scheduler' ? 'scheduler' : 'api'; }

const runtimeFiles = [...visited].filter((p) => tracked.has(p)).sort();
const untrackedInClosure = [...visited].filter((p) => !tracked.has(p));
const files = [];
for (const p of runtimeFiles) { const role = roleFor(p); files.push(entry(p, role, restartFor(role))); }
for (const p of DEPLOY_CONFIGS) { if (tracked.has(p)) files.push(entry(p, 'deploy_config', 'api')); }

const manifest = {
    generated_note: 'FROZEN deployment allowlist. Only these paths may be copied to production.',
    prod_root: PROD_ROOT,
    entrypoints: ENTRYPOINTS,
    import_closure_complete: untrackedInClosure.length === 0,
    unmanifested_runtime_imports: untrackedInClosure,
    total_files: files.length,
    files,
};
const jsonPath = path.join(OUTDIR, 'DEPLOYMENT_MANIFEST.json');
fs.writeFileSync(jsonPath, JSON.stringify(manifest, null, 2));
const manifestHash = crypto.createHash('sha256').update(fs.readFileSync(jsonPath)).digest('hex');
fs.writeFileSync(path.join(OUTDIR, 'DEPLOYMENT_MANIFEST.sha256'), `${manifestHash}  DEPLOYMENT_MANIFEST.json\n`);
console.log(JSON.stringify({ total_files: files.length, import_closure_complete: manifest.import_closure_complete, unmanifested: untrackedInClosure.length, manifest_sha256: manifestHash }, null, 2));
