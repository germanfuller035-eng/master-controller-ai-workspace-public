# Android External Drift Classification Report

FINAL_STATUS=NEED_OWNER_DECISION

## Baseline

- BASELINE_COMMIT=f75b9836b3141753fc99f2f4756e3e3329cff2e8
- BRANCH=feature/working-sales-mvp-launch-v1
- WORKTREE=D:\AI_WORKSPACE\.claude\worktrees\working-sales-mvp-launch-v1

## Files Inspected

- apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/MaterControllerRoot.kt
- apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/sales/WorkingSalesMvpScreen.kt
- apps/mater_controller_android/app/src/test/java/ru/dmitry/matercontroller/OwnerUiRawCodeSafetyTest.kt

## Android Drift Summary

- All three drift files are tracked and modified.
- The drift routes `working_sales_mvp` and `pilot/*` navigation entries to `WorkingSalesMvpScreen`.
- The drift adds a local operator lead import panel to the sales MVP screen.
- The import reads JSON from app external files using a runtime path equivalent to `operator_import/real_leads_pre_send.json`.
- The import populates in-memory sales MVP fields: company name, website/domain, contact, problem hints, and notes.
- The drift adds tests asserting the operator import UI and absence of committed operator import fixtures.

## Per-File Classification

### apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/MaterControllerRoot.kt

- GIT_STATUS=tracked modified
- PURPOSE=Android navigation root for app screens.
- CHANGE_SUMMARY=Replaces `PilotManualSalesCockpitScreen` with `WorkingSalesMvpScreen` for `working_sales_mvp` and `pilot/lead`, `pilot/qualify`, `pilot/draft`, `pilot/qa` routes.
- RUSSIAN_UI_OR_OWNER_VISUAL_REVIEW_RELATED=YES
- SALES_PILOT_RELATED=YES
- SEND_OUTBOUND_PAYMENT_PRODUCTION_WRITE=NO_DIRECT_CODE_FOUND
- CRM_WRITE_OR_OUTREACH_QUEUE=NO_DIRECT_CODE_FOUND
- REAL_LEADS_IN_GIT=NO
- REAL_CONTACT_DATA_IN_GIT=NO
- SECRETS=NO
- OWNER_VISIBLE_ENGLISH_RESIDUE=NO_NEW_VISIBLE_ENGLISH_FOUND_IN_THIS_FILE
- SAFE_TO_COMMIT=NO
- OWNER_DECISION_REQUIRED=YES
- CLASSIFICATION=KEEP_EXTERNAL_DRIFT_NEEDS_OWNER_DECISION
- REASON=Navigation changes alter which screen handles sales pilot routes and should be accepted or rejected as a product/UI routing decision.

### apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/sales/WorkingSalesMvpScreen.kt

- GIT_STATUS=tracked modified
- PURPOSE=Android Compose screen for manual working sales MVP flow.
- CHANGE_SUMMARY=Adds operator lead import state, local JSON parsing, external-file read path, import UI, previous/next imported lead controls, and several Russian label changes.
- RUSSIAN_UI_OR_OWNER_VISUAL_REVIEW_RELATED=PARTIAL
- SALES_PILOT_RELATED=YES
- SEND_OUTBOUND_PAYMENT_PRODUCTION_WRITE=NO_DIRECT_SEND_PAYMENT_OR_PRODUCTION_WRITE_CODE_FOUND
- CRM_WRITE_OR_OUTREACH_QUEUE=NO_DIRECT_CODE_FOUND
- REAL_LEADS_IN_GIT=NO
- REAL_CONTACT_DATA_IN_GIT=NO
- RUNTIME_REAL_LEAD_USAGE=YES_POTENTIAL
- SECRETS=NO
- OWNER_VISIBLE_ENGLISH_RESIDUE=YES_POTENTIAL
- OWNER_VISIBLE_ENGLISH_DETAILS=`LEAD_` and `QA` are newly introduced in owner-visible strings.
- SAFE_TO_COMMIT=NO
- OWNER_DECISION_REQUIRED=YES
- CLASSIFICATION=KEEP_EXTERNAL_DRIFT_NEEDS_OWNER_DECISION
- REASON=The screen now imports operator-provided lead/contact fields from app external storage. This is not a pure visual review change and needs explicit owner decision before committing.

