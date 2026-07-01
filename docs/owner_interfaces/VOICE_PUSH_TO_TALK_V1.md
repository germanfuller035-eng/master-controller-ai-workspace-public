# Voice Push-To-Talk V1

Status: foundation v1 architecture.

## Purpose

Voice is a future owner input mode for quick drafting and navigation. It is not an autonomous action channel.

## Allowed Actions

- Push-to-talk capture.
- Draft owner request.
- Navigate to screen.
- Summarize current state.
- Prepare an approval draft for screen confirmation.

## Denied Actions

- Always-on listening.
- Voice-only payments.
- Voice-only sends.
- Voice-only production writes.
- Voice-only credential or permission changes.

## Risk Boundaries

Risky actions require screen confirmation. R4/R5 approval payloads must be visible and hash-bound before execution.

## Evidence Shown

The confirmation screen must show transcript, interpreted action, target, risk, data class, payload hash, expiry, and rollback/cancel option where possible.

## STOP Behavior

Voice may request STOP, but the system must also provide visible confirmation and checkpoint evidence.

## Future Implementation Notes

No voice runtime is implemented in foundation v1.
