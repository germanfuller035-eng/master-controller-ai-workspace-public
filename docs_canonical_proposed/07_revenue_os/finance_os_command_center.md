---
type: finance_os_canonical
status: proposed
related_project: finance-os
updated: 2026-06-17
canonical_target: 07_revenue_os/finance_os_command_center.md
apply_status: PROPOSED_AFTER_SOAK
tags: [finance_os, command_center, canonical]
---

# Finance OS / Business Control Center (canonical)

> The single canonical Finance OS note. Finance OS is the **financial/managerial control** layer —
> NOT a bank, accounting system, payment service, CRM, or second Project Registry/Deal DB. All data
> is local, offline, TEST_ONLY. No bank connection, no real invoices, no payments, no sending.

## Architecture boundaries
- **Master Controller**: canonical leads, pipeline, communication, approved-send states, replies, follow-ups.
- **Revenue OS**: products, prices, offers, deals, revenue assumptions, funnel.
- **Delivery OS**: projects, scope, milestones, tasks, actual effort, acceptance, delivery risks.
- **Finance OS**: invoices, payment schedules, payments, receivables, expenses, cashflow, P&L,
  project profitability, product economics, budget, reserves, forecast, financial close, owner dashboard.
- **AI HQ**: Project Registry, context packs, task ledger, decisions, backups, validation.

## Components (this build, local + offline)
| Component | File |
| --- | --- |
| Domain schemas (10) | `tools/finance_os/schemas/domain.mjs` |
| Data classification | `tools/finance_os/lib/classification.mjs` |
| Chart of accounts | `tools/finance_os/data/chart_of_accounts.json` |
| Invoice + payment schedule | `tools/finance_os/lib/invoice.mjs` |
| Receivables | `tools/finance_os/lib/receivables.mjs` |
| Payment reconciliation | `tools/finance_os/lib/reconcile.mjs` |
| Expense management | `tools/finance_os/lib/expense.mjs` |
| Product economics + project profitability | `tools/finance_os/lib/economics.mjs` |
| P&L | `tools/finance_os/lib/pnl.mjs` |
| Cashflow | `tools/finance_os/lib/cashflow.mjs` |
| Budget | `tools/finance_os/lib/budget.mjs` |
| Reserves + tax estimate | `tools/finance_os/lib/reserves.mjs` |
| Debt | `tools/finance_os/lib/debt.mjs` |
| Owner separation | `tools/finance_os/lib/separation.mjs` |
| Business units + asset/liability | `tools/finance_os/lib/assets.mjs` + `data/business_units.json` |
| Forecast + break-even | `tools/finance_os/lib/forecast.mjs` |
| KPI system | `tools/finance_os/lib/kpi.mjs` + `data/kpi_definitions.json` |
| Monthly close | `tools/finance_os/lib/close.mjs` |
| Dashboard + command center + alerts | `tools/finance_os/lib/dashboard.mjs` |
| Reports + import contracts | `tools/finance_os/lib/reports.mjs` + `lib/import_contracts.mjs` |
| CLI | `tools/finance_os/finance.mjs` |

## Data status discipline (the core principle)
Every number carries a status: **CONFIRMED / OWNER_TARGET / MODEL_ESTIMATE / IMPORTED_UNVERIFIED / UNKNOWN**.
Never confused: forecast≠revenue · invoiced≠payment · payment≠profit · profit≠cash · target≠result ·
credit≠income · asset valuation≠cash · personal funds≠business revenue.

## Confirmed facts (evidence-based)
Edera Rest 10 000 ₽ paid (CONFIRMED). Mini Audit price 10 000 ₽ (CONFIRMED). Targets 300k/500k/1M ₽/mo
(OWNER_TARGET). Owner capacity, cash balances, tax rate: UNKNOWN (owner input needed).

## Safety invariants
no bank connection · no real invoices · no payments · no sending · `send_allowed=false` everywhere ·
no production mutation · credentials reference `D:\AI_SECRETS` only · no full account numbers · TEST_ONLY.

## Integration (future, post-soak)
- [[07_revenue_os/finance_os_integration_contracts]] — Revenue/Delivery/MC/File Vault, all advisory, non-runtime.

## Dashboards / standards
- [[09_dashboards/finance_dashboard]] · [[09_dashboards/finance_owner_command_center]] · [[03_sop/finance_os_standards]].

## Related
- [[07_revenue_os/revenue_os_command_center]] · [[07_revenue_os/delivery_os_command_center]]
- [[00_MASTER_CONTEXT/PROJECT_REGISTRY]] · [[03_sop/payment_and_receipt_control_sop]] (extended)
