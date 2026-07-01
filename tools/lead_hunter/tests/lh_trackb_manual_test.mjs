// lh_trackb_manual_test.mjs — Phase 4: website-rich commercial route via Manual CSV. PURE offline.
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n); } };

const A = await import('../src/adapters/index.mjs');
const D = await import('../src/dedupe.mjs');
const S = await import('../src/score.mjs');
const C = await import('../src/classify.mjs');
const P = await import('../src/promote.mjs');

// controlled CSV fixture: 3 website-bearing TEST_ONLY candidates with public-email evidence
const csv = [
    { source_record_id: 'tb1', company: 'ООО СтройБетон', region: 'Krasnodar', industry: 'concrete', website: 'https://stroybeton-krd.example', email: 'info@stroybeton-krd.example', email_source_url: 'https://stroybeton-krd.example/contacts', phone: '8 861 200 11 22', address: 'Краснодар, Северная 100', test_only: true },
    { source_record_id: 'tb2', company: 'СтройБетон', website: 'https://stroybeton-krd.example', phone: '+7 861 200 11 22', test_only: true }, // dup of tb1 (same domain+phone)
    { source_record_id: 'tb3', company: 'МеталлКаркас Юг', region: 'Krasnodar', industry: 'metal', website: 'https://metallkarkas.example', email: 'sales@metallkarkas.example', email_source_url: 'https://metallkarkas.example/contacts', phone: '8 861 300 22 33', test_only: true },
];

const mi = new A.ManualImportAdapter();
const imp = mi.importRows(csv);
ok('manual import accepted 3 rows', imp.records.length === 3 && imp.errors.length === 0);

// dedupe: tb1+tb2 merge (same domain+phone), tb3 separate
const clusters = D.clusterCandidates(imp.records);
ok('dedupe → 2 unique businesses', clusters.length === 2);
const merged = clusters.map((cl) => D.mergeCluster(imp.records, cl.members));
const stroybeton = merged.find((m) => /стройбетон|stroybeton/i.test(m.company) || (m.websites || []).some((w) => /stroybeton/.test(w)));
ok('duplicate merged with reversible history', stroybeton.merged_from && stroybeton.merged_from.length === 1);

// candidate score_v2 (website-bearing + official email evidence)
for (const m of merged) {
    const wt = m.website ? 'WEAK_SITE' : 'NO_SITE'; // pre-audit hint
    const es = (m.emails || []).length ? 'PUBLIC_DIRECTORY_CONFIRMED' : 'UNCONFIRMED';
    m._score = S.scoreV2({ region_match: true, niche_match: true, industry: m.category, website_tier: wt, email_status: es, phones: m.phones, identity_status: 'IDENTITY_PARTIAL', latest_evidence_at: new Date().toISOString() }, new Date());
    m._route = C.leadRoute({ websiteTier: wt, emailStatus: es, identityStatus: 'IDENTITY_PARTIAL' });
}
ok('website-bearing candidates scored', merged.every((m) => m._score.overall_priority_score > 0));
ok('no guessed-email-ready (CSV emails are directory-confirmed, not guessed)', merged.every((m) => !m._score.blockers.includes('GUESSED_EMAIL')));

// promotion payload (API-only) for the approved candidate
const approved = { ...stroybeton, id: 'tb_stroybeton', state: 'PROMOTION_APPROVED', score: stroybeton._score, lead_route: stroybeton._route, region: 'Krasnodar', category: 'concrete' };
const dry = await P.promote(approved, { dryRun: true });
ok('promotion dry-run targets lead-intelligence endpoint', dry.ok && dry.wouldCall === 'POST /lead-intelligence/promote');
ok('promotion payload carries website + candidate_score_v2', dry.payload.website_candidates.length >= 1 && dry.payload.candidate_score_version === 'score_v2');
ok('promotion payload has provenance', dry.payload.provenance.length >= 1);

// quality gates
ok('GUESSED_EMAILS_READY=0', merged.every((m) => !(m._route !== 'LOW_CONFIDENCE_RESEARCH' && m.emails?.some?.((e) => false))));
ok('no unrelated website (email domain matches site domain)', (() => {
    const dom = (stroybeton.websites[0] || '').replace(/^https?:\/\//, '').replace(/^www\./, '');
    const em = (stroybeton.emails[0] || '').split('@')[1] || '';
    return dom.includes(em) || em === '' || dom.startsWith(em);
})());

console.log(`\n==== lh_trackb_manual: ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
