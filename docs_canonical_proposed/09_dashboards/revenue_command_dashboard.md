---
type: dashboard
status: proposed
related_project: revenue_os
updated: 2026-06-17
canonical_target: 09_dashboards/revenue_command_dashboard.md
apply_status: PROPOSED_AFTER_SOAK
tags: [dashboard, revenue, command_center]
labels_legend: "CONFIRMED = verified fact · OWNER_TARGET = owner-set goal · MODEL_ESTIMATE = computed model · UNKNOWN = no data"
---

# Revenue Command Dashboard (canonical, commercial only)

> Single canonical commercial dashboard. Does NOT duplicate the Project Portfolio (operational).
> Every number carries a label: **CONFIRMED / OWNER_TARGET / MODEL_ESTIMATE / UNKNOWN**.
> Generated facts come from `tools/revenue_os/data/product_catalog.json` (regenerate via
> `node tools/revenue_os/revenue.mjs dashboard-refresh`).

## 1. Product readiness  `CONFIRMED` (from catalog)
- ACTIVE (2): `express_review` (free), `mini_audit` (10 000 ₽).
- DRAFT (7): mini_audit_plus, full_business_audit, funnel_audit, implementation_sprint, start_page_sprint, landing_sprint, business_website.
- PLANNED (9): process_comm_audit, lead_system, ai_front_office, growth_support, digital_presence_check, owned_presence_pack, domain_recovery, audit_plus_prototype, prototype_preview.

## 2. Current commercial focus
- Entry product `mini_audit` (the only fully-ready paid product). Prove one paid loop (no send during freeze).

## 3. Entry product  `CONFIRMED`
- Mini Audit 10K — 10 000 ₽, 1–2 days, 5–7 evidence-backed findings. Spec: `data/mini_audit_standard.json`.

## 4. Upsell ladder  `CONFIRMED` (ladder) / `OWNER_TARGET` (prices)
express_review (free) → mini_audit (10 000 ₽) → mini_audit_plus (20–30k) / full_business_audit (30–70k) →
implementation_sprint (50–150k) → start_page_sprint / business_website (90–350k) → growth_support (monthly).

## 5. Current pipeline model  `MODEL_ESTIMATE`
- No live pipeline (no production leads touched). Funnel simulator available; sample: 1000 candidates →
  ~3 deals at default conservative rates (assumptions visible in `_generated/revenue_os/samples/`).

## 6. Capacity  `UNKNOWN`
- Owner weekly availability not confirmed in canonical Revenue OS → capacity = UNKNOWN.
  Owner must provide `owner_weekly_hours` to compute max parallel projects / monthly volume.

## 7. Revenue targets  `OWNER_TARGET` / `UNKNOWN`
- No owner targets recorded in canonical files → UNKNOWN. Owner to define monthly target.

## 8. Confirmed revenue  `CONFIRMED`
- No closed-deal ledger present in workspace → confirmed actual revenue = UNKNOWN (0 recorded).

## 9. Forecast assumptions  `MODEL_ESTIMATE`
- Conversion defaults (conservative): replied 0.2, interested 0.4, proposal 0.5, won 0.3. All editable.

## 10. Risks
- Start Pack price conflict across source files (50k vs 90–250k) — owner reconcile.
- Most products DRAFT/PLANNED — only mini_audit fully ready. Capacity unknown.

## 11. Owner actions
- Confirm owner weekly hours; confirm/clarify Start Pack price; define monthly revenue target;
  approve first controlled commercial cycle (separate approval); provide approved case examples.

## 12. Claude actions
- Maintain catalog/engines; generate internal offers/proposals (no send); calibrate funnel after data.

## 13. Cline actions
- Focused fixes to fixtures/validators if needed; no architecture changes.

## 14. Blocked items
- Live outreach (soak + approval); Lead Hunter credentials (owner); capacity calc (owner hours).

## 15. Next commercial milestone
- Soak close → owner acceptance → prove one Mini Audit paid loop (dry-run, no send).

## Related
- [[00_MASTER_CONTEXT/PROJECT_REGISTRY]] · [[09_dashboards/project_portfolio_dashboard]]
- [[07_revenue_os/revenue_os_command_center]] · [[07_revenue_os/master_controller_integration_contract]]
