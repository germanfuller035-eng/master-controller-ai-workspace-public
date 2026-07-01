# UX defect backlog

UPDATED_AT=2026-06-26 Europe/Moscow
SOURCE=baseline audit before implementation

| ID | Priority | Status | Area | Fix target | Acceptance |
|---|---:|---|---|---|---|
| UXR-001 | P0 | Open | IA | Replace top tabs with Today, Decisions, Commerce, Agents, System/STOP. | Existing 41 screens remain reachable; runner nav updated with no route deletion. |
| UXR-002 | P0 | Open | STOP | Add reusable STOP component and render it in System/critical context. | `owner_stop_component` visible in System; no live backend mutation introduced. |
| UXR-003 | P1 | Open | Today | Redesign Today as 5-10 second owner summary with primary next action. | `today_screen` keeps old anchors plus new summary/status tags; no false live success. |
| UXR-004 | P1 | Open | Design system | Add spacing, typography, semantic colors, status/risk components and owner cards. | Shared components compile and are used by redesigned hub screens. |
| UXR-005 | P1 | Open | Approvals | Add owner-readable risk explanation and no-send framing. | Approval detail and offer detail show risk/no-send text before action buttons. |
| UXR-006 | P1 | Open | Commerce | Split commercial hub into grouped owner sections. | Commerce tab opens `commercial_summary`; controls preserve old `cs_*` tags. |
| UXR-007 | P1 | Open | Agents/AI | Promote Agents/AI to top-level zone. | `tab_agents` opens agents dashboard; AI usage/cost/queues remain reachable. |
| UXR-008 | P1 | Open | System | Reduce technical density and prioritize health/STOP. | System top displays STOP, health and critical cards before deep operational list. |
| UXR-009 | P2 | Open | Empty/error | Improve generic state components with owner next-action copy. | `state_empty`, `state_error`, `banner_offline` remain stable and copy is actionable. |
| UXR-010 | P2 | Open | Localization | Reduce owner-visible technical terms. | Unit localization/raw-code tests pass; added coverage for new strings where practical. |
| UXR-011 | P2 | Open | Runner | Update `exec_plan.json` for new IA only after UI changes. | Agents/multichannel/offer/client-route regressions retained. |
| UXR-012 | P2 | Open | Evidence | Document before/after, known limitations, rollback and checkpoint. | Required `_generated/ux_redesign/*` report set exists before commit. |
