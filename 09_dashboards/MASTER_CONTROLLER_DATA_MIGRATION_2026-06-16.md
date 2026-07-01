# Master Controller — Data Migration Analysis (Phase 2, 2026-06-16)

STATUS: PREP COMPLETE — backup + consistency done. CUTOVER DECISION: VPS single-writer
APPROVED by owner and scheduled for controlled cutover (2026-06-16). Canonical writer moves
from local PC to the VPS; local PC becomes development + backup + emergency restore only.
Earlier wording ("declined by owner") was INCORRECT and is superseded by this line.

## Backup (reversible safety net — DONE)
- `backups/master_controller_phase2_20260616_153726/` with `BASELINE_SHA256.txt`:
  - lead_pipeline_store.json  sha256 01ba740f…e8d09dc6  (50 leads, store_revision 1)
  - outbound_send_ledger.jsonl  04fda652…7bbe321e  (7 lines)
  - outbound_email_ledger.jsonl 0c44821f…887bfee9d  (63 lines)
  - lead_contacts.json  e9687cf1…2f750d83
  - lead_intake_events.jsonl d33654e5…556de4e

## Consistency check (DONE — clean)
- LEADS_COUNT=50, NO_ID=0, OPT_OUT_LOST=0, GUESSED_EMAIL_READY=0.
- BY_STATUS: rejected 9, hold_no_public_email 10, written_channel_search_queue 12,
  hold_later 10, waiting_reply 5, send_uncertain 3.
- Ledgers: 0 malformed lines in either ledger.
- Store already carries revision/operationId fields (`store_revision`, `updated_by`,
  `last_operation_id`) — the optimistic-concurrency primitives exist.

## Storage decision: SQLite (WAL) vs keep JSON
Recommendation: **SQLite WAL on the VPS** for the canonical store once the VPS becomes the
single writer — but only AFTER the cutover decision below, because the data is tiny (50
leads / 153 KB) and JSON already has atomic writes + lock + revision. SQLite earns its place
specifically for: real transactions across store+approvals+jobs, concurrent worker + API
access, durable idempotency keys, and bounded memory on the 1 GB box. The repository will be
an adapter so business modules (operator_mode, queue_navigation, outbound_channel_router) keep
their current `readStore`/`updateStoreWithRevision` contract — no business-logic rewrite.

## THE CUTOVER IS AN OWNER DECISION (why I stopped here)
Phase 2 makes the **public VPS the single canonical writer** and disables the local PC and
Telegram direct writers. That is a deliberate inversion of the current model:
- Today: local PC = canonical writer; VPS = read-only snapshot (0444); Telegram writes local.
- After cutover: canonical truth LIVES ON THE VPS. The local copy becomes a backup/restore
  source only. Telegram + Android + workers all write only via the API.

Consequences that need explicit owner sign-off:
1. Canonical lead/ledger data will physically reside on the public VPS (data-residency change).
2. The VPS store must become writable (today it is deliberately 0444 read-only).
3. Telegram must be repointed to the API and lose direct file-write — a behavior change to a
   currently-working contour.
4. Rollback after cutover = restore from the backup above + repoint writers back; any data
   written on the VPS between cutover and rollback must be reconciled.

This is exactly the "second writer / divergence / data on public host" tradeoff you previously
chose to AVOID by selecting read-only remote. Flipping to single-writer-on-VPS reverses that
choice, so it must be a fresh, explicit decision — not inferred from "продолжай".

## Safe next steps once approved
1. Maintenance mode (API returns 503 for mutations; reads ok).
2. Stop Telegram writer; verify no in-flight writes.
3. Build SQLite repository adapter + import (leads, statuses, drafts, approvals, send records,
   replies, opt-out, provenance) — JSON/JSONL kept as immutable migration archive.
4. Cutover: API writes to SQLite on VPS; local + Telegram direct writes disabled.
5. Verify: one writer, no lost updates, Telegram+Android see identical data, restart-safe,
   rollback rehearsed.

---

## RELEASE 2 EXECUTION LOG (2026-06-16) — prep done, cutover gated

### Step 1 — Writer Inventory (PROVEN, not assumed)
There are TWO direct writers to the canonical store, with DIFFERENT safety guarantees:

| WRITER | FILE/FUNCTION | DATA_MUTATED | HOST | CONCURRENT? | TARGET AFTER CUTOVER |
|---|---|---|---|---|---|
| Telegram bot + lead workers | `tools/telegram_gateway/lead_store.mjs saveStore()` (plain writeFileSync, NO lock, NO revision) | lead store, drafts, statuses | local PC | YES (no lock) | route via API repository |
| API store accessor | `mater_controller_api/.../store_access.mjs` writeStoreAtomic/updateStoreWithRevision (atomic+lock+revision) | lead store | wherever API runs | guarded | becomes the ONLY writer |
| Send ledger | `telegram_gateway/outbound_send_ledger.mjs appendFileSync` | outbound_send_ledger.jsonl | local (bot/workers) | append-only | via API/router only |
| Reply state | `telegram_gateway/reply_monitor.mjs logReply (append-only JSONL)` | replies/reply_state.jsonl | local/worker | append-only | via API/repository |
| Follow-up state | `telegram_gateway/followup_engine.mjs` | followups/followup_state.jsonl | local | append-only | via API/repository |
| Contact resolver | `telegram_gateway/contact_resolver_v2.mjs saveStore` | lead store | local | YES | via API repository |

