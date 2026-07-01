// tools/commercial_core/lib/product_catalog_runtime.mjs
// Self-contained product catalog + pricing runtime for Integration Wave 1. Resolves its data via
// import.meta.url (NOT process.cwd()), reads ONLY the generated runtime snapshot, and has NO import
// from tools/product_os or tools/revenue_os. Fail-closed on a missing/corrupt snapshot. No network,
// no workspace fallback. This is the single product/price truth the commercial adapter consumes.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = path.join(HERE, '..', 'runtime_data', 'product_catalog.runtime.json');

let CACHE = null;
function load() {
    if (CACHE) return CACHE;
    let raw;
    try { raw = readFileSync(SNAPSHOT_PATH, 'utf8'); }
    catch (e) { throw new Error('PRODUCT_SNAPSHOT_MISSING'); }
    let data;
    try { data = JSON.parse(raw); }
    catch { throw new Error('PRODUCT_SNAPSHOT_CORRUPT'); }
    if (!data || data.schema_version !== 1 || !Array.isArray(data.products)) throw new Error('PRODUCT_SNAPSHOT_INVALID');
    CACHE = data;
    return data;
}

export function catalog() { return load().products; }
export function product(id) { return load().products.find((p) => p.product_id === id) || null; }
export function productsTotal() { return load().products_total; }
export function snapshotProvenance() {
    const d = load();
    return { schema_version: d.schema_version, generator_version: d.generator_version, source_sha256: d.generated_from_source_sha256 };
}

// Pricing adapter — preserves Revenue OS resolvePrice() semantics over the snapshot price object.
// The snapshot is the source of product price; this NEVER mutates it.
function priceDisplay(pr) {
    if (!pr) return 'UNKNOWN';
    if (pr.type === 'free') return 'free';
    if (pr.amount != null) return `${pr.amount} ${pr.currency}`;
    if (pr.amount_min != null && pr.amount_max != null) return `${pr.amount_min}–${pr.amount_max} ${pr.currency}`;
    return 'UNKNOWN';
}

export function resolvePrice(productId) {
    const p = product(productId);
    if (!p) return { ok: false, error: `unknown product ${productId}` };
    const pr = p.price;
    return {
        ok: true,
        product_id: productId,
        type: pr?.type ?? null,
        amount: pr?.amount ?? null,
        amount_min: pr?.amount_min ?? null,
        amount_max: pr?.amount_max ?? null,
        currency: pr?.currency ?? 'RUB',
        status: pr?.status ?? 'UNKNOWN',
        approved_by_owner: pr?.approved_by_owner ?? false,
        display: priceDisplay(pr),
    };
}
