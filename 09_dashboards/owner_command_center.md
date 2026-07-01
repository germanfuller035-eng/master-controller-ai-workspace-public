---
type: dashboard
status: proposed
related_project: executive-os
updated: 2026-06-17
canonical_target: 09_dashboards/owner_command_center.md
apply_status: PROPOSED_AFTER_SOAK
labels_legend: "CONFIRMED · OWNER_TARGET · MODEL_ESTIMATE · OWNER_DECISION_REQUIRED · BLOCKED_EXTERNAL · UNKNOWN"
tags: [dashboard, executive, owner_command_center]
---

# Owner Command Center (canonical)

> The single top-level owner command center. **References** domain dashboards — does NOT duplicate
> them. Generated via `node tools/executive_os/executive.mjs dashboard-refresh`.

## Sections
- **System health:** v0.4.0-rc1 no-send soak (FREEZE).
- **Current release/soak:** soak in progress; owner acceptance pending.
- **Primary owner action:** confirm weekly capacity / approve READY_FOR_OWNER decisions (8 ready).
- **Decision queue:** 19 decisions (8 READY_FOR_OWNER, 11 NEEDS_DATA) — see decision backlog.
- **Portfolio ranking:** mini_audit FOCUS_NOW; others PREPARE/WAIT/PAUSE.
- **Revenue:** → [[09_dashboards/revenue_command_dashboard]]
- **Delivery:** → [[09_dashboards/delivery_dashboard]]
- **Finance:** → [[09_dashboards/finance_dashboard]]
- **Capacity:** UNKNOWN (owner input needed).
- **Critical risks:** negative-cash (model), infrastructure (mitigated by rollback runbook).
- **External blockers:** soak completion.
- **AI work:** offline OS layers built (Revenue/Delivery/Finance/Executive), all proposed-after-soak.
- **Waiting items:** production changes (soak); proposed docs apply (post-soak, owner-gated).
- **Proposed next milestone:** soak close → owner acceptance → first commercial cycle (approval-gated).

## Domain dashboard references (not copied)
[[09_dashboards/ai_operations_dashboard]] · [[09_dashboards/project_portfolio_dashboard]] ·
[[09_dashboards/revenue_command_dashboard]] · [[09_dashboards/delivery_owner_command_center]] ·
[[09_dashboards/finance_owner_command_center]]

## Related
- [[07_revenue_os/executive_os_command_center]] · [[00_MASTER_CONTEXT/current_decisions_index]]
