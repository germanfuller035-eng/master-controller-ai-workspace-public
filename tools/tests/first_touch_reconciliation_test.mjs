// tools/tests/first_touch_reconciliation_test.mjs
// Regression: the First Touch scorer must account for every owner-visible real lead — each real lead
// is either SCORED (eligible) or NOT_SCORED with at least one explicit reason. TEST_ONLY leads are
// skipped in the real-owner path and covered by first_touch_includetest_test.mjs.
// Runs against a committed 62-lead production snapshot fixture (read-only). NEVER sends, NEVER writes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, 'fixtures', 'first_touch_recon', 'lead_pipeline_store_62.json');

// Point the service at the fixture before importing it (config resolves env at import time).
process.env.MATER_STORE_PATH = FIXTURE;
process.env.MATER_AI_USAGE_LEDGER_PATH = path.join(__dirname, 'fixtures', 'first_touch_recon', 'ai_usage_ledger.jsonl');
process.env.MATER_SEND_LEDGER_PATH = path.join(__dirname, 'fixtures', 'first_touch_recon', 'outbound_send_ledger.jsonl');

const { readStore, leadsArray } = await import('../mater_controller_api/src/shared/store_access.mjs');
const firstTouch = (await import('../mater_controller_api/src/commercial/first_touch_service.mjs')).default;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('FAIL', n); } };

const store = readStore(FIXTURE);
const leads = leadsArray(store);
const p = firstTouch.pilotCandidates();
const isTestLead = (l) => l.test_only === true || /^TEST_ONLY|^INTERNAL_|^TEST_|_E2E$|^selftest|^(002|A|MA-1)$|VALIDATION_ONLY/i.test(String(l.lead_id || ''));
const realLeads = leads.filter((l) => !isTestLead(l));

const ALLOWED = new Set(['REJECTED', 'ON_HOLD', 'MISSING_CONTACT', 'CONTACT_NOT_EVIDENCED', 'MISSING_REAL_AUDIT',
    'AUDIT_QA_FAILED', 'QUALITY_OR_COMPLIANCE_GATE', 'TEST_ONLY', 'INTERNAL', 'PRIOR_COMMERCIAL_SEND', 'OPT_OUT',
    'BOUNCE_SUPPRESSION', 'DUPLICATE', 'OUTSIDE_CAMPAIGN',
    'BLOCKED_IDENTITY_MISMATCH', 'BLOCKED_CONTACT_UNVERIFIED', 'BLOCKED_UNCERTAIN_PRIOR_SEND', 'BLOCKED_PRIOR_SEND',
    'NEEDS_OWNER_HISTORY_REVIEW', 'SUPPRESS_DO_NOT_CONTACT', 'SUPPRESSED_DUPLICATE_OR_NO_REPLY',
    'FOLLOW_UP_ONLY_EXISTING_THREAD', 'FOLLOW_UP_SENT', 'NEEDS_OWNER_OVERRIDE', 'NOT_A_REAL_LEAD']);

ok('R1 store has 62 leads', leads.length === 62);
ok('R2 scorer considered all real owner-visible leads', p.leads_considered === realLeads.length && p.leads_scored === realLeads.length);
ok('R3 every real lead present in scorer output', p.all.length === realLeads.length);

const ids = new Set(realLeads.map((l) => String(l.lead_id)));
const scoredIds = new Set(p.all.map((r) => String(r.lead_id)));
ok('R4 no real lead dropped from scorer', [...ids].every((id) => scoredIds.has(id)));
ok('R4b no test lead leaks into real-owner scorer', leads.filter(isTestLead).every((l) => !scoredIds.has(String(l.lead_id))));

const eligible = p.all.filter((r) => r.eligible);
const notScored = p.all.filter((r) => !r.eligible);
ok('R5 scored + not_scored == real lead count', eligible.length + notScored.length === realLeads.length);
ok('R6 zero unexplained exclusions', notScored.every((r) => r.excluded_reasons.length > 0));
ok('R7 all exclusion reasons are from the allowed set', notScored.every((r) => r.excluded_reasons.every((e) => ALLOWED.has(e))));
ok('R8 pilot_eligible matches eligible rows', p.pilot_eligible === eligible.length);
ok('R9 unexplained_exclusions metric is 0', p.unexplained_exclusions === 0);
ok('R10 no-send invariant', p.no_send === true);

// The 12 cand_* discovery leads must be NOT_SCORED with MISSING_CONTACT (legit expected).
const cand = p.all.filter((r) => String(r.lead_id).startsWith('cand_'));
ok('R11 twelve discovery candidates present', cand.length === 12);
ok('R12 discovery candidates excluded with explicit reason', cand.every((r) => !r.eligible && r.excluded_reasons.length > 0));

console.log(`\n==== first_touch_reconciliation: ${pass} passed, ${fail} failed ====`);
process.exit(fail === 0 ? 0 : 1);
