// owner_center/reliability.mjs
// ============================================================
// Reliability Center (0.8.0) — deterministic, read-only aggregator.
// ------------------------------------------------------------
// Answers the owner's reliability questions in one place:
//   - health: are the core services up / degraded / down?
//   - incidents: what is currently open (from the owner-center incident engine)?
//   - retries / dead letters: is the job queue healthy or backing up?
//   - degraded states: which subsystems are partially impaired (and why)?
//   - recovery actions: what did auto-remediation already do (recorded, never sent)?
//
// HARD INVARIANTS:
//   - PURE read-model. Takes a live snapshot + the owner-center store and computes
//     a deterministic verdict. It NEVER writes, NEVER sends, NEVER opens a gate,
//     NEVER performs a remediation itself (it only REPORTS recorded ones).
//   - Owner-facing text is Russian; raw codes live in metadata.
//   - Honest UNKNOWN: a metric that is genuinely unavailable is surfaced as
//     'UNKNOWN', never coerced to a false 0.

export const RELIABILITY_VERSION = 'reliability_v1';

// Health verdicts in worsening order (used to fold many signals into one).
export const HEALTH_LEVELS = Object.freeze(['HEALTHY', 'DEGRADED', 'DOWN', 'UNKNOWN']);
function worse(a, b) {
    const order = { HEALTHY: 0, DEGRADED: 1, DOWN: 2, UNKNOWN: 3 };
    return (order[b] ?? 3) > (order[a] ?? 3) ? b : a;
}

// Map a single service descriptor to a deterministic level + Russian label.
// svc: { status?: 'ok'|'FAILED'|'degraded', polling?: bool|null, lastBeat?: iso|null }
function serviceLevel(svc, { now = null } = {}) {
    if (!svc || typeof svc !== 'object') return { level: 'UNKNOWN', reason_ru: 'Нет данных о состоянии' };
    const raw = String(svc.status || '').toLowerCase();
    if (raw === 'failed' || raw === 'down') return { level: 'DOWN', reason_ru: 'Сервис недоступен' };
    if (raw === 'degraded') return { level: 'DEGRADED', reason_ru: 'Сервис работает с ограничениями' };
    if (svc.polling === false) return { level: 'DEGRADED', reason_ru: 'Опрос остановлен' };
    if (raw === 'ok' || svc.polling === true) return { level: 'HEALTHY', reason_ru: 'Штатный режим' };
    return { level: 'UNKNOWN', reason_ru: 'Нет данных о состоянии' };
}

// Build the per-service health board from a live system snapshot.
// system: shape of system.getSystemStatus() (api, telegramBot, smtpConfigured, ...)
export function serviceHealth(system = {}) {
    const services = [];
    if (system && system.api) services.push({ key: 'api', name_ru: 'API', ...serviceLevel({ status: system.api.status || 'ok' }) });
    else services.push({ key: 'api', name_ru: 'API', level: 'UNKNOWN', reason_ru: 'Нет данных о состоянии' });
    // worker health is inferred from queue liveness by the caller; default UNKNOWN if absent.
    if (system?.worker) services.push({ key: 'worker', name_ru: 'Воркер', ...serviceLevel(system.worker) });
    else services.push({ key: 'worker', name_ru: 'Воркер', level: 'UNKNOWN', reason_ru: 'Нет данных о воркере' });
    if (system?.telegramBot) {
        const tb = system.telegramBot;
        const lvl = tb.polling === true ? { level: 'HEALTHY', reason_ru: 'Опрос активен' }
            : tb.polling === false ? { level: 'DEGRADED', reason_ru: 'Опрос остановлен' }
                : { level: 'UNKNOWN', reason_ru: 'Нет heartbeat' };
        services.push({ key: 'telegram_bot', name_ru: 'Telegram-бот', ...lvl });
    }
    return services;
}

// Queue / retry / dead-letter view from jobs.counts() + a dead-letter sample.
// counts: { QUEUED, RUNNING, RETRY, DEAD_LETTER, BLOCKED_APPROVAL, COMPLETED, ... }
// deadLetters: optional array of {job_id, job_type, last_error_code, updated_at}
export function queueHealth(counts = null, deadLetters = null) {
    if (!counts || typeof counts !== 'object') {
        return { available: false, level: 'UNKNOWN', reason_ru: 'Очередь недоступна',
            queued: 'UNKNOWN', running: 'UNKNOWN', retry: 'UNKNOWN', dead_letter: 'UNKNOWN', blocked_approval: 'UNKNOWN' };
    }
    const n = (k) => Number(counts[k] || 0);
    const dead = n('DEAD_LETTER');
    const retry = n('RETRY');
    let level = 'HEALTHY', reason_ru = 'Очередь в норме';
    if (dead > 0) { level = 'DEGRADED'; reason_ru = `Есть необработанные задачи (dead-letter): ${dead}`; }
    if (dead >= 10) { level = 'DOWN'; reason_ru = `Много необработанных задач (dead-letter): ${dead}`; }
    else if (retry >= 20) { level = worse(level, 'DEGRADED'); reason_ru = `Высокий уровень повторов: ${retry}`; }
    return {
        available: true, level, reason_ru,
        queued: n('QUEUED'), running: n('RUNNING'), retry, dead_letter: dead,
        blocked_approval: n('BLOCKED_APPROVAL'), completed: n('COMPLETED'),
        dead_letter_sample: Array.isArray(deadLetters)
            ? deadLetters.slice(0, 10).map((j) => ({ job_id: j.job_id, job_type: j.job_type, last_error_code: j.last_error_code || null, updated_at: j.updated_at || null }))
            : [],
    };
}

