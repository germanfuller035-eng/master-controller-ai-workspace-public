// owner_center/chief_ops.mjs
// ============================================================
// Chief Operations Agent + Daily Command Brief (0.8.0) — deterministic.
// ------------------------------------------------------------
// Reads the owner-center store + a supplied pipeline/funnel snapshot and produces
// the four owner answers (what happened / how important / what the system already
// did / what decision is needed), plus the primary constraint and <=3 next actions.
//
// HARD INVARIANTS: read-only aggregation. NEVER writes canonical, NEVER sends,
// NEVER opens a gate, NEVER changes price/policy. AI is optional — absent provider
// => DETERMINISTIC_ONLY. The agent may only CREATE OwnerDecisions / events via the
// owner_center service (which itself never performs outbound).
import {
    listEvents, listIncidents, listDecisions, eventsSummary, incidentsSummary,
    getAutopilot, leadNextBestAction,
} from './service.mjs';

export const CHIEF_OPS_VERSION = 'chief_ops_v1';
// AI is optional; we default to deterministic. A provider can be injected later.
export function agentMode() {
    return process.env.OWNER_CENTER_AI === 'enabled' ? 'AI_ASSISTED' : 'DETERMINISTIC_ONLY';
}

// Specialist agent contracts — read scope only, structured recommendation, no writes.
export const SPECIALIST_AGENTS = Object.freeze([
    'LeadQualityAgent', 'ContactIntelligenceAgent', 'AuditAgent', 'FirstTouchStrategist',
    'CampaignStrategist', 'ReplyAgent', 'ReliabilityAgent', 'CostGovernorAgent',
    'SecurityPolicyAgent', 'KnowledgeRadarAgent',
]);
export function agentsStatus() {
    return {
        chief: 'ChiefOperationsAgent',
        mode: agentMode(),
        specialists: SPECIALIST_AGENTS.map((name) => ({ name, scope: 'read_only', writes_canonical: false, sends: false, changes_policy: false })),
        constraints: ['no_canonical_write', 'no_send', 'no_gate_open', 'no_suppression_lift', 'no_price_change', 'no_paid_source_enable', 'no_delete'],
    };
}

// Determine the system's single primary constraint (deterministic priority order).
// snapshot: { pipeline: {STAGING, verified_ready, ...}, ownerQueue: n, ownerQueueLimit: n,
//             costMonthPct: 0..100, services: {api,worker,scheduler,...}, backupAgeHours: n }
export function primaryConstraint(snapshot = {}, store = {}, includeTest = false) {
    // DEF-V3-001: exclude test_only records by default — they must never surface in a real owner's
    // brief. includeTest=true (debug app only) re-includes them for acceptance fixture visibility.
    const inc = (store.incidents || []).filter((i) => (includeTest || !i.test_only) && !['RESOLVED', 'MUTED'].includes(i.state));
    const p0 = inc.find((i) => i.severity === 'P0');
    if (p0) return { kind: 'P0_INCIDENT', text_ru: `Критический инцидент: ${p0.title_ru}`, deep_link: `/incidents/${p0.incident_id}` };
    if (snapshot.services && (snapshot.services.api === 'FAILED' || snapshot.services.worker === 'FAILED')) {
        return { kind: 'SERVICE_DOWN', text_ru: 'Недоступен ключевой сервис', deep_link: '/reliability' };
    }
    if (Number(snapshot.costMonthPct) >= 100) return { kind: 'COST_LIMIT', text_ru: 'Достигнут месячный лимит расходов — платные источники на паузе', deep_link: '/costs' };
    if (snapshot.ownerQueueLimit && Number(snapshot.ownerQueue) >= Number(snapshot.ownerQueueLimit)) {
        return { kind: 'OWNER_QUEUE_FULL', text_ru: 'Очередь решений владельца заполнена — новые пакеты на паузе', deep_link: '/owner-decisions' };
    }
    if (Number(snapshot.costMonthPct) >= 80) return { kind: 'COST_WARNING', text_ru: 'Расходы достигли 80% месячного лимита', deep_link: '/costs' };
    const openDec = (store.decisions || []).filter((d) => (includeTest || !d.test_only) && d.status === 'OPEN');
    if (openDec.length) return { kind: 'DECISIONS_PENDING', text_ru: `Ожидают решения владельца: ${openDec.length}`, deep_link: '/owner-decisions' };
    // pipeline bottleneck: where do leads pile up?
    const p = snapshot.pipeline || {};
    if ((p.verified_ready || 0) > 0 && (p.audit_ready || 0) === 0) return { kind: 'AUDIT_BACKLOG', text_ru: 'Лиды готовы к аудиту', deep_link: '/leads' };
    return { kind: 'NONE', text_ru: 'Критических ограничений нет — система работает в штатном режиме', deep_link: '/' };
}