KEY RISK: the local Telegram bot is **currently LIVE** (heartbeat PID 6036, polling, last
command 05:38 today) and writes the store via the NON-locking `saveStore`. A cutover that makes
the VPS canonical while this bot still writes locally = exactly the two-writer divergence the
task forbids.

### Step 2 — Backup + restore drill: PASS
- `backups/master_controller_release2_20260616_165448/` + MANIFEST.txt (sha256/size/lines/mtime).
- Restore drill in temp: parse OK, 50 leads, rev 1, send 7 / email 63.
- DISCREPANCY (reported, not fixed): only 2/7 send-ledger rows reference a currently-known
  lead_id; the other 5 are historical sends whose leads were removed in the earlier cleanup.
  Expected, but must be preserved as historical send truth during migration.

### Step 3 — Storage decision: KEEP JSON+atomic for now (SQLite deferred), evidence-based
- VPS Node is **20.20.2 → `node:sqlite` NOT available** (Node 22+ only). `better-sqlite3` is a
  native module needing a build toolchain on the 1 GB box (absent). So "SQLite WAL on VPS"
  cannot be adopted without either a Node 22 upgrade or installing/compiling a native driver —
  a larger change than this task's "no business-logic rewrite" guardrail allows in one pass.
- The existing JSON store already provides atomic temp+rename + lock + optimistic
  `store_revision` (`store_access.mjs`). For 50 leads/153 KB this satisfies transactions-enough,
  revision, idempotency, restart-safety. DECISION: canonical state stays JSON under the API's
  `store_access` accessor; SQLite is a future step gated on a Node 22 upgrade (recorded in backlog).

### Step 4 — Migration dry-run: PASS
- Copied current store/ledgers to VPS `migration_dryrun/` (NOT the live read-only path).
- Counts on VPS == local: 50 leads / rev 1 / send 7 / email 63. sha256 byte-identical
  (01ba740f…) → re-import is inherently idempotent. Staging cleaned afterwards.

### Step 5 — Cutover: BLOCKED on a real engineering gap (see below)

### Write-path build (DONE + verified) — prerequisite for cutover
The API previously could not write (mutation functions defined, never called). Built the
canonical write service so the VPS CAN become the writer when flipped:
- `mater_controller_api/src/writes/service.mjs` — updateLeadStatus / saveLeadDraft /
  rejectLeadDraft, all via `updateStoreWithRevision` (atomic temp+rename + lock + optimistic
  `store_revision` + `operation_id` idempotency). Handles the PRODUCTION object-map `leads`
  shape (a bug — array-only assumption — was caught by the live HTTP test and fixed).
- API routes (gated by `requireWrite`): `POST /mini-audit/leads/:id/status`, `/draft`,
  `/draft/reject`; plus `GET /capabilities` and `GET /store/revision`.
- WRITE GATE: mutations allowed ONLY when `MATER_CANONICAL_WRITER=true` AND not
  `MATER_MAINTENANCE`. Otherwise 503 READ_ONLY / 503 MAINTENANCE — a client can never believe
  a write persisted on a read-only contour. 2xx is returned ONLY after confirmed commit;
  stale revision → 409 STORE_REVISION_CONFLICT.
- Tests: writes_service 14/14 (object-map shape, persistence, idempotency, revision conflict,
  restart recovery, no lost update, unknown lead, non-writable status); backend suite 47/47;
  live HTTP on a temp store proved write→rev2, idempotent replay no-overwrite, 409 on stale,
  restart reads committed state.
- DEPLOYED to VPS, which REMAINS read-only: live `/capabilities` → `writeAllowed:false`,
  write attempt → 503. The flip (`MATER_CANONICAL_WRITER=true`) is a separate gated step.

### Remaining before the flip (the actual cutover)
1. Stop the LIVE local Telegram bot (PID 6036) so it can't write concurrently — owner action.
2. Repoint Telegram mutations through these API endpoints (remove direct `lead_store.saveStore`).
3. Final export → import to VPS canonical path (writable, config-driven, not chmod-only).
4. Set `MATER_CANONICAL_WRITER=true` on the VPS; verify single-writer + rollback drill.
Steps 2–4 are the next session's work; step 1 needs the owner to stop the bot.

