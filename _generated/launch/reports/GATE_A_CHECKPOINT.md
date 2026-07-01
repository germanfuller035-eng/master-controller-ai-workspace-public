# Gate A Checkpoint (COMPLETE — read-only live verification done)

date: 2026-06-17T19:33Z · branch feature/controlled-production-launch-v1

## Status
FINAL_STATUS=PARTIAL_OWNER_ACCEPTANCE_PENDING
TECHNICAL_LAUNCH_STATUS=LIVE_VERIFIED_EXISTING_RELEASE
CLIENT_ACCEPTANCE_STATUS=NOT_RUN · COMMERCIAL_CYCLE_STATUS=NOT_STARTED

## Gates
GATE_A_APPROVED=YES · GATE_A_EXECUTED=YES (SSH recovered via AI_SECRETS key; full read-only pass done)
GATE_B_REQUIRED=NO (runtime delta NONE — prod == release == candidate, byte-for-byte)
GATE_B_APPROVED=NO · GATE_C_APPROVALS=0

## What is now LIVE-PROVEN
Production runtime == release 9d346f3 == consolidation 7ea6993 (all hashed files match). 14 services
healthy, 1 canonical writer, store_revision=66, 50 leads / 0 dup, integrity PASS. Queue 28/28 completed,
0 dead letters. 7 ledger sends (matches baseline), 0 unexpected. autosend=false. 1 Telegram poller,
isolated. IMAP stage1_readonly. UFW+fail2ban active. TLS valid → 2026-09-14. LIVE_HEALTH_STATUS=HEALTHY,
0 critical failures.

## Hard-stop conditions
None triggered. No second writer, no duplicate poller, no unexpected send, no autosend, no canonical
change, no secret printed, no service restart.

## Remaining (owner-gated, NOT executed)
- Telegram owner smoke (physical taps) — checklist prepared, NOT_RUN.
- Android physical-device smoke — build PASS offline; device smoke NOT_RUN.
- Restore drill — backup+checksum present; restore NOT executed (owner-gated).
- Commercial cycle — NOT_STARTED (8 commercial-blocking owner decisions + per-message Gate C).
- 9 live-blocking decisions (alert channel, SLO/RPO/RTO, backup encryption/off-site, Lead Hunter creds,
  the two smokes) remain OWNER_DECISION_REQUIRED.

## Next action
Owner performs Telegram + Android smoke and records results; then resolve commercial decisions for any
controlled cycle. No production change is needed for the technical launch (RESULT A).

---
## UPDATE 2026-06-18 — Telegram UX deployed + Android RC2 built
- Telegram FINAL UX deployed (Gate B approved): views.mjs 99071ffa→dd45b613, PID 7757, owner smoke PASS;
  soak T0 2026-06-17T22:24:14Z IN_PROGRESS (UNCHANGED in the Android pass — no VPS touch).
- Android pairing PASS (Samsung A56). Physical smoke for rc1 was PARTIAL (raw owner-facing values).
- Android v0.4.0-rc2 built (code 5): all five hubs + nested screens localized; raw enums/reasons removed;
  centralized OwnerLocalization layer; 52 unit tests / 0 failed; lint 0 errors; signed APK+AAB, signer ==
  rc1, update-compatible; HTTPS-only; no secrets/token in artifacts; pairing survives over-install.
- Build-blocking repo fix: SecureTokenStore.kt + TokenRefresher.kt (secret-free) were gitignored by an
  over-broad `*token*` rule → added negations so a clean checkout compiles.
- ANDROID_PHYSICAL_SMOKE=NOT_RUN_FOR_NEW_BUILD (owner installs rc2 + runs checklist). Tag v0.4.0-rc1 NOT
  moved; no remote; no push. See ANDROID_OWNER_UX_RC2.md.

---
## UPDATE 2026-06-18 (2) — Android RC3 (nested-screen code cleanup)
- rc2 physical testing found internal codes still on nested screens (manual_verified_csv,
  ALREADY_WAITING_REPLY, SEND_UNCERTAIN, MISSING_PREVIEW, Follow-up). rc3 closes the whole owner-facing
  presentation layer: centralized renderLeadSourceRu / renderBlockerRu (+redundancy) / renderDateRu /
  audit-missing reason; follow-up term → «Повторный контакт».
