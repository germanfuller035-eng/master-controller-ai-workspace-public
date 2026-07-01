# Customer Success Pre-Sale Read

date: 2026-06-18 · CUSTOMER_SUCCESS_READ_API=ON · pre-sale read only (no lifecycle before a deal).

## Scope
No Customer Success post-sale lifecycle is created before a deal. The existing customer_success_os
runtime starts at HANDOFF_PENDING (post-sale) and is NOT used here. Pre-sale indicators are a NEW
read model (`commercial_core/lib/conversation_read.mjs presaleHealth`) over conversation signals only.

## Allowed states (pre-sale)
```
PRE_SALE  AWAITING_REPLY  FOLLOWUP_DUE  OWNER_REVIEW
```
No surveys, no support messages, no renewal messages, never auto.

## Read indicators (GET /conversations/:id/presale-health)
```
state, communication_health (NOT_CONTACTED | CONTACTED_AWAITING | ENGAGED),
days_since_last_action, reply_received, followup_due,
delivery_status_confidence (NONE | LOW | MEDIUM | HIGH — only ledger-backed confirmed send is HIGH),
owner_attention_reason (delivery_unconfirmed | reply_received | followup_due | null)
```

## After deal WON (future)
A Delivery → Customer Success handoff would transition into the post-sale lifecycle. Out of scope here.

```
CUSTOMER_SUCCESS_PRESALE_READ_API=ON
```