// Source/channel ingest health → DEGRADED if any source reported errors.
export function ingestHealth(sources = null, channels = null) {
    const out = { sources: { available: false, level: 'UNKNOWN', with_errors: 'UNKNOWN' }, channels: { available: false, level: 'UNKNOWN', quarantined: 'UNKNOWN' } };
    if (sources && Array.isArray(sources.items)) {
        const withErr = sources.items.filter((s) => Number(s.errors || 0) > 0).length;
        out.sources = { available: true, level: withErr > 0 ? 'DEGRADED' : 'HEALTHY', total: sources.items.length, with_errors: withErr,
            reason_ru: withErr > 0 ? `Источников с ошибками: ${withErr}` : 'Все источники без ошибок' };
    }
    if (channels && Array.isArray(channels.items)) {
        const q = channels.items.reduce((s, c) => s + Number(c.quarantine_count || 0), 0);
        out.channels = { available: true, level: q > 0 ? 'DEGRADED' : 'HEALTHY', total: channels.items.length, quarantined: q,
            reason_ru: q > 0 ? `Сообщений в карантине: ${q}` : 'Каналы в норме' };
    }
    return out;
}

// Recovery actions actually recorded by auto-remediation (REPORTED, never executed here).
export function recoveryActions(store = {}) {
    const rems = Array.isArray(store.remediations) ? store.remediations : [];
    const recent = rems.slice(-20).reverse();
    const recovered = rems.filter((r) => r.result === 'recovered' || r.result === 'success').length;
    return {
        total_recorded: rems.length,
        recovered,
        pending: rems.filter((r) => r.result === 'pending').length,
        failed: rems.filter((r) => r.result === 'failed').length,
        items: recent.map((r) => ({ playbook: r.playbook, trigger: r.trigger || null, result: r.result, at: r.at, test_only: !!r.test_only })),
    };
}

// Fold everything into the single Reliability overview the owner screen renders.
// snapshot: { system, counts, deadLetters, sources, channels }
export function reliabilityOverview({ system = {}, counts = null, deadLetters = null, sources = null, channels = null, store = {} } = {}) {
    const services = serviceHealth(system);
    const queue = queueHealth(counts, deadLetters);
    const ingest = ingestHealth(sources, channels);
    // Incidents are read from the passed store (PURE — no global file read here).
    const allIncidents = Array.isArray(store.incidents) ? store.incidents : [];
    const incidents = allIncidents.filter((i) => !['RESOLVED', 'MUTED'].includes(i.state));
    const incSum = { active: incidents.length, p0: incidents.filter((i) => i.severity === 'P0').length };
    const recovery = recoveryActions(store);

    // Overall health = worst of all observed signals (UNKNOWN never masks a real DOWN/DEGRADED).
    let overall = 'HEALTHY';
    for (const s of services) if (s.level !== 'UNKNOWN') overall = worse(overall, s.level);
    if (queue.available) overall = worse(overall, queue.level);
    if (ingest.sources.available) overall = worse(overall, ingest.sources.level);
    if (ingest.channels.available) overall = worse(overall, ingest.channels.level);
    if (incSum.p0 > 0) overall = worse(overall, 'DOWN');
    else if (incSum.active > 0) overall = worse(overall, 'DEGRADED');
    // If nothing was observable at all, the verdict is honestly UNKNOWN.
    const anyObservable = services.some((s) => s.level !== 'UNKNOWN') || queue.available || ingest.sources.available || ingest.channels.available;
    if (!anyObservable) overall = 'UNKNOWN';

    // Degraded states list (human-readable, deterministic).
    const degraded = [];
    for (const s of services) if (s.level === 'DEGRADED' || s.level === 'DOWN') degraded.push({ subsystem: s.key, level: s.level, reason_ru: s.reason_ru });
    if (queue.available && (queue.level === 'DEGRADED' || queue.level === 'DOWN')) degraded.push({ subsystem: 'queue', level: queue.level, reason_ru: queue.reason_ru });
    if (ingest.sources.available && ingest.sources.level !== 'HEALTHY') degraded.push({ subsystem: 'sources', level: ingest.sources.level, reason_ru: ingest.sources.reason_ru });
    if (ingest.channels.available && ingest.channels.level !== 'HEALTHY') degraded.push({ subsystem: 'channels', level: ingest.channels.level, reason_ru: ingest.channels.reason_ru });
    for (const i of incidents) degraded.push({ subsystem: 'incident', level: i.severity === 'P0' ? 'DOWN' : 'DEGRADED', reason_ru: i.title_ru, incident_id: i.incident_id });

    const stateRu = overall === 'DOWN' ? 'Требует внимания' : overall === 'DEGRADED' ? 'Работает с ограничениями' : overall === 'UNKNOWN' ? 'Состояние неизвестно' : 'Штатный режим';
    return {
        reliability_version: RELIABILITY_VERSION,
        overall_health: overall,
        state_ru: stateRu,
        services,
        queue,
        ingest,
        incidents: {
            active: incSum.active, p0: incSum.p0,
            items: incidents.slice(0, 20).map((i) => ({ incident_id: i.incident_id, severity: i.severity, title_ru: i.title_ru, state: i.state, event_count: i.event_count, last_seen: i.last_seen })),
        },
        recovery_actions: recovery,
        degraded_states: degraded,
        // No-send posture, surfaced read-only so the UI can always prove it.
        outbound_ru: 'Исходящие отключены (no-send)',
        performs_remediation: false,
        sends: false,
    };
}

export default { RELIABILITY_VERSION, HEALTH_LEVELS, serviceHealth, queueHealth, ingestHealth, recoveryActions, reliabilityOverview };