- v0.4.0-rc3 built (code 6): 66 unit tests / 0 failed (incl. static OwnerUiRawCodeSafety scan →
  RAW_INTERNAL_CODES_IN_OWNER_UI=0); lint 0 errors; signed APK+AAB, signer == rc1/rc2, update-compatible;
  Room schema unchanged (no migration); pairing survives over-install; HTTPS-only; no secrets/token in artifacts.
- Telegram soak T0 2026-06-17T22:24:14Z UNCHANGED (no VPS touch). Tag v0.4.0-rc1 NOT moved; no remote; no push.
- ANDROID_PHYSICAL_SMOKE=NOT_RUN_FOR_RC3 (owner installs rc3 + runs checklist). See ANDROID_OWNER_UX_RC3.md.

---
## UPDATE 2026-06-18 (3) — Android RC4 (offline cache recovery + version/device metadata)
- rc3 physical testing found: offline relaunch showed raw `connection closed`; Settings showed
  hardcoded 1.0.0; Settings showed technical device id dev_…. rc4 fixes all three.
- Root cause (offline): Today/System/Replies/Automation used a no-fallback read helper that surfaced
  the raw network exception. rc4 adds a read-through cache (readCached → cache_kv write-through +
  read-back on transport failure) + renderNetworkErrorRu (raw java.net/okhttp/retrofit text never
  shown) + offline banners; with no cache → localized «Нет соединения и сохранённых данных».
- Mutation safety unchanged + explicit: no offline queue, no auto-replay, no false success (Confirmed
  only on backend ok=true). OFFLINE_MUTATION_REQUESTS=0, DEFERRED_MUTATIONS=0, AUTO_REPLAY=0.
- Version: buildConfig enabled; Settings uses BuildConfig.VERSION_NAME/CODE (rc4 / 7); 1.0.0 removed.
- Device: deviceName persisted locally (additive, Keystore store, no re-pair) → «Устройство: Samsung
  A56»; technical id only shortened secondary line; token never shown.
- v0.4.0-rc4 built (code 7): 78 unit tests / 0 failed; lint 0 errors; signed APK+AAB, signer == rc1-rc3,
  update-compatible; Room schema unchanged (no migration); pairing + cache survive over-install;
  HTTPS-only; no secrets/token in artifacts.
- Telegram soak T0 2026-06-17T22:24:14Z UNCHANGED (no VPS touch). Tag v0.4.0-rc1 NOT moved; no remote; no push.
- ANDROID_PHYSICAL_SMOKE=NOT_RUN_FOR_RC4 (owner installs rc4 + runs checklist). See ANDROID_OFFLINE_ACCEPTANCE_RC4.md.

---
## UPDATE 2026-06-18 (4) — Android RC5 (System cache consistency + terminology)
- rc4 physical smoke PARTIAL_PASS; one blocker: «Система» showed false zeros offline (Очередь 0 /
  Выполнено 0) instead of the last online 28.
- Root cause: split snapshot — automationStatus2 cached (revision 66 survived) but jobsCounts had no
  cache fallback, so offline it errored and the VM coerced it to emptyMap → false 0. rc5 read-through-
  caches jobsCounts (cache_kv rc:jobs_counts), tracks queueCountsKnown, renders «—» when truly unknown
  (never a false 0), and «Нет сохранённых данных о состоянии системы» on empty cache.
- Terminology: «Канонический writer» → «Каноническое хранилище»; owner-facing «follow-up» →
  «повторное обращение / повторный контакт» (internal enum/DTO/route unchanged).
- v0.4.0-rc5 built (code 8): 84 unit tests / 0 failed; lint 0 errors; signed APK+AAB, signer == rc1-rc4,
  update-compatible; Room schema unchanged (no migration); pairing + cache survive over-install.
- Telegram soak T0 2026-06-17T22:24:14Z UNCHANGED (no VPS touch). Tag v0.4.0-rc1 NOT moved; no remote; no push.
- ANDROID_PHYSICAL_SMOKE=NOT_RUN_FOR_RC5 (owner installs rc5 + runs checklist). See ANDROID_SYSTEM_CACHE_RC5.md.
