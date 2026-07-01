// tools/commercial_core/lib/events.mjs
// Commercial event envelope (Integration Event Standard aligned). Separates FACT_EVENT (a committed
// mutation) from RECOMMENDATION_EVENT (a proposal — never looks like a done operation) and
// COMMAND_RESULT. Deterministic ids (no Date.now/random) so tests replay.
import crypto from 'node:crypto';

export const EVENT_TYPES = [
    'opportunity.created', 'opportunity.stage_changed', 'offer.prepared',
    'offer.owner_decision_recorded', 'deal.won', 'deal.lost',
    'delivery_handoff.created', 'project.created',
    'invoice.created', 'payment.evidence_recorded', 'payment.confirmed', 'profitability.updated',
];

export const EVENT_KIND = { FACT: 'FACT_EVENT', RECOMMENDATION: 'RECOMMENDATION_EVENT', COMMAND_RESULT: 'COMMAND_RESULT' };

export function buildEvent({ type, kind = EVENT_KIND.FACT, subjectType, subjectId, actor = 'commercial_core', at, correlationId = null, causationId = null, revision = null, classification = 'FACT', evidence = {}, payload = {} }) {
    if (!EVENT_TYPES.includes(type)) throw new Error(`UNKNOWN_EVENT_TYPE:${type}`);
    const body = { type, subjectType, subjectId, at, payload };
    const eventId = 'evt_' + crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16);
    return {
        event_id: eventId, event_type: type, event_version: 1, event_kind: kind,
        occurred_at: at, recorded_at: at, actor, source_system: 'commercial_core',
        subject_type: subjectType, subject_id: subjectId,
        correlation_id: correlationId, causation_id: causationId,
        revision, classification, evidence, payload,
    };
}
