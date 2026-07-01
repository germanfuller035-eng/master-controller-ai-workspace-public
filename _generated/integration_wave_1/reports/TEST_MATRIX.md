# Integration Wave 1 — Test Matrix

date: 2026-06-18

## Commercial core (offline, synthetic) — tools/commercial_core/tests
| Suite | Count | Result |
|-------|-------|--------|
| commercial.test.mjs (E2E happy + idempotency + negative + events + read models + single-writer) | 87 | PASS |
| security.test.mjs (boundary scan + behavioral) | 15 | PASS |

Coverage: Revenue (opportunity/offer/decision/deal lifecycle, value/evidence, revision, idempotency);
Product (version snapshot, ACTIVE gating, price snapshot, Mini Audit 10000 RUB, historical immutability);
Delivery (handoff gating, idempotent project, no duplicate); Finance (FACT/TARGET/ESTIMATE/UNKNOWN,
invoice lifecycle, payment evidence, no fabricated payment, unknown≠0, profitability); Events (envelope,
fact/recommendation separation, versioning, unknown-type reject).

## Android — apps/mater_controller_android (testDebugUnitTest)
| Suite | Note |
|-------|------|
| CommercialMappingTest (7) | envelope parse, money unknown≠0, fact/estimate/target qualifiers, value-class-never-raw, finance unknown≠0, partial payload |
| OfflineAndMetadataTest | version assertion updated to 0.5.0-rc1 / code 9 |
| OwnerLocalizationTest, OwnerUiRawCodeSafetyTest, RoomMigrationTest, UpgradeSafetyTest, DtoMappingTest, etc. | unchanged, green |
| **Android total** | **91 passed / 0 failed**; lint 0 errors |

## Prior OS regression (reused modules, unmodified)
revenue_os PASS · product_os PASS · delivery_os PASS · finance_os PASS · integration_os PASS.

## Totals
```
NEW_TESTS_FAILED=0
PRIOR_TEST_REGRESSIONS=0
ANDROID_LINT_ERRORS=0
COMPILE_STATUS=PASS
DUPLICATE_WRITERS=0  PARALLEL_LEDGERS=0  REAL_MESSAGES_SENT=0
```
