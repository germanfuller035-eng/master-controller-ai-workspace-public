# QA Rules Updated

SESSION_NAME=FIRST_TOUCH_MESSAGE_QUALITY_FIX_V1

## Updated Gates

- Commercial first-touch scorer now hard-fails missing human intro, missing first-touch context, missing visible-site context, missing caveat, missing 3-5 mini-review, missing low-pressure transfer CTA, and forbidden abstract/ROI/traffic/conversion/payment/contract claims.
- Growth OS QA now validates `message_architecture.json` variants against the first-touch standard.
- Telegram draft-quality first-contact generator now defaults to the transfer-review CTA and avoids price/offer pressure in first contact.
- Android manual sales pilot now exposes first-touch draft status and blocks QA if the generated first-touch text has risks.

## Test Coverage

- `tools/commercial_core/tests/first_touch.test.mjs`: PASS, 29/29.
- `tools/tests/first_touch_commands_test.mjs`: PASS, 16/16.
- `tools/tests/first_touch_includetest_test.mjs`: PASS, 46/46.
- `tools/tests/first_touch_reconciliation_test.mjs`: PASS, 13/13.
- `tools/growth_os/tests/run_all.mjs`: PASS, 2/2 suites.
- Android Gradle focused checks: PASS.

NO_SEND_STATUS=PASS
NO_PAYMENT_STATUS=PASS
NO_PRODUCTION_WRITE_STATUS=PASS
