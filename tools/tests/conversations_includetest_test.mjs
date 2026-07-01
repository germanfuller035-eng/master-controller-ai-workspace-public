// tools/tests/conversations_includetest_test.mjs
// SAFE_TEST_ONLY_CONVERSATIONS contract regression. Verifies the acceptance-only includeTest path on
// the /conversations list (same model as first-touch DEF-V3-001):
//   - a TEST_ONLY conversation is INVISIBLE with includeTest=false (owner/release) and VISIBLE with =true;
//   - a real conversation is shown in BOTH modes (the new param never hides real owner data);
//   - the list is pure read-only: no send, no ledger write, store_revision unchanged in both calls;
//   - scope label flips REAL_COMMERCIAL_ONLY <-> ALL.
// Runs against a temp store; never sends, never deploys, never touches the canonical prod store.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'convinc'));
const STORE = path.join(tmp, 'store.json');

// Minimal store: one REAL opportunity + one TEST_ONLY opportunity. isTestLeadId matches ^TEST_ONLY.
const REAL_ID = 'REAL-LEAD-1';
const TEST_ID = 'TEST_ONLY_CONV_ACCEPT_V3';
const store = {
    store_revision: 7,
    'commercial.opportunities': {
        opp_real: { opportunity_id: 'opp_real', lead_id: REAL_ID, stage: 'QUALIFIED', created_at: '2026-06-01T10:00:00Z' },
        opp_test: { opportunity_id: 'opp_test', lead_id: TEST_ID, stage: 'QUALIFIED', created_at: '2026-06-02T10:00:00Z', test_only: true },
    },
    'commercial.offers': {},
    'commercial.deals': {},
};
fs.writeFileSync(STORE, JSON.stringify(store, null, 2));
process.env.MATER_STORE_PATH = STORE;

const conv = (await import('../mater_controller_api/src/commercial/conversations.mjs')).default;
const { readStore } = await import('../mater_controller_api/src/shared/store_access.mjs');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('FAIL', n); } };
const revBefore = Number(readStore(STORE).store_revision) || 0;

// ---- owner / release mode (includeTest=false) ----
const ownerList = conv.listConversations({ includeTest: false });
const ownerIds = ownerList.items.map((i) => String(i.lead_id));
ok('C1 owner scope REAL_COMMERCIAL_ONLY', ownerList.scope === 'REAL_COMMERCIAL_ONLY');
ok('C2 owner sees real conversation', ownerIds.includes(REAL_ID));
ok('C3 owner does NOT see TEST_ONLY conversation', !ownerIds.includes(TEST_ID));

// default (no arg) must behave exactly like owner mode (release safety)
const defList = conv.listConversations();
ok('C4 default == owner (no test leak)', !defList.items.map((i) => String(i.lead_id)).includes(TEST_ID));
ok('C5 default scope REAL_COMMERCIAL_ONLY', defList.scope === 'REAL_COMMERCIAL_ONLY');

// ---- acceptance / debug mode (includeTest=true) ----
const acceptList = conv.listConversations({ includeTest: true });
const acceptIds = acceptList.items.map((i) => String(i.lead_id));
ok('C6 acceptance scope ALL', acceptList.scope === 'ALL');
ok('C7 acceptance sees TEST_ONLY conversation', acceptIds.includes(TEST_ID));
ok('C8 acceptance still sees real conversation', acceptIds.includes(REAL_ID));
ok('C9 acceptance card has send_capability NONE', acceptList.items.every((i) => i.send_capability === 'NONE'));

// ---- KPI leak: the TEST_ONLY conversation card never crosses into owner mode ----
// (count-diff is not asserted: ledger/replies are read from the global WORKSPACE and may add other
//  pre-existing test/internal ids in acceptance mode; the contract is per-id visibility, not a count.)
ok('C10 TEST_ONLY id visible only in acceptance, never in owner', acceptIds.includes(TEST_ID) && !ownerIds.includes(TEST_ID));

// ---- pure read-only: store_revision unchanged, no ledger mutation ----
const revAfter = Number(readStore(STORE).store_revision) || 0;
ok('C11 store_revision unchanged (read-only)', revAfter === revBefore);

// ---- timeline of the TEST_ONLY conversation is buildable (so card opens) but no-send ----
const tl = conv.getTimeline(TEST_ID);
ok('C12 TEST_ONLY timeline buildable', tl && tl.lead_id === TEST_ID && Array.isArray(tl.events));
const realTl = conv.getTimeline(REAL_ID);
ok('C13 real timeline buildable', realTl && realTl.lead_id === REAL_ID);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`conversations_includetest: ${pass}/${pass + fail} pass` + (fail ? ` (${fail} FAIL)` : ''));
process.exit(fail ? 1 : 0);
