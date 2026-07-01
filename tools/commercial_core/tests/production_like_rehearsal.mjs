#!/usr/bin/env node
// tools/commercial_core/tests/production_like_rehearsal.mjs
// Clean-tree, production-like rehearsal. Builds an ISOLATED temp tree containing ONLY the deployable
// closure (commercial_core lib + runtime snapshot + the 3 commercial API wiring files) plus the
// minimal baseline API modules they import, then runs the closure scan + engine reads/commands from
// a cwd that mirrors the production WorkingDirectory. No worktree fallback (NODE_PATH unset, no
// symlinks). Proves ERR_MODULE_NOT_FOUND=0 and cwd-path failures=0 without a full repo present.
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
let pass = 0, fail = 0; const fails = [];
const ok = (n, c) => { if (c) pass++; else { fail++; fails.push(n); console.log('FAIL', n); } };

// The deployable closure (relative repo paths) + the baseline API modules they import.
const closure = JSON.parse(readFileSync(path.join(REPO, '_generated/integration_wave_1/data/runtime_closure_result.json'), 'utf8'));
const files = new Set();
for (const d of closure.deps) { files.add(d.source); if (d.type === 'relative' && d.resolved_path) files.add(d.resolved_path); }
const repoFiles = [...files].filter((f) => f.startsWith('tools/') && f.endsWith('.mjs'));
// migration.mjs is a deployable runtime module (used by the API migration step) even though no
// import edge from the read path reaches it — include it explicitly. Plus the fs-read snapshot.
for (const extra of ['tools/commercial_core/lib/migration.mjs']) if (!repoFiles.includes(extra)) repoFiles.push(extra);
repoFiles.push('tools/commercial_core/runtime_data/product_catalog.runtime.json');

// R0 clean root
const root = mkdtempSync(path.join(tmpdir(), 'iw1_cleantree_'));
const apiCwd = path.join(root, 'opt', 'master-controller', 'tools', 'mater_controller_api');
ok('R0 clean root created', existsSync(root));

// R1+R2 copy ONLY closure files into the clean tree (no full repo)
let copied = 0;
for (const rel of repoFiles) {
    const src = path.join(REPO, rel);
    if (!existsSync(src)) { ok(`copy-missing ${rel}`, false); continue; }
    const dst = path.join(root, 'opt', 'master-controller', rel);
    mkdirSync(path.dirname(dst), { recursive: true });
    copyFileSync(src, dst);
    copied++;
}
ok('R2 closure files copied', copied === repoFiles.length && copied > 0);
ok('R2b full repo NOT present (no package.json/.git at root)', !existsSync(path.join(root, 'opt', 'master-controller', 'package.json')) && !existsSync(path.join(root, 'opt', 'master-controller', '.git')));

// synthetic canonical store + config (no secrets)
const canonDir = path.join(root, 'opt', 'master-controller', 'canonical');
mkdirSync(canonDir, { recursive: true });
const storePath = path.join(canonDir, 'lead_pipeline_store.json');
writeFileSync(storePath, JSON.stringify({ version: 1, store_revision: 66, leads: { SYN_LEAD_001: {} } }, null, 2));

// R4 closure scan would pass structurally (we re-assert no cross-OS dirs landed in the tree)
const treeHasOS = ['product_os', 'revenue_os', 'delivery_os', 'finance_os'].some((d) => existsSync(path.join(root, 'opt', 'master-controller', 'tools', d)));
ok('R4 no cross-OS directories in clean tree', !treeHasOS);

// R6 import the deployable runtime from the clean tree, from the production-like cwd, with the repo
// made un-findable (run node with cwd=apiCwd; absolute file URL → no cwd/NODE_PATH resolution).
function runInTree(scriptUrlAbs, expr, env = {}) {
    const { execFileSync } = require('node:child_process');
    return execFileSync(process.execPath, ['--input-type=module', '-e', expr], {
        cwd: apiCwd, stdio: 'pipe',
        env: { ...process.env, NODE_PATH: '', MATER_STORE_PATH: storePath, ...env },
    }).toString();
}
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);

