# Telegram Reserve Channel V1

Status: foundation v1 architecture.

## Purpose

Telegram is a reserve owner channel, not the primary command center.

## Allowed Actions

- Critical notifications.
- R4/R5 approval prompts with exact payload hash.
- STOP.
- Brief Today summary.
- Quick lead open or deep link.

## Denied Actions

- Unrestricted command execution.
- Production deploy.
- Production DB write.
- Payment.
- Secret display.
- Broad approval without exact payload hash and expiry.

## Risk Boundaries

Telegram approvals require the same payload contract as Web and Android. R5 requires strong owner approval and should prefer a richer screen when possible.

## Evidence Shown

Telegram messages should show compact action, target, risk, expiry, payload hash, and a link to full evidence.

## STOP Behavior

STOP from Telegram triggers the same control-plane STOP contract and reports what was stopped.

## Future Implementation Notes

Do not expand Telegram beyond reserve channel until approval, STOP, and audit runtime exist.
