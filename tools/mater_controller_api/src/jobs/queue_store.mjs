// jobs/queue_store.mjs
// Operational job-queue store, owned EXCLUSIVELY by the API/repository process.
// Atomic temp+rename + lock + revision, mirroring store_access.mjs. This is OPERATIONAL
// state (jobs), NOT a second business/lead store and NOT a second outbound ledger.
// Workers never open this file — they go through the API.
import fs from 'node:fs';
import path from 'node:path';
import { WORKSPACE } from '../shared/config.mjs';

export const QUEUE_PATH = process.env.MATER_QUEUE_PATH
    ? path.resolve(process.env.MATER_QUEUE_PATH)
    : path.join(WORKSPACE, '13_sales', 'job_queue.json');

const LOCK = QUEUE_PATH + '.writelock';
const STALE_MS = 15000;

function acquireLock() {
    const deadline = Date.now() + 5000;
    for (;;) {
        try { fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, at: Date.now() }), { flag: 'wx' }); return; }
        catch {
            // Reclaim a stale lock. Prefer the timestamp written inside the lock; if the lock is
            // empty/corrupt (e.g. a crash between create and write), fall back to its file mtime so
            // a damaged lock can never wedge the queue forever (root cause of the 2026-06-19 enqueue 500s).
            try {
                let at = 0;
                try { at = Number(JSON.parse(fs.readFileSync(LOCK, 'utf8')).at || 0); } catch { /* unparseable */ }
                if (!at) { try { at = fs.statSync(LOCK).mtimeMs; } catch { /* gone */ } }
                if (at && Date.now() - at > STALE_MS) { fs.unlinkSync(LOCK); continue; }
            } catch { /* ignore */ }
            if (Date.now() > deadline) throw new Error('QUEUE_LOCK_TIMEOUT');
            const w = Date.now() + 40; while (Date.now() < w) { /* spin */ }
        }
    }
}
function releaseLock() { try { fs.unlinkSync(LOCK); } catch { /* ignore */ } }

function emptyQueue() { return { version: 1, queue_revision: 0, jobs: {}, updated_at: null }; }

export function readQueue(p = QUEUE_PATH) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return emptyQueue(); }
}

// read-modify-write under lock; mutate(q) returns q or falsy to abort.
export function updateQueue(mutate, { p = QUEUE_PATH } = {}) {
    acquireLock();
    try {
        let q;
        try { q = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { q = emptyQueue(); }
        if (!q.jobs) q.jobs = {};
        const next = mutate(q);
        if (!next) return { written: false };
        next.queue_revision = (Number(next.queue_revision) || 0) + 1;
        next.updated_at = new Date().toISOString();
        const tmp = `${p}.tmp_${process.pid}_${Date.now()}`;
        fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
        fs.renameSync(tmp, p);
        return { written: true, revision: next.queue_revision };
    } finally { releaseLock(); }
}
