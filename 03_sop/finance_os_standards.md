---
type: sop
status: proposed
related_project: finance-os
updated: 2026-06-17
canonical_target: 03_sop/finance_os_standards.md
apply_status: PROPOSED_AFTER_SOAK
tags: [finance_os, sop, standards, policy]
---

# Finance OS Standards (canonical policy bundle)

> One canonical standards document covering Finance OS policies. Extends `03_sop/payment_and_receipt_control_sop.md`.
> Managerial, not statutory accounting. Not tax/legal advice.

## 1. Financial data policy
Every number carries a status (CONFIRMED/OWNER_TARGET/MODEL_ESTIMATE/IMPORTED_UNVERIFIED/UNKNOWN) +
source + as_of + confidence. Category confusion forbidden (forecast≠revenue, invoiced≠payment,
payment≠profit, profit≠cash, target≠result, credit≠income, asset≠cash, personal≠business revenue).

## 2. Chart of accounts
Managerial categories (revenue / direct costs / operating expenses / owner-personal / taxes-reserves).
Personal and business categories never mixed.

## 3. Invoice policy
DRAFT default. APPROVED needs owner. ISSUED_EXTERNAL needs external evidence. PAID needs confirmed
payment. Unique number, correct total math, valid currency/dates, price approved. No sending, no bank requisites.

## 4. Payment policy
Statuses EXPECTED→RECEIVED_UNVERIFIED→CONFIRMED. Reconciliation never auto-confirms a probable match —
owner confirms. No paid status without evidence.

## 5. Receivables policy
Aging buckets; reminder DRAFTS only (send_allowed=false, never sent). Concentration tracked.

## 6. Expense policy
Classify business/personal/ambiguous; ambiguous → owner classifies. Duplicate/missing-evidence/
negative detection. CONFIRMED needs evidence.

## 7. Budget policy
States DRAFT→OWNER_REVIEW→APPROVED→LOCKED→CLOSED. No auto-approval. Variance/overspend tracked.

## 8. Reserve policy
9 categories; policy target / available / shortfall separated. No legally-required reserve asserted
without confirmed regime/rate.

## 9. Tax-estimate policy
Configurable rate/regime (never hard-coded). UNKNOWN without rate. Labeled ESTIMATE — VERIFY WITH ACCOUNTANT.

## 10. Debt policy
Synthetic fixtures; real/personal debt referenced safely, never copied to general dashboards. Stress coverage modeled.

## 11. Business/personal separation
Owner draw is post-tax-reserve, post-profit — not revenue. Ambiguous flows flagged for owner. No real transfers.

## 12. Project profitability standard
Integrates Delivery OS plan-vs-actual. Flags profitable-but-unpaid, low-owner-hour-return, scope-creep, etc.
Revenue may be CONFIRMED; costs are MODEL_ESTIMATE.

## 13. Product economics standard
UNKNOWN where price/hours absent. Costs always MODEL_ESTIMATE, never promoted to confirmed.

## 14. Monthly close SOP
15 steps. Period lock blocked until reconciliations + receivables + cashflow done. No bank integration.

## Related
- [[07_revenue_os/finance_os_command_center]] · [[03_sop/payment_and_receipt_control_sop]]
