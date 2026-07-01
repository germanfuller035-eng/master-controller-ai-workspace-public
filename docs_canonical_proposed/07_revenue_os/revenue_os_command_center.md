---
type: revenue_os_canonical
status: proposed
related_project: revenue_os
updated: 2026-06-17
canonical_target: 07_revenue_os/revenue_os_command_center.md
apply_status: PROPOSED_AFTER_SOAK
supersedes: extends 07_revenue_os/revenue_os_structure.md (skeleton)
tags: [revenue_os, command_center, canonical]
---

# Revenue OS Command Center (canonical)

> The single canonical Revenue OS note. Extends the old `revenue_os_structure.md` skeleton.
> Revenue OS is the **product / offer / pricing / economics** layer — NOT a CRM, NOT a lead store,
> NOT a send system. Lead truth lives in Master Controller; knowledge lives in Obsidian; orchestration
> in AI Operations HQ.

## What Revenue OS is
Product catalog · recommendation engine · offer factory · proposal factory · pricing engine ·
scope controller · evidence quality gate · deal/project handoff planner · revenue analytics ·
owner decision dashboard.

## What Revenue OS is NOT
Second lead base · second canonical lead store · second approval system · second send system ·
second outbound ledger · second task registry · separate CRM · auto-messaging tool.

## Components (this build, local + offline)
| Component | File |
| --- | --- |
| Domain schemas | `tools/revenue_os/schemas/domain.mjs` |
| Product catalog (18 products) | `tools/revenue_os/data/product_catalog.json` |
| Digital maturity model (11 states) | `tools/revenue_os/lib/maturity.mjs` |
| Recommendation engine | `tools/revenue_os/lib/recommend.mjs` |
| Evidence quality gate | `tools/revenue_os/lib/evidence.mjs` |
| Audit finding taxonomy (20 cats) | `tools/revenue_os/data/audit_taxonomy.json` |
| Mini Audit standard | `tools/revenue_os/data/mini_audit_standard.json` |
| Pricing engine + guard | `tools/revenue_os/lib/pricing.mjs` |
| Scope/delivery engine | `tools/revenue_os/lib/scope.mjs` |
| Offer factory | `tools/revenue_os/lib/offer.mjs` |
| Proposal generator (md/json/html) | `tools/revenue_os/lib/proposal.mjs` |
| Message asset factory (no send) | `tools/revenue_os/lib/messaging.mjs` |
| Objection playbook (15) | `tools/revenue_os/data/objection_playbook.json` |
| Deal lifecycle + handoff | `tools/revenue_os/lib/deal.mjs` |
| Economics / capacity / funnel | `tools/revenue_os/lib/{economics,capacity,funnel}.mjs` |
| Validators | `tools/revenue_os/lib/validators.mjs` |
| CLI | `tools/revenue_os/revenue.mjs` |
| Asset library | `tools/revenue_os/data/asset_library.json` |

## Source of truth for prices
Canonical commercial files in `13_sales/` (read-only). Confirmed: Express Review = free,
Mini Audit = 10 000 ₽. Others OWNER_TARGET ranges or UNKNOWN. No invented numbers.

## Safety invariants
`send_allowed=false` everywhere · autosend BLOCKED · no production mutation · no second lead store ·
opt-out honored (no follow-up) · evidence-backed claims only · owner approval before any client contact.

## Integration (future, post-soak)
- [[07_revenue_os/master_controller_integration_contract]] — consume lead truth, return recommendations only.
- [[07_revenue_os/conversation_hub_architecture]] — one shared conversation truth.

## Dashboards & plans
- [[09_dashboards/revenue_command_dashboard]] (commercial only; not the project portfolio).
- [[07_revenue_os/revenue_30_day_execution_plan]].

## Related
- [[00_MASTER_CONTEXT/PROJECT_REGISTRY]] · [[00_MASTER_CONTEXT/AI_SYSTEM_MAP]]
- [[13_sales/audit_product_ladder]] · [[13_sales/pricing_scope_matrix]]
