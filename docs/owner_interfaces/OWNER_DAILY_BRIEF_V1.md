# Owner Daily Brief V1

Status: foundation v1 architecture.

## Purpose

The daily brief gives the owner a compact status view without creating hidden actions.

## Sections

- Today: what changed, what needs attention.
- Decisions: approvals waiting, expiry, risk.
- Commerce: leads, offers, replies, deals.
- AI Circuit: agents, costs, memory proposals, model/tool flags.
- System Health: incidents, STOP status, checkpoints.

## Allowed Actions

Open evidence, approve exact payloads later, defer, reject, STOP, and create a scoped follow-up task.

## Denied Actions

Autonomous sends, payments, production deploys, production DB writes, secret display, and broad approvals.

## Evidence Shown

Each claim should reference source, time, confidence where relevant, and data class. R4/R5 items require payload hash and expiry.

## STOP Behavior

The brief must show whether STOP is active, what is disabled, and which approvals were revoked.

## Future Implementation Notes

Foundation v1 defines content only. No scheduler, notification, or outbound system is implemented.
