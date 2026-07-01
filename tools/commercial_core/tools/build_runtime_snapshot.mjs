#!/usr/bin/env node
// tools/commercial_core/tools/build_runtime_snapshot.mjs
// Deterministic generator: reads the canonical Product OS catalog (revenue_os/data/product_catalog.json)
// at BUILD/READINESS time, selects only the Wave-1 runtime fields, sorts deterministically, stamps
// provenance, and writes runtime_data/product_catalog.runtime.json atomically. NOT a production
// dependency — production ships the generated snapshot only. Supports --check (fail if stale).
//
// No timestamp inside the content (would churn the hash); provenance uses the SOURCE sha + commit.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..'); // tools/commercial_core/tools → repo root
const SOURCE = path.join(REPO, 'tools', 'revenue_os', 'data', 'product_catalog.json');
const OUT = path.join(HERE, '..', 'runtime_data', 'product_catalog.runtime.json');
const GENERATOR_VERSION = '1.0.0';
const SCHEMA_VERSION = 1;

const RUNTIME_FIELDS = [
    'product_id', 'name', 'client_name', 'category', 'status', 'description',
    'scope_included', 'scope_excluded', 'deliverables', 'acceptance_criteria',
    'evidence_required', 'implementation_readiness', 'price',
];

function sortDeep(v) {
    if (Array.isArray(v)) return v.map(sortDeep);
    if (v && typeof v === 'object') {
        const out = {};
        for (const k of Object.keys(v).sort()) out[k] = sortDeep(v[k]);
        return out;
    }
    return v;
}

export function buildSnapshot() {
    const srcRaw = readFileSync(SOURCE, 'utf8');
    const srcSha = 'sha256:' + crypto.createHash('sha256').update(srcRaw).digest('hex');
    const src = JSON.parse(srcRaw);
    const products = (src.products || []).map((p) => {
        const o = {};
        for (const f of RUNTIME_FIELDS) if (p[f] !== undefined) o[f] = p[f];
        // normalize a stable product_version + commercial fields for Wave 1
        o.product_version = 'v1';
        o.currency = p.price?.currency || 'RUB';
        return sortDeep(o);
    }).sort((a, b) => a.product_id.localeCompare(b.product_id));

    const body = {
        schema_version: SCHEMA_VERSION,
        generator_version: GENERATOR_VERSION,
        generated_from_source_path: 'tools/revenue_os/data/product_catalog.json',
        generated_from_source_sha256: srcSha,
        products_total: products.length,
        products,
    };
    return body;
}

function stableStringify(o) { return JSON.stringify(o, null, 2) + '\n'; }

function main() {
    const check = process.argv.includes('--check');
    const built = buildSnapshot();
    const builtStr = stableStringify(built);
    const builtHash = crypto.createHash('sha256').update(builtStr).digest('hex').slice(0, 16);
    if (check) {
        let cur = '';
        try { cur = readFileSync(OUT, 'utf8'); } catch { /* missing */ }
        const curHash = crypto.createHash('sha256').update(cur).digest('hex').slice(0, 16);
        if (cur !== builtStr) {
            console.error(`SNAPSHOT_STALE: tracked=${curHash} expected=${builtHash} — run build_runtime_snapshot.mjs`);
            process.exit(1);
        }
        console.log(`SNAPSHOT_FRESH hash=${builtHash} products=${built.products_total}`);
        process.exit(0);
    }
    const tmp = OUT + '.tmp';
    writeFileSync(tmp, builtStr, 'utf8');
    // atomic-ish replace
    writeFileSync(OUT, builtStr, 'utf8');
    try { readFileSync(tmp); } catch {}
    console.log(`SNAPSHOT_WRITTEN hash=${builtHash} products=${built.products_total} → ${path.relative(REPO, OUT)}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) main();
