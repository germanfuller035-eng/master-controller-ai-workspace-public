// pipeline.mjs — Lead Hunter campaign orchestrator. Discovery → normalize → dedupe → verify →
// score → classify → route, persisted to the ISOLATED repo with provenance. No canonical writes,
// no network here (adapters/probes are injected). Deterministic + idempotent per campaign.
import { STATE } from './state.mjs';
import { clusterCandidates, mergeCluster } from './dedupe.mjs';
import { classifyWebsite, classifyEmail, classifyIdentity, leadRoute } from './classify.mjs';
import { scoreV2 } from './score.mjs';
import { newId } from './repository.mjs';

// Run discovery across adapters (dry-run unless live), collect raw candidates under budget.
export async function runDiscovery(repo, campaign, adapters, { live = false, confirm = false, fixtureProvider } = {}) {
    const runId = newId('run');
    const raw = [];
    const sourceStats = {};
    for (const ad of adapters) {
        if (!ad.available()) { sourceStats[ad.name] = { available: false }; continue; }
        try {
            const res = await ad.search(campaign, { live, confirm, fixtureProvider });
            sourceStats[ad.name] = { available: true, mode: res.mode, yield: res.records.length, budget: res.budget };
            for (const r of res.records) {
                if (raw.length >= campaign.max_raw_candidates) break;
                raw.push(r);
            }
        } catch (e) {
            // source failure must NOT stop the campaign
            sourceStats[ad.name] = { available: true, error: String(e.message || e).slice(0, 120) };
            repo.put('errors', newId('err'), { run_id: runId, source: ad.name, error: String(e.message || e).slice(0, 200), at: new Date().toISOString() });
        }
    }
    repo.put('source_runs', runId, { campaign_id: campaign.id, at: new Date().toISOString(), raw_count: raw.length, sources: sourceStats });
    // persist raw records with provenance
    for (const r of raw) repo.put('raw_source_records', newId('raw'), { run_id: runId, campaign_id: campaign.id, ...r });
    return { runId, raw, sourceStats };
}

// Dedupe raw → unique businesses (merged, reversible).
export function runDedupe(repo, campaign, raw) {
    const clusters = clusterCandidates(raw);
    const businesses = [];
    let merged = 0;
    for (const cl of clusters) {
        const biz = mergeCluster(raw, cl.members);
        if (cl.size > 1) merged += cl.size - 1;
        biz.id = newId('biz'); biz.campaign_id = campaign.id; biz.state = STATE.DEDUPED;
        biz.cluster_size = cl.size;
        repo.put('businesses', biz.id, biz);
        businesses.push(biz);
    }
    return { businesses, duplicateGroups: clusters.filter((c) => c.size > 1).length, mergedAway: merged };
}

// Verify + score + classify a business given an injected probe result (website + identity signals).
// probe: { website: <classifyWebsite input>, email: <classifyEmail input>, identity: <signals> }
export function verifyScoreClassify(repo, campaign, biz, probe, now = new Date()) {
    const w = classifyWebsite(probe.website || { noUrl: !biz.website }, now);
    const emailStatus = classifyEmail(probe.email || (biz.emails?.length ? { inPublicDirectory: true } : null));
    const identity = classifyIdentity(probe.identity || {});

    // identity gate: ≥2 signals = VERIFIED, else partial/unknown (NOT auto-reject)
    let state = STATE.VERIFIED;
    if (!biz.website && w.tier === 'NO_SITE') state = STATE.VERIFIED_NO_WEBSITE;
    if (emailStatus === 'NO_EMAIL' || emailStatus === 'UNCONFIRMED') state = (state === STATE.VERIFIED_NO_WEBSITE) ? STATE.VERIFIED_NO_WEBSITE : STATE.VERIFIED_NO_EMAIL;
    if (identity.status === 'IDENTITY_UNKNOWN' || identity.status === 'IDENTITY_CONFLICT') state = STATE.VERIFICATION_PENDING;

    const scored = scoreV2({
        region_match: !!campaign.region, niche_match: true, industry: biz.category,
        website_tier: w.tier, email_status: emailStatus, phones: biz.phones,
        identity_status: identity.status, opt_out: biz.opt_out,
        latest_evidence_at: (biz.evidence?.[0]?.fetched_at) || biz.discovered_at,
    }, now);

    const route = leadRoute({ websiteTier: w.tier, emailStatus, identityStatus: identity.status });

    const patch = {
        website_tier: w.tier, website_evidence: w.evidence, email_status: emailStatus,
        identity_status: identity.status, identity_signals: identity.signals,
        score: scored, score_result: scored.result, lead_route: route,
        state: scored.result === 'REJECT' ? STATE.REJECTED : STATE.SCORED,
    };
    repo.patch('businesses', biz.id, patch);
    repo.put('verification_results', newId('ver'), { business_id: biz.id, website_tier: w.tier, email_status: emailStatus, identity: identity.status, at: new Date().toISOString() });
    repo.put('scores', newId('sc'), { business_id: biz.id, ...scored });
    return { ...biz, ...patch };
}

// Campaign summary for dashboard/status (read-only).
export function campaignSummary(repo, campaignId) {
    const biz = repo.find('businesses', (b) => b.campaign_id === campaignId);
    const byState = {}; const byRoute = {}; const byTier = {};
    let emailReady = 0, noSite = 0;
    for (const b of biz) {
        byState[b.state] = (byState[b.state] || 0) + 1;
        if (b.lead_route) byRoute[b.lead_route] = (byRoute[b.lead_route] || 0) + 1;
        if (b.website_tier) byTier[b.website_tier] = (byTier[b.website_tier] || 0) + 1;
        if (['OFFICIAL_PAGE', 'OFFICIAL_DOCUMENT', 'PUBLIC_DIRECTORY_CONFIRMED', 'ROLE_ADDRESS_CONFIRMED'].includes(b.email_status)) emailReady++;
        if (b.website_tier === 'NO_SITE' || b.website_tier === 'DOMAIN_UNRESOLVED') noSite++;
    }
    const runs = repo.find('source_runs', (r) => r.campaign_id === campaignId);
    const errors = repo.find('errors', () => true);
    const top = biz.filter((b) => b.score).sort((a, b) => (b.score.overall_priority_score) - (a.score.overall_priority_score)).slice(0, 10)
        .map((b) => ({ company: b.company, score: b.score.overall_priority_score, route: b.lead_route, tier: b.website_tier, why: b.score.explanation }));
    return { campaignId, total: biz.length, byState, byRoute, byTier, emailReady, noSite, sourceRuns: runs.length, errors: errors.length, top };
}
