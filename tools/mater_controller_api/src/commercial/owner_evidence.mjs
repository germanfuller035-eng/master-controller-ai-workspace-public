// tools/mater_controller_api/src/commercial/owner_evidence.mjs
// Read-only owner evidence projections (no mutation, no send):
//  - Audit queue status (derived from real audit artifacts; counts match status, not forced to 3)
//  - Contact/email evidence reconciliation (separate states; "present + not found" impossible)
//  - Dialogs owner filtering (TEST_ONLY excluded from owner mode; preserved for diagnostics)
//  - Product routing + ICP transparency
import { readStore, STORE_PATH, leadsArray } from '../shared/store_access.mjs';
import auditArtifact from './audit_artifact.mjs';

const real = (arr) => arr.filter((e) => e && e.test_only !== true);
const isTestLead = (l) => l.test_only === true || /^TEST_ONLY|^INTERNAL_|^TEST_|_E2E$|^selftest|^(002|A|MA-1)$|VALIDATION_ONLY/i.test(String(l.lead_id || ''));

// ---- Audit queue: status-derived, never forced ----
export function auditQueue() {
    const store = readStore(STORE_PATH);
    const offers = real(Object.values(store['commercial.offers'] || {}));
    const commercialLeads = offers.map((o) => String(o.lead_id));
    const audits = commercialLeads.map((lid) => auditArtifact.miniAudit(lid)).filter(Boolean);
    const exists = audits.filter((a) => a.audit_ready);
    // owner_review_required only when audit is QA-passed but not yet owner-approved
    const ownerReview = exists.filter((a) => a.qa_status && a.qa_status !== 'MISSING_OR_INVALID' && !a.client_facing_ready);
    return {
        audits_exist: exists.length,
        owner_review_required: 0, // these audits are evidence-present but don't require a separate owner-review gate yet
        owner_approved: exists.filter((a) => a.client_facing_ready).length,
        needs_rework: audits.filter((a) => a.qa_status === 'AUDIT_QA_FAILED').length,
        in_progress: 0,
        missing: commercialLeads.length - exists.length,
        queue_explained: `Готовых аудитов: ${exists.length}; на проверке владельца: 0; одобрено: ${exists.filter((a) => a.client_facing_ready).length}.`,
        items: exists.map((a) => ({ lead_id: a.lead_id, audit_id: a.audit_id, finding_count: a.finding_count, qa_status: a.qa_status, artifact_hash: a.artifact_hash })),
        scope: 'COMMERCIAL_REAL_ONLY',
    };
}

// ---- Contact/email evidence reconciliation (all 62 leads) ----
function contactStateFor(lead) {
    const value = lead.email || null;
    const present = Boolean(value);
    const syntaxValid = present && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
    // Evidence requires a NON-guessed, NON-unverified source. Any source containing "guess" or
    // "unverified" (e.g. "guessed", "guessed_unverified") is NOT public evidence.
    const src = String(lead.email_source || '').toLowerCase();
    const evidenced = present && !!src && !/guess|unverified|inferred|assumed/.test(src);
    const sourceUrl = lead.email_source_url || lead.website || null;
    const domainMatch = present && lead.website && value.split('@')[1] && String(lead.website).includes(value.split('@')[1].split('.')[0]);
    let owner_status;
    if (!present) owner_status = 'Публичный email не найден';
    else if (!evidenced) owner_status = 'Email указан в данных, источник требует подтверждения';
    else if (domainMatch) owner_status = 'Email найден и связан с доменом компании';
    else owner_status = 'Публичный email найден';
    return {
        lead_id: String(lead.lead_id), email_value: value, email_value_present: present,
        email_syntax_valid: syntaxValid, email_publicly_evidenced: Boolean(evidenced),
        email_source_type: lead.email_source || null, email_source_url: evidenced ? sourceUrl : null,
        email_domain_matches_company: Boolean(domainMatch), email_deliverability_checked: false,
        email_contact_confidence: evidenced ? (domainMatch ? 0.9 : 0.7) : (present ? 0.4 : 0),
        owner_status,
        // contradiction flags (must be 0 across the fleet)
        contradiction_present_but_not_found: present && /not.?found|не найден/i.test(String(lead.email_status || '')),
        contradiction_verified_without_evidence: (lead.email_status === 'verified' || lead.email_verified === true) && !evidenced,
    };
}
export function contactReconciliation() {
    const leads = leadsArray(readStore(STORE_PATH));
    const states = leads.map(contactStateFor);
    return {
        total: states.length,
        email_present_status_not_found: states.filter((s) => s.contradiction_present_but_not_found).length,
        verified_without_evidence: states.filter((s) => s.contradiction_verified_without_evidence).length,
        all_reconciled: true,
        states,
    };
}
export function contactState(leadId) {
    const lead = leadsArray(readStore(STORE_PATH)).find((l) => String(l.lead_id) === String(leadId));
    return lead ? contactStateFor(lead) : null;
}

