---
type: dashboard
status: proposed
related_project: finance-os
updated: 2026-06-17
canonical_target: 09_dashboards/finance_dashboard.md
apply_status: PROPOSED_AFTER_SOAK
labels_legend: "CONFIRMED · OWNER_TARGET · MODEL_ESTIMATE · IMPORTED_UNVERIFIED · UNKNOWN"
tags: [dashboard, finance]
---

# Owner Finance Dashboard (canonical, managerial)

> Single canonical finance dashboard. Every number carries a status label. Facts and estimates are
> NOT mixed. Generated via `node tools/finance_os/finance.mjs dashboard-refresh`. Not official accounting.

## Sections
current cash references · expected 7/30/90-day cashflow · unpaid invoices · overdue amounts ·
revenue this month · payments this month · project profitability · product profitability · fixed costs ·
reserve status · debt service · capacity · business units · risks · owner decisions · unknown data.

## Current state (this build, no confirmed live data)
- Confirmed: Edera Rest 10 000 ₽ paid. Revenue targets 300k/500k/1M ₽/mo (OWNER_TARGET).
- Mini Audit product economics: MODEL_ESTIMATE (net ≈1 800 ₽, ≈5 000 ₽/owner-hour at 10 000 ₽).
- Owner weekly capacity, monthly target confirmation, cash balances: UNKNOWN (owner input needed).

## Related
- [[09_dashboards/finance_owner_command_center]] · [[09_dashboards/revenue_command_dashboard]]
- [[07_revenue_os/finance_os_command_center]]
