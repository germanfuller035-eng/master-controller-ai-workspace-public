// lh_adapters_test.mjs — Phase 2: adapter interface, dry-run, budget, credential gating. PURE offline.
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n); } };

const { Budget, toCandidate } = await import('../src/adapters/base.mjs');
const A = await import('../src/adapters/index.mjs');

// common candidate shape + evidence provenance
const cand = toCandidate({ source: '2gis', sourceRecordId: 'x1', ref: 'r', company: 'Co', phones: ['8 861 200 10 20'], website: 'http://co.ru' });
ok('candidate has source + provenance evidence', cand.source === '2gis' && cand.evidence.length >= 1 && cand.evidence[0].fetched_at);
ok('candidate normalizes website into websites', cand.websites[0] === 'http://co.ru');

// budget
const b = new Budget({ maxRequests: 2, source: 't' });
b.spend(); b.spend();
let threw = false; try { b.spend(); } catch (e) { threw = /BUDGET_EXCEEDED/.test(e.message); }
ok('budget enforces max requests', threw);

// dry-run returns fixtures, no network, no confirm needed
const ov = new A.OverpassAdapter();
const r = await ov.search({ niche: 'concrete' }, { live: false });
ok('overpass dry-run returns fixtures', r.mode === 'dry_run' && r.records.length === 2);
ok('overpass always available (keyless)', ov.available() === true);

// live requires confirm
let liveThrew = false; try { await ov.search({}, { live: true, confirm: false }); } catch (e) { liveThrew = /LIVE_REQUIRES_CONFIRM/.test(e.message); }
ok('live without confirm rejected', liveThrew);

// credential-gated adapters: unavailable without keys, and live returns unavailable (not crash)
const tg = new A.TwoGisAdapter({});
ok('2gis unavailable without key', tg.available() === false);
const tgLive = await tg.search({}, { live: true, confirm: true });
ok('2gis live → unavailable (no crash, CREDENTIAL_MISSING)', tgLive.mode === 'live_unavailable' && tgLive.reason === 'CREDENTIAL_MISSING');
const dfs = new A.DataForSeoAdapter({});
ok('dataforseo unavailable without creds', dfs.available() === false);
ok('dataforseo available WITH creds', new A.DataForSeoAdapter({ DATAFORSEO_LOGIN: 'a', DATAFORSEO_PASSWORD: 'b' }).available() === true);
const yx = new A.YandexSearchAdapter({});
ok('yandex unavailable without key', yx.available() === false);

// availableAdapters with no creds = overpass + manual only (source failure isolation: no blocking)
const avail = A.availableAdapters({}).map(a => a.name).sort();
ok('available with no creds = manual+overpass', JSON.stringify(avail) === JSON.stringify(['manual', 'overpass']));

// manual import: schema validation + idempotent shape
const mi = new A.ManualImportAdapter();
const imp = mi.importRows([{ company: 'Good Co', phone: '8 861 1', website: 'g.ru' }, { phone: 'x' }]);
ok('manual import accepts valid row', imp.records.length === 1);
ok('manual import rejects missing company', imp.errors.length === 1 && imp.errors[0].error === 'MISSING_COMPANY');

// all 5 adapter types exist
ok('5 adapters registered', A.allAdapters({}).length === 5);

console.log(`\n==== lh_adapters: ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
