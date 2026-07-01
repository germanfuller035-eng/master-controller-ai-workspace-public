---
type: dashboard
status: proposed
related_project: delivery-os
updated: 2026-06-17
canonical_target: 09_dashboards/delivery_owner_command_center.md
apply_status: PROPOSED_AFTER_SOAK
tags: [dashboard, delivery, owner]
---

# Delivery Owner Command Center (canonical)

> Owner-oriented daily delivery view. No real notifications. Generated from project records via
> `tools/delivery_os/lib/dashboard.mjs` (ownerCommandCenter).

## Answers
- What needs my approval? · What is blocked by me? · By the client? · What is overdue?
- What is ready for delivery? · Awaiting acceptance? · Which risk needs a decision?
- Which change request needs approval? · How overloaded am I? · Which project should not be started?

## Output fields
`next_owner_action` · `top_three_risks` · approvals · blocked projects · capacity warning.

## Current state
- No live projects. Capacity = UNKNOWN until owner weekly hours confirmed.
- `should_not_start` automatically lists PLANNED/DRAFT products (not delivery-ready).

## Related
- [[09_dashboards/delivery_dashboard]] · [[07_revenue_os/delivery_os_command_center]]
