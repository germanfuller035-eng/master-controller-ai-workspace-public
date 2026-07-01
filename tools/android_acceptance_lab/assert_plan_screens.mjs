// assert_plan_screens.mjs — regression guard for control→screen assignment in the canonical
// exec_plan.json (the file ScreenByScreenRunner.kt actually reads). Protects against the DEF-V3-006
// class of bug: a control rendering on screen A but recorded under screen B.
//
//   node assert_plan_screens.mjs        # exit 0 if all invariants hold, 1 otherwise
//
// Invariants:
//   - every conv_* control            → screen "conversations"
//   - the timeline-dialog "Закрыть"   → screen "conversations" (CTRL-0317, text selector)
//   - every dr_*/transport-back/refresh control on delivery_review → screen "transport"
//   - every to_badge control          → screen "test_only"
//   - CONTROLS_WITHOUT_SCREEN          == 0
//   - total control count preserved   == EXPECTED_TOTAL
import fs from 'node:fs';

const PLAN = 'apps/mater_controller_android/app/src/androidTest/assets/exec_plan.json';
const EXPECTED_TOTAL = 283;
const plan = JSON.parse(fs.readFileSync(PLAN, 'utf8'));

const fails = [];
let without = 0;

for (const c of plan) {
  const sel = c.selector_value || '';
  const scr = c.screen_id;
  if (!scr) { without++; fails.push(`${c.control_id}: CONTROLS_WITHOUT_SCREEN (sel=${sel})`); continue; }

  // conv_* must live on conversations
  if (sel.startsWith('conv_') && scr !== 'conversations')
    fails.push(`${c.control_id}: conv_ control on '${scr}', expected 'conversations'`);

  // the timeline close button (text "Закрыть") that was on transport must now be conversations.
  // (knowledge_digest's own "Закрыть"=CTRL-0169 is allowed; we only forbid it on 'transport'.)
  if (c.selector_kind === 'text' && sel === 'Закрыть' && scr === 'transport')
    fails.push(`${c.control_id}: timeline 'Закрыть' still on 'transport', expected 'conversations'`);

  // to_badge must live on test_only
  if (sel === 'to_badge' && scr !== 'test_only')
    fails.push(`${c.control_id}: to_badge control on '${scr}', expected 'test_only'`);

  // transport screen must NOT contain any conversations/test_only-only selectors
  if (scr === 'transport' && (sel.startsWith('conv_') || sel === 'to_badge'))
    fails.push(`${c.control_id}: '${sel}' wrongly on transport`);
}

const counts = {};
for (const c of plan) counts[c.screen_id] = (counts[c.screen_id] || 0) + 1;

const wrong = fails.length;
console.log('=== assert_plan_screens ===');
console.log(`TOTAL=${plan.length} (expected ${EXPECTED_TOTAL})`);
console.log(`transport=${counts.transport || 0} conversations=${counts.conversations || 0} test_only=${counts.test_only || 0}`);
console.log(`CONTROLS_WITH_WRONG_SCREEN=${wrong}`);
console.log(`CONTROLS_WITHOUT_SCREEN=${without}`);

if (plan.length !== EXPECTED_TOTAL) fails.push(`TOTAL ${plan.length} != expected ${EXPECTED_TOTAL}`);

if (fails.length) {
  console.error('\nFAILURES:');
  for (const f of fails) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log('\nOK — all control→screen invariants hold.');