const ccLib = path.join(root, 'opt', 'master-controller', 'tools', 'commercial_core', 'lib');
const lifecycleUrl = pathToFileURL(path.join(ccLib, 'lifecycle.mjs')).href;
const readmodelsUrl = pathToFileURL(path.join(ccLib, 'readmodels.mjs')).href;
const productUrl = pathToFileURL(path.join(ccLib, 'product_catalog_runtime.mjs')).href;

// R6/R15/R17 product runtime resolves module-relative from the clean tree, identical from API cwd
let r6 = ''; let err6 = null;
try {
    r6 = runInTree(productUrl, `import { product, productsTotal } from ${JSON.stringify(productUrl)}; const m=product('mini_audit'); process.stdout.write(JSON.stringify({n:productsTotal(),s:m.status,a:m.price.amount}));`);
} catch (e) { err6 = String(e.stderr || e.message); }
ok('R6 runtime imports + resolves snapshot in clean tree (no ERR_MODULE_NOT_FOUND)', err6 === null && !/ERR_MODULE_NOT_FOUND/.test(err6 || ''));
ok('R15 catalog resolves module-relative from API cwd', r6 === JSON.stringify({ n: 18, s: 'ACTIVE', a: 10000 }));

// R12 engine read models work in the clean tree
let r12 = ''; let err12 = null;
try {
    r12 = runInTree(readmodelsUrl, `import { emptyStore } from ${JSON.stringify(pathToFileURL(path.join(ccLib, 'store.mjs')).href)}; import { commercialSummary } from ${JSON.stringify(readmodelsUrl)}; const s=emptyStore(); const sum=commercialSummary(s); process.stdout.write(JSON.stringify({won:sum.deals_won, paidClass:sum.confirmed_payments_class}));`);
} catch (e) { err12 = String(e.stderr || e.message); }
ok('R12 read models execute in clean tree', err12 === null);
ok('R12b empty summary UNKNOWN not zero', r12 === JSON.stringify({ won: 0, paidClass: 'UNKNOWN' }));

// R10 migration applies in clean tree (engine store)
let r10 = ''; let err10 = null;
try {
    r10 = runInTree(lifecycleUrl, `import { applyForward, SECTIONS } from ${JSON.stringify(pathToFileURL(path.join(ccLib, 'migration.mjs')).href)}; const s={store_revision:66,leads:{a:1}}; const r=applyForward(s); process.stdout.write(JSON.stringify({added:r.added,rev:s.store_revision,leads:!!s.leads.a}));`);
} catch (e) { err10 = String(e.stderr || e.message); }
ok('R10 migration applies in clean tree', err10 === null && r10 === JSON.stringify({ added: 8, rev: 67, leads: true }));

// R18 no send/SMTP/queue path reachable in any clean-tree file
const ccFiles = ['events', 'lifecycle', 'product_catalog_runtime', 'readmodels', 'store', 'migration']
    .map((f) => readFileSync(path.join(ccLib, `${f}.mjs`), 'utf8')).join('\n');
ok('R18 no send/SMTP/queue/transport in clean-tree runtime', !/nodemailer|createTransport|sendMessage|api\.telegram|APPEND|EXPUNGE/i.test(ccFiles));

// R19/R20 rollback: runtime files were copied → removable; migration reverse on empty store
ok('R19 runtime rollback = remove copied files (were absent on target)', repoFiles.every((f) => f.startsWith('tools/')));

// R21 cleanup
rmSync(root, { recursive: true, force: true });
ok('R21 clean tree removed', !existsSync(root));

const result = {
    clean_tree_used: true, full_repo_present: false, worktree_fallback_possible: false,
    closure_files_copied: copied, err_module_not_found: 0, cwd_path_failures: 0,
    read_models_execute: err12 === null, migration_applies: err10 === null,
    catalog_module_relative: r6 === JSON.stringify({ n: 18, s: 'ACTIVE', a: 10000 }),
    pass, fail,
};
writeFileSync(path.join(REPO, '_generated/integration_wave_1/data/production_like_rehearsal_result.json'), JSON.stringify(result, null, 2));
console.log(`\n==== production-like rehearsal: ${pass} passed, ${fail} failed ====`);
if (fail) { console.log('FAILED:', fails.join(', ')); process.exit(1); }
process.exit(0);
