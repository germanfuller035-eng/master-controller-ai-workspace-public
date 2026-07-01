// tools/mater_controller_api/src/commercial/domain_reservoir.mjs
// Free-First Lead Factory — Domain Reservoir + Common Crawl host-index adapter (bounded, TEST_ONLY)
// + deterministic website technical prefilter + economic lead score. NOT a second canonical lead
// store: only PROMOTED_TO_CANONICAL items would go through the existing canonical API (0 here).
//
// Safety: no AI during raw import, no canonical promotion in test runs, paid sources OFF, no send.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DOMAIN_RESERVOIR_PATH } from '../shared/config.mjs';

export const RESERVOIR_STATES = [
    'DOMAIN_RESERVOIR', 'RAW_CANDIDATE', 'TECHNICALLY_ALIVE', 'BUSINESS_IDENTIFIED',
    'CONTACT_VERIFIED', 'AUDIT_CANDIDATE', 'AUDIT_READY', 'PROMOTED_TO_CANONICAL', 'REJECTED',
];

// Hosts excluded from the reservoir (portals, social, media, forums, marketplaces, parked).
const EXCLUDE_HOST_PATTERNS = [
    /(^|\.)vk\.com$/i, /(^|\.)ok\.ru$/i, /(^|\.)t\.me$/i, /(^|\.)telegram\./i, /(^|\.)youtube\./i,
    /(^|\.)avito\.ru$/i, /(^|\.)ozon\.ru$/i, /(^|\.)wildberries\./i, /(^|\.)yandex\./i, /(^|\.)google\./i,
    /(^|\.)mail\.ru$/i, /(^|\.)rbc\.ru$/i, /(^|\.)ria\.ru$/i, /(^|\.)dzen\./i, /(^|\.)livejournal\./i,
    /(^|\.)wordpress\.com$/i, /(^|\.)wixsite\.com$/i, /parked|sedoparking|godaddy/i,
];
const ALLOWED_TLD = /\.(ru|рф)$/i;

function readStore() {
    try { return JSON.parse(fs.readFileSync(DOMAIN_RESERVOIR_PATH, 'utf8')); }
    catch { return { version: 1, domains: {}, cursor: null, last_run: null, runs: [] }; }
}
function writeStore(s) {
    try { fs.mkdirSync(path.dirname(DOMAIN_RESERVOIR_PATH), { recursive: true }); } catch { /* ignore */ }
    fs.writeFileSync(DOMAIN_RESERVOIR_PATH, JSON.stringify(s, null, 2), 'utf8');
}

// ---- deterministic filters (no LLM) ----
export function hostAllowed(host) {
    const h = String(host || '').toLowerCase().trim();
    if (!h || !ALLOWED_TLD.test(h)) return false;
    if (EXCLUDE_HOST_PATTERNS.some((re) => re.test(h))) return false;
    return true;
}

// Deterministic economic lead score (features extracted elsewhere; score computed in code).
export function economicScore(features = {}) {
    const f = features;
    let s = 0;
    if (f.business_verified) s += 20;
    if (f.niche_match) s += 15;
    if (f.region_match) s += 10;
    if (f.website_alive) s += 10;
    if (f.visible_conversion_problem) s += 15;
    if (f.verified_contact) s += 15;
    if (f.business_activity_signal) s += 10;
    if (f.product_fit) s += 5;
    const band = s >= 80 ? 'AUDIT_CANDIDATE' : s >= 60 ? 'ADDITIONAL_VERIFICATION' : s >= 40 ? 'RESERVOIR' : 'REJECT';
    return { score: s, band };
}

// Deterministic website technical prefilter result classifier (no network here; pure on a probe).
export function classifyProbe(probe = {}) {
    const alive = probe.dns_ok === true && [200, 301, 302].includes(Number(probe.http_status));
    const businessIdentified = alive && (probe.title || probe.schema_org_org || probe.company_name_evidence);
    const contactVerified = businessIdentified && (probe.email_links > 0 || probe.tel_links > 0 || probe.contact_page);
    let state = 'RAW_CANDIDATE';
    if (!alive) state = 'REJECTED';
    else if (contactVerified) state = 'CONTACT_VERIFIED';
    else if (businessIdentified) state = 'BUSINESS_IDENTIFIED';
    else state = 'TECHNICALLY_ALIVE';
    return { alive, state };
}

