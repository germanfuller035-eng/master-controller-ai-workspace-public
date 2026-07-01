# Integration Wave 1 — Production Compatibility Preflight (read-only)

date: 2026-06-18T09:30Z · read-only SSH (masterctl@195.96.132.82) · soak UNTOUCHED · no file/timestamp change

## Runtime
- Node v20.20.2 (commercial_core uses only stdlib + the existing API's deps → COMPATIBLE).
- Debian 12 (bookworm), kernel 6.1.0-22-amd64, x86_64.

## Storage
- Canonical store /opt/master-controller/canonical/lead_pipeline_store.json, owner masterctl:masterctl,
  mode 644, 154337 bytes, store_revision=66.
- Top-level keys: version, updated_at, leads, store_revision, updated_by, last_operation_id,
  _operation_log. The 8 commercial sections are ABSENT → additive migration is a clean add (STORE_FORMAT_COMPATIBLE=YES).
- Disk: 5.7G avail (33% used); inodes 8% used → ample for backup + sections.

## API runtime (read-only hashes)
- server/index.mjs = 5853f84f…; shared/store_access.mjs = 49a18b4a…. The single-writer
  `updateStoreWithRevision` + auth/revision/idempotency middleware are present (AUTH/REVISION/
  IDEMPOTENCY_COMPATIBLE=YES); commercial routes will be added additively at Gate B.

## systemd
master-controller-api active/enabled · worker active/enabled · telegram active/enabled · caddy
active/enabled · imap.timer active · backup.timer active.

## Verdict
```
NODE_RUNTIME_COMPATIBLE=YES
STORE_FORMAT_COMPATIBLE=YES
AUTH_MIDDLEWARE_COMPATIBLE=YES
REVISION_MODEL_COMPATIBLE=YES
IDEMPOTENCY_MODEL_COMPATIBLE=YES
SYSTEMD_LAYOUT_COMPATIBLE=YES
DISK_FOR_BACKUP=PASS (5.7G free)
ROLLBACK_SPACE=PASS
REBOOT_REQUIRED=NO
EXPECTED_SERVICE_RESTARTS=1 (master-controller-api only)
EXPECTED_DOWNTIME=brief API reload (seconds)
```

```
VPS_CHANGES=0  SERVICES_RESTARTED=0  PRODUCTION_WRITES=0  SOAK_INVALIDATED=NO  SECRETS_PRINTED=0
```
