#!/usr/bin/env node
// worker/index.mjs — Master Controller worker. API-ONLY: it claims jobs over HTTPS,
// runs a handler, and reports result via the API. It NEVER opens canonical files, never
// sends email, never calls SMTP. Single instance (systemd). Bounded polling + idle sleep.
import process from 'node:process';

const API_BASE = process.env.MATER_API_BASE || 'http://127.0.0.1:8787/api/v1';
const TOKEN = process.env.MATER_WORKER_TOKEN || '';
const WORKER_ID = process.env.MATER_WORKER_ID || ('worker-' + process.pid);
const WORKER_VERSION = 'w0.1.0';
const TYPES = (process.env.MATER_WORKER_TYPES || 'HEALTH_CHECK,METRICS_REFRESH,BACKUP_VERIFY').split(',').map((s) => s.trim()).filter(Boolean);
const POLL_IDLE_MS = Number(process.env.MATER_WORKER_IDLE_MS || 10000);
const POLL_BUSY_MS = 500;

if (!TOKEN) { console.error('WORKER_FATAL: MATER_WORKER_TOKEN missing'); process.exit(1); }

let running = true;
process.on('SIGTERM', () => { console.log('SIGTERM → graceful shutdown'); running = false; });
process.on('SIGINT', () => { running = false; });

