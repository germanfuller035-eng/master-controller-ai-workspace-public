// tools/mater_controller_api/src/commercial/first_touch_service.mjs
// First Touch Strategist API service. Wires canonical lead + audit + contact + commercial truth into
// the pure first_touch_engine, runs compliance + deliverability read models, scores all 62 leads, and
// selects pilot candidates. READ-ONLY by default; draft persistence (max 3) is a separate gated write
// in the routes layer. NEVER sends, NEVER mutates send ledger, NEVER sets sent/awaiting.
import { readStore, STORE_PATH, leadsArray } from '../shared/store_access.mjs';
import { SEND_LEDGER_PATH } from '../shared/config.mjs';
import fs from 'node:fs';
import auditArtifact from './audit_artifact.mjs';
import ownerTruth from './owner_commercial_truth.mjs';
import * as engine from '../../../commercial_core/lib/first_touch_engine.mjs';

function readLedger() {
    try {
        return fs.readFileSync(SEND_LEDGER_PATH, 'utf8').split(/\n+/).filter(Boolean)
            .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    } catch { return []; }
}
const isTestLead = (l) => l.test_only === true || /^TEST_ONLY|^INTERNAL_|^TEST_|_E2E$|^selftest|^(002|A|MA-1)$|VALIDATION_ONLY/i.test(String(l.lead_id || ''));

function historyGateExclusions(lead) {
    const exclude = [];
    if (lead.self_test_email === true || lead.self_test === true) exclude.push('NOT_A_REAL_LEAD');
    if (lead.outbound_history_checked !== true || lead.suppression_checked !== true
        || lead.duplicate_contact_checked !== true || lead.prior_reply_checked !== true) {
        exclude.push('NEEDS_OWNER_HISTORY_REVIEW');
    }
    if (lead.suppression_status === 'DO_NOT_CONTACT' || lead.do_not_contact === true) exclude.push('SUPPRESS_DO_NOT_CONTACT');
    if (lead.duplicate_contact === true || lead.duplicate_domain === true || lead.duplicate_of) exclude.push('SUPPRESSED_DUPLICATE_OR_NO_REPLY');
    if (lead.prior_reply_exists === true || lead.last_reply_at || lead.reply_status === 'replied') exclude.push('FOLLOW_UP_ONLY_EXISTING_THREAD');
    if (lead.follow_up_sent === true || Number(lead.follow_up_count || 0) > 0) exclude.push('FOLLOW_UP_SENT');
    if (lead.prior_outreach_exists === true && lead.no_reply_after_prior_outreach === true && lead.owner_recontact_approved !== true) {
        exclude.push('NEEDS_OWNER_OVERRIDE');
    }
    return [...new Set(exclude)];
}

// ---- compliance classifier (risk, not legal opinion) ----
function compliance(lead, ctx) {
    const src = String(lead.email_source || '').toLowerCase();
    const evidenced = !!lead.email && !!src && !/guess|unverified|inferred|assumed/.test(src);
    const priorSend = ctx.commercialSentLeadIds.has(String(lead.lead_id));
    const optOut = lead.opt_out === true || lead.unsubscribed === true;
    let gate = 'PASS';
    if (optOut) gate = 'BLOCKED_PRIOR_OPT_OUT';
    else if (priorSend) gate = 'BLOCKED_PRIOR_SEND';
    else if (!lead.email) gate = 'BLOCKED_CONTACT_UNVERIFIED';
    else if (!evidenced) gate = 'NEEDS_OWNER_REVIEW';
    return {
        public_business_contact: evidenced, prior_opt_out: optOut, prior_commercial_send: priorSend,
        jurisdiction_review: 'NOT_REQUIRED', tracking_pixel: false, attachment: false, external_link_count: 0,
        unsupported_claims: 0, guessed_data: evidenced ? 0 : (lead.email ? 1 : 0), gate_result: gate,
    };
}

