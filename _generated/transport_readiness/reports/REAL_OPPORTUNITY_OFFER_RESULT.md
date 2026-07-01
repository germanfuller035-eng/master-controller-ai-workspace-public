# Real Opportunity + Offer Draft Result

date: 2026-06-18 · executed on production through the real command seam. NO send, NO deal.

## Result
```
SELECTED_REAL_PILOT_LEAD=STROYDVOR-UG_RU
REAL_OPPORTUNITY_CREATED=1   opp_e70e7ec3cc87   (revision 97→98)
REAL_OFFER_DRAFT_CREATED=1   offer_dbbbf391d547 (revision 98→99)
OWNER_DECISION=APPROVE_DRAFT_FOR_SEND_REVIEW    (revision 99→100)
REAL_OFFER_STATUS=READY_FOR_SEND_REVIEW
REAL_DEAL_WON=0  REAL_HANDOFFS=0  REAL_PROJECTS=0  REAL_INVOICES=0  PAYMENTS=0
OFFER_PRICE=10000 RUB  send_capability=NONE
```

## Stop point enforced
The new `APPROVE_DRAFT_FOR_SEND_REVIEW` decision records the owner's intent and sets the offer to
READY_FOR_SEND_REVIEW WITHOUT creating a deal (only the literal `APPROVE` wins a deal). Verified:
`dealId=null`, zero real deals/handoffs/projects/invoices, zero payments.

## Invariants after prep
```
PRODUCTION_REVISION 97 → 100  (3 commits: opportunity, offer, decision)
send ledger unchanged (7)  email ledger unchanged (63)
canonical writer = 1  Telegram PID 7757 unchanged
KPI: open_opportunities=1 (the real one), deals_won=0, invoices_due=0
TEST_ONLY entities still excluded from KPI
```

REAL_MESSAGES_SENT=0 · SMTP_CALLS=0 · PAYMENT_FACTS_CREATED=0.