async function api(path, method = 'POST', body = null) {
    const res = await fetch(API_BASE + path, {
        method,
        headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    let data = null; try { data = await res.json(); } catch { /* noop */ }
    return { status: res.status, data };
}

// --- pipeline classifiers (pure, imported from the canonical pipeline service) ---
let _pipe = null;
async function pipe() { if (!_pipe) _pipe = await import('../pipeline/service.mjs'); return _pipe; }
async function classifyWeb(net) { return (await pipe()).classifyWebsite(net); }
async function idClassifyAsync(a) { return (await pipe()).classifyIdentity(a); }
async function emailClassifyAsync(a) { return (await pipe()).classifyEmail(a); }
// sync wrappers resolved lazily (handlers await pipe() indirectly); expose simple shims
function idClassify(a) { return _pipe.classifyIdentity(a); }
function emailClassify(a) { return _pipe.classifyEmail(a); }

// --- bounded network probes (short timeout; no browser) ---
async function httpFetch(url, ms = 8000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
        const res = await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': 'MasterController-Audit/1.0' } });
        const body = (await res.text()).slice(0, 200000);
        return { httpStatus: res.status, finalUrl: res.url, body, ok: true };
    } catch (e) {
        const msg = String(e.message || e);
        return { ok: false, timeout: /abort|timeout/i.test(msg), tlsError: /certificate|tls|ssl/i.test(msg), err: msg.slice(0, 120) };
    } finally { clearTimeout(t); }
}
function normUrl(u) { if (!u) return null; let s = String(u).trim(); if (!/^https?:\/\//i.test(s)) s = 'https://' + s; return s; }
// Mask an email for evidence/logging (PII-safe): d***@domain
function maskEmail(e) { const s = String(e || ''); const at = s.indexOf('@'); if (at < 1) return ''; return s[0] + '***' + s.slice(at); }

async function probeWebsite(website) {
    await pipe(); // ensure classifiers loaded for sync shims
    const url = normUrl(website);
    if (!url) return { noUrl: true };
    const r = await httpFetch(url);
    if (!r.ok) return { dnsOk: r.timeout ? true : false, nxdomain: /ENOTFOUND|getaddrinfo/i.test(r.err || ''), timeout: r.timeout, tlsError: r.tlsError, httpStatus: 0, url };
    const title = (r.body.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '';
    // rawBody (with tags) is needed for mailto: extraction; bodyText (stripped) for name/keyword checks.
    return { dnsOk: true, httpStatus: r.httpStatus, finalUrl: r.finalUrl, title, rawBody: r.body, bodyText: r.body.replace(/<[^>]+>/g, ' ').slice(0, 20000), hasForm: /<form[\s>]/i.test(r.body), url };
}

// Find a likely contact-page URL from homepage HTML (href to /contact(s), /kontakty, "Контакты").
function findContactPageUrl(rawBody, baseUrl) {
    if (!rawBody || !baseUrl) return null;
    const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,80}?)<\/a>/gi;
    let m;
    while ((m = re.exec(rawBody)) !== null) {
        const href = m[1];
        const text = (m[2] || '').replace(/<[^>]+>/g, ' ');
        if (/contact|kontakt|kontakty|контакт/i.test(href) || /контакт|contact/i.test(text)) {
            try { return new URL(href, baseUrl).href; } catch { /* skip bad href */ }
        }
    }
    return null;
}

// Enrichment: extract a public business email from the official site (homepage + contact page).
// FREE_ONLY, read-only, bounded. Returns { email, sourceUrl } or null. No SMTP, no send.
async function enrichEmailFromSite(net) {
    if (!net || !net.rawBody) return null;
    const ext = await import('../../../telegram_gateway/contact_channel_extractor.mjs');
    const pick = (html, sourceUrl) => {
        const emails = ext.extractEmails(html || '');
        if (!emails.length) return null;
        // prefer mailto-confirmed (confidence 0.92), then first found
        emails.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
        return { email: emails[0].value, sourceUrl };
    };
    // 1) homepage raw HTML
    let hit = pick(net.rawBody, net.finalUrl || net.url);
    if (hit) return hit;
    // 2) contact page, if linked
    const contactUrl = findContactPageUrl(net.rawBody, net.finalUrl || net.url);
    if (contactUrl) {
        const cr = await httpFetch(contactUrl);
        if (cr.ok) { hit = pick(cr.body, cr.finalUrl || contactUrl); if (hit) return hit; }
    }
    return null;
}

async function fetchAuditPage(website) {
    const url = normUrl(website);
    if (!url) return { url: null, httpStatus: 0 };
    const r = await httpFetch(url);
    if (!r.ok) return { url, httpStatus: 0, timeout: r.timeout, tlsError: r.tlsError };
    const body = r.body;
    const meta = (body.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i) || [])[1] || '';
    return {
        url: r.finalUrl || url, httpStatus: r.httpStatus,
        title: (body.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '',
        metaDescription: meta,
        hasFormHtml: /<form[\s>]/i.test(body),
        hasPhoneLink: /href=["']tel:/i.test(body),
        hasEmailLink: /href=["']mailto:/i.test(body),
        hasHttps: (r.finalUrl || url).startsWith('https://'),
        hasViewport: /name=["']viewport["']/i.test(body),
        ctaText: ((body.match(/<(?:a|button)[^>]*>([^<]{0,40}(?:заказать|оставить заявку|связаться|позвонить|купить|подробнее)[^<]*)<\/(?:a|button)>/i) || [])[1] || '').trim(),
        servicesFound: /услуги|services|каталог/i.test(body),
        trustFound: /отзыв|сертификат|гаранти/i.test(body),
    };
}

// --- handler registry. Each returns { ok, resultRef?, blocked?, error? }. No file/SMTP. ---
const handlers = {
    HEALTH_CHECK: async () => ({ ok: true, resultRef: { checkedAt: new Date().toISOString(), worker: WORKER_ID } }),
    METRICS_REFRESH: async () => {
        const r = await api('/automation/status', 'GET');
        return r.status === 200 ? { ok: true, resultRef: { queued: r.data?.data?.queued ?? null } } : { ok: false, error: 'STATUS_' + r.status };
    },
    BACKUP_VERIFY: async () => {
        // Non-destructive restore drill via the API (live files are never touched).
        const r = await api('/backups/restore-drill', 'GET');
        if (r.status !== 200) return { ok: false, error: 'BACKUP_DRILL_' + r.status };
        const d = r.data?.data || {};
        return {
            ok: true,
            resultRef: {
                checked: d.checked ?? null, restorable: d.restorable ?? null,
                not_restorable: d.not_restorable ?? [], all_critical_restorable: d.all_critical_restorable ?? null,
                live_touched: d.live_touched === true ? true : false, checkedAt: new Date().toISOString(),
            },
        };
    },
    // LEAD_DISCOVERY: SINGLE runtime path = Lead Hunter OverpassAdapter (the only Overpass
    // fetcher). Worker owns scheduler/queue/backpressure/promotion; adapter owns the fetch +
    // normalization. No inline OSM runtime here anymore.
    LEAD_DISCOVERY: async (job) => {
        const p = job.payload || {};
        if (!p.bbox || !p.niche) return { ok: false, error: 'DISCOVERY_PAYLOAD_INVALID' };
        // capacity backpressure (Master Controller owns the limit)
        const st = await api('/pipeline/counts', 'GET');
        const staging = st.data?.data?.STAGING || 0;
        const maxStaging = Number(process.env.MAX_PENDING_STAGING || 50);
        if (staging >= maxStaging) return { ok: false, blocked: 'DEPENDENCY', error: 'BLOCKED_CAPACITY_STAGING' };
        const limit = Math.min(Number(p.limit || 5), Number(process.env.DAILY_CANDIDATE_LIMIT || 20));
        // The Lead Hunter adapter is the single Overpass runtime owner.
        let mod; try { mod = await import('../../../lead_hunter/src/adapters/index.mjs'); } catch { return { ok: false, blocked: 'DEPENDENCY', error: 'LEAD_HUNTER_ADAPTER_MISSING' }; }
        const ov = new mod.OverpassAdapter();
        let recs = [];
        try {
            const out = await ov.search({ niche: p.niche, bbox: p.bbox, limit }, { live: true, confirm: true });
            recs = out.records || [];
        } catch (e) { return { ok: false, error: 'OSM_FETCH_FAIL', errorMessage: String(e.message || e).slice(0, 160) }; }
        let staged = 0, dup = 0;
        for (const rec of recs.slice(0, limit)) {
            // adapter already emits the common candidate shape; map to /leads/stage fields
            const candidate = {
                source: 'osm_overpass', source_url: rec.ref || 'https://overpass-api.de', source_record_id: rec.source_record_id,
                adapter_version: 'lh_overpass_v1', company_name: rec.company, region: rec.region || p.region || null,
                industry: rec.category || p.niche, address: rec.address || null, website_candidate: rec.website || null,
                phone_candidates: rec.phones || [], email_candidates: rec.emails || [],
                evidence_refs: rec.evidence || [{ type: 'osm', ref: rec.source_record_id }],
            };
            const r = await api('/leads/stage', 'POST', { candidate, operationId: `disc-${rec.source_record_id}` });
            if (r.status === 200 && r.data?.data?.ok) {
                if (r.data.data.duplicate) { dup++; }
                else {
                    staged++;
                    const leadId = r.data.data.leadId;
                    await api('/jobs/enqueue', 'POST', {
                        jobType: 'LEAD_VERIFY', entityType: 'lead', entityId: leadId,
                        payload: { leadId, lead: { company: candidate.company_name, website: candidate.website_candidate, region: candidate.region, industry: candidate.industry, source: 'osm_overpass', email_candidates: candidate.email_candidates } },
                        idempotencyKey: `verify:${leadId}`,
                    });
                }
            }
        }
        return { ok: true, resultRef: { discovered: recs.length, staged, duplicates: dup, runtime: 'lead_hunter_overpass_adapter' } };
    },
    LEAD_VERIFY: async (job) => {
        const leadId = job.entity_id || job.payload?.leadId;
        if (!leadId) return { ok: false, error: 'NO_LEAD_ID' };
        let lead = job.payload?.lead || {};
        // promote/redo path enqueues LEAD_VERIFY without the lead object; load website from store.
        if (!lead.website) {
            const lr = await api(`/mini-audit/leads/${encodeURIComponent(leadId)}`, 'GET');
            const stored = lr.data?.data?.lead || lr.data?.data || null;
            if (stored) lead = { ...stored, ...lead };
        }
        const net = await probeWebsite(lead.website);
        const wc = await classifyWeb(net);
        // identity: name-on-site only if we actually fetched body containing the name
        const nameOnSite = !!(net.bodyText && lead.company && net.bodyText.toLowerCase().includes(String(lead.company).toLowerCase().split(' ')[0]));
        const identity = idClassify({ nameOnSite, regionMatch: !!lead.region, categoryMatch: !!lead.industry, listingPresent: lead.source === 'osm_overpass', conflict: false });
        // contact enrichment: extract a public business email from the official site (homepage + contact page).
        let enrichedEmail = null, enrichedUrl = null;
        if (wc.website_status === 'FOUND') {
            try {
                const hit = await enrichEmailFromSite(net);
                if (hit) { enrichedEmail = hit.email; enrichedUrl = hit.sourceUrl; }
            } catch { /* enrichment is best-effort; never blocks verify */ }
        }
        // OSM email is NOT official by itself; an address is "official page" only if found ON the site.
        const osmOnPage = !!(net.bodyText && (lead.email_candidates || []).some((e) => net.bodyText.includes(e)));
        const emailOnPage = !!enrichedEmail || osmOnPage;
        const chosenEmail = enrichedEmail || (osmOnPage ? (lead.email_candidates || [])[0] : null);
        const emailStatus = emailClassify({ onOfficialPage: emailOnPage && wc.website_status === 'FOUND', inPublicDirectory: false, contactFormOnly: !!net.hasForm && !emailOnPage });
        // route
        let route = 'manual_review';
        if (['MAPS_ONLY', 'MARKETPLACE_ONLY', 'MESSENGER_ONLY', 'NO_CONFIRMED_WEBSITE', 'BROKEN_WEBSITE'].includes(wc.presence) && wc.website_status !== 'FOUND' && wc.website_status !== 'BROKEN') route = 'manual_review_product_routing';
        else route = 'verified_pending_score';
        const verifyPayload = {
            identity: identity.identity_status, website: wc.website_status, presence: wc.presence, emailStatus,
            confidence: identity.confidence, blockers: [], evidenceRefs: [{ type: 'site', url: lead.website || null, status: net.httpStatus }],
            verificationVersion: 'verify_v2_enrich', route, operationId: `verify-${leadId}`,
        };
        // Only attach contact fields when we actually evidenced an email on the official site.
        if (chosenEmail && emailStatus === 'OFFICIAL_PAGE') {
            verifyPayload.email = chosenEmail;
            verifyPayload.emailSource = 'website_official_page';
            verifyPayload.emailSourceUrl = enrichedUrl || net.finalUrl || lead.website || null;
            verifyPayload.emailVerified = true;
            verifyPayload.evidenceRefs.push({ type: 'contact_email', url: verifyPayload.emailSourceUrl, value_masked: maskEmail(chosenEmail) });
        }
        const r = await api(`/pipeline/leads/${encodeURIComponent(leadId)}/verify`, 'POST', verifyPayload);
        if (r.status !== 200) return { ok: false, error: 'VERIFY_PERSIST_' + r.status };
        if (route === 'verified_pending_score') await api('/jobs/enqueue', 'POST', { jobType: 'LEAD_SCORE', entityType: 'lead', entityId: leadId, payload: { leadId }, idempotencyKey: `score:${leadId}` });
        return { ok: true, resultRef: { website: wc.website_status, identity: identity.identity_status, email: emailStatus, enriched: !!enrichedEmail, route } };
    },
    LEAD_SCORE: async (job) => {
        const leadId = job.entity_id || job.payload?.leadId;
        if (!leadId) return { ok: false, error: 'NO_LEAD_ID' };
        const r = await api(`/pipeline/leads/${encodeURIComponent(leadId)}/score`, 'POST', { operationId: `score-${leadId}` });
        if (r.status !== 200) return { ok: false, error: 'SCORE_PERSIST_' + r.status };
        const decision = r.data?.data?.decision;
        if (decision === 'VERIFIED_READY') await api('/jobs/enqueue', 'POST', { jobType: 'AUDIT_GENERATE', entityType: 'lead', entityId: leadId, payload: { leadId }, idempotencyKey: `audit:${leadId}` });
        return { ok: true, resultRef: { decision, score: r.data?.data?.score } };
    },
    AUDIT_GENERATE: async (job) => {
        const leadId = job.entity_id || job.payload?.leadId;
        if (!leadId) return { ok: false, error: 'NO_LEAD_ID' };
        let lead = job.payload?.lead || {};
        // Autonomous chain enqueues AUDIT_GENERATE with only {leadId} (no lead object); load website
        // from the store so the audit can actually fetch the site. Without this the audit page is empty
        // and a lead never reaches AUDIT_READY on the scheduled path.
        if (!lead.website) {
            const lr = await api(`/mini-audit/leads/${encodeURIComponent(leadId)}`, 'GET');
            const stored = lr.data?.data?.lead || lr.data?.data || null;
            if (stored) lead = { ...stored, ...lead };
        }
        const pageData = await fetchAuditPage(lead.website);
        const r = await api(`/pipeline/leads/${encodeURIComponent(leadId)}/audit`, 'POST', { pageData, operationId: `audit-${leadId}` });
        if (r.status !== 200) return { ok: false, blocked: r.status === 409 ? 'DEPENDENCY' : null, error: 'AUDIT_' + (r.data?.error?.details?.code || r.status) };
        if (r.data?.data?.status === 'AUDIT_READY') await api('/jobs/enqueue', 'POST', { jobType: 'DRAFT_GENERATE', entityType: 'lead', entityId: leadId, payload: { leadId }, idempotencyKey: `draft:${leadId}` });
        // Always also attempt to pre-fill the owner approval queue with a first-touch package. The
        // auto-generate endpoint self-gates on the SAME pilot eligibility (identity/contact/audit/quality/
        // compliance), so this is a no-op for ineligible leads. Covers value-hook leads (1 obs) that pass
        // first-touch but never reach System A's AUDIT_READY. No-send.
        await api('/jobs/enqueue', 'POST', { jobType: 'FIRST_TOUCH_DRAFT_GENERATE', entityType: 'lead', entityId: leadId, payload: { leadId }, idempotencyKey: `ftdraft:${leadId}` });
        return { ok: true, resultRef: { status: r.data?.data?.status, findings: r.data?.data?.findings } };
    },
    FIRST_TOUCH_DRAFT_GENERATE: async (job) => {
        const leadId = job.entity_id || job.payload?.leadId;
        if (!leadId) return { ok: false, error: 'NO_LEAD_ID' };
        const r = await api(`/first-touch/auto-generate/${encodeURIComponent(leadId)}`, 'POST', {});
        if (r.status !== 200) return { ok: false, error: 'FTDRAFT_' + (r.data?.error?.code || r.status), blocked: r.status === 409 ? 'DEPENDENCY' : null };
        return { ok: true, resultRef: { generated: r.data?.data?.generated, reason: r.data?.data?.reason || null } };
    },
    DRAFT_GENERATE: async (job) => {
        const leadId = job.entity_id || job.payload?.leadId;
        if (!leadId) return { ok: false, error: 'NO_LEAD_ID' };
        const r = await api(`/pipeline/leads/${encodeURIComponent(leadId)}/draft`, 'POST', { jobId: job.job_id, operationId: `draft-${leadId}` });
        if (r.status !== 200) return { ok: false, error: 'DRAFT_' + (r.data?.error?.code || r.status), blocked: r.status === 409 ? 'DEPENDENCY' : null };
        return { ok: true, resultRef: { draftId: r.data?.data?.draftId, approvalId: r.data?.data?.approvalId } };
    },
    FOLLOWUP_PLAN: async (job) => {
        const leadId = job.entity_id || job.payload?.leadId;
        if (!leadId) return { ok: false, error: 'NO_LEAD_ID' };
        const r = await api(`/pipeline/leads/${encodeURIComponent(leadId)}/followup`, 'POST', { operationId: `followup-${leadId}` });
        if (r.status !== 200) return { ok: false, error: 'FOLLOWUP_' + r.status };
        return { ok: true, resultRef: { status: r.data?.data?.status, step: r.data?.data?.step } };
    },
    REPLY_DRAFT_GENERATE: async (job) => {
        const leadId = job.entity_id || job.payload?.leadId;
        const reply = job.payload?.reply;
        if (!leadId || !reply) return { ok: false, error: 'NO_LEAD_OR_REPLY' };
        const r = await api(`/pipeline/leads/${encodeURIComponent(leadId)}/reply-draft`, 'POST', { reply, operationId: `replydraft-${reply.reply_id}` });
        if (r.status === 422) return { ok: false, blocked: 'DEPENDENCY', error: 'REPLY_BLOCKED:' + (r.data?.error?.details?.reason || '') };
        if (r.status !== 200) return { ok: false, error: 'REPLY_DRAFT_' + r.status };
        return { ok: true, resultRef: { classification: r.data?.data?.classification } };
    },
};

async function runOne() {
    const claim = await api('/jobs/claim', 'POST', { workerId: WORKER_ID, types: TYPES, workerVersion: WORKER_VERSION });
    if (claim.status === 503) { return 'idle'; } // read-only/maintenance
    if (claim.status !== 200 || !claim.data?.data?.job) return 'idle';
    const job = claim.data.data.job;
    const h = handlers[job.job_type];
    if (!h) { await api(`/jobs/${job.job_id}/fail`, 'POST', { workerId: WORKER_ID, errorCode: 'NO_HANDLER' }); return 'busy'; }
    // heartbeat midway for long jobs is omitted (handlers are short); lease is 2 min.
    try {
        const out = await h(job);
        if (out.ok) await api(`/jobs/${job.job_id}/complete`, 'POST', { workerId: WORKER_ID, resultRef: out.resultRef || null });
        else await api(`/jobs/${job.job_id}/fail`, 'POST', { workerId: WORKER_ID, errorCode: out.error || 'ERROR', blocked: out.blocked || null });
    } catch (e) {
        await api(`/jobs/${job.job_id}/fail`, 'POST', { workerId: WORKER_ID, errorCode: 'HANDLER_EXCEPTION', errorMessage: String(e.message || e).slice(0, 200) });
    }
    return 'busy';
}

console.log(`Master Controller worker ${WORKER_ID} ${WORKER_VERSION} types=[${TYPES.join(',')}] base=${API_BASE}`);
(async () => {
    while (running) {
        let outcome = 'idle';
        try { outcome = await runOne(); } catch (e) { console.error('LOOP_ERR', String(e.message || e).slice(0, 200)); }
        await new Promise((r) => setTimeout(r, outcome === 'busy' ? POLL_BUSY_MS : POLL_IDLE_MS));
    }
    console.log('worker stopped');
    process.exit(0);
})();
