# Android Owner Acceptance Plan — Integration Wave 1 (0.5.0-rc1)

date: 2026-06-18 · NOT installed automatically · runs ONLY after backend read-only Gate B PASS.
Backend read API is now LIVE (Gate B PASS) so the candidate has real data to render.

## Artifact validation (local — EXECUTED with Android SDK build-tools 34.0.0 + JDK 17)
```
VERSION=0.5.0-rc1                         (aapt dump badging: versionName='0.5.0-rc1')
VERSION_CODE=9                            (aapt dump badging: versionCode='9')
APPLICATION_ID=ru.dmitry.matercontroller (aapt: package name)
targetSdk=34  minSdk=26
APK_SIGNATURE=PASS                        (apksigner verify: v2 scheme verified=true)
AAB_SIGNATURE=PASS                        (jarsigner -verify: "jar verified"; self-signed chain warning expected)
SIGNER_MATCHES_RC5=YES                    cert SHA-256 11038fca7db3fab1b0206971a93678b9dd28363ddf61241e162568019a1023f7
                                          identical across rc1 APK, rc1 AAB, and rc5 APK
APK_SHA256=53f7b609008ea23bb3df243e1392e2e5677404ca59274a4801e0eb0d0ff55c4b  (== manifest, == SHA256SUMS file)
AAB_SHA256=150e44d0eb028802997f813e07ab3d37f61f18719f77ccd86d8621e97a922352  (== manifest, == SHA256SUMS file)
PAIRING_UPGRADE_COMPATIBLE=YES            (same signing cert ⇒ in-place upgrade over rc5 keeps app data/pairing)
HARDCODED_OLD_BASELINE_COUNTS=0           (aapt: 1058 resource strings; no 50/66/leads/price literals — values come from live API)
SEND/MUTATION UI: autosend fields are display-only "BLOCKED" renders; no send button; commercial
   command controls OFF (server-gated by COMMERCIAL_COMMAND_API=OFF; endpoints return FEATURE_DISABLED).
```
APK path: D:\AI_WORKSPACE_WORKTREES\integration-wave-1-commercial-core-v1\dist\integration_wave_1_android\MasterController-release-v0.5.0-rc1.apk

## Owner smoke checklist (after backend PASS)
1. Install 0.5.0-rc1 over RC5 — do NOT uninstall first.
2. Pairing preserved (no re-pair needed).
3. App shows version 0.5.0-rc1 (code 9).
4. Open «Коммерческая сводка».
5. Read API reachable (live data loads).
6. Commercial collections empty (opportunities/offers/deals/handoffs/projects/invoices = 0).
7. Product catalog = 18 products.
8. Mini Audit = 10 000 ₽.
9. Unknown values render as «—»/UNKNOWN, NOT as 0.
10. No mutation buttons (or disabled); no send controls.
11. Offline cache works (data persists without network).
12. After reconnect, live counts refresh from API (NOT hardcoded; will reflect live baseline e.g. 62 leads).
13. No messages sent anywhere during the check.

No pairing code is created by this process.
