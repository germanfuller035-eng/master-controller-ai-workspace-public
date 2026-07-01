// adapters/index.mjs — concrete source adapters. Credentialed ones report available()=false
// when their key is absent (so a campaign skips them, never blocks). OSM + CSV are keyless.
import { SourceAdapter, toCandidate } from './base.mjs';

// ---- OSM Overpass (keyless) — wraps the existing audited connector ----
export class OverpassAdapter extends SourceAdapter {
    constructor() { super({ name: 'overpass', rateLimitMs: 2000 }); }
    available() { return true; }
    _fixture() {
        return [
            toCandidate({ source: 'overpass', sourceRecordId: 'node/1', ref: 'https://overpass-api.de', company: 'ООО Бетон-Юг', address: 'Краснодар, Северная 320', phones: ['8 861 200 10 20'], website: 'http://beton-yug.ru', category: 'concrete', lat: 45.035, lng: 38.975, raw: { id: 1 } }),
            toCandidate({ source: 'overpass', sourceRecordId: 'node/2', ref: 'https://overpass-api.de', company: 'СтройМеталл', address: 'Краснодар, Ленина 10', phones: ['8 861 300 40 50'], category: 'metal', lat: 45.04, lng: 38.98, raw: { id: 2 } }),
        ];
    }
    async _searchLive(query, budget) {
        const conn = await import('../../../telegram_gateway/osm_overpass_connector.mjs');
        budget.spend(1);
        const out = await conn.searchOverpass({ niche: query.niche, bbox: query.bbox, limit: query.limit || 10, live: true, confirm: true });
        return (out.records || []).map((r) => toCandidate({
            source: 'overpass', sourceRecordId: `${r.osm_type}/${r.osm_id}`, ref: 'https://overpass-api.de',
            company: r.company_name, address: r.address, phones: r.phone_public ? [r.phone_public] : [],
            website: r.site_url || null, email: r.email_public || null, category: query.niche, raw: r,
        }));
    }
}

// ---- 2GIS Places (credential-gated) ----
export class TwoGisAdapter extends SourceAdapter {
    constructor(env = process.env) { super({ name: 'twogis', rateLimitMs: 500 }); this.key = env.TWOGIS_API_KEY || null; }
    available() { return !!this.key; }
    _fixture() {
        return [toCandidate({ source: 'twogis', sourceRecordId: '70000001', ref: '2gis://item/70000001', company: 'Бетон Юг', address: 'г. Краснодар, ул. Северная, д. 320', phones: ['+7 861 200 10 20'], website: 'beton-yug.ru', category: 'Бетон, ЖБИ', lat: 45.0351, lng: 38.9752, raw: { id: '70000001' } })];
    }
    async _searchLive() { throw new Error('TWOGIS_NOT_CONFIGURED'); } // never reached: available()=false without key
}

// ---- DataForSEO Business Listings v3 (credential-gated) ----
export class DataForSeoAdapter extends SourceAdapter {
    constructor(env = process.env) { super({ name: 'dataforseo', rateLimitMs: 1000 }); this.login = env.DATAFORSEO_LOGIN || null; this.pass = env.DATAFORSEO_PASSWORD || null; }
    available() { return !!(this.login && this.pass); }
    _fixture() {
        return [toCandidate({ source: 'dataforseo', sourceRecordId: 'dfs_abc', ref: 'dataforseo://v3/business_listings', company: 'ЖБИ Кубань', address: 'Краснодар, Промышленная 5', phones: ['8 861 555 66 77'], website: 'jbi-kuban.ru', category: 'concrete products', lat: 45.02, lng: 38.99, raw: { id: 'dfs_abc' } })];
    }
    async _searchLive() { throw new Error('DATAFORSEO_NOT_CONFIGURED'); }
}

// ---- Yandex Search (credential-gated) — official site/contact discovery ----
export class YandexSearchAdapter extends SourceAdapter {
    constructor(env = process.env) { super({ name: 'yandex', rateLimitMs: 1500 }); this.key = env.YANDEX_SEARCH_API_KEY || null; }
    available() { return !!this.key; }
    _fixture() { return []; }
    async _searchLive() { throw new Error('YANDEX_NOT_CONFIGURED'); }
}

// ---- Manual CSV/JSON import (keyless) — schema-validated, idempotent ----
export class ManualImportAdapter extends SourceAdapter {
    constructor() { super({ name: 'manual', rateLimitMs: 0 }); }
    available() { return true; }
    // rows: [{company, address, phone, website, email, category, lat, lng}]
    importRows(rows = []) {
        const out = []; const errors = [];
        rows.forEach((r, i) => {
            if (!r || !r.company) { errors.push({ row: i, error: 'MISSING_COMPANY' }); return; }
            out.push(toCandidate({
                source: 'manual', sourceRecordId: r.id || `csv_${i}`, ref: 'manual://import',
                company: r.company, address: r.address, phones: [r.phone].filter(Boolean),
                website: r.website, email: r.email, category: r.category, lat: r.lat, lng: r.lng, raw: r,
            }));
        });
        return { records: out, errors };
    }
    _fixture() { return this.importRows([{ company: 'Тест Импорт', phone: '8 861 111 22 33', website: 'test-import.ru' }]).records; }
}

export function allAdapters(env = process.env) {
    return [new OverpassAdapter(), new TwoGisAdapter(env), new DataForSeoAdapter(env), new YandexSearchAdapter(env), new ManualImportAdapter()];
}
export function availableAdapters(env = process.env) { return allAdapters(env).filter((a) => a.available()); }
