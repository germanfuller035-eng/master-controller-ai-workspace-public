// repository.mjs — Lead Hunter repository interface + a lightweight local JSON DB adapter.
// This is the ISOLATED lead-intelligence database. It is NOT the canonical production store
// and NEVER writes tools/.../13_sales/lead_pipeline_store.json. Atomic temp+rename writes.
// A documented PostgreSQL adapter implements the same interface for production.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function newId(prefix) { return prefix + '_' + crypto.randomBytes(7).toString('hex'); }

// Collections in the lead-intelligence DB (per spec data model).
export const COLLECTIONS = Object.freeze([
    'campaigns', 'source_runs', 'discovery_jobs', 'raw_source_records', 'businesses',
    'business_aliases', 'addresses', 'phones', 'emails', 'websites', 'social_links',
    'evidence', 'verification_results', 'scores', 'audit_findings', 'promotion_events',
    'api_usage', 'errors',
]);

function emptyDb() {
    const db = { _meta: { version: 1, created_at: null } };
    for (const c of COLLECTIONS) db[c] = {};
    return db;
}

// Local JSON adapter — atomic, lock-free single-process (tests + local dev).
export class LocalJsonRepo {
    constructor(dbPath) {
        this.dbPath = dbPath;
        this._cache = null;
    }
    _load() {
        if (this._cache) return this._cache;
        try { this._cache = JSON.parse(fs.readFileSync(this.dbPath, 'utf8')); }
        catch { this._cache = emptyDb(); this._cache._meta.created_at = new Date().toISOString(); }
        for (const c of COLLECTIONS) if (!this._cache[c]) this._cache[c] = {};
        return this._cache;
    }
    _flush() {
        const dir = path.dirname(this.dbPath);
        fs.mkdirSync(dir, { recursive: true });
        const tmp = `${this.dbPath}.tmp_${process.pid}_${Date.now()}`;
        fs.writeFileSync(tmp, JSON.stringify(this._cache, null, 2), 'utf8');
        fs.renameSync(tmp, this.dbPath);
    }
    // generic ops
    put(coll, id, doc) { const db = this._load(); db[coll][id] = { ...doc, id, updated_at: new Date().toISOString() }; this._flush(); return db[coll][id]; }
    get(coll, id) { return this._load()[coll][id] || null; }
    all(coll) { return Object.values(this._load()[coll] || {}); }
    find(coll, pred) { return this.all(coll).filter(pred); }
    patch(coll, id, fields) { const db = this._load(); if (!db[coll][id]) return null; db[coll][id] = { ...db[coll][id], ...fields, updated_at: new Date().toISOString() }; this._flush(); return db[coll][id]; }
    remove(coll, id) { const db = this._load(); const had = !!db[coll][id]; delete db[coll][id]; this._flush(); return had; }
    counts() { const db = this._load(); const o = {}; for (const c of COLLECTIONS) o[c] = Object.keys(db[c]).length; return o; }
    // force re-read from disk (restart-persistence semantics in tests)
    reload() { this._cache = null; return this._load(); }
}

// PostgreSQL adapter — DOCUMENTED production interface. Not wired here (no PG creds in this task).
// It must implement the identical surface (put/get/all/find/patch/remove/counts) backed by tables
// matching COLLECTIONS, with a JSONB `doc` column + indexed dedupe keys. See OPERATOR_GUIDE.
export class PostgresRepo {
    constructor() { throw new Error('PostgresRepo not configured: provide PG connection via protected config. Local JSON repo is the default for tests/dev.'); }
}

export function openRepo({ adapter = 'local', dbPath } = {}) {
    if (adapter === 'postgres') return new PostgresRepo();
    return new LocalJsonRepo(dbPath || path.join(process.env.LEAD_HUNTER_DB_DIR || '.', 'lead_hunter_db.json'));
}
