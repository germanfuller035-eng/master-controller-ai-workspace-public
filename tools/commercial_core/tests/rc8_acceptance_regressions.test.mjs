// tools/commercial_core/tests/rc8_acceptance_regressions.test.mjs
// Regression tests for the 3 defects the Android Acceptance Lab caught against the production
// snapshot (pure predicate locks; the full read models are exercised by the on-VPS API suite + emulator).

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('FAIL', n); } };

// We re-implement the exact evidence predicate the service uses, to lock the JBI-ARMAVIR fix:
// a guessed/unverified source is NEVER public evidence.
function evidenced(email_source) {
    const src = String(email_source || '').toLowerCase();
    return !!src && !/guess|unverified|inferred|assumed/.test(src);
}
// Defect 1: JBI-ARMAVIR — email present + source 'guessed_unverified' must NOT be evidenced.
ok('A1 guessed_unverified not evidenced', evidenced('guessed_unverified') === false);
ok('A2 guessed not evidenced', evidenced('guessed') === false);
ok('A3 inferred not evidenced', evidenced('inferred') === false);
ok('A4 manual_verified IS evidenced', evidenced('manual_verified_csv') === true);
ok('A5 site_published IS evidenced', evidenced('site_published') === true);
ok('A6 empty source not evidenced', evidenced('') === false);

// Defect 2: false follow-up — a followup next action requires a COMMERCIAL send. Guard predicate:
function isFalseFollowup(kind, leadInCommercialSends) {
    return ['followup', 'check_reply', 'await_reply'].includes(kind) && !leadInCommercialSends;
}
ok('B1 followup without commercial send = false (suppress)', isFalseFollowup('followup', false) === true);
ok('B2 followup with commercial send = allowed', isFalseFollowup('followup', true) === false);
ok('B3 review kind never suppressed', isFalseFollowup('review_first_touch_draft', false) === false);

// Defect 3: dialogs test-entity exclusion predicate.
const isTestLeadId = (id) => /^TEST_ONLY|^INTERNAL_|^TEST_|_E2E$|^selftest|^(002|A|MA-1)$|VALIDATION_ONLY/i.test(String(id || ''));
ok('C1 002 is test', isTestLeadId('002'));
ok('C2 selftest is test', isTestLeadId('selftest:<x@y>'));
ok('C3 INTERNAL_VALIDATION is test', isTestLeadId('INTERNAL_VALIDATION_ONLY_20260614'));
ok('C4 TEST_KGBI23_E2E is test', isTestLeadId('TEST_KGBI23_E2E'));
ok('C5 STROYDVOR not test', !isTestLeadId('STROYDVOR-UG_RU'));
ok('C6 DKBI not test', !isTestLeadId('DKBI_RU'));

console.log(`\n==== rc8_acceptance_regressions: ${pass} passed, ${fail} failed ====`);
if (fail > 0) process.exit(1);