// Common Crawl host-index adapter (bounded, TEST_ONLY). Uses a deterministic fixture host list when
// no live endpoint is confirmed — never guesses the live format. No AI, no canonical promotion.
const CC_FIXTURE_HOSTS = [
    'stroy-beton-krd.ru', 'zavod-jbi23.ru', 'gbi-yug.ru', 'beton-master23.рф', 'dkbi-nn.ru',
    'vk.com', 'avito.ru', 'parked-domain.ru', 'news-portal.ru', 'mybusiness.рф',
];

export async function commonCrawlTestRun({ maxHosts = 1000, maxInserts = 200, fixtureHosts = null } = {}) {
    const store = readStore();
    const hosts = (fixtureHosts || CC_FIXTURE_HOSTS).slice(0, maxHosts);
    let inspected = 0, inserted = 0, excluded = 0, deduped = 0;
    for (const host of hosts) {
        inspected += 1;
        if (!hostAllowed(host)) { excluded += 1; continue; }
        const id = crypto.createHash('sha256').update(host.toLowerCase()).digest('hex').slice(0, 16);
        if (store.domains[id]) { deduped += 1; continue; }
        if (inserted >= maxInserts) continue;
        store.domains[id] = {
            host: host.toLowerCase(), state: 'DOMAIN_RESERVOIR', source: 'common_crawl_host_index',
            source_evidence: 'cc-host-index (TEST_ONLY fixture)', discovered_run: store.runs.length + 1,
            ai_calls: 0, promoted: false,
        };
        inserted += 1;
    }
    const run = {
        run_id: store.runs.length + 1, mode: 'TEST_ONLY', source: 'common_crawl',
        hosts_inspected: inspected, reservoir_inserts: inserted, excluded, deduped,
        canonical_promotions: 0, ai_calls: 0, max_hosts: maxHosts,
    };
    store.runs.push(run);
    store.last_run = run;
    store.cursor = (store.cursor || 0) + inspected; // incremental checkpoint
    writeStore(store);
    return run;
}

export function summary() {
    const store = readStore();
    const domains = Object.values(store.domains || {});
    const byState = {};
    for (const st of RESERVOIR_STATES) byState[st] = 0;
    for (const d of domains) byState[d.state] = (byState[d.state] || 0) + 1;
    return {
        reservoir_domains: domains.length, by_state: byState, cursor: store.cursor,
        last_run: store.last_run, runs_total: (store.runs || []).length,
        canonical_promotions_total: domains.filter((d) => d.promoted).length,
        common_crawl_adapter: 'READY',
        common_crawl_mode: 'TEST_ONLY',
        common_crawl_live_compatibility: 'NOT_VERIFIED',
        common_crawl_refresh: 'MONTHLY',
        paid_sources_enabled: false,
    };
}

// Capacity-aware funnel (Free-First). Numbers are deterministic from the reservoir states.
export function funnel() {
    const s = summary();
    const bs = s.by_state;
    return {
        raw_candidates: (bs.DOMAIN_RESERVOIR || 0) + (bs.RAW_CANDIDATE || 0),
        technically_alive: bs.TECHNICALLY_ALIVE || 0,
        business_identified: bs.BUSINESS_IDENTIFIED || 0,
        contact_verified: bs.CONTACT_VERIFIED || 0,
        audit_candidates: bs.AUDIT_CANDIDATE || 0,
        audit_ready: bs.AUDIT_READY || 0,
        promoted_to_canonical: bs.PROMOTED_TO_CANONICAL || 0,
        rejected: bs.REJECTED || 0,
        raw_import_ai_calls: 0,
    };
}

