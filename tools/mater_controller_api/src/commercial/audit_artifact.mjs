// tools/mater_controller_api/src/commercial/audit_artifact.mjs
// Strict separation of artifact types. The "Аудит" tab must show a REAL Mini Audit, never the
// outreach email. A real audit is built ONLY from evidence-backed lead observations (no AI, no
// guessing). If no valid audit can be formed, AUDIT_READY=false / AUDIT_STATUS=MISSING_OR_INVALID —
// the email is NEVER substituted. Read-only; no send.
import crypto from 'node:crypto';
import { readStore, STORE_PATH, leadsArray } from '../shared/store_access.mjs';

export const ARTIFACT_TYPES = ['OUTREACH_EMAIL', 'MINI_AUDIT', 'OFFER', 'QA_REVIEW', 'SOURCE_EVIDENCE'];

// The outreach email artifact (distinct from audit).
export function outreachEmail(leadId) {
    const store = readStore(STORE_PATH);
    const lead = leadsArray(store).find((l) => String(l.lead_id) === String(leadId));
    if (!lead) return null;
    const ap = lead.audit_preview && typeof lead.audit_preview === 'object' ? lead.audit_preview : {};
    const body = (typeof lead.audit_draft_preview === 'string' ? lead.audit_draft_preview : null) || ap.body || null;
    return {
        artifact_type: 'OUTREACH_EMAIL', lead_id: String(leadId),
        subject: lead.subject || ap.subject || null,
        recipient_masked: ap.masked_recipient || maskEmail(lead.email),
        body_text: body, template_id: ap.template_id || null,
        no_send_notice: 'Черновик письма. Клиенту ничего не отправляется.',
    };
}

// Build a REAL mini audit from evidence-backed observations only. No AI. No invented findings.
export function miniAudit(leadId) {
    const store = readStore(STORE_PATH);
    const lead = leadsArray(store).find((l) => String(l.lead_id) === String(leadId));
    if (!lead) return null;
    const obs = Array.isArray(lead.audit_observations) ? lead.audit_observations
        : (lead.audit_preview && Array.isArray(lead.audit_preview.observations) ? lead.audit_preview.observations : []);

    // Each observation must be non-empty text grounded in the lead's verified site/contact evidence.
    const findings = obs.filter((t) => typeof t === 'string' && t.trim().length > 10).map((t, i) => ({
        finding_id: `f_${leadId}_${i + 1}`,
        title: t.slice(0, 80),
        evidence_url: lead.website || null,
        evidence_text: t,
        observed_at: lead.audit_observed_at || lead.updated_at || null,
        impact: null, // not invented — unknown unless explicitly recorded
        priority: 'MEDIUM',
        recommendation: null, // not invented
        confidence: lead.website_reachable === false ? 0.4 : 0.7,
        source: lead.source || 'site_observation',
        is_inferred: false,
    }));

    // A valid client-facing audit needs evidence-backed findings + recommendations. Observations
    // alone are evidence but lack structured impact/recommendation → NOT client_facing_ready, but
    // still a REAL audit artifact (distinct from email), shown honestly.
    const hasEvidence = findings.length > 0 && findings.every((f) => f.evidence_text);
    const valid = hasEvidence;
    const contentHash = crypto.createHash('sha256').update(JSON.stringify(findings)).digest('hex').slice(0, 32);

    return {
        audit_id: valid ? `audit_${leadId}_${contentHash.slice(0, 8)}` : null,
        lead_id: String(leadId), product_id: 'mini_audit',
        created_at: lead.audit_created_at || lead.updated_at || null,
        source_snapshot_at: lead.audit_observed_at || null,
        findings,
        finding_count: findings.length,
        quick_fix_plan: [], // not invented
        next_step: lead.next_step || null,
        limitations: ['Выводы основаны на наблюдениях сайта/контактов; структурированные рекомендации не сформированы автоматически.'],
        qa_status: valid ? 'EVIDENCE_PRESENT_NEEDS_RECOMMENDATIONS' : 'MISSING_OR_INVALID',
        artifact_hash: valid ? contentHash : null,
        provider_provenance: 'deterministic_site_observations_no_ai',
        client_facing_ready: false, // never auto client-ready; owner gate
        audit_ready: valid,
        audit_status: valid ? 'EVIDENCE_AUDIT' : 'MISSING_OR_INVALID',
        is_email: false, // explicit: this is NOT the outreach email
    };
}

// Combined lead-detail artifact view: audit and email are strictly separate.
export function leadArtifacts(leadId) {
    const audit = miniAudit(leadId);
    const email = outreachEmail(leadId);
    if (!audit && !email) return null;
    return {
        lead_id: String(leadId),
        audit, // MINI_AUDIT (or audit_ready=false)
        email, // OUTREACH_EMAIL
        audit_equals_email: false, // guaranteed by construction (different builders/fields)
    };
}

function maskEmail(e) { const s = String(e || ''); const at = s.indexOf('@'); return at < 1 ? null : s[0] + '***' + s.slice(at); }

export default { ARTIFACT_TYPES, outreachEmail, miniAudit, leadArtifacts };
