# Owner Visible Product Review Gate V1

OWNER_VISIBLE_REVIEW_STATUS=COMPLETE_CONCERN_CONFIRMED
CURRENT_HEAD=c915ecc4ef77d200168506eb4a4ad2daff91b8c0
ANDROID_ACCEPTANCE_STATUS=PASS
REVIEW_SCOPE=EXISTING_ANDROID_ACCEPTANCE_EVIDENCE_ONLY

## Basis

Read evidence:

- `_generated/hardening_release_v1/final_android_acceptance_rerun_unlocked/FINAL_ANDROID_ACCEPTANCE_REPORT.md`
- `_generated/hardening_release_v1/final_android_acceptance_rerun_unlocked/SCREEN_SUMMARY.md`
- `_generated/hardening_release_v1/final_android_acceptance_rerun_unlocked/KNOWN_ANDROID_LIMITATIONS.md`
- `_generated/hardening_release_v1/final_android_acceptance_rerun_unlocked/manual_navigation_verification.json`
- `_generated/hardening_release_v1/final_android_acceptance_rerun_unlocked/ui_hierarchy/SANITIZED_UI_HIERARCHY_SUMMARY.md`
- `_generated/hardening_release_v1/HARDENING_EVIDENCE_INDEX.md`
- `_generated/hardening_release_v1/OWNER_RELEASE_DECISION_PACKET.md`

No new Android tests, Gradle, APK install, merge, tag, deploy, outbound send, payment, production database write, VPS, DNS, HAPP, proxy, backend, or feature-flag action was performed.

The acceptance evidence proves route reachability, no-send safety, no payment, no production write, and several visible anchors. It does not prove that the owner experience is clear, complete, or useful enough for product release. Raw UI hierarchy XML and screenshots were not retained in the rerun evidence; the only UI hierarchy artifact is the sanitized anchor/status summary.

OWNER_VISIBLE_RESULT_CONCERN_CONFIRMED=YES

## Owner-Visible Scorecard

Interpretation:

- `reached=YES` means the Android acceptance evidence reached the screen or manually verified its anchor.
- `data useful=YES` is used only when the evidence showed a concrete owner-readable data path or useful empty state.
- `confusing technical text=YES` means the evidence or screen purpose indicates likely owner-facing jargon/status mechanics that need clearer product wording.
- `visual/ergonomic issue=YES` means the evidence shows weak discoverability, insufficient proof of clarity, scattered workflow, or manual navigation limitation.

| screen | reached | visible value for owner | main action clear | data useful | empty state acceptable | confusing technical text | action safety clear | visual/ergonomic issue | owner value score 0-5 | verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| home | YES | Shows Today entry point and visible STOP card, but evidence does not show a 10-second owner summary. | NO | NO | NO | YES | YES | YES | 2 | NEEDS_VISIBLE_REPAIR |
| approvals | YES | Likely useful as owner decision surface, but evidence does not prove R4/R5 decision clarity. | NO | NO | NO | YES | YES | YES | 3 | NEEDS_VISIBLE_REPAIR |
| pipeline | YES | Opens lead pipeline, but evidence does not prove owner can see lead state, priority, or next action. | NO | NO | NO | YES | YES | YES | 2 | NEEDS_VISIBLE_REPAIR |
| offer_review | YES | Useful no-send offer preview surface, but approval semantics need to be visibly explicit. | NO | YES | NO | YES | YES | YES | 3 | NEEDS_VISIBLE_REPAIR |
| replies | YES | Opens replies area, but evidence does not prove drafts are understandable, prioritized, or safely reviewable. | NO | NO | NO | YES | YES | YES | 2 | NEEDS_VISIBLE_REPAIR |
| commandcenter_commercial | YES | Commercial hub can route owner to sales surfaces, but workflow value is fragmented. | NO | YES | NO | YES | YES | YES | 3 | NEEDS_VISIBLE_REPAIR |
| agents | YES | Agent surface opens, but likely reads as internal automation status without clear owner limits. | NO | NO | NO | YES | YES | YES | 2 | NEEDS_VISIBLE_REPAIR |
| cost | YES | Cost topic is valuable, but current evidence proves only screen reachability, not spend insight. | NO | NO | NO | YES | YES | YES | 3 | NEEDS_VISIBLE_REPAIR |
| owner_incidents | YES | Incident screen reached and owner-readable empty state `Инцидентов нет` was verified. | YES | YES | YES | NO | YES | NO | 3 | EMPTY_BUT_ACCEPTABLE |
| knowledge | YES | Knowledge hub exposes urgent, weekly, monthly, sources, and status routes. | YES | YES | YES | YES | YES | NO | 4 | GOOD_ENOUGH |
| operations | YES | System/operations hub exposes reliability, cost, backup, queue, sources, AI usage, connection, and blocked unsafe actions. | YES | YES | YES | YES | YES | NO | 4 | GOOD_ENOUGH |
| multichannel | YES | Multichannel anchor reached manually, but runner could not discover the card without bounded scroll. | NO | NO | NO | YES | YES | YES | 2 | NEEDS_VISIBLE_REPAIR |
| transport | YES | Delivery review empty state `Нет записей на сверку` was verified by ledger evidence. | YES | YES | YES | NO | YES | NO | 2 | EMPTY_BUT_ACCEPTABLE |
| conversations | YES | Read-only conversation timeline rows open and close, giving some owner review value. | YES | YES | YES | NO | YES | NO | 3 | GOOD_ENOUGH |
| ai | YES | AI usage/cost detail opens and refreshes, but limitations and real/off status need owner-readable framing. | NO | NO | NO | YES | YES | YES | 2 | NEEDS_VISIBLE_REPAIR |