// ---- Consistent counters (exclusive states) + signals (non-exclusive) ----
export function counters() {
    const store = readStore();
    const domains = Object.values(store.domains || {});
    const TERMINAL = ['PROMOTED_TO_CANONICAL', 'REJECTED'];
    const exclusive = {};
    for (const st of RESERVOIR_STATES) exclusive[st] = 0;
    for (const d of domains) exclusive[d.state] = (exclusive[d.state] || 0) + 1;
    const total = domains.length;
    const promoted = exclusive.PROMOTED_TO_CANONICAL || 0;
    const rejected = exclusive.REJECTED || 0;
    const active = total - promoted - rejected;
    const activeSum = RESERVOIR_STATES.filter((s) => !TERMINAL.includes(s)).reduce((a, s) => a + (exclusive[s] || 0), 0);
    return {
        total_records: total,
        exclusive_states: exclusive,
        active, promoted, rejected,
        // signals are non-exclusive flags, named explicitly (not states)
        signals: {
            test_only: domains.filter((d) => d.test_only === true || /TEST_ONLY/i.test(String(d.source_evidence || ''))).length,
            has_contacts: domains.filter((d) => d.contacts_found).length,
        },
        invariants: {
            promoted_plus_rejected_plus_active_equals_total: (promoted + rejected + active) === total,
            active_exclusive_sum_equals_active: activeSum === active,
        },
    };
}

// Deterministic free prefilter (NO AI, NO network in this offline-safe form: classifies a supplied
// probe). Live DNS/HTTP probing is performed by the worker; this advances reservoir state from a
// probe result. Returns the new state + economic score. No canonical promotion.
export function applyPrefilter(domainId, probe = {}) {
    const store = readStore();
    const d = store.domains[domainId];
    if (!d) return { ok: false, code: 'NOT_FOUND' };
    const cls = classifyProbe(probe);
    // dedupe vs 62 canonical leads is done by the caller passing probe.canonical_match
    if (probe.duplicate_in_reservoir || probe.canonical_match) { d.state = 'REJECTED'; d.rejection_reason = 'DUPLICATE'; }
    else d.state = cls.state;
    d.last_checked_at = probe.checked_at || null;
    d.dns_ok = probe.dns_ok ?? null; d.http_status = probe.http_status ?? null;
    d.final_url = probe.final_url ?? null; d.title = probe.title ?? null;
    d.contacts_found = Boolean(probe.email_links || probe.tel_links || probe.contact_page);
    d.ai_calls = 0;
    const score = economicScore(probe.features || {});
    d.economic_score = score.score; d.economic_band = score.band;
    writeStore(store);
    return { ok: true, domain_id: domainId, state: d.state, economic: score };
}

// Domain list + detail (read-only).
export function list() {
    const store = readStore();
    return {
        items: Object.entries(store.domains || {}).map(([id, d]) => ({
            domain_id: id, host: d.host, source: d.source, source_mode: d.source_evidence?.includes('TEST_ONLY') ? 'TEST_ONLY' : 'LIVE',
            state: d.state, economic_score: d.economic_score ?? null, economic_band: d.economic_band ?? null,
            contacts_found: d.contacts_found ?? null, last_checked_at: d.last_checked_at ?? null, ai_calls: 0,
        })),
    };
}
export function detail(domainId) {
    const store = readStore();
    const d = store.domains[domainId];
    if (!d) return null;
    return {
        domain_id: domainId, host: d.host, source: d.source,
        test_only: d.source_evidence?.includes('TEST_ONLY') || false,
        inserted_run: d.discovered_run ?? null, last_checked_at: d.last_checked_at ?? null,
        current_stage: d.state, dns_ok: d.dns_ok ?? null, http_status: d.http_status ?? null,
        final_url: d.final_url ?? null, title: d.title ?? null, contacts_found: d.contacts_found ?? null,
        economic_score: d.economic_score ?? null, economic_band: d.economic_band ?? null,
        rejection_reason: d.rejection_reason ?? null, ai_calls: 0, promoted: d.promoted || false,
        no_send_status: 'NO_SEND',
    };
}

// Common Crawl compatibility probe (bounded, read-only). Live CC host-index format is not confirmed
// from this environment, so the adapter reports an HONEST mode rather than a bare "READY".
export function commonCrawlProbe() {
    return {
        common_crawl_mode: 'TEST_ONLY',
        live_compatibility: 'NOT_VERIFIED',
        reason: 'Официальный формат CC host-index не подтверждён из текущей среды; live-запросы не выполнялись.',
        max_index_requests: 3, max_hosts_inspected: 10, max_reservoir_inserts: 20,
        ai_calls: 0, canonical_promotions: 0, paid_source_calls: 0,
    };
}

export default { commonCrawlTestRun, summary, funnel, counters, applyPrefilter, list, detail, commonCrawlProbe, hostAllowed, economicScore, classifyProbe, RESERVOIR_STATES };
