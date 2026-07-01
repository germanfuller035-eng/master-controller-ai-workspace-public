// pipeline/service.mjs
// Lead pipeline operations that mutate the canonical store via updateStoreWithRevision:
//   stageCandidate (discovery), verifyLead (identity/website/contact), scoreLead
//   (deterministic), applyVerifiedReadyGate. All transactional, idempotent, evidence-backed.
// Pure helpers (normalize/dedupeKey/score math) are exported for unit tests with no IO.
import crypto from 'node:crypto';
import { STORE_PATH } from '../shared/config.mjs';
import { updateStoreWithRevision, readStore } from '../shared/store_access.mjs';

// ---------- pure helpers ----------
export function normalizeCompanyName(s) {
    const FORMS = new Set(['ооо', 'оао', 'зао', 'ип', 'пао', 'ао']);
    return String(s || '').toLowerCase().replace(/["'«»“”]/g, ' ')
        .replace(/[^a-zа-я0-9]+/gi, ' ').trim().split(/\s+/)
        .filter((t) => t && !FORMS.has(t)).join(' ');
}
export function normalizeDomain(url) {
    return String(url || '').toLowerCase().trim().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split('?')[0];
}
export function normalizePhone(p) { return String(p || '').replace(/[^\d]/g, '').replace(/^8(?=\d{10}$)/, '7'); }
export function dedupeKey({ company, website, phone }) {
    const d = normalizeDomain(website);
    if (d) return 'dom:' + d;
    const ph = normalizePhone(phone);
    if (ph) return 'tel:' + ph;
    return 'name:' + normalizeCompanyName(company);
}

// Deterministic scoring (no LLM, pure). Config-driven weights, versioned.
export const SCORE_VERSION = 'score_v1';
const W = { identity: 25, activity: 15, website_gap: 20, commercial: 15, contactability: 20, evidence: 15, risk: 30 };
export function computeScore(lead) {
    const c = {};
    c.identity_score = lead.identity_status === 'IDENTITY_VERIFIED' ? W.identity : (lead.identity_status === 'IDENTITY_PARTIAL' ? W.identity / 2 : 0);
    c.business_activity_score = lead.industry ? W.activity : 0;
    // website_gap: a weak/broken site is a COMMERCIAL OPPORTUNITY for a mini-audit
    c.website_gap_score = (lead.website_status === 'BROKEN' || lead.presence === 'HAS_WEAK_WEBSITE') ? W.website_gap
        : (lead.website_status === 'FOUND' ? W.website_gap / 2 : 0);
    c.commercial_potential_score = lead.region ? W.commercial : 0;
    const ce = lead.email_status;
    c.contactability_score = ['OFFICIAL_PAGE', 'OFFICIAL_DOCUMENT', 'PUBLIC_DIRECTORY_CONFIRMED', 'ROLE_ADDRESS_CONFIRMED'].includes(ce) ? W.contactability
        : (ce === 'CONTACT_FORM_ONLY' ? W.contactability / 2 : 0);
    c.evidence_quality_score = (lead.evidence_refs && lead.evidence_refs.length >= 2) ? W.evidence : (lead.evidence_refs && lead.evidence_refs.length === 1 ? W.evidence / 2 : 0);
    let risk = 0;
    if (lead.opt_out) risk += W.risk;
    if (lead.email_status === 'GUESSED' || lead.email_status === 'BOUNCED' || lead.email_status === 'INVALID') risk += W.risk;
    if (lead.identity_status === 'IDENTITY_CONFLICT') risk += W.risk;
    c.risk_penalty = -risk;
    const overall = Object.values(c).reduce((a, b) => a + b, 0);
    const positive = Object.entries(c).filter(([k, v]) => k !== 'risk_penalty' && v > 0).map(([k]) => k);
    const negative = risk > 0 ? ['risk_penalty'] : [];
    let result = 'HOLD';
    if (risk > 0) result = 'REJECT';
    else if (overall >= 80) result = 'HIGH_PRIORITY';
    else if (overall >= 55) result = 'QUALIFIED';
    else if (overall >= 30) result = 'MANUAL_REVIEW';
    else result = 'HOLD';
    return { score_version: SCORE_VERSION, score_components: c, overall_priority_score: overall, positive_signals: positive, negative_signals: negative, result, calculated_at: new Date().toISOString() };
}

// VERIFIED_READY gate — every condition explicit, no silent fallback.
export function verifiedReadyDecision(lead, score) {
    const blockers = [];
    if (lead.identity_status !== 'IDENTITY_VERIFIED') blockers.push('IDENTITY_NOT_VERIFIED');
    if (!['FOUND', 'BROKEN'].includes(lead.website_status)) blockers.push('WEBSITE_NOT_AUDITABLE');
    const okEmail = ['OFFICIAL_PAGE', 'OFFICIAL_DOCUMENT', 'PUBLIC_DIRECTORY_CONFIRMED', 'ROLE_ADDRESS_CONFIRMED'].includes(lead.email_status);
    if (!okEmail) blockers.push('CONTACT_EVIDENCE_INSUFFICIENT');
    if (lead.opt_out) blockers.push('OPT_OUT');
    if (lead.email_status === 'BOUNCED') blockers.push('BOUNCED');
    if (lead.email_status === 'GUESSED') blockers.push('GUESSED_EMAIL');
    if (lead.duplicate) blockers.push('DUPLICATE');
    if (score.result === 'REJECT') blockers.push('SCORE_REJECT');
    // product routing: only confirmed working/weak website supports auto mini-audit
    if (['MAPS_ONLY', 'MARKETPLACE_ONLY', 'MESSENGER_ONLY', 'NO_CONFIRMED_WEBSITE'].includes(lead.presence)) {
        return { decision: 'MANUAL_REVIEW_PRODUCT_ROUTING', blockers: ['NO_AUDITABLE_WEBSITE_PRODUCT_ROUTE'] };
    }
    if (blockers.length === 0 && score.overall_priority_score >= 55) return { decision: 'VERIFIED_READY', blockers: [] };
    return { decision: blockers.length ? 'MANUAL_REVIEW' : 'HOLD', blockers };
}

function newId(prefix) { return prefix + '_' + crypto.randomBytes(6).toString('hex'); }
function leadsMap(store) { if (!store.leads) store.leads = {}; return store.leads; }
function allLeads(store) { return Array.isArray(store.leads) ? store.leads : Object.values(store.leads || {}); }

// ---------- transactional ops ----------
// Create a STAGING candidate. Idempotent by dedupe key (no duplicate).
export function stageCandidate(candidate, { operationId = null } = {}) {
    const key = dedupeKey({ company: candidate.company_name, website: candidate.website_candidate, phone: (candidate.phone_candidates || [])[0] });
    let outcome = { ok: false, code: 'UNKNOWN' };
    const res = updateStoreWithRevision((store) => {
        const map = leadsMap(store);
        // dedupe vs ALL leads (any status)
        const dup = allLeads(store).find((l) => l.dedupe_key === key || (l.lead_id && l.lead_id === candidate.candidate_id));
        if (dup) { outcome = { ok: true, duplicate: true, leadId: dup.lead_id || dup.id, reason: 'DUPLICATE_BLOCKED' }; return null; }
        const id = candidate.candidate_id || newId('cand');
        map[id] = {
            lead_id: id, status: 'STAGING', dedupe_key: key,
            source: candidate.source, source_url: candidate.source_url || null, source_record_id: candidate.source_record_id || null,
            adapter_version: candidate.adapter_version || null, discovered_at: candidate.discovered_at || new Date().toISOString(),
            company: candidate.company_name, company_name_normalized: normalizeCompanyName(candidate.company_name),
            region: candidate.region || null, industry: candidate.industry || null, address: candidate.address || null,
            website: candidate.website_candidate || null, phone: (candidate.phone_candidates || [])[0] || null,
            email_candidates: candidate.email_candidates || [], source_payload_hash: candidate.source_payload_hash || null,
            evidence_refs: candidate.evidence_refs || [], risk_flags: candidate.risk_flags || [],
            identity_status: 'IDENTITY_UNKNOWN', website_status: 'NOT_CHECKED', email_status: 'UNCONFIRMED',
            // Lead Hunter candidate intelligence (HINT only — never authorizes verified/audit/draft).
            // Stored SEPARATELY from canonical_score (score_v1) per the integration score contract.
            candidate_score: candidate.candidate_score ?? null,
            candidate_score_version: candidate.candidate_score_version || null,
            candidate_classification: candidate.candidate_classification || null,
            provenance: candidate.provenance || null,
            correlation_id: candidate.correlation_id || id, staged_at: new Date().toISOString(),
        };
        outcome = { ok: true, duplicate: false, leadId: id };
        return store;
    }, { expectedRevision: null, updatedBy: 'discovery', operationId, storePath: STORE_PATH });
    if (res && res.written) return { ...outcome, written: true, revision: res.revision };
    return { ...outcome, written: false };
}

export function listByStatus(status) { return allLeads(readStore(STORE_PATH)).filter((l) => l.status === status); }
export function countByStatus() { const c = {}; for (const l of allLeads(readStore(STORE_PATH))) c[l.status || '?'] = (c[l.status || '?'] || 0) + 1; return c; }

// ---------- website classification (pure; input = fetch result descriptor) ----------
// netResult: { dnsOk, nxdomain, httpStatus, finalUrl, title, bodyText, tlsError, timeout }
export function classifyWebsite(net) {
    if (!net || net.noUrl) return { website_status: 'NOT_CHECKED', presence: 'NO_CONFIRMED_WEBSITE' };
    if (net.nxdomain) return { website_status: 'NXDOMAIN', presence: 'NO_CONFIRMED_WEBSITE' };
    if (net.timeout || net.tlsError) return { website_status: 'INACCESSIBLE', presence: 'UNKNOWN_PRESENCE' };
    if (net.dnsOk === false) return { website_status: 'NOT_FOUND', presence: 'NO_CONFIRMED_WEBSITE' };
    const code = Number(net.httpStatus || 0);
    if (code >= 500 || code === 0) return { website_status: 'BROKEN', presence: 'BROKEN_WEBSITE' };
    if (code === 403 || code === 401) return { website_status: 'INACCESSIBLE', presence: 'UNKNOWN_PRESENCE' };
    if (code >= 200 && code < 400) {
        const parked = /parked|domain for sale|godaddy|reg\.ru заглушка/i.test(String(net.title || '') + String(net.bodyText || '').slice(0, 200));
        if (parked) return { website_status: 'BROKEN', presence: 'BROKEN_WEBSITE' };
        return { website_status: 'FOUND', presence: 'CONFIRMED_WEBSITE' };
    }
    return { website_status: 'UNKNOWN', presence: 'UNKNOWN_PRESENCE' };
}

// identity from independent signals (pure). Requires >1 signal for VERIFIED.
export function classifyIdentity({ nameOnSite, regionMatch, categoryMatch, listingPresent, conflict }) {
    const positive = []; const negative = [];
    if (nameOnSite) positive.push('NAME_ON_SITE');
    if (regionMatch) positive.push('REGION_MATCH');
    if (categoryMatch) positive.push('CATEGORY_MATCH');
    if (listingPresent) positive.push('LISTING_PRESENT');
    if (conflict) negative.push('NAME_OR_REGION_CONFLICT');
    let status = 'IDENTITY_UNKNOWN';
    if (conflict) status = 'IDENTITY_CONFLICT';
    else if (positive.length >= 2 && nameOnSite) status = 'IDENTITY_VERIFIED';
    else if (positive.length >= 1) status = 'IDENTITY_PARTIAL';
    const confidence = Math.min(1, positive.length / 3) * (conflict ? 0.3 : 1);
    return { identity_status: status, confidence, positive_evidence: positive, negative_evidence: negative };
}

// contact email classification (pure). OSM/directory email is NOT official by itself.
export function classifyEmail({ onOfficialPage, inPublicDirectory, isRoleAddress, contactFormOnly, guessed, bounced, optOut }) {
    if (optOut) return 'OPT_OUT';
    if (bounced) return 'BOUNCED';
    if (guessed) return 'GUESSED';
    if (isRoleAddress && onOfficialPage) return 'ROLE_ADDRESS_CONFIRMED';
    if (onOfficialPage) return 'OFFICIAL_PAGE';
    if (inPublicDirectory) return 'PUBLIC_DIRECTORY_CONFIRMED';
    if (contactFormOnly) return 'CONTACT_FORM_ONLY';
    return 'UNCONFIRMED';
}

// Persist a verification result on a lead + route to next status. Transactional, idempotent.
export function applyVerification({ leadId, identity, website, presence, emailStatus, confidence, blockers = [], evidenceRefs = [], verificationVersion = 'verify_v1', route, operationId = null, email = null, emailSource = null, emailSourceUrl = null, emailVerified = null }) {
    let outcome = { ok: false, code: 'UNKNOWN' };
    const res = updateStoreWithRevision((store) => {
        const map = leadsMap(store);
        const ref = (() => { const r = require_ref(store, leadId); return r; })();
        if (!ref) { outcome = { ok: false, code: 'LEAD_NOT_FOUND' }; return null; }
        const lead = ref.get();
        if (lead._verify_version === verificationVersion && lead._verify_evidence_hash === hashEvidence(evidenceRefs)) {
            outcome = { ok: true, idempotent: true, status: lead.status }; return null;
        }
        lead.identity_status = identity; lead.website_status = website; lead.presence = presence;
        lead.email_status = emailStatus; lead.verification_confidence = confidence;
        lead.verification_version = verificationVersion; lead.verified_checked_at = new Date().toISOString();
        lead.verification_blockers = blockers; if (evidenceRefs.length) lead.evidence_refs = (lead.evidence_refs || []).concat(evidenceRefs);
        lead._verify_version = verificationVersion; lead._verify_evidence_hash = hashEvidence(evidenceRefs);
        // identity_match_status drives the first-touch hard-gate; set 'match' only when identity is VERIFIED.
        if (identity === 'IDENTITY_VERIFIED') lead.identity_match_status = 'match';
        // Contact enrichment: persist an evidenced public business email found on the official site.
        // Never overwrite a manually verified contact; never downgrade an existing evidenced email.
        if (email && emailSource && lead.email_source !== 'manual_verified') {
            lead.email = email;
            lead.email_source = emailSource;
            if (emailSourceUrl) lead.email_source_url = emailSourceUrl;
            if (emailVerified !== null) lead.email_verified = !!emailVerified;
        }
        lead.status = route;
        ref.set(lead);
        outcome = { ok: true, leadId, status: route };
        return store;
    }, { updatedBy: 'verify', operationId, storePath: STORE_PATH });
    if (res && res.written) return { ...outcome, written: true, revision: res.revision };
    return { ...outcome, written: false };
}

function hashEvidence(refs) { return crypto.createHash('sha256').update(JSON.stringify(refs || [])).digest('hex').slice(0, 16); }
function require_ref(store, leadId) {
    const id = String(leadId || '').trim();
    if (store.leads && !Array.isArray(store.leads)) {
        if (store.leads[id]) return { get: () => store.leads[id], set: (v) => { store.leads[id] = v; } };
        for (const k of Object.keys(store.leads)) { const v = store.leads[k]; if (v && String(v.lead_id || '') === id) return { get: () => store.leads[k], set: (nv) => { store.leads[k] = nv; } }; }
    }
    return null;
}

// ---------- audit (evidence-backed; input = fetched page descriptor, pure) ----------
export const AUDIT_ENGINE_VERSION = 'audit_v1';
// pageData: { url, httpStatus, title, metaDescription, hasFormHtml, hasPhoneLink, hasEmailLink,
//   hasHttps, hasViewport, ctaText, servicesFound, trustFound } — all from parsed HTML only.
export function buildFindings(lead, pageData) {
    const f = []; const now = new Date().toISOString(); const url = pageData.url || lead.website;
    const mk = (category, severity, title, evidence, implication, fix, confidence) => f.push({
        finding_id: 'find_' + crypto.randomBytes(5).toString('hex'), lead_id: lead.lead_id, category, severity,
        title, evidence, source_url: url, source_excerpt: String(evidence).slice(0, 200), checked_at: now,
        confidence, business_implication: implication, suggested_fix: fix, engine_version: AUDIT_ENGINE_VERSION, status: 'OPEN',
    });
    if (pageData.hasHttps === false) mk('security', 'high', 'Сайт без HTTPS', 'На проверенной странице не обнаружен HTTPS', 'Может снижать доверие посетителей и помечаться браузером как небезопасный', 'Подключить TLS-сертификат', 0.9);
    if (pageData.hasViewport === false) mk('mobile', 'medium', 'Нет viewport meta', 'В HTML проверенной страницы не найден тег viewport', 'Может ухудшать отображение на мобильных устройствах', 'Добавить meta viewport и адаптивную вёрстку', 0.8);
    if (pageData.hasFormHtml === false && pageData.hasEmailLink === false && pageData.hasPhoneLink === false) mk('contact', 'high', 'Не найден способ связи на проверенной странице', 'На проверенной странице не найдено формы, email- или tel- ссылки', 'Может создавать дополнительное препятствие для обращения клиента', 'Добавить заметную форму или кликабельные контакты', 0.75);
    if (!pageData.ctaText) mk('conversion', 'medium', 'Нет явного призыва к действию', 'На проверенной странице не найден заметный CTA', 'Может снижать число обращений', 'Добавить чёткий призыв к действию на первом экране', 0.6);
    if (pageData.metaDescription === '' || pageData.metaDescription == null) mk('seo', 'low', 'Нет meta description', 'В HTML проверенной страницы отсутствует meta description', 'Может ухудшать представление сайта в поиске', 'Добавить описание страницы', 0.7);
    // Fallback for quality sites with ZERO objective defects: an honest profile/industry observation
    // (verified facts — niche/region/reachable site — framed as an outside-review opportunity, NOT a
    // claimed problem, NOT a bare positive fact). Only when there are no defect findings, so real
    // problems always take priority. Carries source_url + evidence so it is a genuine evidence-backed
    // observation; engine.deriveHook routes it to INDUSTRY_VALUE_PROPOSITION.
    if (f.length === 0 && (pageData.httpStatus >= 200 && pageData.httpStatus < 400)) {
        const niche = lead.niche || lead.segment || lead.industry || null;
        const region = lead.region || null;
        const seg = niche ? `сегменте ${niche}` : 'вашем сегменте';
        const regPart = region ? ` (${region})` : '';
        f.push({
            finding_id: 'find_' + crypto.randomBytes(5).toString('hex'), lead_id: lead.lead_id,
            category: 'industry_value', severity: 'info', kind: 'profile_value',
            title: 'Внешний разбор пути покупателя под сегмент',
            evidence: `Компания работает в ${seg}${regPart}; сайт доступен. Внешний разбор пути покупателя под этот сегмент может показать небольшие точки роста заявок.`,
            source_url: url, source_excerpt: `Сегмент: ${niche || 'не указан'}${regPart}. Сайт: ${url}`,
            checked_at: now, confidence: 0.7,
            business_implication: 'свежий внешний разбор пути покупателя под этот сегмент иногда выявляет небольшие точки роста заявок',
            suggested_fix: 'Короткий разбор пути покупателя под нишу с конкретными наблюдениями',
            engine_version: AUDIT_ENGINE_VERSION, status: 'OPEN',
        });
    }
    return f;
}
// quality gate — every finding must be evidence-backed (has source_url + evidence).
export function auditQualityGate(findings, lead) {
    const minFindings = 2;
    const evidenceBacked = findings.filter((x) => x.source_url && x.evidence && x.confidence != null);
    if (lead.identity_status === 'IDENTITY_CONFLICT') return { status: 'AUDIT_BLOCKED_IDENTITY', findings: evidenceBacked };
    if (evidenceBacked.length < minFindings) return { status: 'AUDIT_INSUFFICIENT_EVIDENCE', findings: evidenceBacked };
    const unsupported = findings.length - evidenceBacked.length;
    if (unsupported > 0) return { status: 'AUDIT_NEEDS_REVIEW', findings: evidenceBacked, unsupported };
    return { status: 'AUDIT_READY', findings: evidenceBacked, unsupported: 0 };
}

// Persist audit on lead. Idempotent by (lead, website evidence). Transactional.
export function applyAudit({ leadId, pageData, operationId = null }) {
    let outcome = { ok: false, code: 'UNKNOWN' };
    const res = updateStoreWithRevision((store) => {
        const ref = require_ref(store, leadId);
        if (!ref) { outcome = { ok: false, code: 'LEAD_NOT_FOUND' }; return null; }
        const lead = ref.get();
        const evHash = hashEvidence([pageData.url, pageData.httpStatus, pageData.title]);
        // idempotency BEFORE the status gate (a re-run after routing to audit_ready is a no-op)
        if (lead._audit_evidence_hash === evHash && lead.audit_status) { outcome = { ok: true, idempotent: true, status: lead.audit_status }; return null; }
        if (lead.status !== 'verified_ready') { outcome = { ok: false, code: 'LEAD_NOT_VERIFIED_READY' }; return null; }
        const findings = buildFindings(lead, pageData);
        const gate = auditQualityGate(findings, lead);
        lead.audit_findings = gate.findings; lead.audit_status = gate.status; lead.audit_engine_version = AUDIT_ENGINE_VERSION;
        lead.audit_unsupported = gate.unsupported || 0; lead.audited_at = new Date().toISOString(); lead._audit_evidence_hash = evHash;
        // Bridge: surface the evidence-backed deterministic findings as audit_observations, the field the
        // first-touch miniAudit() reads. Each observation is a grounded, template-derived string tied to an
        // objective HTML signal (no AI, no fabrication). Lets a real audit advance a lead to FIRST_TOUCH_READY.
        lead.audit_observations = gate.findings
            .filter((x) => x.source_url && x.evidence)
            .map((x) => `${x.title}: ${x.business_implication} (наблюдение на ${x.source_url})`);
        lead.audit_observed_at = lead.audited_at;
        lead.audit_created_at = lead.audit_created_at || lead.audited_at;
        if (gate.status === 'AUDIT_READY') lead.status = 'audit_ready';
        ref.set(lead);
        outcome = { ok: true, leadId, status: gate.status, findings: gate.findings.length, unsupported: gate.unsupported || 0 };
        return store;
    }, { updatedBy: 'audit', operationId, storePath: STORE_PATH });
    if (res && res.written) return { ...outcome, written: true, revision: res.revision };
    return { ...outcome, written: false };
}

// ---------- draft (pure builder + transactional persist with approval) ----------
export const TEMPLATE_VERSION = 'draft_v1';
export const CANONICAL_PRICE = process.env.MC_MINI_AUDIT_PRICE || '5000 ₽';
export function buildDraft(lead) {
    const company = lead.company || lead.lead_id;
    const top = (lead.audit_findings || []).slice(0, 3).map((x) => `• ${x.title}`).join('\n');
    const subject = `Мини-аудит сайта ${company}: несколько замечаний`;
    const body = [
        `Здравствуйте!`,
        ``,
        `Мы посмотрели сайт компании «${company}» и по состоянию на проверку заметили несколько моментов, которые могут влиять на обращения клиентов:`,
        ``, top, ``,
        `Подготовили короткий мини-аудит с конкретными рекомендациями. Стоимость — ${CANONICAL_PRICE}.`,
        `Если интересно, ответьте на это письмо — пришлём пример и детали.`,
        ``, `С уважением,`, `Команда Master Controller`,
    ].join('\n');
    const content = subject + '\n' + body;
    return { subject, body, content_hash: crypto.createHash('sha256').update(content).digest('hex').slice(0, 16) };
}
const APPROVED_EMAIL_STATUSES = new Set(['OFFICIAL_PAGE', 'OFFICIAL_DOCUMENT', 'PUBLIC_DIRECTORY_CONFIRMED', 'ROLE_ADDRESS_CONFIRMED']);
export function draftPreconditionBlockers(lead) {
    const b = [];
    if (lead.audit_status !== 'AUDIT_READY' && lead.status !== 'audit_ready') b.push('AUDIT_NOT_READY');
    if (!APPROVED_EMAIL_STATUSES.has(lead.email_status)) b.push('RECIPIENT_EVIDENCE_INSUFFICIENT');
    if (lead.opt_out) b.push('OPT_OUT');
    if (lead.email_status === 'BOUNCED') b.push('BOUNCED');
    if (lead.email_status === 'GUESSED') b.push('GUESSED_EMAIL');
    if (['MAPS_ONLY', 'MARKETPLACE_ONLY', 'MESSENGER_ONLY', 'NO_CONFIRMED_WEBSITE'].includes(lead.presence)) b.push('PRODUCT_ROUTE_UNSUPPORTED');
    return b;
}

export function applyDraft({ leadId, jobId = null, operationId = null }) {
    let outcome = { ok: false, code: 'UNKNOWN' };
    const res = updateStoreWithRevision((store) => {
        const ref = require_ref(store, leadId);
        if (!ref) { outcome = { ok: false, code: 'LEAD_NOT_FOUND' }; return null; }
        const lead = ref.get();
        const blockers = draftPreconditionBlockers(lead);
        if (blockers.length) { outcome = { ok: false, code: 'DRAFT_BLOCKED', blockers }; return null; }
        const recipient = lead.email || (lead.email_candidates || [])[0];
        const d = buildDraft(lead);
        if (lead.draft && lead.draft.content_hash === d.content_hash && lead.draft.recipient === recipient) { outcome = { ok: true, idempotent: true, draftId: lead.draft.draft_id }; return null; }
        const draftId = 'draft_' + crypto.randomBytes(6).toString('hex');
        const approvalId = 'apr_' + crypto.randomBytes(6).toString('hex');
        const rev = (lead.draft?.revision || 0) + 1;
        lead.draft = {
            draft_id: draftId, lead_id: leadId, recipient, recipient_evidence: lead.email_status,
            product_id: 'mini_audit', subject: d.subject, body: d.body, audit_refs: (lead.audit_findings || []).map((x) => x.finding_id),
            evidence_refs: lead.evidence_refs || [], confidence: lead.verification_confidence ?? null, risk_flags: lead.verified_ready_blockers || [],
            template_version: TEMPLATE_VERSION, content_hash: d.content_hash, revision: rev, approval_status: 'APPROVAL_PENDING',
            created_at: new Date().toISOString(), updated_at: new Date().toISOString(), generated_by_job_id: jobId,
        };
        lead.approval = {
            approval_id: approvalId, lead_id: leadId, draft_id: draftId, recipient, channel: 'email',
            content_hash: d.content_hash, draft_revision: rev, owner_id: null, status: 'PENDING',
            created_at: new Date().toISOString(), expires_at: null,
        };
        lead.status = 'approval_pending';
        ref.set(lead);
        outcome = { ok: true, leadId, draftId, approvalId, recipient };
        return store;
    }, { updatedBy: 'draft', operationId, storePath: STORE_PATH });
    if (res && res.written) return { ...outcome, written: true, revision: res.revision };
    return { ...outcome, written: false };
}
export function applyScore({ leadId, operationId = null }) {
    let outcome = { ok: false, code: 'UNKNOWN' };
    const res = updateStoreWithRevision((store) => {
        const ref = require_ref(store, leadId);
        if (!ref) { outcome = { ok: false, code: 'LEAD_NOT_FOUND' }; return null; }
        const lead = ref.get();
        const score = computeScore(lead);
        const gate = verifiedReadyDecision(lead, score);
        lead.score = score; lead.score_result = score.result; lead.scored_at = score.calculated_at;
        lead.verified_ready_decision = gate.decision; lead.verified_ready_blockers = gate.blockers;
        lead.status = gate.decision === 'VERIFIED_READY' ? 'verified_ready' : gate.decision.toLowerCase();
        ref.set(lead);
        outcome = { ok: true, leadId, decision: gate.decision, score: score.overall_priority_score, blockers: gate.blockers };
        return store;
    }, { updatedBy: 'score', operationId, storePath: STORE_PATH });
    if (res && res.written) return { ...outcome, written: true, revision: res.revision };
    return { ...outcome, written: false };
}

// ---------- follow-up planning (pure eligibility + transactional persist) ----------
export const FOLLOWUP_PLANNER_VERSION = 'followup_v1';
export const FOLLOWUP_SCHEDULE_DAYS = [2, 5, 10]; // canonical D2/D5/D10

// Pure eligibility decision. `now` and lead carry the facts; no IO.
//   lead needs: last_sent_at, send_proof_status/sendProof, status, reply_state, opt_out,
//   email_status, followup_step (already-sent steps), original_send_id.
export function planFollowup(lead, now = new Date()) {
    const sentAt = lead.last_sent_at || lead.last_contacted_at || lead.sent_at;
    if (!sentAt) return { status: 'BLOCKED_MISSING_PROVIDER_PROOF', step: null, dueAt: null };
    if (!(lead.send_proof_status === 'proven' || lead.sendProof === 'proven' || lead.provider_proof)) {
        return { status: 'BLOCKED_MISSING_PROVIDER_PROOF', step: null, dueAt: null };
    }
    if (lead.opt_out || lead.status === 'opt_out') return { status: 'BLOCKED_OPT_OUT', step: null, dueAt: null };
    if (lead.email_status === 'BOUNCED') return { status: 'BLOCKED_BOUNCE', step: null, dueAt: null };
    if (lead.reply_received || lead.reply_state === 'received' || lead.status === 'replied') return { status: 'BLOCKED_REPLY', step: null, dueAt: null };
    if (lead.status === 'send_uncertain') return { status: 'BLOCKED_SEND_UNCERTAIN', step: null, dueAt: null };
    if (!lead.email || (lead.email_status && ['INVALID', 'OPT_OUT', 'GUESSED'].includes(lead.email_status))) {
        return { status: 'BLOCKED_INVALID_CONTACT', step: null, dueAt: null };
    }
    const sentMs = Date.parse(sentAt);
    const ageDays = (now.getTime() - sentMs) / 86400000;
    const doneSteps = Number(lead.followup_step || 0);
    if (doneSteps >= FOLLOWUP_SCHEDULE_DAYS.length) return { status: 'BLOCKED_HISTORY', step: doneSteps, dueAt: null };
    const nextStepIdx = doneSteps; // 0-based
    const dueDay = FOLLOWUP_SCHEDULE_DAYS[nextStepIdx];
    const dueAt = new Date(sentMs + dueDay * 86400000).toISOString();
    if (ageDays < dueDay) return { status: 'NOT_DUE', step: nextStepIdx + 1, dueAt };
    return { status: 'ELIGIBLE', step: nextStepIdx + 1, dueAt };
}

function buildFollowupDraftText(lead, step) {
    const company = lead.company || lead.lead_id;
    const subject = `Re: Мини-аудит сайта ${company}`;
    const body = [
        `Здравствуйте!`, ``,
        `Напоминаю про мини-аудит сайта «${company}», который мы предлагали ранее.`,
        `Если вопрос актуален — буду рад прислать пример и детали. Если нет — просто дайте знать, больше не побеспокою.`,
        ``, `С уважением,`, `Команда Master Controller`,
    ].join('\n');
    return { subject, body, content_hash: crypto.createHash('sha256').update(`${step}|${subject}\n${body}`).digest('hex').slice(0, 16) };
}

export function applyFollowupPlan({ leadId, operationId = null, now = new Date() }) {
    let outcome = { ok: false, code: 'UNKNOWN' };
    const res = updateStoreWithRevision((store) => {
        const ref = require_ref(store, leadId);
        if (!ref) { outcome = { ok: false, code: 'LEAD_NOT_FOUND' }; return null; }
        const lead = ref.get();
        const plan = planFollowup(lead, now);
        const step = plan.step;
        const idemTag = `${lead.original_send_id || lead.last_sent_at || 'x'}:${step}:${FOLLOWUP_PLANNER_VERSION}`;
        if (lead.followup && lead.followup._idem === idemTag) { outcome = { ok: true, idempotent: true, status: lead.followup.eligibility_status }; return null; }
        const base = {
            followup_id: 'fu_' + crypto.randomBytes(5).toString('hex'), lead_id: leadId,
            original_send_id: lead.original_send_id || null, step, due_at: plan.dueAt,
            eligibility_status: plan.status, planner_version: FOLLOWUP_PLANNER_VERSION,
            created_at: new Date().toISOString(), updated_at: new Date().toISOString(), _idem: idemTag,
        };
        if (plan.status === 'ELIGIBLE') {
            const d = buildFollowupDraftText(lead, step);
            base.draft = { draft_id: 'fudraft_' + crypto.randomBytes(5).toString('hex'), subject: d.subject, body: d.body, content_hash: d.content_hash, approval_status: 'APPROVAL_PENDING' };
            base.eligibility_status = 'DRAFT_READY';
        }
        lead.followup = base;
        ref.set(lead);
        outcome = { ok: true, leadId, status: base.eligibility_status, step, draft: !!base.draft };
        return store;
    }, { updatedBy: 'followup', operationId, storePath: STORE_PATH });
    if (res && res.written) return { ...outcome, written: true, revision: res.revision };
    return { ...outcome, written: false };
}

// ---------- reply draft (pure eligibility + transactional persist) ----------
export const REPLY_DRAFT_VERSION = 'reply_draft_v1';
const REPLY_ALLOWED = new Set(['interested', 'asks_details', 'asks_price', 'wants_call', 'not_now']);
const REPLY_BLOCKED = new Set(['opt_out', 'bounce', 'spam', 'auto_reply', 'unknown', 'unmatched', 'not_interested', 'wrong_person']);

export function replyDraftEligibility(reply) {
    if (!reply) return { eligible: false, reason: 'NO_REPLY' };
    if (!reply.lead_id || String(reply.lead_id).startsWith('UNMATCHED:')) return { eligible: false, reason: 'UNMATCHED' };
    const cat = reply.category;
    if (REPLY_BLOCKED.has(cat)) return { eligible: false, reason: 'BLOCKED_CLASSIFICATION:' + cat };
    if (!REPLY_ALLOWED.has(cat)) return { eligible: false, reason: 'NOT_ALLOWED:' + cat };
    return { eligible: true, reason: 'OK' };
}

export function buildReplyDraft(reply) {
    const cat = reply.category;
    const lines = [`Здравствуйте!`, ``];
    if (cat === 'asks_price') lines.push(`Спасибо за интерес. Стоимость мини-аудита — ${CANONICAL_PRICE}. Готов прислать пример и детали.`);
    else if (cat === 'asks_details') lines.push(`Спасибо за вопрос. Кратко расскажу, что входит в мини-аудит, и пришлю пример отчёта.`);
    else if (cat === 'wants_call') lines.push(`Спасибо! Подскажите удобное время для короткого звонка — подстроюсь.`);
    else if (cat === 'not_now') lines.push(`Понял, спасибо за ответ. Напишу позже, если будет удобнее — дайте знать.`);
    else lines.push(`Спасибо за ответ! Готов рассказать подробнее про мини-аудит и прислать пример.`);
    lines.push(``, `С уважением,`, `Команда Master Controller`);
    const subject = reply.subject ? (reply.subject.startsWith('Re:') ? reply.subject : 'Re: ' + reply.subject) : 'Re: ваш запрос';
    const body = lines.join('\n');
    return { subject, body, content_hash: crypto.createHash('sha256').update(subject + '\n' + body).digest('hex').slice(0, 16) };
}

// Persist a reply draft keyed on the reply. Idempotent. Stored on the lead under reply_drafts[].
export function applyReplyDraft({ leadId, reply, operationId = null }) {
    let outcome = { ok: false, code: 'UNKNOWN' };
    const elig = replyDraftEligibility({ ...reply, lead_id: reply?.lead_id || leadId });
    if (!elig.eligible) return { ok: false, code: 'REPLY_DRAFT_BLOCKED', reason: elig.reason, written: false };
    const res = updateStoreWithRevision((store) => {
        const ref = require_ref(store, leadId);
        if (!ref) { outcome = { ok: false, code: 'LEAD_NOT_FOUND' }; return null; }
        const lead = ref.get();
        if (!Array.isArray(lead.reply_drafts)) lead.reply_drafts = [];
        const idemTag = `${reply.reply_id}:${reply.category}:${REPLY_DRAFT_VERSION}`;
        if (lead.reply_drafts.some((x) => x._idem === idemTag)) { outcome = { ok: true, idempotent: true }; return null; }
        const d = buildReplyDraft(reply);
        lead.reply_drafts.push({
            reply_draft_id: 'rd_' + crypto.randomBytes(5).toString('hex'), reply_id: reply.reply_id,
            thread_id: reply.thread_id || null, lead_id: leadId, classification: reply.category,
            classification_confidence: reply.confidence ?? null, recommended_action: 'owner_review',
            subject: d.subject, body: d.body, content_hash: d.content_hash, revision: 1,
            approval_status: 'APPROVAL_PENDING', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            _idem: idemTag,
        });
        ref.set(lead);
        outcome = { ok: true, leadId, classification: reply.category };
        return store;
    }, { updatedBy: 'reply_draft', operationId, storePath: STORE_PATH });
    if (res && res.written) return { ...outcome, written: true, revision: res.revision };
    return { ...outcome, written: false };
}

export default {
    normalizeCompanyName, normalizeDomain, normalizePhone, dedupeKey,
    computeScore, SCORE_VERSION, verifiedReadyDecision, stageCandidate, listByStatus, countByStatus,
    classifyWebsite, classifyIdentity, classifyEmail, applyVerification, applyScore,
    buildFindings, auditQualityGate, applyAudit, buildDraft, draftPreconditionBlockers, applyDraft,
    AUDIT_ENGINE_VERSION, TEMPLATE_VERSION,
    planFollowup, applyFollowupPlan, replyDraftEligibility, buildReplyDraft, applyReplyDraft,
    FOLLOWUP_PLANNER_VERSION, FOLLOWUP_SCHEDULE_DAYS, REPLY_DRAFT_VERSION,
};
