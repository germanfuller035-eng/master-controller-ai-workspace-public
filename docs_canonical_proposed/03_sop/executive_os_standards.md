---
type: sop
status: proposed
related_project: executive-os
updated: 2026-06-17
canonical_target: 03_sop/executive_os_standards.md
apply_status: PROPOSED_AFTER_SOAK
tags: [executive_os, sop, standards, policy]
---

# Executive OS Standards (canonical policy bundle)

> One canonical standards document. Extends `00_MASTER_CONTEXT/current_decisions_index.md` and
> `ACTIVE_OBJECTIVES.md`. Executive OS never executes decisions, mutates production, or sends.

## 1. Source of truth policy
One system-of-record per entity (see Source of Truth Matrix). ONE Project Registry / task ledger /
decision register (AI HQ). Lead truth → Master Controller; product → Revenue OS; delivery → Delivery OS;
finance → Finance OS. Executive_OS is never a canonical writer except owner_action recommendations.

## 2. Strategic objectives policy
6-level hierarchy (VISION→ANNUAL→QUARTERLY→MONTHLY→WEEKLY→DAILY). Every goal: upward link, metric,
owner, status, evidence. No activity-only goals. No invented owner targets (UNKNOWN/OWNER_DECISION_REQUIRED).

## 3. Owner decision policy
Unified decision queue. 10-section packets (question/why/options/evidence/recommendation/consequences/
risk/required-input/default-safe-action/deadline). NEVER auto-approved. READY_FOR_OWNER only when evidence
complete, else NEEDS_DATA.

## 4. Portfolio prioritization policy
Transparent weighted scoring (14 visible, configurable criteria). Actions: FOCUS_NOW/CONTINUE/PREPARE/
WAIT/PAUSE/STOP/ARCHIVE/OWNER_DECISION_REQUIRED. No hidden assumptions. No auto archive/delete.

## 5. Next-best-action policy
Deterministic. During production freeze, NEVER recommends production mutation. Separates owner actions
from AI-without-owner actions.

## 6. Operating cadence
Daily (next action / exception / decisions), Weekly (execution review), Monthly (finance close + portfolio +
strategic), Quarterly (objectives + reset), Event-driven (incidents). Scheduling is FUTURE_CONTRACT_ONLY.

## 7. Executive risk policy
Aggregate domain risks by reference (no duplication). Severity = probability × impact.

## 8. Exception policy
16 exception types; cross-system; no external notifications.

## 9. Change control policy
Owner approval required for: architecture, canonical writer, production send, new channel, price,
readiness, real client project, bank integration, tax assumptions, release tag, Git remote, credentials,
recurring cost, sensitive data policy. AI allowed without approval: offline tests, fixtures, docs proposals,
validators, reports, backup verification, context packs.

## 10. Release/acceptance governance
tested ≠ deployed ≠ accepted; server-side test ≠ owner interaction; emulator ≠ device; T+0 ≠ 24h soak;
local tag ≠ published tag.

## 11. Business continuity
11 continuity risks with RPO/RTO/restore path. No secrets exposed; credential paths referenced only.

## 12. KPI policy
Executive KPI tree references authoritative domain metrics; does not reimplement Revenue/Delivery/Finance KPIs.

## Related
- [[07_revenue_os/executive_os_command_center]] · [[00_MASTER_CONTEXT/current_decisions_index]]
