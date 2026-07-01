---
type: customer_success_os_canonical
status: proposed
related_project: customer-success-os
updated: 2026-06-17
canonical_target: 07_revenue_os/customer_success_os_command_center.md
apply_status: PROPOSED_AFTER_SOAK
tags: [customer_success_os, canonical]
---

# Customer Success OS / Retention, Support & Expansion Factory (canonical)

> The single canonical Customer Success OS note. Owns post-delivery success state: onboarding, success
> plans, outcomes, adoption, health, support lifecycle, customer risks, satisfaction, renewal/expansion
> readiness, churn reasons, customer lessons, review cadence, case/referral permission state.
> NOT a CRM / helpdesk SaaS / messaging / lead system / auto-communication. Never sends, publishes,
> changes canonical status, or stores a second customer identity. All data synthetic TEST_ONLY.

## Architecture boundaries
- **Master Controller**: canonical customer identity, communication state, replies, follow-ups, approvals, outbound, revision.
- **Revenue OS**: product sold, offer, deal, expansion recommendation, pricing, renewal commercial proposal.
- **Delivery OS**: project, deliverables, acceptance, change requests, project risks, lessons.
- **Finance OS**: invoice, payment, support cost, customer profitability, renewal cash impact.
- **Product OS**: product definition/version, claims, readiness, product lessons.
- **Executive OS**: owner priority, exceptions, concentration risk, escalation, owner decisions.
- **Customer Success OS**: post-delivery onboarding/success/adoption/health/support/risks/satisfaction/
  renewal/expansion/churn/lessons/cadence/permissions.

## Components (this build, local + offline)
| Component | File |
| --- | --- |
| Domain schemas (9) | `tools/customer_success_os/schemas/domain.mjs` |
| Lifecycle engine (13 states) | `tools/customer_success_os/lib/lifecycle.mjs` |
| Delivery handoff + Mini Audit hierarchy | `tools/customer_success_os/lib/handoff.mjs` + `data/mini_audit_stage_hierarchy.json` |
| Onboarding/success plan/outcomes/adoption | `tools/customer_success_os/lib/success.mjs` |
| Health + risk | `tools/customer_success_os/lib/health.mjs` |
| Support/triage/boundary/SLA | `tools/customer_success_os/lib/support.mjs` |
| Incidents/known issues/KB/drafts | `tools/customer_success_os/lib/incidents.mjs` |
| Feedback/satisfaction/value review | `tools/customer_success_os/lib/feedback.mjs` |
| Renewal/expansion/churn/profitability | `tools/customer_success_os/lib/lifecycle_commercial.mjs` |
| Permissions/case handoff | `tools/customer_success_os/lib/permissions.mjs` |
| Playbooks/portfolio/dashboard/OCC/reports | `tools/customer_success_os/lib/portfolio.mjs` + `data/playbooks.json` |
| CLI | `tools/customer_success_os/success.mjs` |

## Mini Audit 5-vs-15 reconciliation (RESOLVED)
5 macro-phases (Delivery playbook milestones) CONTAIN ~18 detailed operational stages (delivery factory).
Neither model wrong; canonical hierarchy in `data/mini_audit_stage_hierarchy.json`. Status NOT changed.

## Core principles
- No second canonical identity/communication history; `customer_ref_id → canonical_lead_id` reference only.
- Never sends, publishes, or changes canonical status. No auto renewal/upsell. No fabricated outcomes/ROI.
- Health is explainable: payment≠dissatisfaction, silence≠churn, all-unknown→UNKNOWN, critical incident→CRITICAL.
- Permissions never inferred from feedback. Security/privacy support never auto-resolved.

## Integration (future, post-soak)
- [[07_revenue_os/customer_success_os_integration_contracts]] — all advisory, non-runtime.

## Dashboards / standards
- [[09_dashboards/customer_success_dashboard]] (post-delivery focus, does not duplicate domain dashboards).
- [[03_sop/customer_success_os_standards]].

## Related
- [[00_MASTER_CONTEXT/PROJECT_REGISTRY]] · [[00_MASTER_CONTEXT/AI_SYSTEM_MAP]] · [[07_revenue_os/revenue_os_command_center]]
