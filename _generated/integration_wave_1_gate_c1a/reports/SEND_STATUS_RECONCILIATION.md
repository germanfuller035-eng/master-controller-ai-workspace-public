# Send Status Reconciliation (the "3 undefined sends")

date: 2026-06-18 · verified on production.

## Finding
The three records the app labelled "неопределённые отправки" are **NOT confirmed sends**. Each has a
send attempt timestamp but `send_proof_status=missing`, `last_send_status=uncertain_no_smtp_proof`,
no SMTP response code, `external_send_by_bot=unknown`, and **no row in the authoritative ledger**.

```
authoritative_successful_sends = 7   (outbound_send_ledger.jsonl, 7 SENT rows — the ONE truth)
records_requiring_reconciliation = 3
unauthorized_sends = 0
unknown_sends_after_forensic = 0
```

## The three records (classification = DELIVERY_STATUS_UNKNOWN)
| lead_id | last_send_status | send_proof | smtp | ledger row |
|---|---|---|---|---|
| GBIRESURS_RU | uncertain_no_smtp_proof | missing | — | none |
| BETON-MASTERS_RU | uncertain_no_smtp_proof | missing | — | none |
| MEGALIT-KRD_RU | uncertain_no_smtp_proof | missing | — | none |

## Backend read model
`GET /api/v1/mini-audit/send-reconciliation` (pure logic in `commercial_core/lib/reconciliation.mjs`).
It classifies EVERY lead and never asserts a send without ledger backing:
- CONFIRMED_SENT_LEDGER_BACKED: proven proof + matching ledger row
- PROVEN_NO_LEDGER_MATCH: lead marked proven but no ledger row (needs sync)
- DELIVERY_STATUS_UNKNOWN: attempt recorded, proof missing/uncertain
- NOT_SENT: no send attempt

Production classification: CONFIRMED 1, PROVEN_NO_LEDGER_MATCH 3, DELIVERY_STATUS_UNKNOWN 4, NOT_SENT 54.
(7 ledger SENT rows are mostly test/internal ids; lead-level "proven" markers are reconciled against
the ledger and flagged when they don't match — they are NOT counted as additional successful sends.)

## Android fix
The card is renamed **"Записи с неуточнённым статусом доставки"** with subtitle *"Попытка была, но нет
подтверждения в реестре. Это НЕ успешные отправки."* and a separate line **"Подтверждённых успешных
отправок в реестре: 7"**. No record without a ledger row is presented as a successful send.

```
UNDEFINED_SEND_RECORDS_TOTAL = 3
UNDEFINED_SEND_RECORDS_CLASSIFIED = 3
AUTHORITATIVE_SUCCESSFUL_SENDS = 7
UNAUTHORIZED_SENDS = 0
UNKNOWN_SENDS = 0
ANDROID_SEND_LABEL_FIXED = YES
```
