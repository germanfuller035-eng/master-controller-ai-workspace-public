---
type: sop
status: proposed
related_project: delivery-os
updated: 2026-06-17
canonical_target: 03_sop/delivery_os_standards.md
apply_status: PROPOSED_AFTER_SOAK
tags: [delivery_os, sop, standards]
---

# Delivery OS Standards (canonical SOP bundle)

> One canonical standards document covering the delivery lifecycle and its sub-standards. Extends
> (does not replace) `03_sop/client_delivery_packaging_sop.md` and `02_templates/mini_audit_qa_template.md`.

## 1. Delivery lifecycle
`COMMERCIAL_APPROVED → PROJECT_CREATED → WAITING_INPUTS → SCOPE_FROZEN → READY_TO_START →
DELIVERY_IN_PROGRESS → INTERNAL_QA → OWNER_REVIEW → CLIENT_REVIEW → [CHANGE_REQUEST] → DELIVERED →
ACCEPTED → SUPPORT → CLOSED`. Transitions validated by `lib/lifecycle.mjs`. Prohibited: start
without scope/inputs, DELIVERED without QA, ACCEPTED without acceptance, CLOSE with open critical risk,
client-ready without owner review, change accepted without impact evaluation.

## 2. Project creation SOP
Requires won/TEST_ONLY deal, approved product (not PLANNED), approved price, scope, deliverables,
acceptance criteria, client inputs, commercial reference, owner; canonical lead ID for non-test.

## 3. Kickoff SOP
16-section kickoff package. Default INTERNAL_DRAFT. CLIENT_READY only when product-ready + price
approved + inputs complete + milestone plan valid + owner approved. Never sent.

## 4. Client inputs SOP
Per-product required input sets. Credentials reference `D:\AI_SECRETS` only (never embedded).
Completeness score gates READY_TO_START.

## 5. Milestone planning SOP
Relative timelines (Day 0, after client input, after owner approval). No exact client dates without
approved start. Every milestone has a deliverable; final has QA + acceptance. Cycles/overload detected.

## 6. QA standard
6 levels (automated → self-check → peer → owner → client → acceptance), 12 dimensions. Hard blockers
force client_ready=false: missing deliverable, unsupported claim, secret exposure, broken link,
invalid output, missing acceptance/evidence, unapproved commercial, guessed contact, send enabled.

## 7. Acceptance standard
No ACCEPTED without all required criteria PASS or documented waiver (reason + owner approval).
Critical criteria cannot be waived.

## 8. Change request SOP
Scope-creep detection. Never auto-approved. New integration/channel/product/deliverable-absent →
REQUIRES_NEW_OFFER. Owner decides.

## 9. Risk register standard
16 risk categories + product defaults. Open high/high risk blocks closure. Missing mitigation flagged.

## 10. Case-study policy
Stages CANDIDATE → INTERNAL → ANONYMIZED → CLIENT_PERMISSION_PENDING → APPROVED_FOR_USE → PUBLISHED.
No invented metrics, no publishing without client permission, no identity reveal without approval.

## 11. Product readiness policy
14 dimensions. Recommendation only — never auto-promote. READY_FOR_PILOT needs owner approval +
synthetic test; ACTIVE needs successful pilot + lessons + measured effort + owner approval.

## Related
- [[07_revenue_os/delivery_os_command_center]] · [[03_sop/client_delivery_packaging_sop]]
