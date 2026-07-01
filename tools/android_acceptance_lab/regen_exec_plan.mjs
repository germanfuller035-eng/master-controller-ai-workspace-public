// regen_exec_plan.mjs — DEF-V3-003 fix: reassign mis-assigned controls to the screen where their
// testTag actually renders, with the correct nav path. Source of truth: the plan audit + verified
// against MaterControllerRoot.kt routes and feature/*.kt testTags.
//
//   node regen_exec_plan.mjs            # DRY-RUN: print changes, write nothing
//   node regen_exec_plan.mjs --apply    # write exec_plan.json (+ .bak) and print added anchors
//
// Nav steps: {by:"res",sel}|{by:"text",sel}. Detail screens include a dynamic row-tap (harness
// matches By.res by the static prefix before '$'). Anchors that are dynamic at runtime resolve to a
// concrete value (owner_list_incidents, ma_list_needs_check); offer_detail_ is matched by prefix.
import fs from 'node:fs';
import path from 'node:path';

const PLAN = 'apps/mater_controller_android/app/src/androidTest/assets/exec_plan.json';
const apply = process.argv.includes('--apply');

const R = (sel) => ({ by: 'res', sel });
const T = (sel) => ({ by: 'text', sel });

// Reusable nav fragments (verified against MaterControllerRoot.kt)
const COMMERCIAL = [R('tab_today'), R('card_commercial')];
const SYSTEM = [R('tab_system')];
const CMDCENTER = [R('tab_today'), R('card_command_center')];
const MINIAUDIT = [R('tab_today'), R('card_next_action')];

