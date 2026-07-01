# Android Alignment V1

Status: foundation v1 architecture aligned with completed Android owner UX redesign.

## Purpose

Android is the mobile owner command surface for fast decisions, approvals, STOP, and high-signal evidence. It follows the completed owner UX direction: Today, Decisions/Approvals, Commerce, Agents/AI, and System/STOP.

## Required Android Areas

| Area | Purpose | Allowed actions | Denied actions |
| --- | --- | --- | --- |
| Today | 5-10 second owner situation and next action. | Inspect, open approvals/incidents/commerce. | Hidden sends. |
| Approvals | Owner decisions with risk explanation. | Approve only exact payloads later; reject/defer. | Blanket approval. |
| Leads | Lead pipeline summary under Commerce. | Inspect and draft. | Autonomous outreach. |
| Offer preview | Offer review with no-send framing. | Preview and approve explicit future send payloads. | Payment or actual send without R4 approval. |
| Replies | Reply review and drafts. | Inspect, draft, approve explicit sends later. | Autonomous reply send. |
| Deals | Commercial state and delivery context. | Inspect and draft. | Production DB mutation. |
| Agents | Agent status, lifecycle, boundaries. | Inspect registry/shadow state. | Runtime activation without flag. |
| Costs | AI cost and budget state. | Inspect, set draft budget requests later. | Paid action without approval. |
| Incidents | Critical health and owner decisions. | Inspect, STOP, checkpoint. | Hidden recovery action. |
| Memory proposals | Proposed facts and provenance. | Approve or reject future memory writes. | Direct memory write by agent. |
| Global STOP | Owner emergency action. | Stop, revoke, checkpoint. | None. |
| Voice | Push-to-talk command entry. | Draft requests and screen-confirm risky actions later. | Always-on listening or voice payments. |

## Risk Boundaries

Android must show risk level, data class, approval status, and STOP effect for critical actions. It must not hide production writes, sends, payments, or irreversible actions behind friendly copy.

## Evidence Shown

Android surfaces should show concise source, timestamp, payload hash when relevant, and rollback/cancel availability.

## STOP Behavior

Global STOP must be reachable from System and critical contexts. It maps to `STOP_ALL_AGENTS`, `OUTBOUND_OFF`, `PRODUCTION_WRITE_OFF`, `PAYMENTS_OFF`, `BROWSER_ACTIONS_OFF`, and `REVOKE_ACTIVE_APPROVALS`.

## Future Implementation Notes

Reuse the completed Android owner UX evidence in `_generated/ux_redesign`. Foundation v1 does not modify Android app code.
