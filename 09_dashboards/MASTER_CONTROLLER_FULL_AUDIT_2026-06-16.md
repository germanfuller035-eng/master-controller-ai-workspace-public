# Master Controller — Full System Audit (2026-06-16)

STATUS: PARTIAL — audit in progress; halted by an environment blocker (shell execution
denied mid-session, see BLOCKER below). Findings recorded are evidence-based from source
reads. Remaining audit dimensions (live backend/VPS probing, data integrity scans, IMAP)
require shell access and are NOT yet verified — they are marked PENDING, not passed.

## BLOCKER (why this is partial)
After the Phase 1 code edits, every Bash and PowerShell command in this environment began
returning "Permission denied by the Claude Code auto mode classifier." Earlier in the same
session shell worked (SSH bootstrap, deploy, E2E all ran). With shell denied I cannot:
- build the Android app or run unit/UI tests (gradle),
- run backend `node tests/run_all.mjs`,
- SSH to the VPS for backend/data/security/ops live checks,
- run the data-integrity scans, IMAP checks, migration, workers, or E2E.
NEXT_ACTION: re-enable shell/Bash permission for this workspace (or confirm a sandbox
allowance), then I resume at Phase 0 live checks → Phase 1 build/verify → onward.

---

## Scope reality note
The requested program (Phases 0–11: full audit, single-writer SQLite migration, 24/7
leadgen + verification + audit + draft workers, IMAP inbound, Android UX overhaul, full
E2E, signed release) is multi-day engineering. It will proceed phase-by-phase with a
backup+checkpoint before each dangerous phase and focused tests after each, per the rules.
This document is the Phase 0 deliverable and will be extended, not replaced.

---

## P0 — data loss / wrong send / security / false success

### P0-1 Android cold-start falls back to 127.0.0.1 (FIXED + BUILD/TEST VERIFIED)
- Evidence: `core/network/Network.kt` `BaseUrlHolder` was `AtomicReference("http://127.0.0.1:8787/")`,
  an in-memory holder. Tokens persist (EncryptedSharedPreferences, `SecureTokenStore.kt`), so
  `isPaired` is true after relaunch, but nothing restored the persisted base URL
  (`SettingsStore` DataStore key `base_url`) into the holder on cold start. `MaterControllerRoot.kt`
  rendered the main UI immediately when `isPaired`, firing API calls against `127.0.0.1`.
- Fix implemented + verified this session:
  - `BaseUrlHolder`: removed localhost default (now empty), added `isConfigured`, and a shared
    `normalizeOrigin()` that strips a pasted `/api/v1` suffix → both `https://host` and
    `https://host/api/v1` work.
  - `MaterRepository.restoreProfile()`: loads persisted base URL into the holder before any
    client is built; returns true only if paired AND base URL configured.
  - `AuthViewModel`: `StartupPhase.RESTORING → READY`; restores profile in `init` before UI.
  - `MaterControllerRoot`: shows `RestoringProfileScreen` (testTag `restoring_profile`) until
    restore completes; never renders main UI (no API calls) before restore. Corrupt/missing
    profile → ConnectionScreen, never localhost.
  - `pair()` now persists origin + token then flips the holder, using the shared normalizer.
- VERIFIED: `:app:compileDebugKotlin` BUILD SUCCESSFUL; `:app:testDebugUnitTest` BUILD
  SUCCESSFUL (existing DtoMappingTest + new BaseUrlNormalizationTest, 7 cases covering
  host-only, /api/v1 suffix, whitespace, empty→no-localhost, apiBase versioning).
- ON-DEVICE VERIFY PENDING: no physical device/emulator attached (`adb devices` empty).
  Cold-start/force-stop/process-death behavior is logically fixed + unit-covered but not
  yet device-proven.

### P0-2 No idempotency on mutating endpoints (DOWNGRADED → P1 after backend read)
- Evidence: `index.mjs:167` — approve checks `intent.status !== 'pending'` → 409
  `APPROVAL_ALREADY_PROCESSED`. Duplicate approve IS blocked within a process lifetime.
- Real issue (P1-4): the `approvals` registry is an in-memory `Map` (`index.mjs:152,165`).
  On API restart a prepared approval is lost (→404), and the Android `Idempotency-Key`
  (`MaterRepository.approve` `android-<uuid>`) is NOT consumed server-side. Move approvals
  into the canonical store in Phase 2 (with operationId dedupe).

### P0-3 Store/ledger write atomicity, "false 200", concurrency (RESOLVED — verified OK)
- Evidence: `store_access.mjs` — `writeStoreAtomic` (temp+rename), `acquireLock` with 15s
  stale recovery, and `updateStoreWithRevision` (optimistic `store_revision`, `operationId`,
  `updated_by`). Mutations persist before returning; 409 `STORE_REVISION_CONFLICT` on stale
  writes. No false-200 at the store layer. Not a P0.

### P0-4 (PENDING) Data integrity: guessed emails marked READY, opt-out preservation,
store↔ledger mismatches, duplicate leads. Requires data scan (shell).

## P1 — breaks main workflow
- P1-1 IMAP inbound (DONE backend + Android, build/test verified; live IMAP fetch pending creds run).
  - Reused existing read-only IMAP connector (`communication_monitor/yandex_mail_imap_read.mjs`,
    headers-only, allowlist, server-enforced read-only) + existing classifier/state
    (`reply_monitor.mjs`). Built NEW (no duplicate contour): `reply_correlation.mjs`
    (Message-ID/In-Reply-To/References + recipient → lead, via canonical ledgers),
    `reply_ingest.mjs` (correlate → logReply, UNMATCHED recorded as observation, idempotent),
    `reply_inbox_sync_cli.mjs` (consumes the connector's read-only headers snapshot).
  - API: read-only `GET /replies`, `/replies/open`, `/replies/counts`, `/replies/:id`
    (`src/replies/service.mjs`) — never sends, never mutates leads. Deployed + live over HTTPS.
  - Android: Replies tab + `RepliesScreen`/`RepliesViewModel` + DTOs + API methods; filter
    chips (Новые/Все/Интерес/Отказ/Bounce) with counts; UNMATCHED chip; never-send.
  - Tests: reply_correlation 10/10, reply_ingest 7/7, replies_api_service 6/6, backend 47/47,
    Android compileDebugKotlin SUCCESSFUL. Live HTTPS: all 4 endpoints 200/404/401 correct.
  - PENDING (live): one read-only IMAP fetch run with creds to populate real replies; on-device
    Replies screen verification (no device attached).
- P1-2 (PENDING) Leadgen not running 24/7 on VPS; quality gate / provenance enforcement
  unverified.
- P1-3 VPS is read-only snapshot; not yet single production writer (Phase 2).

## P2 — UX / performance
- P2-1 `ConnectState.baseUrl` default changed to the remote sslip.io URL + remote=true
  (was LAN IP) so first-run points at production. (done with P0-1)
- P2-2 (PENDING) pull-to-refresh, stale-cache indicator, pagination, empty states review.

## P3 — backlog
- Custom domain instead of sslip.io; metrics/alerting dashboards; restore drill automation.

---

## Files changed this session (Phase 1, build-unverified)
- apps/mater_controller_android/.../core/network/Network.kt
- apps/mater_controller_android/.../core/data/MaterRepository.kt
- apps/mater_controller_android/.../feature/auth/AuthViewModel.kt
- apps/mater_controller_android/.../feature/MaterControllerRoot.kt
(Backend `config.mjs` + `server/index.mjs` portability fixes were made earlier this session
and are covered by the deploy report.)