// ---- deliverability readiness (read-only; no SMTP probe) ----
function deliverability(lead) {
    const email = lead.email || null;
    const syntaxOk = !!email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
    const domain = email ? email.split('@')[1] : null;
    const companyDomainMatch = !!domain && !!lead.website && String(lead.website).includes(domain.split('.')[0]);
    let status = 'READY_NO_SEND';
    if (!email) status = 'RECIPIENT_DOMAIN_INVALID';
    else if (!syntaxOk) status = 'RECIPIENT_DOMAIN_INVALID';
    else if (lead.bounce_suppressed === true) status = 'BLOCKED_SUPPRESSION';
    else if (String(lead.email_source || '').match(/guess|unverified/)) status = 'CONTACT_EVIDENCE_WEAK';
    return {
        sender_domain: 'configured (yandex)', spf: 'UNKNOWN_READ_ONLY', dkim: 'UNKNOWN_READ_ONLY', dmarc: 'UNKNOWN_READ_ONLY',
        recipient_syntax: syntaxOk, recipient_domain: domain, company_domain_match: companyDomainMatch,
        smtp_probing: false, suppression_history: lead.bounce_suppressed === true, status,
    };
}

// Build a full (no-send) first-touch artifact for a lead from existing audit evidence.
export function buildArtifact(leadId, { store, ctx, otherBodies = [] } = {}) {
    store = store || readStore(STORE_PATH);
    ctx = ctx || buildCtx(store);
    const lead = leadsArray(store).find((l) => String(l.lead_id) === String(leadId));
    if (!lead) return null;
    const audit = auditArtifact.miniAudit(leadId);
    const findings = audit && audit.findings ? audit.findings : [];
    const sel = engine.selectHook(findings, lead, lead.product_route || 'mini_audit');
    const subjects = engine.composeSubjects(lead.company || lead.company_name || leadId, sel.primary);
    const bodies = engine.composeBodies(lead.company || lead.company_name || leadId, sel.primary, sel.supporting);
    const maxSim = otherBodies.length ? Math.max(...otherBodies.map((b) => engine.similarity(bodies[0].text, b))) : 0;
    const recBody = bodies[0];
    const quality = engine.scoreQuality({
        hook: sel.primary, hookScore: sel.primary?.scored?.score || 0, body: recBody,
        contactEvidenced: !!lead.email && !/guess|unverified/.test(String(lead.email_source || '')),
        priorCommercialSend: ctx.commercialSentLeadIds.has(String(leadId)),
        priorOptOut: lead.opt_out === true, maxSimilarity: maxSim,
    });
    const comp = compliance(lead, ctx);
    const deliv = deliverability(lead);
    const core = {
        artifact_type: engine.ARTIFACT_TYPE, schema_version: engine.SCHEMA_VERSION, lead_id: String(leadId),
        audit_id: audit?.audit_id || null, product_id: lead.product_route || 'mini_audit',
        commercial_truth_revision: store.store_revision || null, status: quality.gate_result === 'PASS' && comp.gate_result === 'PASS' ? 'QA_PASSED' : 'QA_FAILED',
        hook: sel.primary ? {
            hook_type: sel.primary.hook_type, title: sel.primary.title, finding_id: sel.primary.finding_id,
            evidence_url: sel.primary.evidence_url, evidence_text: sel.primary.evidence_text, observed_at: sel.primary.observed_at,
            business_impact: sel.primary.business_impact, impact_confidence: sel.primary.impact_confidence,
            reason_selected: `Лучший evidence-backed угол (оценка крючка ${sel.primary.scored.score}).`,
        } : null,
        supporting_hint: sel.supporting ? { finding_id: sel.supporting.finding_id, short_text: sel.supporting.title } : null,
        subject_variants: subjects, body_variants: bodies,
        recommended_subject_id: subjects[0]?.id || null, recommended_body_id: recBody?.id || null,
        cta: { type: 'REPLY_PERMISSION', text: 'Кому у вас удобнее передать такой разбор?' },
        opt_out_text: 'Если обращения не нужны — ответьте одним словом, и я больше не напишу.',
        quality, compliance: comp, deliverability: deliv,
        uniqueness: { max_similarity_to_other_drafts: Number(maxSim.toFixed(3)), duplicate_risk: maxSim >= 0.75 ? 'HIGH' : 'LOW' },
        provenance: { generator: 'FirstTouchStrategist', model: 'deterministic_no_llm', prompt_version: engine.SCHEMA_VERSION, source_revision: store.store_revision || null, usage_record_id: null },
        no_send: true,
    };
    core.content_hash = engine.contentHash({ hook: core.hook, subjects, bodies, lead: leadId });
    return core;
}

