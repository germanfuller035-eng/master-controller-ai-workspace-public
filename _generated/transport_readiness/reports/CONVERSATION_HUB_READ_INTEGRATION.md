# Conversation Hub Read Integration

date: 2026-06-18 · CONVERSATION_READ_API=ON · read-only unified timeline; no send.

## Reuse, no second truth
The unified timeline is a READ model built from already-resolved canonical entities (lead,
opportunity, offer, send approval, send-ledger rows, replies, follow-up plan) in
`commercial_core/lib/conversation_read.mjs` (pure) + `commercial/conversations.mjs` (adapter reusing the
commercial store projection + the existing reply service). No new conversation store, no send.

## Endpoints (gated by CONVERSATION_READ_API; requireAuthOrService)
```
GET /conversations                  → list (one per lead with opp/reply/ledger)
GET /conversations/:id              → conversation + offer status
GET /conversations/:id/timeline     → ordered events, send_capability=NONE
GET /conversations/:id/replies      → correlated replies (read-only)
GET /conversations/:id/followups    → plan-only; delivery-unconfirmed excluded; autosend OFF
GET /conversations/:id/presale-health (CUSTOMER_SUCCESS_READ_API gate)
```

## Production verification
GET /conversations → HTTP 200, total=8 (TEST_ONLY chain leads + ledger leads + the new real lead).
Timeline events are typed (LEAD_CREATED, OPPORTUNITY_CREATED, OFFER_DRAFT_PREPARED, OWNER_DECISION,
MESSAGE_SENT_LEDGER, REPLY_RECEIVED, FOLLOWUP_PLANNED) and ordered; never includes raw body/recipient.
send_capability=NONE everywhere.

## Android
«Диалоги» screen: list + tap → timeline dialog (RU event labels), persistent "Клиенту ничего не
отправляется. Только просмотр."

```
CONVERSATION_HUB_READ_API=ON
```
