# Controlled live commercial machine v1

Date: 2026-06-29
Device: Honor ALT-LX1 / AMSKBB4914919475
Branch: feature/working-sales-mvp-launch-v1
Head before commit: 94ddd272208cc647ce12e376498c723e61c1faf0

## Result

STATUS=PASS_INSTALLED_PENDING_COMMIT

The Android owner app now supports the controlled commercial path without enabling hidden live actions:

- owner can enter a company site and review parsed facts;
- unknown products or contacts are not fabricated;
- owner can manually add contact/channel data;
- draft stays editable and is explicitly marked as not sent;
- QA blocks risky text until edited or explicitly overridden by owner with a reason;
- local manual send packet shows final text and packet code;
- approval screen checks the exact packet before manual action;
- post-send result is local and is not marked sent automatically;
- reply monitor is read-only;
- CRM write is behind a separate permission;
- payment flow is explicitly OFF.

## Safety

AUTO_SEND_STATUS=OFF
PAYMENT_STATUS=OFF
PRODUCTION_WRITE_STATUS=OFF
OUTBOUND_COUNT=0
PAYMENT_COUNT=0
PRODUCTION_DB_WRITES=0
EMAIL_SOCIAL_MESSENGER_SMS_SENT=NO
EMAIL_CLIENT_OPENED_DURING_SMOKE=NO
VPS_CHANGED=NO
DNS_CHANGED=NO
HAPP_PROXY_CHANGED=NO

## Fixed defects

- The site analysis no longer invents products/services/contact paths when the site facts are not available.
- The owner workflow no longer dead-ends at draft, QA, packet, result, replies, CRM, invoice or payment screens.
- Owner override for QA is visible and requires a reason.
- Send packet and approval screens no longer expose raw `body_hash`, `payload_hash`, `approval_id`, `idempotency_key`, `Live`, `canary`, or `Production` wording.
- Today/local mode no longer shows raw `STOP` wording.
- CRM write review no longer shows "idempotency key" wording to the owner.
- Bottom navigation labels remain short and stable.

## Verification

ANDROID_FOCUSED_TESTS=PASS
ANDROID_BUILD_RESULT=PASS
ANDROID_INSTALL_RESULT=PASS
HONOR_VISUAL_SMOKE_RESULT=PASS

Private screenshots and UI dumps were captured outside Git:

PRIVATE_EVIDENCE=D:\AI_FILE_VAULT\sales_pilot_private\controlled_live_commercial_machine_v1\honor_final_visual_smoke_20260629_090644

The smoke used synthetic local data only. No real company, domain, contact, private note, credential, outbound result, payment data, or production data is recorded in this Git evidence.
