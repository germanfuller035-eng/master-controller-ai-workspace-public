// Focused tests for owner-safe commercial automation runtime.
// No network, no email, no Telegram, no payment, no production DB write.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-owner-autonomy-'));
process.env.MATER_QUEUE_PATH = path.join(tmp, 'job_queue.json');

const autonomy = await import('../src/commercial/autonomy_runtime.mjs');
const jobs = await import('../src/jobs/service.mjs');

let passed = 0;
async function ok(name, fn) {
    await fn();
    passed++;
    console.log(`  PASS  ${name}`);
}

await ok('status keeps live actions gated', () => {
    const s = autonomy.autonomyStatus();
    assert.equal(s.enabled, true);
    assert.equal(s.flags.LEAD_DISCOVERY_ENABLED, true);
    assert.equal(s.flags.OWNER_APPROVAL_REQUIRED_FOR_SEND, true);
    assert.equal(s.flags.AUTO_SEND_ENABLED, false);
    assert.equal(s.flags.AUTO_REPLY_ENABLED, false);
    assert.equal(s.flags.MASS_SEND_ENABLED, false);
    assert.equal(s.flags.PAYMENT_LIVE_ENABLED, false);
    assert.equal(s.flags.PRODUCTION_DB_WRITE_ENABLED, false);
    assert.equal(s.safety.outbound_count, 0);
});

await ok('owner leadgen start queues one discovery job only', () => {
    const out = autonomy.startLeadgenRound({
        body: {
            niche: 'construction',
            bbox: [44.95, 38.85, 45.15, 39.10],
            limit: 3,
            idempotencyKey: 'test-owner-leadgen-1',
        },
        now: new Date('2026-06-30T03:00:00.000Z'),
    });
    assert.equal(out.ok, true);
    assert.equal(out.status, 'LEADGEN_QUEUED');
    assert.equal(out.discovery_job.job_type, 'LEAD_DISCOVERY');
    assert.equal(out.discovery_job.payload.limit, 3);
    assert.equal(out.safety.outbound_count, 0);
    assert.equal(out.safety.payment_count, 0);
    assert.equal(out.safety.production_db_writes, 0);
    const queued = jobs.listJobs({ type: 'LEAD_DISCOVERY', limit: 10 });
    assert.equal(queued.length, 1);
});

await ok('owner leadgen start is idempotent', () => {
    const out = autonomy.startLeadgenRound({
        body: {
            niche: 'construction',
            bbox: [44.95, 38.85, 45.15, 39.10],
            limit: 3,
            idempotencyKey: 'test-owner-leadgen-1',
        },
        now: new Date('2026-06-30T03:00:00.000Z'),
    });
    assert.equal(out.ok, true);
    assert.equal(out.idempotent, true);
    const queued = jobs.listJobs({ type: 'LEAD_DISCOVERY', limit: 10 });
    assert.equal(queued.length, 1);
});

console.log(`\nowner_safe_autonomy_runtime.test: ${passed} passed`);
