---
type: sop
status: proposed
related_project: customer-success-os
updated: 2026-06-17
canonical_target: 03_sop/customer_success_os_standards.md
apply_status: PROPOSED_AFTER_SOAK
tags: [customer_success_os, sop, standards, policy]
---

# Customer Success OS Standards (canonical policy bundle)

> One canonical standards document. Extends `03_sop/client_delivery_packaging_sop.md` and
> `payment_and_receipt_control_sop.md`. Never sends/publishes/changes canonical status; synthetic only.

## 1. Customer lifecycle policy
13 states (HANDOFF_PENDING..CLOSED). No onboarding before acceptance; no HEALTHY from payment; no value
claim before evidence; no renewal with critical support; no CLOSED with unresolved contractual support;
no churn without source.

## 2. Delivery-to-success handoff SOP
Requires accepted project + acceptance evidence + no critical defect + support terms + customer actions +
owner + product version. Internal package, no customer message.

## 3. Onboarding SOP
8 stages, INTERNAL_DRAFT default, no send. PLANNED products → specification only.

## 4. Success plan + outcome measurement
Deliverable/adoption/business outcomes separated. No ACHIEVED without evidence. Baseline missing → no-value-risk.
Product outcome library: Mini Audit prohibits revenue/conversion/sales claims unless customer-confirmed.

## 5. Adoption policy
Evidence-based, no fabricated analytics. Statuses CONFIRMED/CUSTOMER_REPORTED/SYSTEM_OBSERVED/MODEL_ESTIMATE/UNKNOWN.

## 6. Customer health + risk policy
10 dimensions, explainable; payment≠dissatisfaction, silence≠churn, unknown can't be high-confidence HEALTHY,
critical incident→CRITICAL. 18-category risk engine.

## 7. Support + triage + boundary + SLA
16 categories, 5 severities (evidence-based). Security/privacy never auto-resolved. Boundary UNKNOWN→owner
review, not classified against customer without evidence. SLA targets non-contractual unless owner-approved;
capacity validator blocks 24/7-without-coverage and third-party-dependent resolution.

## 8. Incident + known issue + knowledge base
Incident lifecycle (7 states), draft comms never sent. No fixed-without-version/evidence; no hidden critical.
KB INTERNAL_DRAFT default, no public publication.

## 9. Feedback + satisfaction + value review
No survey sent. Score-without-comment limited; no-response=UNKNOWN; high-score≠business outcome;
payment≠satisfaction; renewal≠success proof; churn≠always product failure. No fabricated ROI.

## 10. Renewal + expansion + churn + profitability
Renewal: no live deal/message; critical incident→DO_NOT_RENEW. Expansion: no pressure/time-based; needs
evidence + adoption + ready candidate + not-opted-out. Churn: requires source, no auto-blame, lessons routed.
No customer profitability without confirmed cost.

## 11. Permissions + case/referral
Permission never inferred from feedback; expiry/revocation supported. No logo/case/testimonial without
permission; no referral after complaint/critical incident; no synthetic case labelled real; no auto-publish.

## 12. Privacy + retention
Data classes (public..sensitive special). Minimal data, provenance, purpose, retention, opt-out, deletion,
anonymization. No secrets in general context. No legal-compliance claims beyond existing policy.

## Related
- [[07_revenue_os/customer_success_os_command_center]] · [[03_sop/client_delivery_packaging_sop]]
