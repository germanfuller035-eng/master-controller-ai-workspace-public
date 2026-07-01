/**
 * contact_site_crawler.mjs — Bounded Same-Domain Contact Crawler (Phase C2.7c)
 *
 * Purpose:
 *   Walk a company website (homepage → contact / about / requisites pages) and
 *   collect public contact channels by feeding each fetched page into the pure
 *   contact_channel_extractor.mjs. The crawl is bounded, same-domain only, and
 *   GET-only. The result is an evidence-backed contact bundle that the canonical
 *   pipeline can use to upgrade a lead's email_status to OFFICIAL_PAGE.
 *
 *   Architectural ideas borrowed from Crawl4AI / Firecrawl (URL frontier, bounded
 *   depth, contact-page prioritization, per-host throttle, evidence per page) but
 *   NO third-party code is used — pure Node ESM + global fetch.
 *
 * SAFETY MODEL (HARD MODE):
 *   - Default mode is "offline": NO network access, content comes from injected
 *     fixtures. This is what tests and cold runs use.
 *   - "live" mode is the ONLY path that calls real fetch(). It is reached only when
 *     BOTH opts.mode === 'live' AND env CONTACT_CRAWL_LIVE === 'true' (double gate).
 *   - GET-only. NEVER submits a form, NEVER performs POST, NEVER follows non-http(s)
 *     schemes, NEVER reads .env / secrets, NEVER sends any message, NEVER opens SMTP.
 *   - Same-domain only. Per-host throttle, fixed UA, timeout, response size cap.
 *   - robots.txt Disallow rules are honored (best-effort, conservative).
 *   - Pure helpers (scoring/normalization/parsing) never touch the network.
 *
 * Exports:
 *   - crawlContactSite(startUrl, opts = {}) → Promise<CrawlResult>
 *   - createCrawlFetcher(opts = {})         (internal fetch strategy, exported for tests)
 *   - scoreLink(url, anchorText)            (pure link-priority score)
 *   - extractLinks(html, baseUrl)           (pure same-doc link extraction)
 *   - sameDomain(a, b), normalizeUrl(u)     (pure URL helpers)
 *   - parseRobots(txt), isAllowedByRobots(robots, pathname)  (pure robots helpers)
 *
 * CrawlResult shape (matches the documented contact-enrichment contract):
 *   {
 *     ok: true,
 *     domain: 'company.ru',
 *     start_url: 'https://company.ru/',
 *     mode: 'offline' | 'live',
 *     pages_crawled: [ { url, http_status, depth, channel_counts } ],
 *     contacts: [ <channel objects from extractContactChannels> ],
 *     best_contact_channel: { best_channel_type, best_value, reason, confidence },
 *     evidence: [ { type:'contact_page', url, found:[types], at } ],
 *     crawl_status: 'COMPLETE' | 'PARTIAL' | 'BLOCKED',
 *     confidence: number,   // 0..1, derived from best channel + page coverage
 *     stats: { fetched, skipped, errors },
 *     safety: { network_used, external_send:false, smtp_used:false, env_read:false, forms_submitted:false }
 *   }
 */

import {
    extractContactChannels,
    classifyBestContactChannel,
    normalizeExtractedChannels,
    emailMatchesDomain,
    CHANNEL_TYPES,
} from './contact_channel_extractor.mjs';
import crypto from 'node:crypto';

function sha1Short(s) { return crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 16); }

// Pure: extract <title> text from HTML (bounded), '' if none.
export function extractPageTitle(html) {
    const m = /<title[^>]*>([\s\S]{0,300}?)<\/title>/i.exec(String(html || ''));
    return m ? m[1].replace(/\s+/g, ' ').trim().slice(0, 200) : '';
}

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const DEFAULT_USER_AGENT =
    'MasterControllerContactCrawler/1.0 (+public-contact-discovery; GET-only; contact: operator)';
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_BYTES = 2_000_000; // 2 MB per page — we read pages, not downloads.
const DEFAULT_MAX_DEPTH = 2;
const DEFAULT_MAX_PAGES = 5;
const DEFAULT_THROTTLE = Object.freeze({ minDelayMs: 1500, jitterMs: 1500 });

