// shared/store_access.mjs
// Concurrency-safe accessor for the canonical lead store. Telegram bot and the
// Master Controller API can run simultaneously, so:
//   - reads parse a complete file (never a partial write — writes are atomic);
//   - writes go to a temp file then rename() (atomic on NTFS) + a .bak before
//     schema-changing writes;
//   - a lightweight lock file guards concurrent writers with stale-lock recovery.
// This does NOT migrate the store to a DB. JSON remains the production truth.
import fs from 'node:fs';
import path from 'node:path';
import { STORE_PATH, STORE_SEED_PATH } from './config.mjs';

const STALE_MS = 15000;

function lockPathFor(storePath = STORE_PATH) {
    return `${storePath}.writelock`;
}

function ensureStoreFile(storePath = STORE_PATH) {
    if (fs.existsSync(storePath)) return;
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    const seed = path.resolve(STORE_SEED_PATH);
    const target = path.resolve(storePath);
    if (seed !== target && fs.existsSync(seed)) {
        fs.copyFileSync(seed, storePath);
        return;
    }
    fs.writeFileSync(storePath, `${JSON.stringify({
        version: 1,
        updated_at: new Date().toISOString(),
        leads: {},
        store_revision: 0,
        updated_by: 'runtime_store_init',
    }, null, 2)}\n`, 'utf8');
}

function acquireLock(storePath = STORE_PATH) {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    const writeLock = lockPathFor(storePath);
    const deadline = Date.now() + 5000;
    while (true) {
        try {
            fs.writeFileSync(writeLock, JSON.stringify({ pid: process.pid, at: Date.now() }), { flag: 'wx' });
            return true;
        } catch (e) {
            // stale-lock recovery
            try {
                const raw = JSON.parse(fs.readFileSync(writeLock, 'utf8'));
                if (Date.now() - Number(raw.at || 0) > STALE_MS) {
                    fs.unlinkSync(writeLock);
                    continue;
                }
            } catch { /* ignore */ }
            if (Date.now() > deadline) throw new Error('STORE_WRITE_LOCK_TIMEOUT');
            // brief spin
            const wait = Date.now() + 50; while (Date.now() < wait) { /* busy wait, short */ }
        }
    }
}

function releaseLock(storePath = STORE_PATH) {
    try { fs.unlinkSync(lockPathFor(storePath)); } catch { /* ignore */ }
}

// Read the canonical store (complete-file parse). Returns the parsed object.
export function readStore(storePath = STORE_PATH) {
    ensureStoreFile(storePath);
    const raw = fs.readFileSync(storePath, 'utf8');
    return JSON.parse(raw);
}

// Returns leads as an array regardless of object/array shape.
export function leadsArray(store) {
    if (!store) return [];
    if (Array.isArray(store)) return store;
    if (Array.isArray(store.leads)) return store.leads;
    if (store.leads && typeof store.leads === 'object') return Object.values(store.leads);
    return Object.values(store).filter((v) => v && typeof v === 'object');
}

// Atomic write: temp file + rename, with an optional .bak snapshot first.
export function writeStoreAtomic(store, { backup = false, storePath = STORE_PATH } = {}) {
    ensureStoreFile(storePath);
    acquireLock(storePath);
    try {
        if (backup && fs.existsSync(storePath)) {
            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            fs.copyFileSync(storePath, `${storePath}.bak_${ts}`);
        }
        const tmp = `${storePath}.tmp_${process.pid}_${Date.now()}`;
        fs.writeFileSync(tmp, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
        fs.renameSync(tmp, storePath);
    } finally {
        releaseLock(storePath);
    }
}

export { STORE_PATH };

// ----------------------------------------------------------------------------
// Optimistic concurrency: read-modify-write under the lock with a revision check.
// Every writer contour (Android via API, Telegram, dashboard, worker) should route
// mutations through this so a stale client cannot clobber a newer store state.
//   mutate(store) must return the modified store (or a falsy value to abort).
//   If expectedRevision is provided and does not match the on-disk store_revision,
//   throws STORE_REVISION_CONFLICT (409 upstream) — the caller must re-read and retry.
// On success, bumps store_revision and stamps updated_at/updated_by/last_operation_id.
// ----------------------------------------------------------------------------
export function updateStoreWithRevision(mutate, {
    expectedRevision = null, updatedBy = 'unknown', operationId = null, backup = false, storePath = STORE_PATH,
} = {}) {
    ensureStoreFile(storePath);
    acquireLock(storePath);
    try {
        const current = JSON.parse(fs.readFileSync(storePath, 'utf8'));
        const currentRev = Number(current.store_revision) || 0;
        if (expectedRevision != null && Number(expectedRevision) !== currentRev) {
            const err = new Error('STORE_REVISION_CONFLICT');
            err.code = 'STORE_REVISION_CONFLICT';
            err.currentRevision = currentRev;
            err.expectedRevision = Number(expectedRevision);
            throw err;
        }
        const next = mutate(current);
        if (!next) return { written: false, reason: 'ABORTED', revision: currentRev };
        next.store_revision = currentRev + 1;
        next.updated_at = new Date().toISOString();
        next.updated_by = String(updatedBy);
        if (operationId) next.last_operation_id = String(operationId);
        if (backup && fs.existsSync(storePath)) {
            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            fs.copyFileSync(storePath, `${storePath}.bak_${ts}`);
        }
        const tmp = `${storePath}.tmp_${process.pid}_${Date.now()}`;
        fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
        fs.renameSync(tmp, storePath);
        return { written: true, reason: 'OK', revision: next.store_revision };
    } finally {
        releaseLock(storePath);
    }
}
