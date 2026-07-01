# ADR-0007: Owner Interfaces Web, Android, Telegram

## Status

Accepted for foundation v1.

## Context

Owner control needs consistent information architecture across Web, Android, Telegram reserve channel, and future voice.

## Decision

Web owns the full command-center view. Android aligns to the completed owner UX zones and focuses on mobile decisions, approvals, STOP, and quick evidence. Telegram is a reserve channel only for critical notifications, approvals, STOP, brief Today, and quick lead open. Voice is push-to-talk only.

## Consequences

- Android remains aligned with Today, Approvals/Decisions, Commerce, Agents, Costs, Incidents, Memory proposals, Global STOP, and Voice.
- Web shows Today & Decisions, Commerce, AI Circuit, Knowledge, and System Health / STOP.
- Telegram cannot become an unrestricted command surface.

## What Is Explicitly Not Implemented

- No Web implementation.
- No Telegram bot changes.
- No voice runtime.

## Rollback / Supersession Rule

Supersede with a later owner-interface ADR that includes evidence from implementation and acceptance tests.

## Related Files

- `docs/owner_interfaces/WEB_COMMAND_CENTER_IA_V1.md`
- `docs/owner_interfaces/ANDROID_ALIGNMENT_V1.md`
- `docs/owner_interfaces/TELEGRAM_RESERVE_CHANNEL_V1.md`