// Keywords (RU + EN + translit) that mark a high-value contact / about / requisites page.
// Higher score = crawled earlier.
const LINK_KEYWORDS = Object.freeze([
    { re: /конт?акт|kontakt|contact/i, score: 100 },
    { re: /реквизит|rekvizit|requisit/i, score: 90 },
    { re: /о[\s_-]?компани|o[\s_-]?kompani|about|о[\s_-]?нас|o[\s_-]?nas/i, score: 70 },
    { re: /связ|svyaz|feedback|обратн/i, score: 60 },
    { re: /partner|партн[её]р/i, score: 30 },
]);

// ──────────────────────────────────────────────
// Pure URL helpers
// ──────────────────────────────────────────────

export function normalizeUrl(u, base) {
    try {
        const url = base ? new URL(u, base) : new URL(u);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
        url.hash = '';
        // Drop trailing slash duplication noise but keep root '/'.
        return url.toString();
    } catch {
        return null;
    }
}

function hostOf(u) {
    try { return new URL(u).host.replace(/^www\./i, '').toLowerCase(); } catch { return ''; }
}

export function sameDomain(a, b) {
    const ha = hostOf(a);
    const hb = hostOf(b);
    return !!ha && ha === hb;
}

function pathOf(u) {
    try { return new URL(u).pathname || '/'; } catch { return '/'; }
}

// ──────────────────────────────────────────────
// Pure link extraction + scoring
// ──────────────────────────────────────────────

const HREF_RE = /<a\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;

/**
 * Extract same-document <a href> links with their anchor text.
 * Pure: does not touch the network. Resolves relative URLs against baseUrl.
 * Returns [{ url, anchor }] with http(s) absolute URLs only.
 */
