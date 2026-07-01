// promote.mjs — API-ONLY promotion to Master Controller. Lead Hunter NEVER writes canonical
// production JSON. A promotion turns an approved Lead Hunter candidate into a Master Controller
// lead via the existing /leads/stage API only, with idempotency + audit event + dry-run.
import crypto from 'node:crypto';

// Build the Master Controller promotion payload from a Lead Hunter candidate (approved).
// Targets POST /lead-intelligence/promote (the single API-only promotion path).
export function buildPromotionPayload(candidate) {
    return {
        candidate_id: 'lh_' + (candidate.id || crypto.randomBytes(5).toString('hex')),
        source: candidate.source || 'lead_hunter',
        source_url: candidate.ref || null,
        source_records: candidate.source_record_id ? [candidate.source_record_id] : [],
        normalized_company: candidate.company,
        region: candidate.region || null,
        industry: candidate.category || candidate.industry || null,
        address: candidate.address || null,
        website_candidates: [candidate.website, ...(candidate.websites || [])].filter(Boolean),
        contact_candidates: [...(candidate.phones || []), ...(candidate.emails || [])],
        provenance: candidate.evidence || [],
        candidate_classification: candidate.lead_route || candidate.candidate_classification || null,
        candidate_score: candidate.score?.overall_priority_score ?? candidate.candidate_score ?? null,
        candidate_score_version: candidate.score?.score_version || 'score_v2',
        dedupe_keys: candidate.dedupe_keys || [],
        evidence_refs: candidate.evidence || [],
        risk_flags: candidate.score?.blockers || [],
        operation_id: `lh-promote-${candidate.id}`,
        idempotency_key: `lh-promote-${candidate.id}`,
        correlation_id: candidate.correlation_id || candidate.id || null,
    };
}

// Pre-promotion guards (pure): only an explicitly approved candidate may promote.
export function promotionBlockers(candidate) {
    const b = [];
    if (!candidate) return ['NO_CANDIDATE'];
    if (candidate.state !== 'PROMOTION_APPROVED') b.push('NOT_APPROVED');
    if (!candidate.company) b.push('NO_COMPANY');
    if (candidate.opt_out) b.push('OPT_OUT');
    return b;
}

// Promote via an injected API client (so it's fully testable offline with a mock).
// apiClient.post(path, body) -> { status, data }. NEVER touches the filesystem.
// dryRun=true returns the payload + would-be call without invoking the API.
export async function promote(candidate, { apiClient, dryRun = true } = {}) {
    const blockers = promotionBlockers(candidate);
    if (blockers.length) return { ok: false, code: 'PROMOTION_BLOCKED', blockers };
    const payload = buildPromotionPayload(candidate);
    if (dryRun) return { ok: true, dryRun: true, wouldCall: 'POST /lead-intelligence/promote', payload };
    if (!apiClient) return { ok: false, code: 'NO_API_CLIENT' };
    const res = await apiClient.post('/lead-intelligence/promote', payload);
    if (res.status === 200 && res.data?.data?.ok) {
        const d = res.data.data;
        return {
            ok: true, dryRun: false, promoted: d.promotion_result === 'CREATED',
            duplicate: d.promotion_result === 'DUPLICATE_BLOCKED', promotion_result: d.promotion_result,
            masterLeadId: d.canonical_lead_id, revision: d.canonical_revision ?? null,
            auditEvent: { type: 'promotion', candidate_id: candidate.id, master_lead_id: d.canonical_lead_id, result: d.promotion_result, at: new Date().toISOString() },
        };
    }
    if (res.status === 409) return { ok: false, code: 'REVISION_CONFLICT', detail: res.data?.error || null };
    if (res.status === 503) return { ok: false, code: 'MASTER_READ_ONLY_OR_MAINTENANCE' };
    return { ok: false, code: 'PROMOTION_FAILED', status: res.status, detail: res.data?.error || null };
}
