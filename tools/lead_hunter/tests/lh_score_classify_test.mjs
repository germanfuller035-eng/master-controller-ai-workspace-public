// lh_score_classify_test.mjs — Phase 5: website classification + score_v2 + routing. PURE offline.
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n); } };

const C = await import('../src/classify.mjs');
const S = await import('../src/score.mjs');

// website tiers
ok('no url → NO_SITE', C.classifyWebsite({ noUrl: true }).tier === 'NO_SITE');
ok('dns fail → DOMAIN_UNRESOLVED', C.classifyWebsite({ dnsResolved: false }).tier === 'DOMAIN_UNRESOLVED');
ok('timeout → SITE_UNREACHABLE', C.classifyWebsite({ dnsResolved: true, reachable: false }).tier === 'SITE_UNREACHABLE');
ok('500 → BROKEN_SITE', C.classifyWebsite({ dnsResolved: true, reachable: true, httpStatus: 500 }).tier === 'BROKEN_SITE');
ok('403 → SITE_UNREACHABLE (blocked)', C.classifyWebsite({ dnsResolved: true, reachable: true, httpStatus: 403 }).tier === 'SITE_UNREACHABLE');
ok('200 thin → WEAK_SITE', C.classifyWebsite({ dnsResolved: true, reachable: true, httpStatus: 200, hasViewport: false, tlsOk: true }).tier === 'WEAK_SITE');
ok('200 rich → STRONG_SITE', C.classifyWebsite({ dnsResolved: true, reachable: true, httpStatus: 200, hasViewport: true, hasContact: true, hasForm: true, hasCta: true, hasStructuredData: true, hasAnalytics: true, tlsOk: true, copyrightYear: 2026 }, new Date('2026-06-16')).tier === 'STRONG_SITE');
ok('stale copyright pulls down', C.classifyWebsite({ dnsResolved: true, reachable: true, httpStatus: 200, hasViewport: true, hasContact: true, hasForm: true, hasCta: true, tlsOk: true, copyrightYear: 2018 }, new Date('2026-06-16')).tier === 'WEAK_SITE');

// email
ok('official page → OFFICIAL_PAGE', C.classifyEmail({ onOfficialContactPage: true }) === 'OFFICIAL_PAGE');
ok('guessed → GUESSED', C.classifyEmail({ guessed: true }) === 'GUESSED');
ok('guessed not contactable', !C.emailIsContactable('GUESSED'));
ok('official contactable', C.emailIsContactable('OFFICIAL_PAGE'));

// identity needs 2 signals
ok('2 signals → VERIFIED', C.classifyIdentity({ nameAddressMatch: true, coordCategoryMatch: true }).status === 'IDENTITY_VERIFIED');
ok('1 signal → PARTIAL', C.classifyIdentity({ nameAddressMatch: true }).status === 'IDENTITY_PARTIAL');
ok('conflict → CONFLICT', C.classifyIdentity({ nameAddressMatch: true, conflict: true }).status === 'IDENTITY_CONFLICT');

// routing — no-site/no-email stay valid candidates
ok('NO_SITE → NO_SITE_OFFER', C.leadRoute({ websiteTier: 'NO_SITE', emailStatus: 'PUBLIC_DIRECTORY_CONFIRMED', identityStatus: 'IDENTITY_VERIFIED' }) === 'NO_SITE_OFFER');
ok('BROKEN → recovery', C.leadRoute({ websiteTier: 'BROKEN_SITE', emailStatus: 'OFFICIAL_PAGE', identityStatus: 'IDENTITY_VERIFIED' }) === 'BROKEN_SITE_RECOVERY');
ok('WEAK + email → mini-audit', C.leadRoute({ websiteTier: 'WEAK_SITE', emailStatus: 'OFFICIAL_PAGE', identityStatus: 'IDENTITY_VERIFIED' }) === 'WEAK_SITE_MINI_AUDIT');
ok('WEAK no email → manual contact', C.leadRoute({ websiteTier: 'WEAK_SITE', emailStatus: 'UNCONFIRMED', identityStatus: 'IDENTITY_VERIFIED' }) === 'NO_EMAIL_MANUAL_CONTACT');
ok('low identity → research', C.leadRoute({ websiteTier: 'WEAK_SITE', emailStatus: 'OFFICIAL_PAGE', identityStatus: 'IDENTITY_UNKNOWN' }) === 'LOW_CONFIDENCE_RESEARCH');

// score_v2 determinism + components
const lead = { region_match: true, niche_match: true, industry: 'concrete', website_tier: 'WEAK_SITE', email_status: 'OFFICIAL_PAGE', phones: ['7861...'], identity_status: 'IDENTITY_VERIFIED', latest_evidence_at: new Date('2026-06-15').toISOString() };
const s1 = S.scoreV2(lead, new Date('2026-06-16')); const s2 = S.scoreV2(lead, new Date('2026-06-16'));
ok('score deterministic', JSON.stringify(s1.score_components) === JSON.stringify(s2.score_components));
ok('score version v2', s1.score_version === 'score_v2');
ok('score 0..100', s1.overall_priority_score >= 0 && s1.overall_priority_score <= 100);
ok('weak-site good lead qualifies', s1.result === 'QUALIFIED');
ok('explanation present', /market_fit=/.test(s1.explanation));
// no-site lead still scores (digital pain high, not rejected)
const noSite = { region_match: true, niche_match: true, website_tier: 'NO_SITE', email_status: 'PUBLIC_DIRECTORY_CONFIRMED', phones: ['x'], identity_status: 'IDENTITY_VERIFIED', latest_evidence_at: new Date('2026-06-15').toISOString() };
const ns = S.scoreV2(noSite, new Date('2026-06-16'));
ok('no-site lead not auto-rejected', ns.result !== 'REJECT' && ns.score_components.digital_pain > 20);
// opt-out → REJECT
ok('opt-out → REJECT', S.scoreV2({ ...lead, opt_out: true }, new Date('2026-06-16')).result === 'REJECT');
ok('guessed email → REJECT', S.scoreV2({ ...lead, email_status: 'GUESSED' }, new Date('2026-06-16')).blockers.includes('GUESSED_EMAIL'));
// null-safe
ok('null-safe on empty lead', typeof S.scoreV2({}, new Date()).overall_priority_score === 'number');

console.log(`\n==== lh_score_classify: ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
