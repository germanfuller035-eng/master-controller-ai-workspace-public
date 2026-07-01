# Live Health Report (Phase 14 — COMPLETE, evidence-based)

date: 2026-06-17T19:33Z · basis: authenticated read-only SSH + systemd + filesystem aggregates + API GET.

| Component | Status | Evidence |
|-----------|--------|----------|
| API | HEALTHY | service active/enabled PID 615; /health 200; localhost:8787 behind Caddy |
| Canonical writer | HEALTHY | single API writer, single store owner masterctl, no second writer service; worker is API-only (user mcworker, no canonical file access) |
| Canonical integrity | HEALTHY (PASS) | valid JSON, store_revision=66, 50 leads / 50 unique / 0 dup, size 154337, mode 644 |
| Queue | HEALTHY | 28 jobs all COMPLETED, 0 pending/running/failed |
| Worker | HEALTHY | active/enabled PID 620, 0 restarts |
| Scheduler | HEALTHY | discovery/imap/backup timers active, firing on schedule, last imap exit 0 |
| Dead letters | HEALTHY | 0 |
| Telegram | HEALTHY | 1 process / 1 poller, user mctelegram, 0 restarts, 0 getUpdates conflicts, isolated |
| IMAP | HEALTHY | stage1_readonly, last cycle exit 0, read-only ExecStart, no flag mutation/send |
| Backup freshness | HEALTHY | latest canonical backup present + CHECKSUMS.txt; backup timer active (next ~11h) |
| Caddy | HEALTHY | active+enabled, serving 443 |
| TLS | HEALTHY | LE cert valid → 2026-09-14 |
| UFW | HEALTHY | active |
| fail2ban | HEALTHY | active (sshd jail) |
| Disk | HEALTHY | 33% used, 5.7G free, inodes 8% |
| Memory | HEALTHY | 550Mi available of 960Mi |
| autosend gate | HEALTHY | autosend=false everywhere; API unit labeled "no-send" |
| live-send gate | HEALTHY | 0 Gate-A sends, ledger unchanged at 7 |
| Service isolation | HEALTHY | 3 separate low-priv users; api/worker/telegram segregated |

LIVE_HEALTH_STATUS=HEALTHY
HEALTHY_COMPONENTS=19 · DEGRADED=0 · UNHEALTHY=0 · UNKNOWN=0 · NOT_APPLICABLE=0 · CRITICAL_HEALTH_FAILURES=0

Hard gates: CANONICAL_WRITER_COUNT=1 ✓ · CANONICAL_INTEGRITY=PASS ✓ · AUTOSEND=BLOCKED ✓ ·
SEND_ALLOWED_LIVE=OFF ✓ · UNEXPECTED_SENDS=0 ✓ · TELEGRAM_POLLER_COUNT=1 ✓ · DUPLICATE_POLLER=NO ✓.

Note: restore-drill was NOT executed (backup file presence + checksum is evidence of backup, not of
restore — RESTORE_EVIDENCE_STATUS=NOT_RUN, owner-gated). Live evidence was not converted optimistically:
every HEALTHY above is backed by an actual read.
