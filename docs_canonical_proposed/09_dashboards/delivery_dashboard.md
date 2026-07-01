---
type: dashboard
status: proposed
related_project: delivery-os
updated: 2026-06-17
canonical_target: 09_dashboards/delivery_dashboard.md
apply_status: PROPOSED_AFTER_SOAK
tags: [dashboard, delivery, execution]
---

# Delivery Dashboard (canonical, execution-only)

> Single canonical delivery (execution) dashboard. Does **NOT** duplicate the Project Portfolio
> (which lists all projects). This shows execution state only. Generated via
> `node tools/delivery_os/delivery.mjs dashboard-refresh`.

## Sections
active projects · waiting inputs · ready to start · blocked · in QA · waiting owner · waiting client ·
change requests · delivered · acceptance pending · support · overdue milestones · risks ·
owner actions · Claude actions · Cline actions.

## Current state (this build)
- No live projects (no production projects created). 16 synthetic TEST_ONLY fixtures exercise the engine.
- Snapshot: `_generated/delivery_os/samples/delivery_dashboard.json`.

## Agent action split
- **Owner**: commercial approval, client communication, sensitive access, final review.
- **Claude**: implementation, research synthesis, document/code/test/QA.
- **Cline**: focused file-level changes, local repairs, formatting.
- **Client**: inputs, factual confirmation, content approval, acceptance.

## Related
- [[09_dashboards/delivery_owner_command_center]] · [[09_dashboards/project_portfolio_dashboard]]
- [[07_revenue_os/delivery_os_command_center]]
