---
type: dashboard
status: proposed
related_project: product-os
updated: 2026-06-17
canonical_target: 09_dashboards/product_dashboard.md
apply_status: PROPOSED_AFTER_SOAK
tags: [dashboard, product]
---

# Product Dashboard (canonical, readiness focus)

> Single canonical Product Dashboard. Readiness/productization focus — does NOT duplicate the Revenue
> Dashboard (commercial) or Project Portfolio (operational). Generated via
> `node tools/product_os/product.mjs dashboard-refresh`.

## Catalog (verified)
18 products: 2 ACTIVE (express_review, mini_audit), 7 DRAFT, 9 PLANNED.

## Readiness
- **Delivery-defined:** mini_audit (full factory).
- **Pilot candidates:** mini_audit, digital_presence_check, full_business_audit, start_page_sprint, landing_sprint, business_website.
- **Blocked (boundary decision):** lead_system, ai_front_office (both PLANNED).
- **Paused candidate:** edera_rest_mini_audit.

## Warnings
- mini_audit catalog=ACTIVE but evidence gate=DELIVERY_DEFINED (no real pilot) — owner review.
- Several DRAFT products have UNKNOWN price (digital_presence_check, funnel_audit, landing_sprint).
- Start Pack price conflict (50k vs 90–250k) — owner decision.
- Consistency: sales↔delivery deliverable wording mismatches flagged (see consistency report).

## Owner decisions
10 product decisions (7 READY_FOR_OWNER, 3 NEEDS_DATA) — see owner decision queue.

## Next product action
mini_audit pilot review + digital_presence_check internal pilot + full_business_audit pilot.

## Related
- [[07_revenue_os/product_os_command_center]] · [[09_dashboards/revenue_command_dashboard]] · [[09_dashboards/owner_command_center]]