// Reassignment rules. Each maps an old (screen_id, selector-prefix) to {screen, nav, anchor, sel?}.
// Matching is by selector_value startsWith(prefix) AND current screen_id === fromScreen.
const RULES = [
  // 1. command center commercial (C1A) — cc_* live in commercial/CommandCenterScreen.kt
  { from: 'commercial', prefix: 'cc_', screen: 'commandcenter_commercial',
    nav: [...COMMERCIAL, T('Команды')], anchor: 'command_center' },
  // 2. incident_ack → owner_list_incidents
  { from: 'commandcenter', prefix: 'incident_ack_', screen: 'owner_incidents',
    nav: [...CMDCENTER, T('Все инциденты')], anchor: 'owner_list_incidents' },
  // 3. q_* → owner_queues
  { from: 'agents', prefix: 'q_', screen: 'owner_queues',
    nav: [...COMMERCIAL, R('cs_queues')], anchor: 'owner_queues' },
  // 4. tel_filter_ → source_telemetry
  { from: 'sources', prefix: 'tel_filter_', screen: 'source_telemetry',
    nav: [...SYSTEM, R('ops_card_source_telemetry')], anchor: 'source_telemetry' },
  // 5. offer review list + detail
  { from: 'commercial', prefix: 'offer_row_', screen: 'offer_review',
    nav: [...COMMERCIAL, R('cs_send_review')], anchor: 'offer_review_list' },
  { from: 'commercial', prefix: 'offer_detail_', screen: 'offer_detail',
    nav: [...COMMERCIAL, R('cs_send_review'), R('offer_row_')], anchor: 'offer_detail_' },
  { from: 'commercial', prefix: 'offer_act_preview', screen: 'offer_detail',
    nav: [...COMMERCIAL, R('cs_send_review'), R('offer_row_')], anchor: 'offer_detail_' },
  { from: 'commercial', prefix: 'offer_action_confirm', screen: 'offer_detail',
    nav: [...COMMERCIAL, R('cs_send_review'), R('offer_row_')], anchor: 'offer_detail_' },
  { from: 'commercial', prefix: 'offer_preview_close', screen: 'offer_detail',
    nav: [...COMMERCIAL, R('cs_send_review'), R('offer_row_')], anchor: 'offer_detail_' },
  // 6. pd_status → product_detail
  { from: 'catalog', prefix: 'pd_status', screen: 'product_detail',
    nav: [...COMMERCIAL, R('cs_catalog'), R('product_')], anchor: 'product_detail' },
  // 7. approvals list + detail
  { from: 'approvals', prefix: 'approval_row_', screen: 'approval_list',
    nav: [R('tab_decisions'), R('approvals_card_')], anchor: 'approval_list_' },
  { from: 'approvals', prefix: 'approval_detail_', screen: 'approval_detail',
    nav: [R('tab_decisions'), R('approvals_card_'), R('approval_row_')], anchor: 'approval_detail_' },
  { from: 'approvals', prefix: 'btn_defer', screen: 'approval_detail',
    nav: [R('tab_decisions'), R('approvals_card_'), R('approval_row_')], anchor: 'approval_detail_' },
  { from: 'approvals', prefix: 'btn_reject', screen: 'approval_detail',
    nav: [R('tab_decisions'), R('approvals_card_'), R('approval_row_')], anchor: 'approval_detail_' },
  // 8. mini-audit list + lead detail
  { from: 'miniaudit', prefix: 'ma_search', screen: 'ma_list',
    nav: [...MINIAUDIT, R('ma_card_needs')], anchor: 'ma_list_needs_check' },
  { from: 'miniaudit', prefix: 'lead_row_', screen: 'ma_list',
    nav: [...MINIAUDIT, R('ma_card_needs')], anchor: 'ma_list_needs_check' },
  { from: 'miniaudit', prefix: 'btn_send_email', screen: 'ma_lead',
    nav: [...MINIAUDIT, R('ma_card_needs'), R('lead_row_')], anchor: 'lead_detail' },
  { from: 'miniaudit', prefix: 'btn_cancel_send', screen: 'ma_lead',
    nav: [...MINIAUDIT, R('ma_card_needs'), R('lead_row_')], anchor: 'lead_detail' },
  { from: 'miniaudit', prefix: 'btn_confirm_send', screen: 'ma_lead',
    nav: [...MINIAUDIT, R('ma_card_needs'), R('lead_row_')], anchor: 'lead_detail' },
  { from: 'miniaudit', prefix: 'btn_reject', screen: 'ma_lead',
    nav: [...MINIAUDIT, R('ma_card_needs'), R('lead_row_')], anchor: 'lead_detail' },
  { from: 'miniaudit', prefix: 'tab_$', screen: 'ma_lead',
    nav: [...MINIAUDIT, R('ma_card_needs'), R('lead_row_')], anchor: 'lead_detail' },
  // 9. knowledge digest
  { from: 'knowledge', prefix: 'knowledge_digest', screen: 'knowledge_digest',
    nav: [...SYSTEM, R('ops_card_knowledge'), R('kn_urgent')], anchor: 'knowledge_digest' },
  { from: 'knowledge', prefix: 'kn_finding_', screen: 'knowledge_digest',
    nav: [...SYSTEM, R('ops_card_knowledge'), R('kn_urgent')], anchor: 'knowledge_digest' },
  // 10. conversations + test_only.
  // TransportScreens.kt holds THREE composables (DeliveryReview/TestOnly/Conversations) under one
  // feature dir, so the static scanner (screenRoute = parent dir) labels all of them 'transport'.
  // These rules re-home the controls that actually render on conversations/test_only.
  { from: 'transport', prefix: 'conv_', screen: 'conversations',
    nav: [...COMMERCIAL, R('cs_conversations')], anchor: 'conversations' },
  { from: 'transport', prefix: 'to_badge', screen: 'test_only',
    nav: [...COMMERCIAL, R('cs_test_only')], anchor: 'to_badge' },
  // DEF-V3-006: the timeline-dialog close button (TransportScreens.kt:133, onClick=closeTimeline)
  // is a TEXT selector "Закрыть" with no testTag. It lives ONLY inside ConversationsScreen (opens
  // after tapping a conv_ row), but the static scanner left it on 'transport' and the testTag-only
  // reassignment guard skipped it. Re-home to conversations. kind:'text' so it matches the text
  // selector; `from:'transport'` keeps it from touching CTRL-0169 (knowledge_digest "Закрыть").
  { from: 'transport', kind: 'text', prefix: 'Закрыть', screen: 'conversations',
    nav: [...COMMERCIAL, R('cs_conversations')], anchor: 'conversations' },
  // 11. ops deadletters + sources
  { from: 'operations', prefix: 'btn_retry_', screen: 'ops_deadletters',
    nav: [...SYSTEM, R('ops_card_deadletters')], anchor: 'ops_deadletters' },
  { from: 'operations', prefix: 'source_$', screen: 'ops_sources',
    nav: [...SYSTEM, R('ops_card_sources')], anchor: 'ops_sources' },
  // 12. automation — now wired (DEF-V3-004): route `automation` via ops_card_automation
  { from: 'automation', prefix: 'auto_', screen: 'automation',
    nav: [...SYSTEM, R('ops_card_automation')], anchor: 'automation_screen' },
  { from: 'automation', prefix: 'automation_screen', screen: 'automation',
    nav: [...SYSTEM, R('ops_card_automation')], anchor: 'automation_screen' },
  // 13. pipeline_card → leads_card (PipelineHomeScreen dead; LeadsHomeScreen supersedes)
  { from: 'pipeline', prefix: 'pipeline_card_', screen: 'pipeline', remapSel: (s) => s.replace('pipeline_card_', 'leads_card_'),
    nav: [R('tab_leads')], anchor: 'leads_home' },
];

