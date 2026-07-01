# Owner UX principles

UPDATED_AT=2026-06-26 Europe/Moscow

## Non-negotiables

1. Today must answer "what is happening and what should I do now?" in 5-10 seconds.
2. Every screen should have one primary owner action.
3. Critical actions must explain risk in human language before the owner acts.
4. STOP must always be available from System and critical context.
5. Errors must give the next action: retry, reconnect, check route, or wait for backend.
6. Empty state is normal. It must never look like a failure.
7. Loading cannot be endless. A screen must resolve to content, empty, error, or offline cache.
8. Owner-facing text must not show technical enum keys, raw JSON, raw route names, or unexplained IDs.
9. Russian text must be natural and specific, not machine-translated.
10. Important actions must be reachable one-handed: bottom or low-mid screen, large touch target, stable layout.

## Command Center rules

- "Safe / Attention / Critical" beats raw status codes.
- "No send / no payment / no production write" must be visible next to risky owner decisions.
- Show evidence and rollback together for critical/system areas.
- A successful preview is not a successful action; wording must avoid false success.

## Interaction rules

- Primary button is filled; secondary actions are outlined/text.
- Dangerous actions open a dialog or preview and default to cancel/close.
- Refresh is explicit and stable; loading spinner is not the only feedback.
- State banners should not push critical content out of view on small screens.

## Android ergonomics rules

- Minimum tap target: 48dp, preferred owner command target: 56dp.
- Use bottom navigation for five zones only.
- Put primary action near the bottom when possible.
- Keep cards scan-friendly: short title, one subtitle, optional trailing count/status.
- Avoid card nesting.
- Use status chips/risk badges instead of long technical explanations when possible.