export function extractLinks(html, baseUrl) {
    if (typeof html !== 'string' || !html) return [];
    const out = [];
    const seen = new Set();
    let m;
    HREF_RE.lastIndex = 0;
    while ((m = HREF_RE.exec(html)) !== null) {
        const rawHref = (m[2] ?? m[3] ?? m[4] ?? '').trim();
        if (!rawHref) continue;
        if (/^(mailto:|tel:|javascript:|#)/i.test(rawHref)) continue;
        const abs = normalizeUrl(rawHref, baseUrl);
        if (!abs) continue;
        const anchor = String(m[5] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const key = abs.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ url: abs, anchor });
    }
    return out;
}

/**
 * Score a link by how likely it points at a contact/about/requisites page.
 * Pure. Considers both the URL path and the anchor text.
 */
export function scoreLink(url, anchorText) {
    const hay = `${pathOf(url)} ${String(anchorText || '')}`;
    let best = 0;
    for (const k of LINK_KEYWORDS) {
        if (k.re.test(hay)) best = Math.max(best, k.score);
    }
    return best;
}

// ──────────────────────────────────────────────
// Pure robots.txt helpers (conservative, best-effort)
// ──────────────────────────────────────────────

/**
 * Parse robots.txt into a flat list of Disallow path-prefixes that apply to
 * our user-agent group (we only honor `User-agent: *` and our own UA token).
 * Pure. Returns { disallow: string[] }.
 */
export function parseRobots(txt) {
    const disallow = [];
    if (typeof txt !== 'string' || !txt) return { disallow };
    let active = false;
    for (const rawLine of txt.split(/\r?\n/)) {
        const line = rawLine.replace(/#.*$/, '').trim();
        if (!line) continue;
        const mUA = line.match(/^user-agent\s*:\s*(.+)$/i);
        if (mUA) {
            const ua = mUA[1].trim().toLowerCase();
            active = ua === '*' || ua.includes('mastercontroller');
            continue;
        }
        if (!active) continue;
        const mD = line.match(/^disallow\s*:\s*(.*)$/i);
        if (mD) {
            const p = mD[1].trim();
            if (p) disallow.push(p);
        }
    }
    return { disallow };
}

export function isAllowedByRobots(robots, pathname) {
    if (!robots || !Array.isArray(robots.disallow) || robots.disallow.length === 0) return true;
    const p = String(pathname || '/');
    for (const rule of robots.disallow) {
        if (rule === '/') return false; // disallow everything
        if (p.startsWith(rule)) return false;
    }
    return true;
}

// ──────────────────────────────────────────────
// Fetch strategy (offline fixtures vs live politeFetch). GET-only.
// ──────────────────────────────────────────────

/**
 * Create a page fetcher.
 *
 * @param {object}   opts
 * @param {"offline"|"live"} [opts.mode="offline"]
 * @param {Record<string,string>} [opts.fixtures]  url -> html (offline content)
 * @param {object}   [opts.throttle]   { minDelayMs, jitterMs } per-host pacing (live)
 * @param {Function} [opts.now]        () => ms clock (injectable for tests)
 * @param {Function} [opts.sleep]      (ms) => Promise (injectable for tests)
 * @param {Function} [opts.fetchImpl]  fetch implementation (injectable for tests)
 * @param {string}   [opts.userAgent]
 * @returns {{ mode, fetch: (url) => Promise<{ ok, html, httpStatus, finalUrl?, reason? }> }}
 */
export function createCrawlFetcher(opts = {}) {
    // Double gate: live requires BOTH the explicit mode AND the env flag.
    const liveRequested = opts.mode === 'live';
    const liveArmed = liveRequested && process.env.CONTACT_CRAWL_LIVE === 'true';
    const mode = liveArmed ? 'live' : 'offline';

    const fixtures = opts.fixtures || {};
    const throttle = {
        minDelayMs: Number(opts.throttle?.minDelayMs ?? DEFAULT_THROTTLE.minDelayMs),
        jitterMs: Number(opts.throttle?.jitterMs ?? DEFAULT_THROTTLE.jitterMs),
    };
    const now = typeof opts.now === 'function' ? opts.now : () => Date.now();
    const sleep = typeof opts.sleep === 'function'
        ? opts.sleep
        : (ms) => new Promise((r) => setTimeout(r, ms));
    const userAgent = opts.userAgent || DEFAULT_USER_AGENT;
    const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
    const lastHitByHost = new Map();

    async function offlineFetch(url) {
        const html = Object.prototype.hasOwnProperty.call(fixtures, url) ? fixtures[url] : '';
        if (!html) return { ok: false, html: '', httpStatus: 0, reason: 'no_offline_fixture' };
        return { ok: true, html, httpStatus: 200, finalUrl: url };
    }

    async function politeFetch(url) {
        const host = hostOf(url);
        if (!host) return { ok: false, html: '', httpStatus: 0, reason: 'invalid_url' };

        // Per-host pacing.
        const last = lastHitByHost.get(host) || 0;
        const wait = throttle.minDelayMs + Math.floor(rng() * throttle.jitterMs);
        const elapsed = now() - last;
        if (last !== 0 && elapsed < wait) await sleep(wait - elapsed);
        lastHitByHost.set(host, now());

        const fetchImpl = opts.fetchImpl || globalThis.fetch;
        if (typeof fetchImpl !== 'function') {
            return { ok: false, html: '', httpStatus: 0, reason: 'no_fetch_impl' };
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
        try {
            const res = await fetchImpl(url, {
                method: 'GET',
                headers: { 'User-Agent': userAgent, Accept: 'text/html' },
                signal: controller.signal,
                redirect: 'follow',
            });
            if (!res || !res.ok) {
                return { ok: false, html: '', httpStatus: res ? res.status : 0, reason: `http_${res ? res.status : 'no_response'}` };
            }
            const text = await res.text();
            if (typeof text === 'string' && text.length > DEFAULT_MAX_BYTES) {
                return { ok: false, html: '', httpStatus: res.status, reason: 'response_too_large' };
            }
            return { ok: true, html: text, httpStatus: res.status, finalUrl: res.url || url };
        } catch (err) {
            return { ok: false, html: '', httpStatus: 0, reason: `fetch_error:${err?.name || 'unknown'}` };
        } finally {
            clearTimeout(timer);
        }
    }

    return { mode, fetch: mode === 'live' ? politeFetch : offlineFetch };
}

// ──────────────────────────────────────────────
// Confidence derivation (pure)
// ──────────────────────────────────────────────

function deriveConfidence(best, pagesCrawled, contactPagesSeen) {
    // Base on the best channel's own confidence, lightly boosted by coverage.
    let c = best && typeof best.confidence === 'number' ? best.confidence : 0;
    // A confirmed email on an official contact page is the strongest signal.
    if (best && best.best_channel_type === CHANNEL_TYPES.EMAIL && contactPagesSeen > 0) {
        c = Math.max(c, 0.92);
    }
    // Tiny coverage bonus (more official pages read → slightly more trust), capped.
    if (pagesCrawled >= 3) c = Math.min(1, c + 0.03);
    return Math.round(Math.min(1, Math.max(0, c)) * 100) / 100;
}

// ──────────────────────────────────────────────
// Orchestrator: crawlContactSite
// ──────────────────────────────────────────────

/**
 * @param {string} startUrl
 * @param {object} opts
 *   mode, fixtures, fetchImpl, now, sleep, userAgent, throttle, rng (passed to fetcher)
 *   maxDepth (<=2 default 2), maxPages (<=5 default 5), robotsTxt (optional pre-fetched string)
 * @returns {Promise<CrawlResult>}
 */
export async function crawlContactSite(startUrl, opts = {}) {
    const start = normalizeUrl(startUrl);
    const domain = hostOf(startUrl);
    const base = {
        ok: false,
        domain,
        start_url: start,
        mode: 'offline',
        pages_crawled: [],
        contacts: [],
        best_contact_channel: null,
        evidence: [],
        crawl_status: 'BLOCKED',
        confidence: 0,
        stats: { fetched: 0, skipped: 0, errors: 0 },
        safety: {
            network_used: false,
            external_send: false,
            smtp_used: false,
            env_read: false,
            forms_submitted: false,
        },
    };

    if (!start) {
        return { ...base, reason: 'invalid_start_url' };
    }

    const maxDepth = Math.min(Number(opts.maxDepth ?? DEFAULT_MAX_DEPTH), DEFAULT_MAX_DEPTH);
    const maxPages = Math.min(Number(opts.maxPages ?? DEFAULT_MAX_PAGES), DEFAULT_MAX_PAGES);

    const fetcher = createCrawlFetcher(opts);
    base.mode = fetcher.mode;
    base.safety.network_used = fetcher.mode === 'live';

    // Robots: honor only if provided (live runs may pass a pre-fetched robots.txt).
    // We never auto-fetch robots from offline mode.
    const robots = opts.robotsTxt ? parseRobots(opts.robotsTxt) : { disallow: [] };

    // URL frontier: priority queue ordered by link score (homepage first).
    // Each item: { url, depth, score }.
    const frontier = [{ url: start, depth: 0, score: 1000 }];
    const visited = new Set();
    const allChannels = [];
    let contactPagesSeen = 0;
    let hadError = false;

    while (frontier.length > 0 && base.pages_crawled.length < maxPages) {
        // Pop highest-scoring URL.
        frontier.sort((a, b) => b.score - a.score);
        const item = frontier.shift();
        const urlKey = item.url.toLowerCase();
        if (visited.has(urlKey)) continue;
        visited.add(urlKey);

        // Robots gate (same-domain paths only ever reach here).
        if (!isAllowedByRobots(robots, pathOf(item.url))) {
            base.stats.skipped++;
            continue;
        }

        const r = await fetcher.fetch(item.url);
        if (!r.ok) {
            base.stats.errors++;
            hadError = true;
            continue;
        }
        base.stats.fetched++;

        const pageTitle = extractPageTitle(r.html);
        const extraction = extractContactChannels(r.html);
        const pageChannels = Array.isArray(extraction.channels) ? extraction.channels : [];
        for (const ch of pageChannels) {
            // Attach provenance: which page this channel came from + page title.
            const out = { ...ch, source_url: item.url, source_page_title: pageTitle };
            // Same-domain verification: an email on the company's own domain is a much
            // stronger signal than a third-party address found on the page.
            if (ch.type === CHANNEL_TYPES.EMAIL && ch.value) {
                const val = String(ch.value).trim().toLowerCase();
                out.normalized_value = val;
                out.official_domain = domain;
                const onDomain = emailMatchesDomain(ch.value, domain);
                out.same_domain = onDomain;
                out.domain_match = onDomain; // kept for backward compat
                // Evidence type: a same-domain email on a contact/about page is an
                // official-page contact; off-domain needs separate evidence → keep modest.
                out.evidence_type = onDomain ? 'OFFICIAL_PAGE' : 'THIRD_PARTY_PAGE';
                if (onDomain) out.confidence = Math.max(Number(ch.confidence) || 0, 0.95);
                else out.confidence = Math.min(Number(ch.confidence) || 0, 0.6);
                out.content_hash = sha1Short(`${val}|${item.url}|${out.evidence_type}`);
            }
            allChannels.push(out);
        }

        const foundTypes = Array.from(new Set(pageChannels.map((c) => c.type)));
        base.pages_crawled.push({
            url: item.url,
            http_status: r.httpStatus || 0,
            depth: item.depth,
            channel_counts: extraction.counts || {},
        });

        const isContactPage = item.depth > 0 && scoreLink(item.url, '') >= 60;
        if (isContactPage || foundTypes.includes(CHANNEL_TYPES.EMAIL) || foundTypes.includes(CHANNEL_TYPES.WEBSITE_FORM)) {
            contactPagesSeen++;
            base.evidence.push({
                type: item.depth === 0 ? 'homepage' : 'contact_page',
                url: item.url,
                page_title: pageTitle,
                found: foundTypes,
                at: new Date().toISOString(),
            });
        }

        // Expand frontier (only if we still have depth + page budget).
        if (item.depth < maxDepth) {
            const links = extractLinks(r.html, item.url);
            for (const lk of links) {
                if (!sameDomain(lk.url, start)) continue;
                const key = lk.url.toLowerCase();
                if (visited.has(key)) continue;
                const s = scoreLink(lk.url, lk.anchor);
                // Only enqueue links that look relevant (score > 0) to stay bounded;
                // this keeps the crawl focused on contact/about/requisites pages.
                if (s <= 0) continue;
                frontier.push({ url: lk.url, depth: item.depth + 1, score: s });
            }
        }
    }

    const contacts = normalizeExtractedChannels(allChannels);
    // Re-attach the rich evidence fields that normalizeExtractedChannels strips.
    // For each normalized channel, find the strongest matching raw channel and copy
    // provenance/evidence fields (source_url, page title, domain match, hash).
    const EVIDENCE_FIELDS = ['source_url', 'source_page_title', 'normalized_value', 'official_domain', 'same_domain', 'domain_match', 'evidence_type', 'content_hash'];
    for (const c of contacts) {
        const key = `${c.type}::${String(c.value).trim().toLowerCase()}`;
        const matches = allChannels.filter((r) => `${r.type}::${String(r.value).trim().toLowerCase()}` === key);
        if (!matches.length) continue;
        // prefer a same-domain / highest-confidence raw record
        matches.sort((a, b) => (Number(b.same_domain) - Number(a.same_domain)) || ((b.confidence || 0) - (a.confidence || 0)));
        const src = matches[0];
        for (const f of EVIDENCE_FIELDS) { if (src[f] !== undefined) c[f] = src[f]; }
        c.discovered_at = new Date().toISOString();
        c.extractor_version = 'contact_site_crawler_v1';
    }
    const best = classifyBestContactChannel(contacts);

    base.ok = base.stats.fetched > 0;
    base.contacts = contacts;
    base.best_contact_channel = best;
    base.confidence = deriveConfidence(best, base.pages_crawled.length, contactPagesSeen);

    if (base.stats.fetched === 0) {
        base.crawl_status = 'BLOCKED';
    } else if (frontier.length > 0 || hadError) {
        // We stopped early (hit page budget) or some pages failed.
        base.crawl_status = 'PARTIAL';
    } else {
        base.crawl_status = 'COMPLETE';
    }

    return base;
}

export default {
    crawlContactSite,
    createCrawlFetcher,
    scoreLink,
    extractLinks,
    sameDomain,
    normalizeUrl,
    parseRobots,
    isAllowedByRobots,
};
