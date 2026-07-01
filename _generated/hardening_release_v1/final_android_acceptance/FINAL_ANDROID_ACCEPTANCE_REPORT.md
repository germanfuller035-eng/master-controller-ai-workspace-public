# Final Android Owner Acceptance Report

FINAL_ANDROID_ACCEPTANCE_STATUS=BLOCKED
BLOCKED_REASON=DEVICE_LOCKED_KEYGUARD_PIN_REQUIRED
DATE=2026-06-27 Europe/Moscow
BRANCH=feature/ai-system-hardening-disaster-recovery-release-v1
HEAD_BEFORE=4d4ed7f7fee666c7f7a7eb9e8406e4d40e23d10d
ANDROID_SOURCE_CHANGED_AFTER_UX=NO
ANDROID_BUILD_REQUIRED=NO
ANDROID_INSTALL_REQUIRED=NO

## Scope

Owner approved Option B: final focused Android owner acceptance only.

No merge, tag, deploy, production action, legacy Full Run 1/2, Android build, APK install, app data clear, feature flag change, VPS change, DNS change, HAPP/proxy change, outbound send, payment, or production database write was performed.

## Environment

- WORKTREE=D:\AI_WORKSPACE\.claude\worktrees\ai-system-hardening-disaster-recovery-release-v1
- BRANCH=feature/ai-system-hardening-disaster-recovery-release-v1
- START_HEAD=4d4ed7f7fee666c7f7a7eb9e8406e4d40e23d10d
- WORKTREE_STATUS_BEFORE=CLEAN

## Android change check

Compared against UX implementation head `ab35db507db0c5aa4c52e3fc9a235f05f7b257f1`.

Checked paths:

- `apps/mater_controller_android/**`
- `tools/android_acceptance_lab/**`
- `apps/mater_controller_android/app/src/androidTest/java/**`
- `apps/mater_controller_android/app/src/androidTest/assets/control_plan.jsonl`
- `apps/mater_controller_android/app/src/androidTest/assets/exec_plan.json`

Result:

- ANDROID_SOURCE_CHANGED_AFTER_UX=NO
- ANDROID_BUILD_REQUIRED=NO
- ANDROID_INSTALL_REQUIRED=NO

## Device and route check

- DEVICE_SERIAL=AMSKBB4914919475
- DEVICE_STATE=device
- ADB_REVERSE_STATUS=PASS
- ADB_REVERSE=tcp:18089->tcp:10809
- ANDROID_GLOBAL_PROXY=127.0.0.1:18089
- DEVICE_ROUTE_STATUS=PASS
- HONOR_HEALTH=200
- HONOR_OFFERS=401
- NO_TIMEOUT=YES
- NO_CONNECTION_REFUSED=YES
- NO_DNS_FAILURE=YES

Note: `adb reverse tcp:18089 tcp:10809` was restored because it was absent at precheck. Android global proxy was already correct.

## Owner-visible smoke

The focused owner-visible smoke did not start because the physical device remained on keyguard and required PIN unlock.

Evidence:

- `dumpsys window`: `isKeyguardShowing=true`
- `mCurrentFocus=NotificationShade`
- App activity was started but hidden behind keyguard: `ru.dmitry.matercontroller.debug/ru.dmitry.matercontroller.MainActivity ... mVisible=false`
- UI hierarchy showed PIN prompt and keypad.

No PIN was guessed, no app data was cleared, and no APK was installed.

## Screens planned but blocked

SCREENS_CHECKED=[]
SCREENS_PASS=0
SCREENS_BLOCKED=[home,approvals,pipeline,offer_review,replies,commandcenter_commercial,agents,cost,owner_incidents,knowledge,multichannel,transport,conversations,ai]

Planned coverage mapped to existing APK screens:

- Today: `home`
- Approvals / Decisions: `approvals`
- Leads: `pipeline`
- Offer Preview: `offer_review`
- Replies: `replies`
- Deals / commercial owner hub: `commandcenter_commercial`
- Agents: `agents`
- Costs: `cost`
- Incidents: `owner_incidents`
- Memory / knowledge area: `knowledge`
- Multichannel: `multichannel`
- Transport: `transport`
- Conversations: `conversations`
- AI usage/cost detail: `ai`

## Contract-only cases

CONTRACT_ONLY_NOT_IN_ANDROID_APK=[real_qdrant,real_docling,real_opa,real_voltagent_runtime,real_mcp_production_servers,real_browser_automation,real_voice_capture,real_crm_payment_mail_integration,post_hardening_contract_layers]

These were not treated as Android failures because the final Android acceptance scope is the installed APK and owner-visible interface, not contract-only local validators.

## Safety result

APPROVAL_SAFETY_STATUS=NOT_RUN_DEVICE_LOCKED
STOP_STATUS=NOT_RUN_DEVICE_LOCKED
NO_SEND_STATUS=PASS
NO_PAYMENT_STATUS=PASS
NO_PRODUCTION_WRITE_STATUS=PASS
OUTBOUND_COUNT=0
PAYMENT_COUNT=0
PRODUCTION_DB_WRITES=0
MERGE_DONE=NO
TAG_CREATED=NO
DEPLOY_DONE=NO
PRODUCTION_CHANGES=NO
VPS_CHANGED=NO
DNS_CHANGED=NO
FEATURE_FLAGS_CHANGED=NO

## Evidence files

- `_generated/hardening_release_v1/final_android_acceptance/FINAL_ANDROID_ACCEPTANCE_REPORT.md`
- `_generated/hardening_release_v1/final_android_acceptance/FINAL_ANDROID_ACCEPTANCE_LOGCAT.txt`
- `_generated/hardening_release_v1/final_android_acceptance/SCREEN_SUMMARY.md`
- `_generated/hardening_release_v1/final_android_acceptance/KNOWN_ANDROID_LIMITATIONS.md`
- `_generated/hardening_release_v1/final_android_acceptance/ui_hierarchy/precheck_keyguard.xml`

## Next owner decision

NEXT_OWNER_DECISION=UNLOCK_DEVICE_AND_RERUN_FINAL_ANDROID_ACCEPTANCE

After owner unlocks the device, rerun Option B without build/install/data clear unless Android source changes.
