# Android Owner UX Redesign V1 — baseline audit

UPDATED_AT=2026-06-26 Europe/Moscow
BASE_HEAD=63a8fd9f14e04cc03d022c891af5d0baf46889f6
BRANCH=feature/android-owner-ux-redesign-v1
SCOPE=Android owner-facing UI only

## Baseline evidence

- `CURRENT_TASK_CHECKPOINT.md`: Session 0 final closeout says Run 2 complete, 41/41 screens complete, agents/multichannel/client route blockers resolved, outbound=0, payments=0, production DB writes=0.
- `_generated/session_0/SESSION_0_HANDOFF.md`: next session is `ANDROID_OWNER_UX_REDESIGN_AND_APPLE_SAMSUNG_ERGONOMICS_V1`; do not start UX inside Session 0; keep Honor proxy/reverse unless owner requests rollback.
- `_generated/session_0/SESSION_0_FINAL_REPORT.md`: assembleDebug and assembleDebugAndroidTest passed in Session 0; no VPS/backend/firewall/DNS/production deploy changes.
- `_generated/session_0/SESSION_0_FINAL_EVIDENCE_INDEX.md`: final acceptance evidence points to `_generated/full_run_2/RUN2_RESUME_PROGRESS.md`, runner ledgers, agents/multichannel targeted proofs.
- Android source: `apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/**`, `core/ui/**`, `core/designsystem/Theme.kt`.
- Runner contract: `apps/mater_controller_android/app/src/androidTest/assets/exec_plan.json` and `screen_anchors.json`; `ScreenByScreenRunner.kt` reads these assets at runtime.

## Current UX shape

- Top-level nav is five tabs: Today, Leads, Decisions, Replies, System.
- Commerce, Agents, AI, Costs, Knowledge, Multichannel, Transport, Conversations and Offer Review are mostly nested under Today -> Commercial Summary or System.
- STOP is not a first-class component in the System/Critical context.
- Common states exist (`LoadingState`, `ErrorState`, `EmptyState`, `OfflineBanner`) but are visually minimal and do not consistently give owner next action.
- Design system is a default Material3 theme with brand blue and basic `SectionCard`; spacing/typography/risk/status semantics are implicit.
- Existing text already avoids many raw enum leaks through `OwnerLocalization`, but several screens still show technical terms such as "dead-letter", "raw tokens", internal IDs, and raw-looking route/test labels in owner-adjacent places.

## Acceptance baseline

- Screen count: 41 routed acceptance screens.
- Control plan: 282 controls in `exec_plan.json`.
- Final Session 0 state: Full Run 1 green by recovery/tail evidence; Full Run 2 complete; agents and multichannel targeted regressions pass.
- Known runner hazards to preserve:
  - `agents`: already-open anchor accepted; target anchor wait required after nav step disappears.
  - `multichannel`: empty inbound rows are valid and must remain `PASS_EMPTY_STATE_VERIFIED`.
  - `offer_review`: empty offer list is valid; error state is not a false pass.
  - `conversations` and `delivery_review`: empty production data is valid when the screen anchor and empty marker exist.

## Baseline UX defects

| ID | Severity | Area | Evidence | Defect |
|---|---:|---|---|---|
| UXR-001 | P0 | Navigation | `MaterControllerRoot.kt` tabs | Top IA does not match owner command model: Commerce and Agents are hidden, Replies/Leads compete for top-level slots. |
| UXR-002 | P0 | STOP | Source search | No dedicated global STOP component in System/critical context. |
| UXR-003 | P1 | Today | `TodayScreen.kt` | Today is a list of cards; it does not front-load a 5-10 second owner situation summary. |
| UXR-004 | P1 | Design system | `Theme.kt`, `CommonUi.kt` | Spacing, status, risk and state components are implicit; repeated screens render inconsistent owner cards. |
| UXR-005 | P1 | Critical approvals | `ApprovalDetailScreen.kt`, `OfferReviewScreens.kt`, `AgentsScreens.kt` | Risk explanation is present in places but not standardized as a reusable owner-readable approval pattern. |
| UXR-006 | P1 | Empty/error states | Multiple screens | Empty state often says only "нет данных"; error state often repeats backend text without next action. |
| UXR-007 | P1 | One-hand use | Hub screens | Primary actions are scattered as cards inside long vertical lists; bottom primary action is absent. |
| UXR-008 | P1 | False success | Mutation screens | Existing code generally avoids false success, but confirmation/result language is not standardized. |
| UXR-009 | P2 | Technical text | Agents/Costs/System | Raw or technical terms are still visible where owner needs interpretation: dead-letter, raw tokens, direct writes. |
| UXR-010 | P2 | Test alignment | `exec_plan.json` | Runner nav still encodes old IA through `tab_leads` and `tab_replies`; must change only after UI contract changes. |

## Redesign requirements derived from baseline

- Introduce top-level IA: Today, Decisions/Approvals, Commerce, Agents/AI, System/STOP.
- Preserve every existing route and acceptance screen; route migration must be documented.
- Keep old deep route tags and anchors stable unless `exec_plan.json` and runner assertions are updated together.
- Standardize owner components: spacing tokens, status chips, risk badges R0-R5, owner cards, approval cards, incident cards, evidence/rollback block, bottom primary action, state surfaces, offline banner, STOP component.
- Keep all destructive/live-send/payment/backend actions out of scope.
- Keep `testTagsAsResourceId=true` and stable tags mandatory.

## Safety boundary

- PRODUCTION_CHANGES=NO
- VPS_CHANGED=NO
- HAPP_PROXY_CHANGED=NO unless only read/check is needed
- OUTBOUND_COUNT=0
- PAYMENT_COUNT=0
- PRODUCTION_DB_WRITES=0
- No AI_SYSTEM_FOUNDATION, MCP, VoltAgent, Qdrant, OPA, Knowledge architecture, Commercial Agent Factory, controlled outbound, deploy, merge, tag or release.