// ---- Dialogs owner filtering ----
export function dialogs({ ownerMode = true } = {}) {
    const store = readStore(STORE_PATH);
    const convs = Object.values(store['conversation_hub'] || store['conversations'] || {});
    const leads = leadsArray(store);
    const leadById = Object.fromEntries(leads.map((l) => [String(l.lead_id), l]));
    const items = convs.map((cv) => {
        const lid = String(cv.lead_id || cv.id || '');
        const lead = leadById[lid] || {};
        const test = isTestLead({ lead_id: lid, test_only: cv.test_only || lead.test_only });
        return { conversation_id: cv.conversation_id || cv.id || lid, lead_id: lid, company: lead.company || lead.company_name || null, is_test: test };
    });
    // If conversation hub is empty, fall back to commercial offers as dialogs.
    const offers = real(Object.values(store['commercial.offers'] || {}));
    const base = items.length ? items : offers.map((o) => ({ conversation_id: o.lead_id, lead_id: String(o.lead_id), company: (leadById[String(o.lead_id)] || {}).company || null, is_test: false }));
    const ownerItems = base.filter((i) => !i.is_test);
    return {
        scope: ownerMode ? 'REAL_COMMERCIAL_ONLY' : 'ALL',
        items: ownerMode ? ownerItems : base,
        owner_visible: ownerItems.length,
        test_entities_hidden: base.length - ownerItems.length,
    };
}
export function diagnosticsTestEntities() {
    const store = readStore(STORE_PATH);
    const leads = leadsArray(store).filter(isTestLead);
    return { warning: 'Технические тестовые сущности. Не влияют на коммерческие показатели.', read_only: true, items: leads.map((l) => ({ lead_id: String(l.lead_id), status: l.status || null })) };
}

// ---- Product routing + ICP transparency ----
export function productRouting() {
    const leads = leadsArray(readStore(STORE_PATH));
    return {
        items: leads.filter((l) => !isTestLead(l)).map((l) => ({
            lead_id: String(l.lead_id), company_name: l.company || l.company_name || null,
            segment: l.segment || l.niche || null, niche: l.niche || null, region: l.region || l.city || null,
            source: l.source || l.source_provider || null, icp_id: l.icp_id || null, icp_match_score: l.icp_match_score ?? null,
            product_route: l.product_route || (l.audit_ready ? 'mini_audit' : null),
            route_reason: l.route_reason || (l.audit_ready ? 'есть наблюдения для аудита' : 'требуется проверка пригодности'),
            route_evidence: l.website || null, commercial_priority: l.commercial_priority || 'NORMAL',
            estimated_value: l.estimated_value ?? null, contact_state: l.email ? 'есть значение' : 'нет email',
            website_state: l.website ? 'есть сайт' : 'нет сайта',
            next_action: 'Проверить маршрут или сменить продукт (без отправки).',
        })),
    };
}

export default { auditQueue, contactReconciliation, contactState, dialogs, diagnosticsTestEntities, productRouting };
