# Android RC2 Physical Acceptance

date: 2026-06-18 · ADB checked: no device attached → physical install OWNER-PENDING (not blocking).

## Artifact (RC2, prior session)
```
versionName=0.5.0-rc2  versionCode=10  applicationId=ru.dmitry.matercontroller
signer 11038fca…1023f7 == RC1 == RC5  → in-place upgrade preserves pairing
APK_SHA256=569306f8cf0e21773d02d9f9642594755713fd0e812c58caf5587226cbdcfc6d
AAB_SHA256=83d34c85f791a0da627e98a18c8dc1f00f651f44f342bbeff6c4ee0feae0b8fc
```
APK: dist/integration_wave_1_gate_c1a_android/MasterController-release-v0.5.0-rc2.apk (prior worktree)

## ADB
`adb devices` → empty list (no trusted device in this environment). Per spec, physical acceptance is
left owner-pending and does NOT block the backend/readiness work. Note: RC3 (this pass) supersedes RC2
for the owner; the owner should install RC3 directly (RC3 acceptance report has the checklist).

## Owner UI checklist (to run on device, RC2 or RC3)
Version/pairing, catalog 18 (2/7/9), Mini Audit 10 000 ₽, canonical 62 / operational 52 / excluded 10
explained, no "Неопределённые отправки" label, 7 confirmed sends shown, delivery-unconfirmed category
separate, offline read works, offline mutation blocked, reconnect refresh, C1-A preview no-send badge,
no payment/send, TEST_ONLY not shown as real business, no crash/re-pair.

```
ANDROID_RC2_PHYSICAL_ACCEPTANCE=OWNER_PENDING (no ADB device)
```
