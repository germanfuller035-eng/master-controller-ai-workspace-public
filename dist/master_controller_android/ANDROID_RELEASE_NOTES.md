# Master Controller Android — Release Notes v0.4.0-rc5

date: 2026-06-18 · versionCode 8 (was 7) · versionName 0.4.0-rc5 (was 0.4.0-rc4)
applicationId ru.dmitry.matercontroller (unchanged) · signer unchanged · update-compatible over rc4.

## Focus: System offline cache consistency + final owner terminology (presentation/repository only)
No backend / API / canonical / worker / scheduler / Telegram / IMAP change. No new mutations. No
offline mutation queue. Autosend BLOCKED, live send OFF.

### Defect — «Система» showed false zeros offline (FIXED)
In airplane mode the System screen showed «Очередь задач: 0 / Выполнено: 0» even though the last
online state had 28 completed. Root cause: `automationStatus2()` was cached (rc4) so revision survived,
but `jobsCounts()` had NO cache fallback — offline it errored and the ViewModel coerced it to an empty
map, rendering a false `0`. A split-completeness snapshot.

Fix:
- `jobsCounts()` is now read-through cached (cache_kv, key `rc:jobs_counts`): success writes through;
  a transport/retriable failure (never 401/403) returns the last cached counts flagged `fromCache`.
- The System ViewModel tracks `queueCountsKnown`. When counts are genuinely unavailable (no cache),
  the UI renders «—», never a false `0`. A real backend `0` still renders `0`.
- Empty system snapshot (no cache at all) shows «Нет сохранённых данных о состоянии системы».
- Offline is now flagged if automation OR jobs OR counts came from cache; the cached-at timestamp is
  the max across all three, so the offline banner reflects the freshest cached part.

Result: after going offline + force-stop, «Система» shows the saved revision 66 / completed 28 /
dead letters 0 behind the offline banner — the same values as the last online state.

### Owner terminology (FIXED)
- «Канонический writer: работает» → «Каноническое хранилище: работает» (hub card + detail).
- Remaining owner-facing «follow-up» → «повторное обращение» / «повторный контакт»: the next-action
  reason sentence, status labels, the Decisions send-disabled warning, and the Mini Audit hub subtitle.
  Internal enum values, API routes and DTO fields keep `followup` unchanged.

### Build / quality
- Unit tests: 84 passed / 0 failed (added CountsData/AutomationStatusDto round-trip, unknown≠0,
  terminology cases). Lint 0 errors. Signed release APK + AAB; signer SHA-256 `11038fca…` == rc1–rc4.
- Room schema unchanged (v2, no migration); pairing + cache survive the over-install.
