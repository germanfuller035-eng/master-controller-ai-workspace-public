---
type: sop
status: proposed
related_project: product-os
updated: 2026-06-17
canonical_target: 03_sop/product_os_standards.md
apply_status: PROPOSED_AFTER_SOAK
tags: [product_os, sop, standards, policy]
---

# Product OS Standards (canonical policy bundle)

> One canonical standards document. Product OS never changes canonical product status, publishes, or sends.

## 1. Product specification standard
25 mandatory sections. Blocks on: undefined problem, vague outcome, missing deliverables/scope/
exclusions/QA/acceptance/price source/delivery, unsupported claim, overstated readiness.

## 2. Product claims policy
Claim types: FACT/INFERENCE/HYPOTHESIS/ASPIRATIONAL/PROHIBITED. FACT requires evidence + owner approval
for sales use. Prohibited (blocked in client-ready assets): guaranteed revenue/lead/conversion/ranking/
payback growth; full automation / employee replacement / no-owner-involvement without proof; unsupported cases.

## 3. Product readiness policy
22 dimensions (COMPLETE/PARTIAL/MISSING/BLOCKED/NOT_APPLICABLE). Not reduced to one percentage.
Status gate (recommendation only, never auto-promote):
- DELIVERY_DEFINED: scope+deliverables+playbook+QA+acceptance+risks.
- READY_FOR_INTERNAL_TEST: spec complete + synthetic fixture + demo + pilot plan + economics.
- READY_FOR_PILOT: internal pilot passed + owner-approved price/scope + QA + acceptance + capacity + owner approval.
- ACTIVE: real pilot completed + client feedback + actual hours/cost + lessons + owner approval.

## 4. Internal pilot policy
Synthetic only. 12 stages. 8 scenarios. PASSED/PASSED_WITH_NOTES/FAILED. No promotion. No real client.

## 5. Demo asset policy
INTERNAL_DRAFT default. CLIENT_DEMO_READY only with owner approval + clean claims. No real company data.
send/publish always false.

## 6. Product versioning policy
New version required for: price/scope/deliverable/timeline/acceptance/major-risk/channel/integration change.
Semantic bump (major for price/scope/deliverable/acceptance). No retroactive rewriting.

## 7. Product change control
Owner approval required. Never auto-approved. Records commercial/delivery/financial/risk impact + version result.

## 8. Product QA standard
16 dimensions + hard blockers: unsupported claim, no scope/acceptance/price/playbook/pilot, bad-margin-
as-viable, real-data-in-demo, client-ready-without-approval.

## 9. Consistency standards
Sales-delivery (promise-vs-delivery, price-without-scope, no-acceptance) + price-cost-capacity
(viable/underpriced/unknown/high-risk; no new approved prices).

## 10. Boundaries
Lead System and AI Front Office stay PLANNED until owner packaging/boundary decision. No reusable
client product auto-created. AI Front Office autonomous variant prohibited by default.

## Related
- [[07_revenue_os/product_os_command_center]] · [[07_revenue_os/revenue_os_command_center]]
