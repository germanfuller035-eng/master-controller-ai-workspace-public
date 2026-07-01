# Integration Wave 1 — Gate B Rollback Runbook (PREPARED — NOT EXECUTED)

date: 2026-06-18 · four independent layers; each preserves existing data.

## BACKEND_RUNTIME_ROLLBACK
- The 4 commercial_core files + commercial/service.mjs + commercial/routes.mjs were ABSENT before Gate
  B → rollback = remove those files, restore the backed-up `src/server/index.mjs` (5853f84f), and
  `sudo systemctl restart master-controller-api`.
- Restores only changed runtime files; touches no canonical data.

## CONFIG_ROLLBACK
- Set COMMERCIAL_READ_API=OFF (commands + send were already OFF and stay OFF). Reload API.
- Read API disabled → commercial endpoints return FEATURE_DISABLED; nothing else affected.

## MIGRATION_ROLLBACK
- The 8 commercial sections are empty at initial Gate B → reverse migration removes ONLY those empty
  namespaces and decrements revision by the single forward bump.
- If ANY commercial entity exists, destructive reverse is FORBIDDEN → forward recovery / manual review.
- Never a blind full-store restore unless canonical corruption is independently proven.

## ANDROID_ROLLBACK
- Reinstall the rc5-compatible APK over 0.5.0-rc1 WITHOUT clearing app data. Pairing survives
  (Keystore EncryptedSharedPreferences, separate from Room; Room schema unchanged). versionCode 9 → 8
  is a downgrade-by-reinstall (owner action), data preserved.

```
ROLLBACK_PRESERVES_EXISTING_DATA=YES
ROLLBACK_PRESERVES_LEADS=YES
ROLLBACK_PRESERVES_SEND_LEDGER=YES
ROLLBACK_PRESERVES_PAIRING=YES
BLIND_CANONICAL_RESTORE=NO
ROLLBACK_REHEARSAL=PASS (migration reverse proven in MIGRATION_DRY_RUN DR14–DR20 + rehearsal R8–R10)
```
