---
type: dashboard
status: proposed
related_project: customer-success-os
updated: 2026-06-17
canonical_target: 09_dashboards/customer_success_dashboard.md
apply_status: PROPOSED_AFTER_SOAK
tags: [dashboard, customer_success]
---

# Customer Success Dashboard (canonical, post-delivery focus)

> Single canonical Customer Success Dashboard. Post-delivery success focus — does NOT duplicate
> Revenue / Delivery / Finance / Product dashboards. Generated via
> `node tools/customer_success_os/success.mjs dashboard-refresh`. All customers synthetic TEST_ONLY.

## Sections
onboarding · activation · healthy · watch · at-risk · critical · support requests · incidents ·
value reviews · renewals · expansion · churn · case permissions · customer profitability · owner actions.

## Current state (synthetic fixtures)
- 24 synthetic customers exercise the engine. No real customers.
- Example signals: 1 CRITICAL (lead_system incident), 2 AT_RISK, 2 renewals due, expansion candidates flagged.

## Owner Customer Command Center
Primary action · critical support · at-risk · renewal decisions · expansion review · high-support-unpaid ·
case approvals · needs-product-change · needs-delivery-change. No external notification.

## Related
- [[07_revenue_os/customer_success_os_command_center]] · [[09_dashboards/owner_command_center]] · [[09_dashboards/revenue_command_dashboard]]
