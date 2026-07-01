# Session 0 Acceptance Asset Reconciliation

UPDATED_AT=2026-06-26 Europe/Moscow

## Decision

COMMIT_SESSION0_ACCEPTANCE_ASSET_RECONCILIATION=YES

Owner decision accepted after Session 0 final commit `388bb28`.

## Scope

Files reconciled:

- `apps/mater_controller_android/app/src/androidTest/assets/control_plan.jsonl`
- `apps/mater_controller_android/app/src/androidTest/assets/exec_plan.json`

No runtime, production, VPS, HAPP, VPN, proxy, adb reverse, release, tag, merge, UX redesign, MCP, AI foundation, VoltAgent, Qdrant, OPA, or deployment work was started.

## Verification

- `control_plan.jsonl` JSONL syntax: PASS
- `exec_plan.json` JSON syntax: PASS
- `control_plan` count: 300
- `exec_plan` count: 282
- removed control from `control_plan`: `CTRL-0085`
- removed control from `exec_plan`: `CTRL-0085`
- added controls: none
- remaining `control_plan` order after removing `CTRL-0085`: unchanged
- remaining `exec_plan` order after removing `CTRL-0085`: unchanged
- scoped path class: Android instrumentation acceptance assets
- asset secret scan: no plaintext secret patterns matched
- runtime data in asset diff: none

## Rationale

`CTRL-0085` duplicated the same commercial confirm button selector already covered by `CTRL-0084`.
The independent dismiss action did not have a separate addressable testTag target, and the cancel path was already exercised through the `CTRL-0084` handler.

Keeping `CTRL-0085` in HEAD would leave the committed asset baseline with a 283-control mismatch while Session 0 final evidence records `FULL_RUN_1_STATUS=282/282_PASS` and `RUN2_FINAL_STATUS=COMPLETE`.

## Supporting Proof

Compact proof file reviewed for inclusion:

- `_generated/full_run_1_invalid_partial_20260625T121102/INVENTORY_FIXES/DUPLICATE_CTRL-0085.json`
- size: 2404 bytes
- JSON syntax: PASS
- plaintext secret scan: PASS

The proof is included because it is compact, directly explains the invalid duplicate, and supports the exact Session 0 asset reconciliation without adding bulk generated evidence.

## Commit Boundary

Allowed in this reconciliation commit:

- the two Android acceptance asset files above
- this reconciliation note
- the compact `DUPLICATE_CTRL-0085.json` proof

Not allowed in this reconciliation commit:

- `tools/mater_controller_api/data/devices.json`
- `tools/mater_controller_api/data/pairing.json`
- `.agents/skills/**`
- generated XML, screenshots, stdout, probe, cache, or bulk evidence
- runtime state, secrets, or local pairing data
