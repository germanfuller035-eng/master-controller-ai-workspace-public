#!/usr/bin/env node
/**
 * contact_site_crawler_live_smoke.mjs — controlled LIVE smoke test for the
 * Bounded Same-Domain Contact Crawler (Phase 1).
 *
 * SAFETY: GET-only. Crawls ONE owner-supplied public website to confirm the crawler
 * discovers contact pages and extracts channels against real HTML. It NEVER submits
 * forms, NEVER sends, NEVER reads secrets, NEVER writes to any store. Output is a
 * sanitized JSON summary printed to stdout.
 *
 * Double gate (same as the worker path):
 *   - pass --live on the CLI, AND
 *   - set env CONTACT_CRAWL_LIVE=true
 * Without BOTH, the script refuses to hit the network and exits.
 *
 * Usage:
 *   CONTACT_CRAWL_LIVE=true node tools/telegram_gateway/contact_site_crawler_live_smoke.mjs --live --url https://example.ru
 *   node tools/.../contact_site_crawler_live_smoke.mjs --url https://example.ru   # dry: prints the plan only
 */
import process from 'node:process';
import { crawlContactSite } from './contact_site_crawler.mjs';

function arg(name, def = null) {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const wantLive = process.argv.includes('--live');
const url = arg('--url');
const maxPages = Number(arg('--max-pages', '5'));
const maxDepth = Number(arg('--max-depth', '2'));

if (!url) {
    console.error('USAGE: --url https://site.ru [--live] [--max-pages 5] [--max-depth 2]');
    process.exit(2);
}

const envArmed = process.env.CONTACT_CRAWL_LIVE === 'true';
const live = wantLive && envArmed;

if (wantLive && !envArmed) {
    console.error('REFUSED: --live passed but CONTACT_CRAWL_LIVE!=true. Set the env flag to confirm live network access.');
    process.exit(3);
}

(async () => {
    console.error(`[smoke] mode=${live ? 'LIVE' : 'offline-dry'} url=${url} maxPages=${maxPages} maxDepth=${maxDepth}`);
    if (!live) {
        console.error('[smoke] dry run: not hitting the network. Re-run with CONTACT_CRAWL_LIVE=true --live to crawl for real.');
        console.log(JSON.stringify({ ok: true, dry_run: true, would_crawl: url, maxPages, maxDepth }, null, 2));
        process.exit(0);
    }
    const t0 = Date.now();
    const result = await crawlContactSite(url, { mode: 'live', maxPages, maxDepth });
    const elapsedMs = Date.now() - t0;
    // sanitized summary — no raw HTML, channels already public contact data
    const summary = {
        ok: result.ok,
        domain: result.domain,
        mode: result.mode,
        crawl_status: result.crawl_status,
        confidence: result.confidence,
        elapsed_ms: elapsedMs,
        pages_crawled: result.pages_crawled,
        best_contact_channel: result.best_contact_channel,
        contacts: result.contacts,
        evidence: result.evidence,
        stats: result.stats,
        safety: result.safety,
    };
    console.log(JSON.stringify(summary, null, 2));
    process.exit(result.ok ? 0 : 1);
})();