## Screen Group Conclusions

REAL_OWNER_VALUE_NOW:

- `knowledge`: gives a usable read-only knowledge/status hub, although real Qdrant/Docling remain contract-only.
- `operations`: gives the clearest safety/control evidence and blocked unsafe action evidence, but still uses technical system framing.
- `conversations`: gives a read-only owner timeline flow.

OPENS_BUT_WEAK_OR_CONFUSING:

- `home`: not yet a 10-second owner cockpit.
- `approvals`: decision safety exists, but owner decision language is not proven clear.
- `pipeline`, `offer_review`, `replies`, `commandcenter_commercial`, `multichannel`: commercial workflow is present but scattered and not owner-obvious.
- `agents`, `ai`: risks reading as automation internals rather than controlled owner-facing product.
- `cost`: important area, but evidence does not prove spend clarity.

EMPTY_BUT_ACCEPTABLE:

- `owner_incidents`: acceptable because `Инцидентов нет` was verified.
- `transport`: acceptable because `Нет записей на сверку` was verified.

BLOCKERS_FOUND_FROM_EXISTING_EVIDENCE:

- No screen-level technical blocker was found after unlock.
- Product readiness blocker remains owner-visible clarity and usefulness, not route reachability.

## Contract-Only Not Product Ready

CONTRACT_ONLY_NOT_PRODUCT_READY=[voice_capture,real_qdrant,real_docling,real_opa,real_voltagent_runtime,real_mcp_production_servers,real_browser_automation,real_crm_payment_mail_integration,post_hardening_contract_layers]

