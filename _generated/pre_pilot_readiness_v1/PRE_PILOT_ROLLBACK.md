# Pre-Pilot Rollback

Rollback scope:
- Android UI source copy changes.
- Focused unit test changes.
- Pre-pilot generated evidence documents and screenshots/XML.
- CURRENT_TASK_CHECKPOINT.md section for this stage.

Rollback method:
1. Revert the pre-pilot commit once created.
2. Reinstall the prior debug APK only if owner needs device rollback.
3. Do not delete or change secrets, quarantine, backups, file vault, VPS, DNS, HAPP, proxy, or production data.

No external-state rollback is required because:
- No send occurred.
- No payment occurred.
- No production DB write occurred.
- No deploy/merge/tag/push occurred.
- No runtime agent or skill was enabled.
