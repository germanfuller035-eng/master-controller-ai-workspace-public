---
type: integration_contract
status: proposed
related_project: executive-os
updated: 2026-06-17
canonical_target: 07_revenue_os/executive_os_integration_contracts.md
apply_status: PROPOSED_AFTER_SOAK
tags: [executive_os, integration, contracts, future]
---

# Executive OS — Integration Contracts (future, non-runtime)

> All contracts are **future** and **non-runtime**. Nothing implemented/deployed during the soak.
> Executive OS never executes owner decisions, never mutates production, never sends.

## Telegram future contract (Phase 32)
Commands (read-only by default): `/executive`, `/decisions`, `/owner_next`, `/risks`, `/portfolio`,
`/weekly`, `/finance_summary`, `/delivery_summary`.
Rules: read-only default · approval only via explicit gated callback · no send path · no direct
canonical file access · one owner identity · revision-safe · human-readable Russian · no raw objects /
internal enums. Not implemented/deployed.

## Android future contract (Phase 33)
Screens: Executive Overview, Owner Actions, Decisions, Portfolio, Risks, Weekly Review, KPI Summary,
System Health. Rules: API-only · Room cache only · no offline decisions/approvals · revision conflict
handling · read-only until explicit owner action · no server secrets. Not implemented during soak.

## Master Controller contract (Phase 34)
- Executive OS may READ: canonical lead summary, pipeline counts, approval/reply/follow-up queues,
  automation status, release health, revision.
- Executive OS may RETURN only: owner recommendation, priority, decision request, executive alert.
- No direct mutation. Future path: `Executive OS → MC API → validation → owner approval → canonical mutation`.

## File Vault contract (Phase 35, dry-run only)
Routing for: decision evidence, financial evidence, delivery evidence, project docs, acceptance,
risk evidence, reports, backups. Rules: hash · dedupe · sensitivity · restricted access · no secrets
in context · provenance · no automatic deletion · owner approval for sensitive moves. Dry-run only.

## AI HQ contract
Executive OS consumes Project Registry / context packs / task ledger / decision register (read) and
adds prioritization + owner actions. Never writes canonical registry/ledger/decision-register.

## Project Registry proposal
Proposed `executive-os` entry (`_generated/executive_os/reports/registry_proposal.json`) — resolves
the ledger warning. Not written to canonical registry during soak.

## Related
- [[07_revenue_os/revenue_os_command_center]] · [[07_revenue_os/delivery_os_command_center]]
- [[07_revenue_os/finance_os_command_center]] · [[00_MASTER_CONTEXT/AI_SYSTEM_MAP]]
