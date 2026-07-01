// lh_dedupe_test.mjs — Phase 3: normalization + weighted dedupe. PURE offline.
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n); } };

const N = await import('../src/normalize.mjs');
const D = await import('../src/dedupe.mjs');

// normalization
ok('normName strips form+quotes', N.normName('ООО «Бетон-Юг»') === 'бетон юг');
ok('normDomain', N.normDomain('HTTPS://www.Beton-Yug.RU/contacts?x=1') === 'beton-yug.ru');
ok('normPhone 8→7', N.normPhone('8 (861) 200-10-20') === '78612001020');
ok('normPhone +7 same as 8', N.normPhone('+7 861 200 10 20') === N.normPhone('8 861 200 10 20'));
ok('normAddress strips ул/д', N.normAddress('г. Краснодар, ул. Северная, д. 320') === 'краснодар северная 320');
ok('geoCell rounds', N.geoCell(45.035123, 38.975456) === '45.035,38.975');
ok('evidence has provenance', (() => { const e = N.evidence({ source: '2gis', sourceRecordId: 'r1', rawValue: 'x', normalizedValue: 'x', confidence: 0.9 }); return e.source === '2gis' && e.fetched_at && e.evidence_hash; })());

// fuzzy name
ok('name similarity high for variants', N.nameSimilarity('Бетон-Юг', 'Бетон Юг') > 0.9);
ok('name similarity low for different', N.nameSimilarity('Бетон-Юг', 'МеталлСтрой') < 0.5);

// MIXED FIXTURES: same company across sources/formats
const A = { source: '2gis', source_record_id: '1', company: 'ООО Бетон-Юг', phones: ['8 (861) 200-10-20'], website: 'http://beton-yug.ru', address: 'г. Краснодар, ул. Северная 320', lat: 45.035, lng: 38.975 };
const B = { source: 'dataforseo', source_record_id: '2', company: 'Бетон Юг', phones: ['+7 861 200 10 20'], address: 'Краснодар Северная 320' }; // same phone, diff format
const C = { source: 'overpass', source_record_id: '3', company: 'Бетон-Юг Краснодар', website: 'https://www.beton-yug.ru', lat: 45.0351, lng: 38.9752 }; // same domain
const E = { source: '2gis', source_record_id: '4', company: 'МеталлСтрой', phones: ['8 861 999 88 77'], website: 'http://metallstroy.ru' }; // different company

ok('same phone diff format → merge', D.matchDecision(A, B).merge === true);
ok('same domain diff www → merge', D.matchDecision(A, C).merge === true);
ok('different company → no merge', D.matchDecision(A, E).merge === false);
// name-only must NOT merge
const nameOnly1 = { source: 's1', source_record_id: '9', company: 'Бетон-Юг', lat: 10, lng: 10 };
const nameOnly2 = { source: 's2', source_record_id: '10', company: 'Бетон Юг', lat: 60, lng: 60 }; // far apart, no strong key
const d = D.matchDecision(nameOnly1, nameOnly2);
ok('NAME ONLY (no strong key, far geo) → NOT merged', d.merge === false && d.reason === 'NAME_ONLY_INSUFFICIENT');

// clustering: A,B,C are one business; E separate
const clusters = D.clusterCandidates([A, B, C, E]);
const big = clusters.find(c => c.size === 3);
ok('cluster groups A+B+C', !!big);
ok('E stays separate', clusters.some(c => c.size === 1));

// merge preserves provenance + aliases + all phones/domains
const merged = D.mergeCluster([A, B, C, E], big.members);
ok('merge keeps all phones', merged.phones.length >= 1);
ok('merge keeps aliases', merged.aliases.length >= 2);
ok('merge reversible history', merged.merged_from.length === 2);
ok('merge keeps dedupe_keys', merged.dedupe_keys.some(k => k.startsWith('dom:') || k.startsWith('tel:')));

console.log(`\n==== lh_dedupe: ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
