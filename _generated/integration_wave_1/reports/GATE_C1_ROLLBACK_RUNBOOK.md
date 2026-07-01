# Gate C1 — Rollback Runbook (PREPARED — NOT EXECUTED)

date: 2026-06-18 · applies if C1-A or C1-B activation violates an invariant.
Non-destructive. Never drop a non-empty section. Never delete a payment FACT silently.

## Trigger conditions (roll back C1)
- API unhealthy after command activation, module/catalog/cwd failure.
- Unexpected mutation (revision change without a corresponding owner command).
- Send ledger != 7, any SMTP call, any autosend/live-send enable event.
- Duplicate writer, queue write from a command, dead letters > 0.
- A command wrote an entity that fails its evidence/classification invariants.

## Rollback steps (reverse of C1 activation; data-preserving)
1. Set `COMMERCIAL_COMMAND_API=false` in master-controller.env (read API may stay ON).
   Keep COMMERCIAL_SEND=false.
2. `sudo systemctl restart master-controller-api` (ONLY service).
3. Verify commands again return FEATURE_DISABLED (7/7) and engine unreachable.
4. Data created by legitimate owner commands is PRESERVED (it is real commercial truth).
   - Do NOT run the reverse migration if any of the 8 sections is non-empty
     (migration.applyReverse refuses with REFUSE_NONEMPTY_SECTIONS by design).
   - Only erroneous entities are corrected, per their own correction path:
     - opportunity/offer/handoff/project/invoice-draft: remove by id while downstream-empty.
     - owner decision: correct via a NEW decision event (authority record, not deletion).
     - payment FACT: correct via a reversing evidence entry under separate owner approval —
       NEVER deleted.
5. If activation itself was bad (not data), restore the env + restart is sufficient; the store is
   unchanged because gated commands never mutated.
6. Record rollback evidence: before/after revision, ledger lines, queue counts, flags.

## What rollback NEVER does
- Never deletes a non-empty commercial/delivery/finance section.
- Never deletes a payment FACT.
- Never restarts Telegram/worker/scheduler/IMAP or reboots the VPS.
- Never touches leads/queue/send ledger.
