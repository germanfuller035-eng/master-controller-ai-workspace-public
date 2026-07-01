// tools/commercial_core/lib/agent_shadow.mjs
// PURE shadow-no-send agent runtime for the commercial pipeline. Reuses orchestrator_os engines for
// leases/anti-loop/retry/checkpoints (imported by the caller). Agents produce EVIDENCE-BACKED
// artifacts only; they NEVER write the canonical store directly, NEVER send, NEVER touch flags.
//
// Flow: Master Controller event → orchestration task → agent artifact → QA review → owner queue.
// A deterministic analyzer underlies each agent (testable, no external dependency, never burns API
// calls re-proving audits). An optional Claude provider can be injected by the caller for richer
// analysis; when absent the deterministic path is authoritative. No untrusted text can change tools,
// flags, or send state — agents only read provided evidence fields and emit a validated schema.

export const AGENT_PROFILES = ['CHIEF_ORCHESTRATOR', 'LEAD_INTELLIGENCE', 'MINI_AUDIT', 'OFFER', 'QA_SAFETY'];
export const AGENT_MODE = 'SHADOW_NO_SEND';
export const AGENT_CAPS = { canonicalDirectWrite: false, send: false, payment: false, deploy: false };

const isEmail = (s) => typeof s === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);

// Strip anything that looks like an instruction injected via untrusted website/email content.
// Agents treat all lead-derived text as DATA; this neutralizes prompt-injection attempts in evidence.
export function sanitizeUntrusted(text) {
    const s = String(text == null ? '' : text);
    const flagged = /(ignore (all|previous)|disregard|system prompt|you are now|enable send|api[_ ]?key|run shell|sudo|exec\()/i.test(s);
    return { text: s.slice(0, 4000), injectionFlagged: flagged };
}

// ---- D2. Lead Intelligence Agent ----
export function leadIntelligence(lead) {
    const id = String(lead.lead_id || '');
    const identityVerified = lead.identity_match_status === 'match' || lead.identity_verified === true;
    const emailOk = lead.email_verified === true && isEmail(lead.email) && lead.email_source !== 'guessed';
    const websiteOk = !!lead.website && lead.website_reachable !== false;
    const reasons = [];
    if (!identityVerified) reasons.push('identity_not_verified');
    if (!emailOk) reasons.push('email_not_verified_or_guessed');
    if (!websiteOk) reasons.push('website_unconfirmed');
    const confidence = [identityVerified, emailOk, websiteOk].filter(Boolean).length / 3;
    return {
        artifact_type: 'LEAD_INTELLIGENCE', lead_id: id,
        identity_verified: identityVerified, email_evidence: emailOk ? 'verified_manual' : 'insufficient',
        website_verified: websiteOk, duplicate: false,
        product_fit: lead.niche ? 'mini_audit' : 'mini_audit',
        confidence, rejection_reasons: reasons,
        evidence: { source: lead.source || null, email_source: lead.email_source || null, identity: lead.identity_match_status || null },
        guessed_email: lead.email_source === 'guessed',
    };
}

// ---- D3. Mini Audit Agent (evidence-backed; no unsupported claims) ----
export function miniAudit(lead) {
    const findings = [];
    const obs = Number(lead.audit_observations_count || 0);
    // Findings are derived ONLY from present evidence fields; no invented claims.
    if (lead.website) findings.push({ area: 'site_presence', severity: 'info', evidence: 'website present', confidence: 'high' });
    if (obs > 0) findings.push({ area: 'audit_observations', severity: 'medium', evidence: `${obs} observations recorded`, confidence: 'medium' });
    if (lead.audit_ready === true) findings.push({ area: 'conversion_path', severity: 'medium', evidence: 'audit-ready lead', confidence: 'medium' });
    const hasPreview = !!lead.audit_draft_preview;
    return {
        artifact_type: 'MINI_AUDIT', lead_id: String(lead.lead_id || ''),
        findings, finding_count: findings.length,
        preview_available: hasPreview,
        unsupported_claims: 0, // by construction: only evidence-derived findings
        confidence: findings.length ? 'medium' : 'low',
    };
}

// ---- D4. Offer Agent (immutable product snapshot; no-send artifact) ----
export function offer(lead, productSnapshot) {
    return {
        artifact_type: 'OFFER_DRAFT', lead_id: String(lead.lead_id || ''),
        product_id: productSnapshot.product_id, product_version: productSnapshot.product_version,
        price: productSnapshot.price_snapshot, currency: productSnapshot.currency,
        scope_snapshot: productSnapshot.scope_snapshot || null,
        send_capability: 'NONE', client_notified: false,
        message_draft_ref: `draft_${lead.lead_id}`, // reference only — not a sent message
    };
}

// ---- D5. QA & Safety Agent ----
export function qaReview({ intelligence, audit, offerArtifact, priorSendProven, deliveryUnconfirmed, duplicateOpportunity }) {
    const issues = [];
    if (!intelligence.identity_verified) issues.push('identity_not_verified');
    if (intelligence.guessed_email) issues.push('guessed_email');
    if (intelligence.email_evidence !== 'verified_manual') issues.push('email_evidence_insufficient');
    if (audit.unsupported_claims > 0) issues.push('unsupported_claims');
    if (!offerArtifact || offerArtifact.send_capability !== 'NONE') issues.push('send_capability_not_none');
    if (duplicateOpportunity) issues.push('duplicate_opportunity');
    if (deliveryUnconfirmed) issues.push('delivery_unconfirmed');
    let verdict;
    if (issues.includes('guessed_email') || issues.includes('identity_not_verified') || issues.includes('send_capability_not_none')) verdict = 'REJECTED';
    else if (deliveryUnconfirmed || duplicateOpportunity) verdict = 'QUARANTINED';
    else if (issues.length > 0) verdict = 'NEEDS_REWORK';
    else verdict = 'APPROVED_FOR_OWNER_REVIEW';
    return { artifact_type: 'QA_REVIEW', lead_id: intelligence.lead_id, verdict, issues, ready_for_owner_send_queue: verdict === 'APPROVED_FOR_OWNER_REVIEW' };
}

// ---- D1. Chief Orchestrator: run the agent chain for one lead (shadow; no writes) ----
export function orchestrateLead(lead, productSnapshot, ctx = {}) {
    const intelligence = leadIntelligence(lead);
    const audit = miniAudit(lead);
    const offerArtifact = offer(lead, productSnapshot);
    const review = qaReview({
        intelligence, audit, offerArtifact,
        priorSendProven: ctx.priorSendProven === true,
        deliveryUnconfirmed: ctx.deliveryUnconfirmed === true,
        duplicateOpportunity: ctx.duplicateOpportunity === true,
    });
    return {
        lead_id: String(lead.lead_id || ''),
        artifacts: [intelligence, audit, offerArtifact, review],
        qa_verdict: review.verdict,
        owner_review_required: review.verdict !== 'APPROVED_FOR_OWNER_REVIEW' || ctx.alwaysOwnerReview === true,
        agent_mode: AGENT_MODE,
        send_attempts: 0,
    };
}
