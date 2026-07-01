# Integration Wave 1 — Domain Model

date: 2026-06-18

## Lifecycle
```
Lead → Opportunity → Product Selection → Offer → Owner Decision → Deal
     → Delivery Handoff → Project → Invoice Schedule → Payment Evidence → Payment Fact
     → Profitability Read Model
```

## Immutable IDs (deterministic, Integration ID Standard aligned)
opportunity_id (opp_…), offer_id (offer_…), deal_id (deal_…), handoff_id (handoff_…),
project_id (proj_…), invoice_id (inv_…), payment_id (pay_…). customer_id / lead_id / product_id /
product_version carried through from upstream truth; no silent re-key (crosswalk only).

## Stages / statuses (namespaced, never collide with lead statuses)
- Opportunity: REVENUE.OPPORTUNITY_NEW · QUALIFIED · OFFER_PREPARED · OWNER_REVIEW · NEGOTIATION · WON · LOST · PAUSED
- Offer: DRAFT · READY_FOR_OWNER_REVIEW · APPROVED · REJECTED · EXPIRED · SUPERSEDED
- Owner decision: APPROVE · REJECT · RETURN_FOR_EDIT · PAUSE · CANCEL
- Deal: WON · LOST
- Project (Delivery namespace): DELIVERY.PLANNED · DELIVERY.ACTIVE · DELIVERY.ACCEPTANCE
- Invoice: DRAFT · APPROVED · ISSUED_EXTERNALLY · PARTIALLY_PAID · PAID · OVERDUE · CANCELLED

Revenue WON and Delivery IN_PROGRESS/ACTIVE are kept strictly separate.

## Snapshots (immutability after the fact)
Offer and Deal capture product price/scope/claims/acceptance snapshots at the time of creation. A
later product version edit does NOT retroactively change an existing offer/deal/project.

## Classification (Finance)
FACT | TARGET | ESTIMATE | UNKNOWN. Rules enforced + tested:
UNKNOWN != 0 · ESTIMATE != FACT · TARGET != FACT · MISSING_PAYMENT != ZERO_PAYMENT.
Invoice amount is TARGET until a payment with evidence makes it FACT/PAID. Actual cost stays UNKNOWN
in Wave 1, so actual profit is UNKNOWN even after payment (only estimated profit is ESTIMATE).

## Product (reused from Product OS)
Mini Audit: product_id=mini_audit, price 10000 RUB, status ACTIVE. Catalog 18 products (2 ACTIVE).
Price never changes without an owner decision.
