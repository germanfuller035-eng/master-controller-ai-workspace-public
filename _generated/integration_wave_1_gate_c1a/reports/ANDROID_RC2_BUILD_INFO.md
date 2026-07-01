# Android RC2 Build Info — Gate C1-A

date: 2026-06-18 · build: local (Gradle 8.7, JDK 17, AGP 8.5.2, build-tools 34.0.0)

```
VERSION_NAME=0.5.0-rc2
VERSION_CODE=10
APPLICATION_ID=ru.dmitry.matercontroller
minSdk=26  targetSdk=34  compileSdk=34
APK_SIGNATURE=PASS (v2 scheme verified)
AAB_SIGNATURE=PASS (jar verified)
SIGNER_MATCH=YES  cert SHA-256 11038fca7db3fab1b0206971a93678b9dd28363ddf61241e162568019a1023f7
                  (identical to RC1 and RC5 → in-place upgrade preserves pairing)
APK_SHA256=569306f8cf0e21773d02d9f9642594755713fd0e812c58caf5587226cbdcfc6d
AAB_SHA256=83d34c85f791a0da627e98a18c8dc1f00f651f44f342bbeff6c4ee0feae0b8fc
hardcoded_product_catalog=0  (products come from API/cache)
hardcoded_lead_totals=0      (counts come from API reconciliation read models)
tracked_secrets=0            (signing props read from D:\AI_SECRETS, not in repo)
```

Artifacts:
- dist/integration_wave_1_gate_c1a_android/MasterController-release-v0.5.0-rc2.apk
- dist/integration_wave_1_gate_c1a_android/MasterController-release-v0.5.0-rc2.aab
- dist/integration_wave_1_gate_c1a_android/SHA256SUMS-v0.5.0-rc2.txt

Tests: app:testDebugUnitTest = 100 passed (incl. 9 new GateC1aMappingTest). Owner-UI raw-code
safety scan passes. Build = assembleRelease + bundleRelease SUCCESSFUL.
