/**
 * reliability_v1_test.mjs — Reliability Center backend scenario lab.
 *
 * OFFLINE. No network. No SMTP. No send. Operates on a TEMP owner-center store
 * (MATER_OWNER_CENTER_STORE_PATH). Verifies the deterministic reliability overview:
 * service health folding, queue/dead-letter levels, ingest health, recovery actions
 * report (never executed), honest UNKNOWN, and the no-send invariant.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = path.join(os.tmpdir(), `mc_reliability_${process.pid}_${Date.now()}.json`);
process.env.MATER_OWNER_CENTER_STORE_PATH = TMP;

const svc = await import('../mater_controller_api/src/owner_center/service.mjs');
const rel = await import('../mater_controller_api/src/owner_center/reliability.mjs');

let passed = 0, failed = 0; const fails = [];
function check(n, c) { if (c) { passed++; console.log('  ✅ ' + n); } else { failed++; fails.push(n); console.log('  ❌ ' + n); } }

console.log('\n=== Reliability Center — Scenario Lab ===\n');

// 1. service health folding
console.log('Scenario: service health levels');
const sh = rel.serviceHealth({ api: { status: 'ok' }, telegramBot: { polling: true }, worker: { status: 'ok' } });
check('api healthy', sh.find((s) => s.key === 'api').level === 'HEALTHY');
check('worker healthy', sh.find((s) => s.key === 'worker').level === 'HEALTHY');
check('telegram healthy', sh.find((s) => s.key === 'telegram_bot').level === 'HEALTHY');
const shDown = rel.serviceHealth({ api: { status: 'ok' }, worker: { status: 'FAILED' } });
check('failed worker → DOWN', shDown.find((s) => s.key === 'worker').level === 'DOWN');
const shUnknown = rel.serviceHealth({ api: { status: 'ok' } });
check('absent worker → UNKNOWN', shUnknown.find((s) => s.key === 'worker').level === 'UNKNOWN');

// 2. queue / dead-letter health
console.log('Scenario: queue + dead-letter levels');
const qHealthy = rel.queueHealth({ QUEUED: 3, RUNNING: 1, RETRY: 0, DEAD_LETTER: 0 });
check('clean queue → HEALTHY', qHealthy.level === 'HEALTHY' && qHealthy.dead_letter === 0);
const qDeg = rel.queueHealth({ QUEUED: 0, DEAD_LETTER: 2 });
check('some dead-letter → DEGRADED', qDeg.level === 'DEGRADED');
const qDown = rel.queueHealth({ DEAD_LETTER: 12 });
check('many dead-letter → DOWN', qDown.level === 'DOWN');
const qRetry = rel.queueHealth({ RETRY: 25 });
check('high retries → DEGRADED', qRetry.level === 'DEGRADED');
const qUnknown = rel.queueHealth(null);
check('no counts → UNKNOWN (not false 0)', qUnknown.level === 'UNKNOWN' && qUnknown.queued === 'UNKNOWN');
const qSample = rel.queueHealth({ DEAD_LETTER: 1 }, [{ job_id: 'j1', job_type: 'LEAD_VERIFY', last_error_code: 'TIMEOUT', updated_at: 't' }]);
check('dead-letter sample surfaced', qSample.dead_letter_sample.length === 1 && qSample.dead_letter_sample[0].job_id === 'j1');

// 3. ingest health
console.log('Scenario: ingest (sources/channels) health');
const ingErr = rel.ingestHealth({ items: [{ source_id: 's1', errors: 3 }, { source_id: 's2', errors: 0 }] }, { items: [{ channel: 'email', quarantine_count: 0 }] });
check('source errors → DEGRADED', ingErr.sources.level === 'DEGRADED' && ingErr.sources.with_errors === 1);
check('clean channels → HEALTHY', ingErr.channels.level === 'HEALTHY');
const ingNone = rel.ingestHealth(null, null);
check('no ingest data → UNKNOWN', ingNone.sources.level === 'UNKNOWN' && ingNone.sources.with_errors === 'UNKNOWN');

// 4. recovery actions reported (recorded, never executed by reliability)
console.log('Scenario: recovery actions report');
svc.recordRemediation({ playbook: 'RESTART_WORKER', trigger: 'worker_crash', result: 'recovered', recoveryEvidence: 'health 200' });
svc.recordRemediation({ playbook: 'APPLY_BACKOFF', trigger: 'rate_limit', result: 'pending' });
const store1 = JSON.parse(fs.readFileSync(TMP, 'utf8'));
const recovery = rel.recoveryActions(store1);
check('recorded remediations counted', recovery.total_recorded === 2);
check('recovered count correct', recovery.recovered === 1);
check('pending count correct', recovery.pending === 1);

// 5. incidents feed into overview
console.log('Scenario: incidents in overview');
svc.recordIncidentSignal({ groupKey: 'src_down', severity: 'P2', entity_type: 'SOURCE', title_ru: 'Источник недоступен' });
const ovr = rel.reliabilityOverview({
    system: { api: { status: 'ok' }, worker: { status: 'ok' }, telegramBot: { polling: true } },
    counts: { QUEUED: 1, DEAD_LETTER: 0 },
    sources: { items: [{ source_id: 's1', errors: 0 }] },
    channels: { items: [] },
    store: JSON.parse(fs.readFileSync(TMP, 'utf8')),
});
check('overview has active incident', ovr.incidents.active >= 1);
check('active P2 incident → overall DEGRADED', ovr.overall_health === 'DEGRADED');
check('degraded_states populated', ovr.degraded_states.length >= 1);
check('recovery actions in overview', ovr.recovery_actions.total_recorded === 2);

// 6. healthy overview
console.log('Scenario: fully healthy overview');
const TMP2 = path.join(os.tmpdir(), `mc_reliability_clean_${process.pid}_${Date.now()}.json`);
const ovrClean = rel.reliabilityOverview({
    system: { api: { status: 'ok' }, worker: { status: 'ok' }, telegramBot: { polling: true } },
    counts: { QUEUED: 0, RUNNING: 0, RETRY: 0, DEAD_LETTER: 0 },
    sources: { items: [{ source_id: 's1', errors: 0 }] },
    channels: { items: [{ channel: 'email', quarantine_count: 0 }] },
    store: { remediations: [], incidents: [] },
});
check('clean → HEALTHY', ovrClean.overall_health === 'HEALTHY');
check('clean → no degraded states', ovrClean.degraded_states.length === 0);

// 7. honest UNKNOWN when nothing observable
console.log('Scenario: nothing observable → UNKNOWN');
const ovrBlind = rel.reliabilityOverview({ system: {}, counts: null, sources: null, channels: null, store: {} });
check('blind overview → UNKNOWN', ovrBlind.overall_health === 'UNKNOWN');

// 8. no-send invariant
console.log('Scenario: no-send invariant');
check('reliability performs no remediation', ovr.performs_remediation === false);
check('reliability sends nothing', ovr.sends === false);
check('outbound off label', ovr.outbound_ru.includes('no-send'));
const relSrc = fs.readFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\//, ''), '..', 'mater_controller_api', 'src', 'owner_center', 'reliability.mjs'), 'utf8');
check('no nodemailer/smtp import in reliability', !/nodemailer|createTransport|tls\.connect/i.test(relSrc));
check('reliability does not write store', !/updateStoreWithRevision|writeFileSync|appendFileSync/.test(relSrc));

// cleanup
try { for (const f of fs.readdirSync(os.tmpdir())) { if (f.startsWith('mc_reliability_')) { try { fs.unlinkSync(path.join(os.tmpdir(), f)); } catch {} } } } catch {}
void TMP2;

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failed > 0) { console.log('FAILURES:', fails.join(', ')); process.exit(1); }
process.exit(0);
