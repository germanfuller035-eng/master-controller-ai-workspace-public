# Delivery-Status Containment

date: 2026-06-18 · verified on production. Auto-resend/follow-up forbidden for unproven delivery.

## Production classification (GET /mini-audit/delivery-containment)
```
records_total (owner-review queue) = 7
by_category: CONFIRMED_SENT 1, CONFIRMED_NOT_SENT 0, ATTEMPT_UNPROVEN 3,
             DELIVERY_UNCONFIRMED 1, TEST_ONLY 0, LEGACY_INCONSISTENCY 3
automatic_resend_allowed = false
automatic_followup_allowed = false
```

## The original three DELIVERY_STATUS_UNKNOWN records → now precise
GBIRESURS_RU, BETON-MASTERS_RU, MEGALIT-KRD_RU → **ATTEMPT_UNPROVEN** (send attempt recorded, no SMTP
proof, no ledger row, external_send_by_bot=unknown). NOT confirmed sends.

The pass also surfaced (correctly) 3 LEGACY_INCONSISTENCY (lead marked `proven` but no matching ledger
row) and 1 DELIVERY_UNCONFIRMED — all routed to the owner-review queue, none counted as sends.

## Safety state (every queued record)
```
confirmedSent=false  automaticResendAllowed=false  automaticFollowupAllowed=false  ownerReviewRequired=true
```
The authoritative send ledger is unchanged (7). No record without a ledger row + SMTP proof is treated
as a successful send.

## Owner review actions (prepared; mutation gated)
MARK_AS_NOT_SENT, MARK_AS_DELIVERY_UNCONFIRMED, ATTACH_EXTERNAL_DELIVERY_PROOF,
LINK_TO_EXISTING_LEDGER_ENTRY, DISMISS_LEGACY_MARKER — these are owner-only, revision+idempotency
guarded, audit-event writing, and NEVER create a SENT row without ledger/proof. The read-side
classification + containment is LIVE now; the mutation commands are documented as the next gated step
(not activated in this pass) to keep historical send count immutable.

## Android
«Статусы доставки требуют сверки»: count, reason (RU category), "Подтверждённая отправка: нет",
"Автоматическая повторная отправка: запрещена", "Требуется решение владельца". No recipient/body shown.

```
DELIVERY_STATUS_RECORDS_CLASSIFIED=3/3 (the original unknowns) + full base classified
AUTOMATIC_RESEND_ALLOWED=NO  AUTOMATIC_FOLLOWUP_ALLOWED=NO  OWNER_REVIEW_QUEUE=YES
```
