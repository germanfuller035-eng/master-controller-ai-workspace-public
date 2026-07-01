// tools/commercial_core/tests/rc7_unified_truth.test.mjs
// Validates the unified-truth send classifier + stage helpers (pure, no store/network).
import { classifySend, SEND_CLASS, PRIMARY_STAGES } from '../../mater_controller_api/src/commercial/owner_commercial_truth.mjs';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('FAIL', n); } };

const commercial = new Set(['STROYDVOR-UG_RU', 'DKBI_RU', 'ZAVODATOM_RU']);

// the 7 real ledger records must all classify as test/internal/self-test/validation (NOT commercial)
ok('T1 002 internal', classifySend({ lead_id: '002' }, { commercialLeadIds: commercial }).classification === SEND_CLASS.INTERNAL);
ok('T2 MA-1 internal', classifySend({ lead_id: 'MA-1' }, { commercialLeadIds: commercial }).classification === SEND_CLASS.INTERNAL);
ok('T3 selftest', classifySend({ lead_id: 'selftest:<x@y.ru>' }, { commercialLeadIds: commercial }).classification === SEND_CLASS.SELF_TEST);
ok('T4 internal validation', classifySend({ lead_id: 'INTERNAL_VALIDATION_ONLY_20260614' }, { commercialLeadIds: commercial }).classification === SEND_CLASS.VALIDATION);
ok('T5 TEST_OWNER', classifySend({ lead_id: 'TEST_OWNER_EMAIL_CHANNEL' }, { commercialLeadIds: commercial }).classification === SEND_CLASS.TEST_ONLY);
ok('T6 e2e test', classifySend({ lead_id: 'TEST_KGBI23_E2E' }, { commercialLeadIds: commercial }).classification === SEND_CLASS.TEST_ONLY);
ok('T7 none are commercial', ['002', 'A', 'MA-1', 'selftest:<x>', 'INTERNAL_VALIDATION_ONLY_20260614', 'TEST_OWNER_EMAIL_CHANNEL', 'TEST_KGBI23_E2E']
    .every((id) => classifySend({ lead_id: id }, { commercialLeadIds: commercial }).classification !== SEND_CLASS.COMMERCIAL));

// a real commercial offer lead WOULD classify commercial if it had a send
ok('T8 commercial match', classifySend({ lead_id: 'DKBI_RU' }, { commercialLeadIds: commercial }).classification === SEND_CLASS.COMMERCIAL);

// classification carries evidence + confidence
const c = classifySend({ lead_id: 'TEST_KGBI23_E2E' }, { commercialLeadIds: commercial });
ok('T9 evidence present', Array.isArray(c.evidence) && c.evidence.length > 0 && c.confidence > 0);

// stages enum has exactly-one-per-lead candidates incl READY_FOR_SEND_REVIEW + AWAITING_REPLY
ok('T10 stages include key states', PRIMARY_STAGES.includes('READY_FOR_SEND_REVIEW') && PRIMARY_STAGES.includes('AWAITING_REPLY') && PRIMARY_STAGES.includes('REJECTED'));

console.log(`\n==== rc7_unified_truth: ${pass} passed, ${fail} failed ====`);
if (fail > 0) process.exit(1);
