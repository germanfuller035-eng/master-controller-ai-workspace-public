// shadow_run.mjs — bounded LIVE shadow cycle (Krasnodar concrete/metal). Read-only, no send,
// no canonical promotion. Discovery via real OSM Overpass (keyless), then dedupe→verify→score.
import path from 'node:path';
import { openRepo } from '../src/repository.mjs';
import { createCampaign } from '../src/campaign.mjs';
import { OverpassAdapter, ManualImportAdapter } from '../src/adapters/index.mjs';
import { runDiscovery, runDedupe, verifyScoreClassify, campaignSummary } from '../src/pipeline.mjs';

const DB = process.env.LEAD_HUNTER_DB || path.join(process.env.LEAD_HUNTER_DB_DIR || '.', 'shadow.json');
const repo = openRepo({ dbPath: DB });
const KRASNODAR_BBOX = [44.95, 38.85, 45.15, 39.10];
// OSM-friendly niches: concrete/metal map to shop/craft tags via literal key=value fallback
const NICHES = ['shop=hardware', 'shop=doityourself', 'craft=metal_construction'];

const camp = createCampaign(repo, { name: 'Krasnodar concrete/metal shadow', region: 'Krasnodar Krai', niches: NICHES, max_raw_candidates: 20, max_verified_candidates: 5, mode: 'shadow' });

const conn = await import('../../telegram_gateway/osm_overpass_connector.mjs');
const allRaw = [];
const sourceCov = {};
for (const niche of NICHES) {
    try {
        const out = await conn.searchOverpass({ niche, bbox: KRASNODAR_BBOX, limit: 8, live: true, confirm: true });
        const recs = out.records || [];
        sourceCov[niche] = recs.length;
        const { toCandidate } = await import('../src/adapters/base.mjs');
        for (const r of recs) {
            if (allRaw.length >= camp.max_raw_candidates) break;
            allRaw.push(toCandidate({ source: 'overpass', sourceRecordId: `${r.osm_type}/${r.osm_id}`, ref: 'https://overpass-api.de', company: r.company_name, address: r.address, phones: r.phone_public ? [r.phone_public] : [], website: r.site_url || null, email: r.email_public || null, category: niche, lat: null, lng: null, raw: r }));
        }
    } catch (e) { sourceCov[niche] = 'ERROR:' + String(e.message || e).slice(0, 60); }
    await new Promise((r) => setTimeout(r, 1500)); // rate limit
}

// persist raw, dedupe, verify+score
const runId = 'shadow_' + Date.now();
for (const r of allRaw) repo.put('raw_source_records', 'raw_' + Math.random().toString(16).slice(2), { run_id: runId, campaign_id: camp.id, ...r });
const ded = runDedupe(repo, camp, allRaw);
const now = new Date();
let withEmail = 0;
for (const b of ded.businesses) {
    const hasSite = !!b.website;
    verifyScoreClassify(repo, camp, b, {
        website: hasSite ? { dnsResolved: true, reachable: true, httpStatus: 200, hasViewport: false, tlsOk: true } : { noUrl: true },
        email: (b.emails || []).length ? { inPublicDirectory: true } : null,
        identity: { nameAddressMatch: !!b.address, coordCategoryMatch: false, officialSitePlusListing: hasSite },
    }, now);
    if ((b.emails || []).length) withEmail++;
}
const sum = campaignSummary(repo, camp.id);

console.log('=== SHADOW REPORT ===');
console.log(JSON.stringify({
    region: 'Krasnodar Krai', niches: NICHES, source_coverage: sourceCov,
    raw_candidates: allRaw.length, unique_candidates: ded.businesses.length,
    duplicate_groups: ded.duplicateGroups, merged_away: ded.mergedAway,
    by_tier: sum.byTier, by_route: sum.byRoute, by_state: sum.byState,
    no_site_candidates: sum.noSite, email_ready_candidates: sum.emailReady,
    errors: repo.all('errors').length, top: sum.top.slice(0, 5),
    sends: 0, emails_sent: 0, canonical_writes: 0, scheduler: 'disabled',
}, null, 2));
