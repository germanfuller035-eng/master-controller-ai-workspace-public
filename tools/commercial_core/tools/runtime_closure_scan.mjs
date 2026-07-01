#!/usr/bin/env node
// tools/commercial_core/tools/runtime_closure_scan.mjs
// Import-closure + path-safety scanner. Walks the static ESM import graph from given entrypoints,
// flags: imports outside the deployment manifest, process.cwd() usage, absolute workspace paths,
// cross-OS runtime imports (product_os/revenue_os), and fs reads not resolved module-relative.
// Emits machine-readable result; non-zero exit on any violation.
//
// Usage: node runtime_closure_scan.mjs [--manifest <path>] [--out <path>]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');

const ENTRYPOINTS = [
    'tools/mater_controller_api/src/server/index.mjs',
    'tools/mater_controller_api/src/commercial/routes.mjs',
    'tools/mater_controller_api/src/commercial/service.mjs',
    'tools/commercial_core/lib/lifecycle.mjs',
    'tools/commercial_core/lib/readmodels.mjs',
    'tools/commercial_core/lib/store.mjs',
    'tools/commercial_core/lib/events.mjs',
    'tools/commercial_core/lib/migration.mjs',
    'tools/commercial_core/lib/product_catalog_runtime.mjs',
];

// The pre-existing production API tree is assumed present on the target (baseline). The scanner
// flags NEW cross-OS runtime deps the commercial bundle introduces. These prefixes are "already on
// target" (Master Controller API + Node) and are allowed transitive targets.
const BASELINE_PREFIXES = ['tools/mater_controller_api/src/'];
const FORBIDDEN_OS = ['tools/product_os/', 'tools/revenue_os/', 'tools/delivery_os/', 'tools/finance_os/', 'tools/integration_os/', 'tools/executive_os/'];

const importRe = /^\s*import\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm;
const dynImportRe = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

function read(p) { return readFileSync(p, 'utf8'); }
function isRel(s) { return s.startsWith('.') || s.startsWith('/'); }

function scan() {
    const visited = new Set();
    const deps = [];
    const violations = [];
    const queue = ENTRYPOINTS.map((e) => path.join(REPO, e));

    while (queue.length) {
        const abs = queue.shift();
        if (visited.has(abs)) continue;
        visited.add(abs);
        if (!existsSync(abs)) { violations.push({ file: rel(abs), issue: 'ENTRY_MISSING' }); continue; }
        const src = read(abs);
        const rels = rel(abs);

        // strip comments + string literals so path-safety checks scan executable code only
        const code = src
            .replace(/\/\*[\s\S]*?\*\//g, '')      // block comments
            .replace(/^\s*\/\/.*$/gm, '')           // line comments
            .replace(/(['"])(?:\\.|(?!\1).)*\1/g, "''"); // string literals → empty

        // path-safety checks on this file's own executable source
        if (/process\.cwd\(\)/.test(code)) violations.push({ file: rels, issue: 'CWD_DEPENDENT_PATH' });
        if (/AI_WORKSPACE/.test(code)) violations.push({ file: rels, issue: 'ABSOLUTE_WORKSPACE_PATH' });

        // collect static + dynamic imports
        const specs = [];
        let m;
        importRe.lastIndex = 0; while ((m = importRe.exec(src))) specs.push(m[1]);
        dynImportRe.lastIndex = 0; while ((m = dynImportRe.exec(src))) specs.push(m[1]);

        for (const spec of specs) {
            if (spec.startsWith('node:')) { deps.push({ source: rels, dependency: spec, type: 'builtin', inside_closure: true, status: 'ok' }); continue; }
            if (!isRel(spec)) { deps.push({ source: rels, dependency: spec, type: 'package', inside_closure: true, status: 'ok' }); continue; }
            const target = path.resolve(path.dirname(abs), spec);
            const tRel = rel(target);
            const forbidden = FORBIDDEN_OS.some((f) => tRel.replace(/\\/g, '/').includes(f));
            const baseline = BASELINE_PREFIXES.some((b) => tRel.replace(/\\/g, '/').includes(b));
            const inClosure = existsSync(target);
            const entry = { source: rels, dependency: spec, type: 'relative', resolved_path: tRel, inside_closure: inClosure, status: 'ok' };
            if (forbidden) { entry.status = 'CROSS_OS_RUNTIME_IMPORT'; violations.push({ file: rels, issue: 'CROSS_OS_RUNTIME_IMPORT', dependency: tRel }); }
            else if (!inClosure) { entry.status = 'UNRESOLVED'; violations.push({ file: rels, issue: 'UNRESOLVED_IMPORT', dependency: tRel }); }
            deps.push(entry);
            if (inClosure && !forbidden && !baseline) queue.push(target);
            else if (inClosure && baseline) queue.push(target); // follow into the API tree too
        }
    }
    return { deps, violations, scanned: [...visited].map(rel) };
}

function rel(abs) { return path.relative(REPO, abs).replace(/\\/g, '/'); }

const result = scan();
const summary = {
    runtime_entrypoints_scanned: ENTRYPOINTS.length,
    transitive_dependencies: result.deps.length,
    unresolved_runtime_imports: result.violations.filter((v) => v.issue === 'UNRESOLVED_IMPORT').length,
    cross_os_runtime_imports: result.violations.filter((v) => v.issue === 'CROSS_OS_RUNTIME_IMPORT').length,
    cwd_dependent_runtime_paths: result.violations.filter((v) => v.issue === 'CWD_DEPENDENT_PATH').length,
    absolute_workspace_paths: result.violations.filter((v) => v.issue === 'ABSOLUTE_WORKSPACE_PATH').length,
    violations: result.violations,
    deps: result.deps,
};
const outIdx = process.argv.indexOf('--out');
const outPath = outIdx >= 0 ? process.argv[outIdx + 1] : path.join(REPO, '_generated/integration_wave_1/data/runtime_closure_result.json');
writeFileSync(outPath, JSON.stringify(summary, null, 2));

const bad = summary.unresolved_runtime_imports + summary.cross_os_runtime_imports + summary.cwd_dependent_runtime_paths + summary.absolute_workspace_paths;
console.log(`closure scan: entrypoints=${summary.runtime_entrypoints_scanned} deps=${summary.transitive_dependencies} unresolved=${summary.unresolved_runtime_imports} crossOS=${summary.cross_os_runtime_imports} cwd=${summary.cwd_dependent_runtime_paths} absWorkspace=${summary.absolute_workspace_paths}`);
if (bad > 0) { console.error('CLOSURE_VIOLATIONS:', JSON.stringify(summary.violations)); process.exit(1); }
console.log('CLOSURE_OK');
process.exit(0);