| item | why contract-only | needed to make it real | should block release |
| --- | --- | --- | --- |
| voice_capture | No current Android APK voice route was accepted; voice remains outside visible installed app behavior. | Android voice UI, microphone permission flow, capture UX, backend voice pipeline, privacy state, and acceptance evidence. | YES if voice is claimed as product-ready; NO for foundation/archive release. |
| real_qdrant | Knowledge/vector storage is listed as not enabled. | Provisioned Qdrant, authenticated connection, indexing pipeline, failure states, monitoring, and Android-visible search/status proof. | YES if semantic memory/search is promised; NO for no-real-integration archive. |
| real_docling | Document ingestion remains contract/local only. | Real Docling service path, file ingestion UX, processing status, errors, retention policy, and evidence with safe sample docs. | YES if document intelligence is promised; NO for foundation-only release. |
| real_opa | Policy engine is not production-active. | Real OPA deployment/config, policy decision logs, owner-readable allow/deny explanations, and regression gate. | YES for production automation; NO for current no-send owner UI. |
| real_voltagent_runtime | Agent runtime remains OFF / not production runtime. | Runtime activation gate, limits, observability, kill switch, owner consent, and Android status showing real/off states. | YES if autonomous agents are claimed live; NO for manual review/no-send archive. |
| real_mcp_production_servers | MCP production servers are not enabled. | Server deployment, auth, read/write scopes, audit logs, rollback, and owner-visible status. | YES if production MCP is in scope; NO for local/synthetic release. |
| real_browser_automation | Browser automation remains contract/disabled. | Sandbox, allowlist, recording, approval UX, failure recovery, and proof that no uncontrolled browser action occurs. | YES if browser actions are advertised; NO for current safe no-action gate. |
| real_crm_payment_mail_integration | CRM/payment/mail integrations are OFF; outbound and payments counts remain zero. | Real provider credentials, dry-run/preview UX, explicit owner approval, no-send-to-send gate, payment safeguards, and audit trail. | YES for commercial production launch; NO for no-send foundation archive. |
| post_hardening_contract_layers | Later layers are documented as contracts, not installed owner-product behavior. | Separate activation macro-sessions, real integration evidence, Android-visible status, and owner approval. | YES if marketed as complete product; NO for internal foundation milestone. |

## Top 3 Visible Repair Candidates

### 1. Today / Home owner cockpit

current problem:

- Acceptance proves `today_screen` and `card_system_stop`, but not that the owner understands the system in 10 seconds.
- The home screen does not yet have evidence of a simple owner summary: what needs attention, what is safe/off, what costs money, and what cannot send.

proposed repair:

- Make Today the owner cockpit: `Needs attention`, `Waiting for approval`, `Commercial pipeline`, `Safety/STOP`, `Spend today/month`, `Incidents`, and `Last sync`.
- Use plain Russian labels and explicit safe/off states: `Отправка выключена`, `Платежи выключены`, `Продакшн-запись выключена`.
- Make STOP visible as status plus guarded action, not just a card.

files likely affected:

- `apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/home/TodayScreen.kt`
- `apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/home/TodayViewModel.kt`
- `apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/core/ui/CommonUi.kt`
- `apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/core/ui/OwnerLocalization.kt`

tests needed:

- Focused Android acceptance for `home`.
- Screenshot/manual owner review for 10-second clarity.
- ViewModel/unit mapping for safe/off states and empty/error states.

expected owner-visible delta:

- Very high. This directly addresses "it still feels broken" because the first screen becomes a readable product status, not a route launcher.

risk:

- Medium. Mostly presentation aggregation, but it must not imply real integrations are live.

whether Android build/install required:

- YES.

### 2. Pipeline / Commercial no-send workflow

current problem:

- `pipeline`, `offer_review`, `replies`, `commandcenter_commercial`, and `multichannel` open, but value is fragmented.
- `multichannel` needed manual bounded scroll because the runner did not discover the lower commercial card.
- Evidence does not prove the owner can understand lead priority, offer state, reply state, and no-send limits in one flow.

proposed repair:

- Create a clear commercial work surface: lead stage counts, urgent leads, offer previews, reply drafts, multichannel queue, and explicit `preview only / no send` badges.
- Make the primary action "review/approve text only" rather than any wording that suggests real send.
- Reduce hidden lower-card navigation and make commercial subtasks discoverable from the first viewport.

files likely affected:

- `apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/pipeline/PipelineHomeScreen.kt`
- `apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/pipeline/PipelineQueueScreen.kt`
- `apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/commercial/CommercialSummaryScreen.kt`
- `apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/commercial/CommandCenterScreen.kt`
- `apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/commercial/OfferReviewScreens.kt`
- `apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/replies/RepliesScreen.kt`
- `apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/multichannel/MultichannelScreen.kt`

tests needed:

- Focused Android acceptance for `pipeline`, `offer_review`, `replies`, `commandcenter_commercial`, and `multichannel`.
- No-send regression: outbound count remains zero and no real send affordance is enabled.
- Manual owner review of commercial first viewport and empty/error states.

expected owner-visible delta:

- Very high. It turns the commercial area from "many screens open" into "I can see what is happening with leads/offers and why nothing sends automatically."

