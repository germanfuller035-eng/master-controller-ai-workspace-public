#!/usr/bin/env bash
# master-controller-backup.sh — daily canonical backup on the VPS.
# Snapshots the canonical store with sha256 + retention + disk guard. No secrets.
set -euo pipefail

CANON="/opt/master-controller/canonical/lead_pipeline_store.json"
BACKUP_DIR="/opt/master-controller/backups"
RETENTION=14            # keep last N daily backups
DISK_WARN=70
DISK_CRIT=80

mkdir -p "$BACKUP_DIR"
TS="$(date -u +%Y%m%d_%H%M%S)"

# disk guard BEFORE writing
USE="$(df --output=pcent / | tail -1 | tr -dc '0-9')"
if [ "$USE" -ge "$DISK_CRIT" ]; then
  echo "BACKUP_ABORT disk_critical=${USE}% (>=${DISK_CRIT})"; exit 3
fi

if [ ! -f "$CANON" ]; then
  echo "BACKUP_ABORT canonical_missing=$CANON"; exit 2
fi

OUT="$BACKUP_DIR/lead_pipeline_store.${TS}.json"
cp -p "$CANON" "$OUT"
SHA="$(sha256sum "$OUT" | cut -d' ' -f1)"
echo "$SHA  $(basename "$OUT")" >> "$BACKUP_DIR/CHECKSUMS.txt"

# integrity: backup must parse and match source hash
SRC_SHA="$(sha256sum "$CANON" | cut -d' ' -f1)"
if [ "$SHA" != "$SRC_SHA" ]; then echo "BACKUP_FAIL hash_mismatch"; rm -f "$OUT"; exit 4; fi
node -e "JSON.parse(require('fs').readFileSync('$OUT','utf8'))" || { echo "BACKUP_FAIL parse"; exit 5; }

# retention: keep newest $RETENTION
ls -1t "$BACKUP_DIR"/lead_pipeline_store.*.json 2>/dev/null | tail -n +$((RETENTION+1)) | xargs -r rm -f

COUNT="$(ls -1 "$BACKUP_DIR"/lead_pipeline_store.*.json 2>/dev/null | wc -l)"
WARN=""; [ "$USE" -ge "$DISK_WARN" ] && WARN=" disk_warn=${USE}%"
echo "BACKUP_OK file=$(basename "$OUT") sha=${SHA:0:12} kept=$COUNT disk=${USE}%$WARN"