// Assemble the Daily Command Brief (P3). Deterministic, read-only.
// funnel: per-day counts; snapshot: live system state.
export function buildCommandBrief({ funnel = {}, snapshot = {}, store = {}, kind = 'morning', includeTest = false } = {}) {
    const evSum = eventsSummary({});
    const incSum = incidentsSummary({});
    const openDec = listDecisions({ status: 'OPEN' }).items;
    // DEF-V3-001: exclude test_only remediations from a real owner's brief (same canonical marker
    // as incidents/decisions). includeTest=true (debug app only) re-includes acceptance fixtures.
    const recoveries = (store.remediations || []).filter((r) => (includeTest || !r.test_only) && (r.result === 'recovered' || r.result === 'success')).length;
    const constraint = primaryConstraint(snapshot, store, includeTest);
    const ap = getAutopilot();

    const ownerActions = openDec
        .filter((d) => ['P0', 'P1'].includes(d.priority))
        .slice(0, 3)
        .map((d) => ({ decision_id: d.decision_id, title_ru: d.title_ru, priority: d.priority, deep_link: `/owner-decisions/${d.decision_id}` }));

    return {
        brief_version: CHIEF_OPS_VERSION,
        kind, // 'morning' | 'evening' | 'weekly'
        generated_at_note: 'stamp at delivery time',
        system_state_ru: incSum.p0 > 0 ? 'Требует внимания' : (incSum.active > 0 ? 'Есть незначительные инциденты' : 'Штатный режим'),
        autopilot_mode: ap.mode,
        outbound_ru: 'Исходящие отключены (no-send)',
        funnel: {
            leads_24h: Number(funnel.leads_24h || 0),
            verified_companies: Number(funnel.verified_companies || 0),
            contacts_found: Number(funnel.contacts_found || 0),
            audits_ready: Number(funnel.audits_ready || 0),
            first_touch_ready: Number(funnel.first_touch_ready || 0),
            replies: Number(funnel.replies || 0),
            positive_replies: Number(funnel.positive_replies || 0),
        },
        incidents: { active: incSum.active, p0: incSum.p0 },
        automatic_recoveries: recoveries,
        events_by_severity: evSum.by_severity,
        cost: { month_pct: Number(snapshot.costMonthPct || 0) },
        primary_constraint: constraint,
        owner_actions: ownerActions, // <= 3
        recommendation_ru: ownerActions.length
            ? `Рассмотрите ${ownerActions.length} решени${ownerActions.length === 1 ? 'е' : 'я'} в порядке приоритета`
            : (constraint.kind === 'NONE' ? 'Действий не требуется — система работает автономно' : `Главное: ${constraint.text_ru}`),
        owner_action_required: ownerActions.length > 0 || incSum.p0 > 0,
    };
}

// The four owner answers for the main screen (deterministic synthesis).
export function ownerSnapshot({ funnel = {}, snapshot = {}, store = {}, includeTest = false } = {}) {
    const recentEvents = listEvents({ limit: 5, includeTest }).items;
    const incidents = listIncidents({ activeOnly: true, includeTest }).items;
    const constraint = primaryConstraint(snapshot, store, includeTest);
    // DEF-V3-001: test_only remediations must not surface as automatic_actions in a real owner's view.
    const recoveries = (store.remediations || []).filter((r) => (includeTest || !r.test_only) && (r.result === 'recovered' || r.result === 'success'));
    const openDec = listDecisions({ status: 'OPEN', includeTest }).items.filter((d) => ['P0', 'P1'].includes(d.priority)).slice(0, 3);
    return {
        // 1. what happened
        recent_events: recentEvents.map((e) => ({ severity: e.severity, title_ru: e.title_ru, deep_link: e.deep_link })),
        // 2. how important
        system_state_ru: incidents.some((i) => i.severity === 'P0') ? 'Требует внимания' : (incidents.length ? 'Незначительные инциденты' : 'Штатный режим'),
        primary_constraint: constraint,
        // 3. what the system already did
        automatic_actions: recoveries.slice(-5).map((r) => ({ playbook: r.playbook, result: r.result, at: r.at })),
        // 4. what decision is needed
        owner_decisions: openDec.map((d) => ({ decision_id: d.decision_id, title_ru: d.title_ru, priority: d.priority })),
        critical_incidents: incidents.filter((i) => i.severity === 'P0').map((i) => ({ incident_id: i.incident_id, title_ru: i.title_ru })),
    };
}

export default { CHIEF_OPS_VERSION, agentMode, agentsStatus, SPECIALIST_AGENTS, primaryConstraint, buildCommandBrief, ownerSnapshot };