risk:

- Medium-high. Touches several screens and must preserve no-send boundaries.

whether Android build/install required:

- YES.

### 3. Safety / Costs / Incidents / STOP

current problem:

- Safety signals exist, but they are scattered across Today, Operations, Cost, Incidents, AI usage, and system routes.
- `owner_incidents` and `transport` empty states are acceptable, but empty does not equal confidence.
- Cost and AI usage screens pass reachability, but evidence does not prove spend is understandable.

proposed repair:

- Add a compact safety and spend panel: STOP status, outbound OFF, payments OFF, production writes OFF, today's/monthly spend, open incidents, last failure, backup/restore status.
- Use owner-readable green/yellow/red status with text labels, not technical route names only.
- Keep destructive/system actions guarded by confirmation and show why actions are disabled.

files likely affected:

- `apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/cost/CostCenterScreen.kt`
- `apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/operations/OperationsScreens.kt`
- `apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/system/SystemScreen.kt`
- `apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/home/TodayScreen.kt`
- `apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/commandcenter/OwnerListScreen.kt`
- `apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/ai/AiUsageScreen.kt`

tests needed:

- Focused Android acceptance for `home`, `cost`, `owner_incidents`, `operations`, and `ai`.
- Unsafe action blocked checks for STOP/system cards.
- Empty-state checks for no incidents/no delivery records and cost unavailable states.

expected owner-visible delta:

- High. It makes safety and cost visible as product value rather than hidden test assertions.

risk:

- Medium. Needs careful language so disabled production capabilities are not presented as live.

whether Android build/install required:

- YES.

## Release Decision

RECOMMENDED_DECISION=NEEDS_OWNER_VISIBLE_REPAIR_BEFORE_MERGE

Rationale:

- Android acceptance passed, but it mainly proves screens are reachable and dangerous actions were not executed.
- The owner concern is supported by the evidence gap: there is little proof that the visible product is understandable, useful, or polished.
- Contract-only layers are not APK failures, but they make a product-ready claim unsafe.
- Legacy Full Run 1/2 would improve technical confidence, but it would not fix owner-visible clarity.

Not recommended now:

- READY_FOR_MERGE_TAG_GATE: rejected because owner-visible value is not acceptable enough.
- RELEASE_ARCHIVE_ONLY: possible later, but not the best next step if the goal is owner product usefulness.
- RUN_LEGACY_FULL_RUN_FIRST: not the primary next move because the issue is visible product quality, not missing confidence evidence.

## Final Status Fields

OWNER_VISIBLE_REVIEW_STATUS=COMPLETE_CONCERN_CONFIRMED
CURRENT_HEAD=c915ecc4ef77d200168506eb4a4ad2daff91b8c0
ANDROID_ACCEPTANCE_STATUS=PASS
SCREENS_REVIEWED=15
GOOD_ENOUGH_COUNT=3
NEEDS_VISIBLE_REPAIR_COUNT=10
EMPTY_BUT_ACCEPTABLE_COUNT=2
CONTRACT_ONLY_COUNT=9
BLOCKER_COUNT=0
TOP_3_VISIBLE_REPAIR_CANDIDATES=[today_home_owner_cockpit,pipeline_commercial_no_send_workflow,safety_costs_incidents_stop]
CONTRACT_ONLY_NOT_PRODUCT_READY=[voice_capture,real_qdrant,real_docling,real_opa,real_voltagent_runtime,real_mcp_production_servers,real_browser_automation,real_crm_payment_mail_integration,post_hardening_contract_layers]
RECOMMENDED_DECISION=NEEDS_OWNER_VISIBLE_REPAIR_BEFORE_MERGE
MERGE_RECOMMENDED=NO
TAG_RECOMMENDED=NO
DEPLOY_RECOMMENDED=NO
LEGACY_FULL_RUN_RECOMMENDED=NO
OWNER_VISIBLE_REPAIR_RECOMMENDED=YES
NEXT_PROMPT_RECOMMENDATION=START_OWNER_VISIBLE_REPAIR_SPRINT_V1_TOP_3_ONLY_NO_SEND_NO_PROD
