---
type: executive_os_canonical
status: proposed
related_project: executive-os
updated: 2026-06-17
canonical_target: 07_revenue_os/executive_os_command_center.md
apply_status: PROPOSED_AFTER_SOAK
tags: [executive_os, command_center, canonical]
---

# Executive OS / Owner Command Center (canonical)

> The single canonical Executive OS note. The top management layer over AI HQ → Revenue → Delivery →
> Finance. NOT a CRM, accounting, task manager, lead system, send system, or second Project Registry.
> Executive OS **never executes owner decisions**, never mutates production, never sends.

## Architecture boundaries
- **AI HQ**: project registry, system map, context packs, task ledger, anti-loop, decision register, backups.
- **Revenue OS**: product, offer, price, deal, commercial readiness, funnel.
- **Delivery OS**: project, scope, milestones, tasks, QA, acceptance, delivery.
- **Finance OS**: invoices, payments, expenses, cashflow, profit, budgets, reserves.
- **Executive OS**: strategic goals, priorities, cross-system state, decision queue, owner actions,
  next-best-action, dependencies, exceptions, executive KPIs, cadence, reviews, scenarios, portfolio
  stop/go/pause, cross-system alerts, executive reporting.

## Components (this build, local + offline)
| Component | File |
| --- | --- |
| Source of Truth Matrix (25 entities) | `tools/executive_os/data/source_of_truth_matrix.json` + `lib/sot.mjs` |
| Domain schemas (6) | `tools/executive_os/schemas/domain.mjs` |
| Strategic goal hierarchy | `tools/executive_os/lib/goals.mjs` |
| Owner decision system + backlog (19) | `tools/executive_os/lib/decisions.mjs` + `data/decision_backlog.json` |
| Unified status model | `tools/executive_os/lib/status.mjs` |
| Snapshot builder | `tools/executive_os/lib/snapshot.mjs` |
| Portfolio prioritization + stop/go/pause | `tools/executive_os/lib/portfolio.mjs` |
| Next-best-action | `tools/executive_os/lib/nba.mjs` |
| Owner attention budget | `tools/executive_os/lib/attention.mjs` |
| Dependency graph | `tools/executive_os/lib/dependencies.mjs` |
| Risk register + exceptions | `tools/executive_os/lib/{risk,exceptions}.mjs` |
| KPI tree (10) + reviews + cadence | `tools/executive_os/data/kpi_tree.json` + `lib/reviews.mjs` |
| Policy engine (14) | `tools/executive_os/lib/policy.mjs` |
| Scenarios (12) | `tools/executive_os/lib/scenarios.mjs` |
| Allocation + decision debt | `tools/executive_os/lib/allocation.mjs` |
| Change control + release gov + continuity | `tools/executive_os/lib/governance.mjs` |
| Reports + Owner Command Center | `tools/executive_os/lib/reports.mjs` |
| CLI | `tools/executive_os/executive.mjs` |

## Core principles
- ONE Project Registry / task ledger / decision register (AI HQ). Executive OS adds prioritization only.
- Executive OS is never a canonical writer (except owner_action recommendations).
- No decision auto-executed. No production mutation. No send. During soak: NBA never recommends production change.
- Every value carries status: CONFIRMED / OWNER_TARGET / MODEL_ESTIMATE / OWNER_DECISION_REQUIRED / BLOCKED_EXTERNAL / UNKNOWN.

## Integration (future, post-soak)
- [[07_revenue_os/executive_os_integration_contracts]] — Telegram/Android/MC/File Vault, all advisory, non-runtime.

## Dashboards / standards
- [[09_dashboards/owner_command_center]] (references domain dashboards, does not duplicate).
- [[03_sop/executive_os_standards]].

## Related
- [[00_MASTER_CONTEXT/PROJECT_REGISTRY]] · [[00_MASTER_CONTEXT/AI_SYSTEM_MAP]] · [[00_MASTER_CONTEXT/current_decisions_index]]
- [[07_revenue_os/revenue_os_command_center]] · [[07_revenue_os/delivery_os_command_center]] · [[07_revenue_os/finance_os_command_center]]
