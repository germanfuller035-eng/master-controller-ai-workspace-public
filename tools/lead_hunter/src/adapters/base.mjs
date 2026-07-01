// adapters/base.mjs — common source-adapter interface + shared safety scaffolding.
// Every adapter: dry-run by default (fixtures, no network); live ONLY with {live:true, confirm:true};
// per-source rate limit + request budget; cost accounting; emits a common candidate shape
// with full evidence provenance. No adapter writes canonical production data.
import { evidence, normPhone, normDomain } from '../normalize.mjs';

// Common candidate shape every adapter must emit.
export function toCandidate({ source, sourceRecordId, ref, company, address, phones = [], website, email, category, lat, lng, raw }) {
    const ev = [];
    if (company) ev.push(evidence({ source, sourceRecordId, ref, rawValue: company, normalizedValue: company, confidence: 0.9 }));
    if (website) ev.push(evidence({ source, sourceRecordId, ref, rawValue: website, normalizedValue: normDomain(website), confidence: 0.8 }));
    for (const p of phones) ev.push(evidence({ source, sourceRecordId, ref, rawValue: p, normalizedValue: normPhone(p), confidence: 0.7 }));
    return {
        source, source_record_id: sourceRecordId != null ? String(sourceRecordId) : null, ref: ref || null,
        company: company || null, address: address || null, phones: phones.filter(Boolean),
        website: website || null, websites: website ? [website] : [],
        emails: email ? [email] : [], category: category || null,
        lat: lat ?? null, lng: lng ?? null, evidence: ev, discovered_at: new Date().toISOString(),
        raw_payload_hash: raw ? require_hash(raw) : null,
    };
}
import crypto from 'node:crypto';
function require_hash(o) { return crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex').slice(0, 16); }

// Token-bucket-ish rate limit + budget tracker shared by adapters.
export class Budget {
    constructor({ maxRequests = 50, source = 'unknown' } = {}) { this.max = maxRequests; this.used = 0; this.source = source; this.costUnits = 0; }
    canSpend() { return this.used < this.max; }
    spend(cost = 1) { if (!this.canSpend()) throw new Error(`BUDGET_EXCEEDED:${this.source}:${this.used}/${this.max}`); this.used++; this.costUnits += cost; return this.used; }
    report() { return { source: this.source, requests: this.used, max: this.max, cost_units: this.costUnits }; }
}

// Base class: subclasses implement _searchLive(query, budget) and _fixture(query).
export class SourceAdapter {
    constructor({ name, rateLimitMs = 1000 } = {}) { this.name = name; this.rateLimitMs = rateLimitMs; }
    available() { return true; } // override: false if a required credential is absent
    // search(): dry-run returns fixtures; live requires confirm. Always returns {records, budget, mode}.
    async search(query = {}, { live = false, confirm = false, budget, fixtureProvider } = {}) {
        const b = budget || new Budget({ source: this.name });
        if (!live) {
            const recs = fixtureProvider ? fixtureProvider(this.name, query) : (this._fixture ? this._fixture(query) : []);
            return { mode: 'dry_run', records: recs, budget: b.report() };
        }
        if (!confirm) throw new Error('LIVE_REQUIRES_CONFIRM');
        if (!this.available()) return { mode: 'live_unavailable', records: [], budget: b.report(), reason: 'CREDENTIAL_MISSING' };
        const recs = await this._searchLive(query, b);
        return { mode: 'live', records: recs, budget: b.report() };
    }
}
