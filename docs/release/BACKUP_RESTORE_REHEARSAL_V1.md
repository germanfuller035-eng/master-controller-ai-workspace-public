# Backup Restore Rehearsal V1

SESSION_NAME=AI_SYSTEM_HARDENING_DISASTER_RECOVERY_AND_RELEASE_V1
SCOPE=SYNTHETIC_ONLY
PRODUCTION_DATA_TOUCHED=NO

## Backup Manifest

The rehearsal uses `tests/fixtures/hardening/synthetic_backup_manifest.json` as the source list. The generated manifest records path, byte size, and SHA-256 for selected local evidence and config files.

Expected output:

```text
BACKUP_MANIFEST_RESULT=PASS
SYNTHETIC_ONLY=YES
PRODUCTION_DATA_TOUCHED=NO
```

## Restore Rehearsal

The restore rehearsal uses `tests/fixtures/hardening/synthetic_restore_source.json`. It writes only to `_generated/hardening_release_v1/synthetic_restore/` and verifies that the restored synthetic records match the source records.

Expected output:

```text
RESTORE_REHEARSAL_RESULT=PASS
SYNTHETIC_ONLY=YES
PRODUCTION_DATA_TOUCHED=NO
```

## Boundaries

- No production restore is performed.
- No production DB write is performed.
- No runtime data, local secrets, device pairing files, or APK/build outputs are included.
- Any real backup or restore requires a separate owner gate.
