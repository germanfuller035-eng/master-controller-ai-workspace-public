#!/usr/bin/env bash
# master-controller-imap-sync.sh — one read-only IMAP sync cycle, then ingest replies.
# Credentials come from the root-owned EnvironmentFile via systemd (not in this script,
# not in argv, not logged). Read-only: no flag change, no delete, no move, no send.
set -euo pipefail
cd /opt/master-controller

# The connector reads YANDEX_MAIL_* from process env (provided by systemd EnvironmentFile).
# STAGE1_LIVE_READ=true enables the live read-only fetch; it writes a headers snapshot to
# data/yandex_mail_stage1_headers.json. Never prints credentials (only PRESENT/MISSING).
node tools/communication_monitor/yandex_mail_imap_read.mjs

# Correlate + ingest the snapshot into the canonical reply state (append-only, idempotent).
node tools/telegram_gateway/reply_inbox_sync_cli.mjs

echo "IMAP_SYNC_CYCLE_DONE $(date -u +%Y-%m-%dT%H:%M:%SZ)"
