---
type: product_os_canonical
status: proposed
related_project: product-os
updated: 2026-06-17
canonical_target: 07_revenue_os/product_os_command_center.md
apply_status: PROPOSED_AFTER_SOAK
tags: [product_os, canonical]
---

# Product OS / Service Productization & Pilot Factory (canonical)

> The single canonical Product OS note. Productizes services: specs, claims, evidence, internal pilots,
> demo assets, readiness recommendation. NOT a second product registry / Revenue catalog / Delivery
> playbook store. Product OS **never changes canonical product status**, never publishes, never sends,
> never creates real client projects/pilots.

## Architecture boundaries
- **Revenue OS**: catalog, commercial formulation, price, offer, commercial readiness, funnel (commercial truth).
- **Delivery OS**: project delivery, inputs, milestones, tasks, QA, acceptance, risks, playbooks.
- **Finance OS**: cost, margin, cashflow impact, capacity cost, profitability.
- **Executive OS**: priority, owner decisions, stop/go/pause, capacity allocation, next-best-action.
- **Product OS**: product specification, packaging, evidence, internal pilots, demo assets, benchmark
  outputs, readiness evidence, change log, versioning, claims catalog, standardization, reusable
  components, pilot evaluation, promote/pause/merge/deprecate **recommendations**.

## Components (this build, local + offline)
| Component | File |
| --- | --- |
| Domain schemas (6) | `tools/product_os/schemas/domain.mjs` |
| Catalog/playbook loader (read-only) | `tools/product_os/lib/catalog.mjs` |
| Spec standard + duplication analysis | `tools/product_os/lib/spec.mjs` |
| Claims catalog + prohibited blocker | `tools/product_os/lib/claims.mjs` |
| Readiness dimensions + status gate | `tools/product_os/lib/readiness.mjs` |
| Productization packs + boundaries | `tools/product_os/lib/productize.mjs` + `data/product_packs.json` |
| Demo asset factory | `tools/product_os/lib/demo.mjs` |
| Internal pilot engine | `tools/product_os/lib/pilot.mjs` |
| Consistency (sales-delivery, price-cost) | `tools/product_os/lib/consistency.mjs` |
| Components + templates | `tools/product_os/lib/components.mjs` |
| Versioning + change control | `tools/product_os/lib/versioning.mjs` |
| Product QA | `tools/product_os/lib/qa.mjs` |
| Roadmap + decisions + dashboard + OCC | `tools/product_os/lib/dashboard.mjs` |
| CLI | `tools/product_os/product.mjs` |

## Core principles
- Catalog is read-only; Product OS NEVER writes canonical product status (recommendation only).
- No auto-promotion. READY_FOR_PILOT/ACTIVE require owner approval + pilot evidence.
- Prohibited claims (guarantees, full automation, employee replacement) blocked in client-ready assets.
- All pilots synthetic. All demos INTERNAL_DRAFT by default. send_allowed/publish_allowed always false.
- Mini Audit price 10 000 ₽ (CONFIRMED) never altered. No invented prices/claims.

## Key findings (this build)
- Catalog verified: 2 ACTIVE, 7 DRAFT, 9 PLANNED. digital_presence_check is PLANNED (not assumed active).
- mini_audit: catalog=ACTIVE but evidence-based gate only supports DELIVERY_DEFINED (no real pilot) —
  flagged for owner. With synthetic pilot flags → recommends READY_FOR_PILOT (owner approval required).
- lead_system / ai_front_office kept PLANNED (boundary decisions); AI Front Office autonomous variant prohibited by default.
- Start Pack price conflict surfaced as owner decision (not auto-resolved).

## Integration (future, post-soak)
- [[07_revenue_os/product_os_integration_contracts]] — MC/Revenue/Delivery/Finance/Executive, advisory non-runtime.

## Dashboards / standards
- [[09_dashboards/product_dashboard]] (readiness focus, does not duplicate Revenue Dashboard).
- [[03_sop/product_os_standards]].

## Related
- [[07_revenue_os/revenue_os_command_center]] · [[00_MASTER_CONTEXT/PROJECT_REGISTRY]] · [[00_MASTER_CONTEXT/AI_SYSTEM_MAP]]
