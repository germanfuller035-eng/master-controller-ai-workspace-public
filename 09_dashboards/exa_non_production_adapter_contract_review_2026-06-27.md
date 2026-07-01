# Exa Non-Production Adapter Contract Review - 2026-06-27

FINAL_STATUS=PASS_COMMITTED_WITH_EXTERNAL_DRIFT

## Baseline

- BASELINE_COMMIT=ea8fc8424ed10fff4819c0ffbb4a39f54553ca80
- BRANCH=feature/working-sales-mvp-launch-v1
- WORKTREE=D:\AI_WORKSPACE\.claude\worktrees\working-sales-mvp-launch-v1
- STARTING_WORKTREE_STATUS=DIRTY_EXTERNAL_DRIFT_PRESENT
- EXTERNAL_DRIFT_NOT_TOUCHED:
  - apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/MaterControllerRoot.kt
  - apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/sales/WorkingSalesMvpScreen.kt
  - apps/mater_controller_android/app/src/test/java/ru/dmitry/matercontroller/OwnerUiRawCodeSafetyTest.kt

## Files Reviewed

- tools/commercial/exa_research_ingestion.py
- tools/commercial/exa_research_result.py
- schemas/commercial/exa_research_result.schema.json
- tests/commercial/test_exa_research_ingestion.py
- tests/commercial/test_exa_research_result.py
- 09_dashboards/exa_non_production_ingestion_report_2026-06-27.md

## Review Changes

- 09_dashboards/exa_non_production_adapter_contract_review_2026-06-27.md
- tests/commercial/test_exa_research_ingestion.py

PRODUCTION_PATH_CHANGE_STATUS=NOT_CHANGED_BY_THIS_REVIEW

## Adapter API Review

- `ingest_exa_research_result()` validates first, returns accepted non-production ingestion metadata, owner-review item, routing booleans, and the validated result.
- `normalize_exa_research_for_owner_review()` validates first and emits the expected owner-review shape.
- `can_send_to_owner_review()` validates before returning true.
- `can_route_to_enrichment()` validates before returning true.
- `can_route_to_scoring()` validates before returning true.
- `can_route_to_outreach()` validates first and never returns allowed by default.

ADAPTER_CONTRACT_REVIEW_STATUS=PASS

## Validation Before Downstream

- OWNER_REVIEW_VALIDATION_FIRST=PASS
- ENRICHMENT_VALIDATION_FIRST=PASS
- SCORING_VALIDATION_FIRST=PASS
- OUTREACH_ROUTING_VALIDATION_FIRST=PASS
- INVALID_PAYLOAD_DOWNSTREAM_REJECT_STATUS=PASS

VALIDATION_BEFORE_DOWNSTREAM_STATUS=PASS

## Owner Review Normalization

Required fields verified:

- `review_item_type`
- `review_status`
- `research_task_id`
- `lead_id`
- `company_name`
- `website`
- `facts_count`
- `buying_signals_count`
- `contact_candidates_count`
- `risk_flags_count`
- `has_high_risk`
- `do_not_contact`
- `recommended_next_action`
- `source_urls`
- `outreach_routing`

OWNER_REVIEW_NORMALIZATION_STATUS=PASS

## Outreach Route Guard

- INVALID_PAYLOAD_BLOCKED=PASS
- DO_NOT_CONTACT_TRUE_BLOCKED=PASS
- HIGH_SEVERITY_RISK_FLAG_BLOCKED=PASS
- NO_OWNER_APPROVAL_BLOCKED=PASS
- OUTREACH_ALLOWED_BY_DEFAULT=NO

OUTREACH_ROUTE_GUARD_STATUS=PASS

## Source URLs

- SOURCE_URLS_PRESERVED_STATUS=PASS
- Verified ordered, de-duplicated source URL collection from facts, buying signals, contact candidates, and risk flags.

## Email/Phone Limitation Review

- EMAIL_PHONE_CONTACT_CANDIDATES_CURRENT_STATUS=REJECTED_BY_NON_PRODUCTION_ADAPTER
- REASON=current Exa Research Result contract allows `email` and `phone` syntactically, but does not prove company-level provenance.
- FUTURE_CONTRACT_RECOMMENDATION=COMPANY_LEVEL_CONTACT_PROVENANCE_CONTRACT_V1
- FUTURE_CONTRACT_SCOPE=prove that email/phone values are company-level public contact paths before any downstream admission.

EMAIL_PHONE_LIMITATION_REVIEW_STATUS=PASS_WITH_KNOWN_LIMITATION

## Tests

- TESTS_ADDED_OR_UPDATED=tests/commercial/test_exa_research_ingestion.py
- TEST_COVERAGE_ADDED:
  - valid non-production ingestion accepts after validation
  - synthetic email contact candidate is rejected pending future company-level provenance contract
- UNIT_TEST_RESULT=PASS
- UNIT_TEST_COMMAND=`python -m unittest tests.commercial.test_exa_research_result tests.commercial.test_exa_research_ingestion tests.commercial.test_validate_commercial`
- UNIT_TEST_COUNT=19
- COMMERCIAL_VALIDATION_RESULT=PASS
- COMMERCIAL_VALIDATION_COMMAND=`python tools\commercial\validate_commercial.py`

## Safety Checks

- SALES_PILOT_STATUS=NOT_RUN
- OUTBOUND_SEND_PAYMENT_PRODUCTION_WRITE_STATUS=NOT_PERFORMED
- CRM_WRITE_OUTREACH_QUEUE_STATUS=NOT_TOUCHED
- VPS_DNS_HAPP_PROXY_STATUS=NOT_TOUCHED
- LIVE_EXA_CALL_STATUS=NO_CALL_PERFORMED
- RAW_EXA_RESPONSE_STATUS=NOT_SAVED
- PRODUCTION_PATH_CHANGE_STATUS=NOT_CHANGED_BY_THIS_REVIEW
- REAL_LEAD_CONTACT_DATA_STATUS=NO_REAL_LEADS_OR_CONTACT_DATA_ADDED
- SECRETS_STATUS=NO_SECRETS_DETECTED_IN_REVIEW_CHANGES

## Known Limitations

- This remains a non-production local adapter review, not production ingestion design.
- Outreach is intentionally blocked until a separate owner approval gate is designed.
- Email/phone candidate admission needs `COMPANY_LEVEL_CONTACT_PROVENANCE_CONTRACT_V1` before implementation.
- Worktree had unrelated Android modifications before this review; they were not inspected as part of this contract gate and were not touched.

## Recommended Next Safe Action

- Design `COMPANY_LEVEL_CONTACT_PROVENANCE_CONTRACT_V1` before any owner approval gate admits email or phone contact candidates.
