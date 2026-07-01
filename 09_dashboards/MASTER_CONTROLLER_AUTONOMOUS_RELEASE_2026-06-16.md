# Master Controller — Android Release v0.2.0-rc2 (2026-06-16)

## What changed vs v0.2.0-rc1
Single focused fix: **Android cold-start no longer falls back to http://127.0.0.1:8787**
after a Remote pairing + full app close (P0-1 in the full audit).

### Root cause
`core/network/Network.kt` `BaseUrlHolder` was an in-memory `AtomicReference` defaulting to
`http://127.0.0.1:8787/`. Device tokens persist (EncryptedSharedPreferences), so `isPaired`
returned true after relaunch, but the persisted base URL (DataStore key `base_url`) was never
restored into the holder. The app rendered the main UI immediately and fired API calls at
localhost.

### Fix (code + verified)
- `BaseUrlHolder`: removed localhost default (now empty), added `isConfigured`, and a shared
  `normalizeOrigin()` that strips a pasted `/api/v1` suffix so `https://host` and
  `https://host/api/v1` behave identically.
- `MaterRepository.restoreProfile()`: loads persisted base URL into the holder before any
  API client is built; true only if paired AND base URL configured.
- `AuthViewModel`: `StartupPhase.RESTORING → READY`; profile restored in `init` before UI.
- `MaterControllerRoot`: shows `RestoringProfileScreen` (testTag `restoring_profile`) until
  restore completes — no API call before restore; corrupt/missing profile → ConnectionScreen,
  never localhost.
- `ConnectState` default base URL now the remote sslip.io URL (was a LAN IP).
- `pair()` persists origin + token, then flips the holder (shared normalizer).

## Verification
- `:app:compileDebugKotlin` — BUILD SUCCESSFUL.
- `:app:testDebugUnitTest` — BUILD SUCCESSFUL (existing DtoMappingTest + new
  BaseUrlNormalizationTest: 7 cases — host-only, /api/v1 suffix, /api/v1/ suffix, whitespace,
  empty→no-localhost, unconfigured apiBase empty, apiBase version appended once).
- `:app:assembleDebug :app:assembleRelease :app:bundleRelease` — BUILD SUCCESSFUL.
- Release APK signature verified (apksigner): Signer #1 CN=Mater Controller — **same signing
  key as rc1**, so this installs as an in-place upgrade.
- ON-DEVICE: NOT verified — no physical device/emulator attached (`adb devices` empty).
  The fix is logic-correct + unit-covered but not yet device-proven.

## Artifacts (dist/master_controller_android/)
- MasterController-debug-v0.2.0-rc2.apk
  SHA256 c4be3476337033dd5f2c7e1268bfd2d7254e6df1e4ec2a35b3511e69ef171e48
- MasterController-release-v0.2.0-rc2.apk
  SHA256 e8b876dc18f75bab18b05ebe81e34cd6902070caa8d658b03e54fb7e5704f3c5
- MasterController-release-v0.2.0-rc2.aab
  SHA256 d771a8081911b3d49984f81cb3bffe3a46fc4166643dd07ddcff27c88cd856a2
- Signing cert SHA-256: 11038fca7db3fab1b0206971a93678b9dd28363ddf61241e162568019a1023f7

## versionCode/Name
versionCode 1→2, versionName "1.0.0"→"0.2.0-rc2". rc1 artifacts retained under
dist/ (not overwritten).

## How to verify on your phone
1. Install MasterController-release-v0.2.0-rc2.apk (upgrade over the existing build — same key).
2. If not already paired: Remote profile, base URL `https://195-96-132-82.sslip.io` (or
   `.../api/v1` — both work now), enter a fresh pairing code.
3. Confirm data loads (leads, status) — that proves the remote profile is active.
4. Force-stop the app, reopen. It must briefly show a spinner then reconnect to the remote
   API — NOT show the connection screen and NOT call 127.0.0.1.

## Remaining program (not in this release)
Phases 2–11 (single-writer SQLite migration, 24/7 leadgen/audit/draft workers, IMAP inbound +
replies screen, follow-up automation, UX overhaul, observability/backup, full E2E, v0.3.0-rc1)
remain. See MASTER_CONTROLLER_FULL_AUDIT_2026-06-16.md.
