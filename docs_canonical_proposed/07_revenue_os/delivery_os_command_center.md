---
type: delivery_os_canonical
status: proposed
related_project: delivery-os
updated: 2026-06-17
canonical_target: 07_revenue_os/delivery_os_command_center.md
apply_status: PROPOSED_AFTER_SOAK
tags: [delivery_os, command_center, canonical]
---

# Delivery OS / Client Project Factory (canonical)

> The single canonical Delivery OS note. Delivery OS turns an approved product + won deal into a
> managed client project. It is the **execution** layer — NOT a CRM, lead store, send system,
> approval system, second task ledger, or second Project Registry.

## Architecture boundaries
- **Master Controller**: canonical lead, communication, audit, draft, approval, reply, follow-up, send, pipeline.
- **Revenue OS**: product recommendation, pricing, scope template, offer, proposal, deal lifecycle, economics.
- **Delivery OS**: project creation, kickoff, client inputs, scope freeze, delivery plan, milestones,
  tasks, QA, acceptance, change requests, risk register, time model, case evidence, closure, lessons, readiness.
- **AI Operations HQ**: Project Registry, context packs, task ledger, anti-loop, handoff, decisions, backups.
- **Obsidian**: project knowledge, docs, SOP, templates, lessons, dashboards.

## Components (this build, local + offline)
| Component | File |
| --- | --- |
| Domain schemas (11) | `tools/delivery_os/schemas/domain.mjs` |
| Lifecycle engine (14 states) | `tools/delivery_os/lib/lifecycle.mjs` |
| Project creation contract | `tools/delivery_os/lib/creation.mjs` |
| Client inputs engine + catalog | `tools/delivery_os/lib/inputs.mjs` + `data/client_inputs_catalog.json` |
| Milestone planner | `tools/delivery_os/lib/milestones.mjs` |
| Task generator | `tools/delivery_os/lib/tasks.mjs` |
| Kickoff engine | `tools/delivery_os/lib/kickoff.mjs` |
| Playbooks (8) + Mini Audit factory | `tools/delivery_os/lib/playbooks.mjs` + `data/playbooks.json` + `data/advanced_playbooks.json` |
| QA system | `tools/delivery_os/lib/qa.mjs` |
| Acceptance engine | `tools/delivery_os/lib/acceptance.mjs` |
| Change request engine | `tools/delivery_os/lib/change.mjs` |
| Risk register | `tools/delivery_os/lib/risk.mjs` + `data/risk_taxonomy.json` |
| Capacity model | `tools/delivery_os/lib/capacity.mjs` |
| Plan vs actual | `tools/delivery_os/lib/plan_actual.mjs` |
| Case study factory | `tools/delivery_os/lib/casestudy.mjs` |
| Readiness gate | `tools/delivery_os/lib/readiness.mjs` |
| Pilot simulator | `tools/delivery_os/lib/pilot.mjs` |
| Dashboard + owner command center | `tools/delivery_os/lib/dashboard.mjs` |
| Client asset factory | `tools/delivery_os/lib/assets.mjs` |
| CLI | `tools/delivery_os/delivery.mjs` |

## Safety invariants
`send_allowed=false` everywhere · no production mutation · no real client projects (TEST_ONLY only) ·
PLANNED products blocked at creation · client communication never auto-assigned to AI · no embedded
credentials (reference `D:\AI_SECRETS`) · opt-out honored · case studies need client permission.

## Product delivery readiness (this build)
- **mini_audit**: DELIVERY_DEFINED (complete factory + playbook).
- DRAFT playbooks: digital_presence_check, full_business_audit, landing_sprint, start_page_sprint, business_website.
- PLANNED (architecture spec only): lead_system, ai_front_office.
- Readiness is recommended, never auto-promoted. READY_FOR_PILOT/ACTIVE require owner approval.

## Integration (future, post-soak)
- [[07_revenue_os/delivery_os_master_controller_contract]] — consume lead/deal, return recommendations only.
- [[07_revenue_os/delivery_os_file_vault_contract]] — dry-run file routing.
- Project Registry: proposed `delivery-os` entry (`_generated/delivery_os/reports/registry_proposal.json`).

## Dashboards
- [[09_dashboards/delivery_dashboard]] (execution-only; not the Project Portfolio).
- [[09_dashboards/delivery_owner_command_center]].

## Related
- [[07_revenue_os/revenue_os_command_center]] · [[00_MASTER_CONTEXT/PROJECT_REGISTRY]] · [[00_MASTER_CONTEXT/AI_SYSTEM_MAP]]
- Existing extended: [[03_sop/client_delivery_packaging_sop]] · [[02_templates/mini_audit_qa_template]]
