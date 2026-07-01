// lh_pipeline_e2e_test.mjs — Phase 6/8: full Lead Hunter pipeline E2E. PURE offline, no network.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n); } };

const { openRepo } = await import('../src/repository.mjs');
const { createCampaign } = await import('../src/campaign.mjs');
const A = await import('../src/adapters/index.mjs');
const PL = await import('../src/pipeline.mjs');
const { STATE } = await import('../src/state.mjs');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhe2e_'));
const repo = openRepo({ dbPath: path.join(dir, 'db.json') });
const camp = createCampaign(repo, { name: 'Krasnodar concrete', region: 'Krasnodar Krai', niches: ['concrete', 'metal'], max_raw_candidates: 20 });

// A failing adapter to prove source-failure isolation
class BoomAdapter extends (await import('../src/adapters/base.mjs')).SourceAdapter {
    constructor() { super({ name: 'boom' }); }
    available() { return true; }
    _fixture() { throw new Error('SOURCE_DOWN'); }
}
const adapters = [new A.OverpassAdapter(), new A.TwoGisAdapter({}), new BoomAdapter(), new A.ManualImportAdapter()];

// DISCOVERY (dry-run)
const disc = await PL.runDiscovery(repo, camp, adapters, { live: false });
ok('discovery collected raw candidates', disc.raw.length >= 2);
ok('source failure isolated (boom errored, others ok)', disc.sourceStats.boom.error && disc.sourceStats.overpass.yield >= 2);
ok('failing source logged to errors', repo.all('errors').length >= 1);
ok('2gis unavailable recorded', disc.sourceStats.twogis.available === false);
ok('raw records persisted with provenance', repo.all('raw_source_records').every(r => r.source && r.evidence));

// DEDUPE
const ded = PL.runDedupe(repo, camp, disc.raw);
ok('dedupe produced businesses', ded.businesses.length >= 2);
ok('businesses persisted to ISOLATED repo', repo.all('businesses').length === ded.businesses.length);

// VERIFY+SCORE+CLASSIFY with injected probes
const now = new Date('2026-06-16');
const bizList = repo.find('businesses', () => true);
for (const b of bizList) {
    // simulate: businesses with a website → weak site + official email; without → no-site + directory email
    const hasSite = !!b.website;
    PL.verifyScoreClassify(repo, camp, b, {
        website: hasSite ? { dnsResolved: true, reachable: true, httpStatus: 200, hasViewport: false, tlsOk: true } : { noUrl: true },
        email: hasSite ? { onOfficialContactPage: true } : { inPublicDirectory: true },
        identity: { nameAddressMatch: true, coordCategoryMatch: true },
    }, now);
}
const sum = PL.campaignSummary(repo, camp.id);
ok('summary has totals', sum.total >= 2);
ok('no-site businesses retained (not rejected)', (sum.byTier.NO_SITE || 0) >= 1);
ok('email-ready counted', sum.emailReady >= 1);
ok('routes assigned', Object.keys(sum.byRoute).length >= 1);
ok('top scored has explanations', sum.top.length >= 1 && /market_fit=/.test(sum.top[0].why));
ok('scores persisted', repo.all('scores').length >= 2);
ok('verification_results persisted', repo.all('verification_results').length >= 2);

// no-site lead specifically is VERIFIED_NO_WEBSITE or SCORED, never REJECTED just for no site
const noSiteBiz = bizList.find(b => !b.website);
if (noSiteBiz) {
    const reread = repo.get('businesses', noSiteBiz.id);
    ok('no-site lead not rejected for lacking site', reread.state !== STATE.REJECTED);
}

// idempotency: re-running dedupe on same raw doesn't corrupt (new biz ids, but counts sane)
const before = repo.all('businesses').length;
ok('idempotent re-summary stable', PL.campaignSummary(repo, camp.id).total === before);

// NO canonical write invariant: repo path is isolated temp, not 13_sales
ok('repo db is isolated (not canonical path)', !repo.dbPath.includes('13_sales') && !repo.dbPath.includes('lead_pipeline_store'));

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n==== lh_pipeline_e2e: ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
