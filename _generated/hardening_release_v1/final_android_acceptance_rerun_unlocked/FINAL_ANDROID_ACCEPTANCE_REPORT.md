# Final Android Acceptance Rerun After Manual Unlock

FINAL_ANDROID_ACCEPTANCE_STATUS=PASS
DATE=2026-06-27 Europe/Moscow
BRANCH=feature/ai-system-hardening-disaster-recovery-release-v1
HEAD_BEFORE=6d5eb63baf21811380921b37e8fa8f8614ddba9b
DEVICE_SERIAL=AMSKBB4914919475
DEVICE_UNLOCKED=YES
KEYGUARD_LOCKED=NO
SCREEN_ON=YES

## Scope

Owner approved rerun of focused Android owner acceptance after manual device unlock.

No PIN guessing, keyguard bypass, app data clear, APK install, Android rebuild, Gradle, legacy Full Run 1/2, broad Android acceptance, merge, tag, deploy, production action, feature flag change, HAPP/VPN/proxy change, outbound send, payment, or production database write was performed.

## Environment

- WORKTREE=D:\AI_WORKSPACE\.claude\worktrees\ai-system-hardening-disaster-recovery-release-v1
- BRANCH=feature/ai-system-hardening-disaster-recovery-release-v1
- START_HEAD=6d5eb63baf21811380921b37e8fa8f8614ddba9b
- WORKTREE_STATUS_BEFORE=CLEAN

## Device unlock check

- DEVICE_STATE=device
- KEYGUARD_LOCKED=NO
- SCREEN_ON=YES
- APP_VISIBLE=YES
- Current focus: `ru.dmitry.matercontroller.debug/ru.dmitry.matercontroller.MainActivity`

## Device route check

- ADB_REVERSE_STATUS=PASS
- ADB_REVERSE=tcp:18089->tcp:10809
- ANDROID_GLOBAL_PROXY=127.0.0.1:18089
- DEVICE_ROUTE_STATUS=PASS
- HONOR_HEALTH=200
- HONOR_OFFERS=401
- NO_TIMEOUT=YES
- NO_CONNECTION_REFUSED=YES
- NO_DNS_FAILURE=YES

No HAPP, VPN, Windows proxy, VPS, DNS, Caddy, backend, or firewall change was made.

## Android source and install decision

Compared against UX implementation head `ab35db507db0c5aa4c52e3fc9a235f05f7b257f1`.

- ANDROID_SOURCE_CHANGED_AFTER_UX=NO
- ANDROID_BUILD_REQUIRED=NO
- ANDROID_INSTALL_REQUIRED=NO

No Gradle task was run and no APK was installed.

## Focused owner-visible smoke result

SCREENS_CHECKED=[home,approvals,pipeline,offer_review,replies,commandcenter_commercial,agents,cost,owner_incidents,knowledge,operations,multichannel,transport,conversations,ai]
SCREENS_PASS=15
SCREENS_BLOCKED=[]

Summary:

- Today: PASS, owner home reached; STOP entry visible.
- Approvals / Decisions: PASS.
- Leads: PASS.
- Offer Preview: PASS.
- Replies: PASS.
- Deals / commercial owner hub: PASS.
- Agents: PASS.
- Costs: PASS.
- Incidents: PASS_EMPTY_STATE_VERIFIED, `owner_list_incidents` reached and `Инцидентов нет` shown.
- Memory / knowledge area: PASS.
- Global STOP / System: PASS, Today STOP entry visible and Operations/System route passed.
- Multichannel: PASS_MANUAL_NAVIGATION, commercial hub card `cs_multichannel` was found by manual bounded scroll and the `multichannel` anchor reached.
- Transport: PASS.
- Conversations: PASS on single-screen rerun.
- AI usage / cost detail: PASS.

## Runner limitations handled

- `owner_incidents`: ScreenByScreenRunner reported `unexecuted=2` because there were no incident acknowledgement rows. Manual UI verification confirmed the screen anchor and owner-readable empty state `Инцидентов нет`.
- `multichannel`: ScreenByScreenRunner did not scroll far enough to find the lower commercial card `cs_multichannel`. Manual bounded scroll found the card, opened the screen, and confirmed the `multichannel` anchor without connection errors or loading state.
- `conversations`: A first concurrent host invocation produced invalid evidence and was discarded. A single-screen rerun completed PASS.

## Contract-only cases

CONTRACT_ONLY_NOT_IN_ANDROID_APK=[voice_capture,voice_placeholder_status,real_qdrant,real_docling,real_opa,real_voltagent_runtime,real_mcp_production_servers,real_browser_automation,real_crm_payment_mail_integration,post_hardening_contract_layers]

These are not Android APK failures because this acceptance checks the installed owner interface only.

## Safety checks

APPROVAL_SAFETY_STATUS=PASS_OWNER_APPROVAL_SURFACES_NO_SEND
STOP_STATUS=PASS_VISIBLE_ENTRY_NO_DESTRUCTIVE_ACTION
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

- `_generated/hardening_release_v1/final_android_acceptance_rerun_unlocked/FINAL_ANDROID_ACCEPTANCE_REPORT.md`
- `_generated/hardening_release_v1/final_android_acceptance_rerun_unlocked/FINAL_ANDROID_ACCEPTANCE_LOGCAT.txt`
- `_generated/hardening_release_v1/final_android_acceptance_rerun_unlocked/SCREEN_SUMMARY.md`
- `_generated/hardening_release_v1/final_android_acceptance_rerun_unlocked/KNOWN_ANDROID_LIMITATIONS.md`
- `_generated/hardening_release_v1/final_android_acceptance_rerun_unlocked/manual_navigation_verification.json`
- `_generated/hardening_release_v1/final_android_acceptance_rerun_unlocked/screen_logs/`
- `_generated/hardening_release_v1/final_android_acceptance_rerun_unlocked/ui_hierarchy/SANITIZED_UI_HIERARCHY_SUMMARY.md`

Raw UI hierarchy XML was not retained in this rerun evidence folder; only sanitized anchor/status summaries were kept.

## Next owner decision

NEXT_OWNER_DECISION=RUN_LEGACY_FULL_RUN_OR_PREPARE_MERGE_TAG_GATE
