#!/usr/bin/env node
/**
 * build_import_closure.mjs — compute the runtime import closure from entrypoints and
 * classify every reached file as git-tracked or untracked. Pure static analysis:
 * resolves `import ... from '...'` and `import('...')` with string literals.
 * Dynamic imports with computed specifiers are reported as UNRESOLVED for review.
 *
 * Output: JSON to stdout. Run from the MAIN workspace (all files present on disk).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.argv[2] || process.cwd();
const ENTRYPOINTS = [
    'tools/mater_controller_api/src/server/index.mjs',
    'tools/mater_controller_api/src/worker/index.mjs',
    'tools/mater_controller_api/src/scheduler/daily_discovery.mjs',
    'tools/telegram_gateway/contact_site_crawler.mjs',
    'tools/telegram_gateway/contact_site_crawler_live_smoke.mjs',
    'tools/mater_controller_api/src/campaigns/service.mjs',
    'tools/lead_hunter/src/adapters/index.mjs',
    // Known computed-dynamic import targets (resolved manually; analyzer can't see them):
    'tools/telegram_gateway/mini_audit_operator_mode.mjs',
    'tools/telegram_gateway/queue_navigation.mjs',
    'tools/telegram_gateway/outbound_channel_router.mjs',
    'tools/telegram_gateway/reply_monitor.mjs',
    'tools/telegram_gateway/osm_overpass_connector.mjs',
];

// git-tracked set (fast lookup)
const tracked = new Set(
    execSync('git ls-files', { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 })
        .toString().split(/\r?\n/).filter(Boolean).map((p) => p.replace(/\\/g, '/'))
);

const STATIC_RE = /import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const DYN_RE = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const DYN_COMPUTED_RE = /import\s*\(\s*(?!['"])/g;

function relromRoot(abs) { return path.relative(ROOT, abs).replace(/\\/g, '/'); }

function resolveSpec(spec, fromFile) {
    if (!spec.startsWith('.') && !spec.startsWith('/')) return { kind: 'bare', spec }; // node_modules / builtin
    const baseDir = path.dirname(fromFile);
    let target = path.resolve(baseDir, spec);
    const candidates = [target, target + '.mjs', target + '.js', path.join(target, 'index.mjs'), path.join(target, 'index.js')];
    for (const c of candidates) {
        try { if (fs.statSync(c).isFile()) return { kind: 'file', file: c }; } catch { /* skip */ }
    }
    return { kind: 'missing', spec, resolvedGuess: target };
}

const visited = new Set();
const closure = new Map(); // relpath -> { tracked, imports:[], dynamicComputed:int }
const missing = [];
const computedDynamic = [];

function walk(absFile) {
    const rel = relromRoot(absFile);
    if (visited.has(rel)) return;
    visited.add(rel);
    let src;
    try { src = fs.readFileSync(absFile, 'utf8'); } catch { missing.push(rel); return; }
    const info = { tracked: tracked.has(rel), imports: [], dynamicComputed: 0 };
    const specs = new Set();
    let m;
    STATIC_RE.lastIndex = 0; while ((m = STATIC_RE.exec(src))) specs.add(m[1]);
    DYN_RE.lastIndex = 0; while ((m = DYN_RE.exec(src))) specs.add(m[1]);
    DYN_COMPUTED_RE.lastIndex = 0; while ((m = DYN_COMPUTED_RE.exec(src))) info.dynamicComputed++;
    if (info.dynamicComputed > 0) computedDynamic.push(rel);
    for (const spec of specs) {
        const r = resolveSpec(spec, absFile);
        if (r.kind === 'file') {
            const childRel = relromRoot(r.file);
            info.imports.push(childRel);
            walk(r.file);
        } else if (r.kind === 'missing') {
            missing.push(`${rel} -> ${spec} (guess ${relromRoot(r.resolvedGuess)})`);
        }
    }
    closure.set(rel, info);
}

for (const ep of ENTRYPOINTS) {
    const abs = path.resolve(ROOT, ep);
    try { fs.statSync(abs); walk(abs); } catch { missing.push(`ENTRYPOINT_MISSING:${ep}`); }
}

const all = [...closure.entries()];
const untrackedRuntime = all.filter(([, v]) => !v.tracked).map(([k]) => k).sort();
const trackedRuntime = all.filter(([, v]) => v.tracked).map(([k]) => k).sort();

const report = {
    generated_note: 'import closure from entrypoints; static + literal-dynamic imports only',
    entrypoints: ENTRYPOINTS,
    total_files_in_closure: closure.size,
    tracked_count: trackedRuntime.length,
    untracked_runtime_count: untrackedRuntime.length,
    untracked_runtime: untrackedRuntime,
    missing_on_disk: missing,
    files_with_computed_dynamic_import: computedDynamic,
};
console.log(JSON.stringify(report, null, 2));