const plan = JSON.parse(fs.readFileSync(PLAN, 'utf8'));
const changes = [];
const newAnchors = {};

function ruleFor(c) {
  for (const r of RULES) {
    // A rule defaults to matching testTag selectors; rules may opt into matching a text selector
    // (DEF-V3-006) by setting kind:'text'. The selector_kind of the control must match the rule's kind.
    const ruleKind = r.kind || 'testTag';
    if (c.selector_kind !== ruleKind) continue;
    if (c.screen_id === r.from && (c.selector_value || '').startsWith(r.prefix)) return r;
  }
  return null;
}

for (const c of plan) {
  // testTag and text selectors are both eligible; ruleFor() enforces the per-rule kind.
  if (c.selector_kind !== 'testTag' && c.selector_kind !== 'text') continue;
  const r = ruleFor(c);
  if (!r) continue;
  const oldScreen = c.screen_id, oldNav = JSON.stringify(c.nav), oldSel = c.selector_value;
  c.screen_id = r.screen;
  c.nav = r.nav;
  if (r.remapSel) c.selector_value = r.remapSel(c.selector_value);
  newAnchors[r.screen] = r.anchor;
  changes.push({ id: c.control_id, from: oldScreen, to: r.screen,
    sel: oldSel === c.selector_value ? oldSel : `${oldSel}→${c.selector_value}`,
    nav: r.nav.map((n) => n.sel).join('/') });
}

console.log(`=== DEF-V3-003 regen: ${changes.length} controls reassigned ===`);
const byTo = {};
for (const ch of changes) byTo[ch.to] = (byTo[ch.to] || 0) + 1;
console.log('reassigned by new screen:', JSON.stringify(byTo, null, 0));
for (const ch of changes) console.log(`  ${ch.id}  ${ch.from}→${ch.to}  sel=${ch.sel}  nav=[${ch.nav}]`);
console.log('\n=== anchors to add to screen_anchors.json ===');
console.log(JSON.stringify(newAnchors, null, 2));

if (apply) {
  fs.copyFileSync(PLAN, PLAN + '.bak_def003');
  fs.writeFileSync(PLAN, JSON.stringify(plan) + '\n', 'utf8');
  console.log(`\nAPPLIED. Backup: ${path.basename(PLAN)}.bak_def003. Add the anchors above to screen_anchors.json.`);
} else {
  console.log('\nDRY-RUN — nothing written. Re-run with --apply to write.');
}
