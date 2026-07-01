// lh_foundation_test.mjs — Phase 1: state machine + repo + campaign. PURE offline.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n); } };

const { STATE, canTransition, isTerminal, ALL_STATES } = await import('../src/state.mjs');
const { openRepo, newId, COLLECTIONS } = await import('../src/repository.mjs');
const { createCampaign, listCampaigns, getCampaign, CAMPAIGN_DEFAULTS } = await import('../src/campaign.mjs');

// state machine
ok('legal transition DISCOVERED→NORMALIZED', canTransition(STATE.DISCOVERED, STATE.NORMALIZED));
ok('illegal transition DISCOVERED→PROMOTED rejected', !canTransition(STATE.DISCOVERED, STATE.PROMOTED));
ok('missing-website is not rejection (own state)', ALL_STATES.includes('VERIFIED_NO_WEBSITE') && canTransition(STATE.VERIFICATION_PENDING, STATE.VERIFIED_NO_WEBSITE));
ok('no-website can still be scored', canTransition(STATE.VERIFIED_NO_WEBSITE, STATE.SCORED));
ok('PROMOTED is terminal', isTerminal(STATE.PROMOTED) && !canTransition(STATE.PROMOTED, STATE.SCORED));
ok('REJECTED is terminal', isTerminal(STATE.REJECTED));

// repo
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lh_'));
const dbPath = path.join(dir, 'db.json');
const repo = openRepo({ dbPath });
ok('all collections empty initially', COLLECTIONS.every(c => repo.all(c).length === 0));
const bid = newId('biz');
repo.put('businesses', bid, { name: 'Test', dedupe_keys: ['dom:test.ru'] });
ok('put+get business', repo.get('businesses', bid).name === 'Test');
repo.patch('businesses', bid, { state: STATE.NORMALIZED });
ok('patch persists', repo.get('businesses', bid).state === 'NORMALIZED');
// restart persistence: new repo instance reads from disk
const repo2 = openRepo({ dbPath });
ok('restart persistence (reload from disk)', repo2.get('businesses', bid).name === 'Test');

// campaign defaults are production-safe
const camp = createCampaign(repo, { name: 'Krasnodar concrete', region: 'Krasnodar Krai', niches: ['concrete'] });
ok('campaign created', !!getCampaign(repo, camp.id));
ok('default shadow mode', camp.mode === 'shadow');
ok('scheduler disabled by default', camp.scheduler_enabled === false);
ok('promotion disabled by default', camp.promotion_enabled === false);
ok('max_raw default 20', camp.max_raw_candidates === 20);
ok('max_verified default 5', camp.max_verified_candidates === 5);
ok('include_no_website true', camp.include_no_website === true);
// clamp guard
const huge = createCampaign(repo, { name: 'huge', max_raw_candidates: 999999 });
ok('raw candidates clamped to 200', huge.max_raw_candidates === 200);
ok('list returns campaigns', listCampaigns(repo).length >= 2);

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n==== lh_foundation: ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