### apps/mater_controller_android/app/src/test/java/ru/dmitry/matercontroller/OwnerUiRawCodeSafetyTest.kt

- GIT_STATUS=tracked modified
- PURPOSE=Local raw-code safety test for owner-visible UI labels and blocked unsafe success states.
- CHANGE_SUMMARY=Adds assertions that sales routes open `WorkingSalesMvpScreen`, operator import UI labels exist, no operator import fixtures are committed, and import reads from app external files.
- RUSSIAN_UI_OR_OWNER_VISUAL_REVIEW_RELATED=YES
- SALES_PILOT_RELATED=YES
- SEND_OUTBOUND_PAYMENT_PRODUCTION_WRITE=NO_DIRECT_CODE_FOUND
- CRM_WRITE_OR_OUTREACH_QUEUE=NO_DIRECT_CODE_FOUND
- REAL_LEADS_IN_GIT=NO
- REAL_CONTACT_DATA_IN_GIT=NO
- SECRETS=NO
- OWNER_VISIBLE_ENGLISH_RESIDUE=TEST_ASSERTIONS_INCLUDE_ENGLISH_ONLY_IN_TEST_MESSAGES_AND_TAGS
- TEST_DOES_NOT_HIDE_REAL_DATA=PASS
- TEST_DOES_NOT_ALLOW_DANGEROUS_ACTIONS=PASS
- TEST_DOES_NOT_WEAKEN_SAFETY_CHECKS=PASS
- TEST_DOES_NOT_MASK_ENGLISH_RESIDUE=PARTIAL_RISK
- SAFE_TO_COMMIT=NO
- OWNER_DECISION_REQUIRED=YES
- CLASSIFICATION=KEEP_EXTERNAL_DRIFT_NEEDS_OWNER_DECISION
- REASON=The test codifies the new operator import behavior, so it should not be committed before the owner decides whether that behavior is accepted.

## Safety Checks

- GIT_DIFF_STATUS=REVIEWED
- SECRETS_STATUS=NO_SECRETS_DETECTED_IN_DRIFT_FILES
- REAL_EMAIL_PHONE_CONTACT_DATA_STATUS=NO_REAL_EMAIL_OR_PHONE_MATCHES_IN_DRIFT_FILES
- REAL_LEAD_CONTACT_DATA_STATUS=NO_REAL_DATA_COMMITTED_BUT_RUNTIME_IMPORT_CAN_LOAD_REAL_LEAD_CONTACT_FIELDS
- LIVE_EXA_CALL_STATUS=NO_CALL_PERFORMED
- SEND_OUTBOUND_PAYMENT_PRODUCTION_WRITE_STATUS=NO_DIRECT_CODE_FOUND_IN_DRIFT
- CRM_WRITE_OUTREACH_QUEUE_STATUS=NO_DIRECT_CODE_FOUND_IN_DRIFT
- PRODUCTION_WRITE_STATUS=NO_DIRECT_CODE_FOUND_IN_DRIFT
- SALES_PILOT_STATUS=NOT_RUN

## Android/UI Tests Reviewed

- TEST_COMMAND=`.\gradlew.bat :app:testDebugUnitTest --tests ru.dmitry.matercontroller.OwnerUiRawCodeSafetyTest`
- TEST_RESULT=PASS
- TEST_SCOPE=local Android unit test only

## Action Taken

- Android files were not staged.
- Android files were not committed.
- Android files were not reverted.
- Classification report was created.
- COMMIT_HASH=NONE

## Remaining Worktree Status

- apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/MaterControllerRoot.kt remains modified.
- apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/sales/WorkingSalesMvpScreen.kt remains modified.
- apps/mater_controller_android/app/src/test/java/ru/dmitry/matercontroller/OwnerUiRawCodeSafetyTest.kt remains modified.
- _generated/android_external_drift_classification_v1/ANDROID_EXTERNAL_DRIFT_CLASSIFICATION_REPORT.md is untracked until owner decides whether to record this blocked classification.

## Known Limitations

- This review did not decide whether operator lead import belongs in the Android sales MVP.
- This review did not inspect any runtime external file contents because none are part of Git.
- This review did not continue to `COMPANY_LEVEL_CONTACT_PROVENANCE_CONTRACT_V1`.

## Next Safe Action

- Owner decision required: accept the Android operator import and route switch as an intentional UI/product change, or revert/redo the drift before the next provenance-contract gate.