function buildCtx(store) {
    const offers = (Object.values(store['commercial.offers'] || {})).filter((o) => o && o.test_only !== true);
    const commercialLeadIds = new Set([...offers.map((o) => String(o.lead_id)),
        ...(Object.values(store['commercial.opportunities'] || {})).filter((o) => o && o.test_only !== true).map((o) => String(o.lead_id))]);
    const ledger = readLedger().filter((e) => String(e.result || e.status || '').toUpperCase() === 'SENT');
    const classified = ledger.map((r) => ownerTruth.classifySend(r, { commercialLeadIds }));
    const commercialSentLeadIds = new Set(classified.filter((c) => c.classification === 'COMMERCIAL').map((c) => c.lead_id));
    return { commercialLeadIds, commercialSentLeadIds };
}

// Score all 62 leads, exclude unsafe, produce top-5 / top-3 / 1 recommended pilot. Deterministic.
// includeTest (default false) is an ACCEPTANCE-ONLY switch (debug app / service token):
//   - false (real owner / release): TEST_ONLY leads are SKIPPED ENTIRELY — they never enter `rows`,
//     so leads_scored / leads_considered / exclusion_breakdown stay COMMERCIAL_REAL_ONLY (zero KPI leak).
//   - true (acceptance): a TEST_ONLY lead is NOT given the 'TEST_ONLY' exclusion, but EVERY other
//     hard gate still applies (identity/contact/audit/quality/compliance/prior-send/opt-out). It can
//     become eligible ONLY if it would also be eligible as a real lead. Still no_send by construction.
export function pilotCandidates(includeTest = false) {
    const store = readStore(STORE_PATH);
    const ctx = buildCtx(store);
    const leads = leadsArray(store);
    const rows = [];
    for (const lead of leads) {
        // Real owner / release path: a TEST_ONLY lead must be invisible everywhere — skip it before it
        // can affect any counter. Acceptance path: keep it, but only by passing the same safety gates.
        if (!includeTest && isTestLead(lead)) continue;
        const lid = String(lead.lead_id);
        const exclude = [];
        if (ctx.commercialSentLeadIds.has(lid)) exclude.push('PRIOR_COMMERCIAL_SEND');
        if (lead.opt_out === true) exclude.push('OPT_OUT');
        if (!lead.email) exclude.push('MISSING_CONTACT');
        if (/guess|unverified/.test(String(lead.email_source || ''))) exclude.push('CONTACT_NOT_EVIDENCED');
        // Hard gate: identity must be a verified match (mismatch/unverified contact-company relation blocks pilot).
        if (lead.identity_match_status && lead.identity_match_status !== 'match') exclude.push('BLOCKED_IDENTITY_MISMATCH');
        // Hard gate: contact must be evidenced public business contact, not scraped.
        if (/scrap/.test(String(lead.email_source || ''))) exclude.push('BLOCKED_CONTACT_UNVERIFIED');
        exclude.push(...historyGateExclusions(lead));
        // Hard gate: per-lead send history (proven OR uncertain) — a first-touch pilot must be a true first contact.
        if (lead.last_send_status === 'uncertain_no_smtp_proof' || (lead.send_proof_status === 'missing' && lead.uncertain_last_sent_at)) exclude.push('BLOCKED_UNCERTAIN_PRIOR_SEND');
        else if (lead.last_send_status === 'success' || lead.send_proof_status === 'proven' || lead.external_contact_sent === true) exclude.push('BLOCKED_PRIOR_SEND');
        const audit = auditArtifact.miniAudit(lid);
        if (!audit || !audit.audit_ready) exclude.push('MISSING_REAL_AUDIT');
        if (lead.status === 'rejected') exclude.push('REJECTED');
        let score = 0, hook = null, quality = null;
        if (exclude.length === 0) {
            const art = buildArtifact(lid, { store, ctx });
            hook = art.hook; quality = art.quality;
            score = Math.round(0.5 * quality.total_score + 0.5 * (hook?.impact_confidence ? hook.impact_confidence * 100 : 60));
            if (quality.gate_result !== 'PASS' || art.compliance.gate_result !== 'PASS') exclude.push('QUALITY_OR_COMPLIANCE_GATE');
        }
        rows.push({
            lead_id: lid, company: lead.company || lead.company_name || null, segment: lead.niche || lead.segment || null,
            product: lead.product_route || 'mini_audit', contact_evidenced: !!lead.email && !/guess|unverified/.test(String(lead.email_source || '')),
            audit_ready: !!(audit && audit.audit_ready), hook_type: hook?.hook_type || null,
            quality_score: quality?.total_score ?? null, eligible: exclude.length === 0, excluded_reasons: exclude, score,
        });
    }
    // Sort eligible by score desc, then lead_id. In ACCEPTANCE mode (includeTest), a TEST_ONLY
    // candidate is floated to the FRONT so the acceptance harness opens IT (and never a real lead)
    // for the no-send draft flow. This ordering tweak applies ONLY when includeTest=true; the real
    // owner / release path (includeTest=false) has no test leads in `rows`, so its order is unchanged.
    const eligible = rows.filter((r) => r.eligible).sort((a, b) => {
        if (includeTest) {
            const at = isTestLead({ lead_id: a.lead_id }) || /^TEST_ONLY/i.test(a.lead_id) ? 1 : 0;
            const bt = isTestLead({ lead_id: b.lead_id }) || /^TEST_ONLY/i.test(b.lead_id) ? 1 : 0;
            if (at !== bt) return bt - at; // test leads first in acceptance mode
        }
        return (b.score - a.score) || String(a.lead_id).localeCompare(String(b.lead_id));
    });
    // Honest accounting: every considered lead is either SCORED (eligible) or NOT_SCORED with an
    // explicit reason. leads_scored stays === rows.length for backward compatibility (it has always
    // meant "leads processed by the scorer"); leads_considered/leads_not_scored + the exclusion
    // breakdown make it clear the base is the full store, not just the eligible subset.
    const notScored = rows.filter((r) => !r.eligible);
    const exclusion_breakdown = {};
    for (const r of notScored) for (const e of r.excluded_reasons) exclusion_breakdown[e] = (exclusion_breakdown[e] || 0) + 1;
    return {
        leads_considered: rows.length,
        leads_scored: rows.length, pilot_eligible: eligible.length,
        leads_not_scored: notScored.length, exclusion_breakdown,
        unexplained_exclusions: notScored.filter((r) => r.excluded_reasons.length === 0).length,
        top_5: eligible.slice(0, 5), top_3: eligible.slice(0, 3),
        recommended_pilot: eligible[0] || null, all: rows,
        scope: includeTest ? 'COMMERCIAL_REAL_PLUS_TEST_ACCEPTANCE' : 'COMMERCIAL_REAL_ONLY', no_send: true,
    };
}

export function summary(includeTest = false) {
    const p = pilotCandidates(includeTest);
    return {
        leads_considered: p.leads_considered, leads_not_scored: p.leads_not_scored,
        exclusion_breakdown: p.exclusion_breakdown, unexplained_exclusions: p.unexplained_exclusions,
        leads_scored: p.leads_scored, pilot_eligible: p.pilot_eligible,
        top_5_count: p.top_5.length, top_3_count: p.top_3.length,
        recommended_pilot: p.recommended_pilot ? p.recommended_pilot.lead_id : null,
        controlled_send_gate: 'DISABLED', transport_enabled: false, no_send: true,
        scope: includeTest ? 'COMMERCIAL_REAL_PLUS_TEST_ACCEPTANCE' : 'COMMERCIAL_REAL_ONLY',
    };
}

export default { buildArtifact, pilotCandidates, summary };
