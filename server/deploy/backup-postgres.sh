#!/usr/bin/env bash
set -Eeuo pipefail

readonly DATABASE="${DATABASE:-zcash_explorer_mainnet}"
readonly STORAGEBOX="${STORAGEBOX:-u630383@u630383.your-storagebox.de}"
readonly STORAGEBOX_PORT="${STORAGEBOX_PORT:-23}"
readonly STORAGEBOX_PATH="${STORAGEBOX_PATH:-/home/backups}"
readonly RETENTION_DAYS="${RETENTION_DAYS:-7}"
readonly STATE_DIR="${STATE_DIR:-/var/lib/cipherscan-backup}"
readonly MOUNT_DIR="${MOUNT_DIR:-/mnt/cipherscan-storagebox-backups}"
readonly DATE="$(date -u +%Y-%m-%d_%H%M%S)"
readonly NAME="${DATABASE}_${DATE}.dump"
readonly PARTIAL="${MOUNT_DIR}/.${NAME}.partial"
readonly FINAL="${MOUNT_DIR}/${NAME}"

mkdir -p "$STATE_DIR" "$MOUNT_DIR"
exec 9>"${STATE_DIR}/backup.lock"
flock -n 9 || {
  echo "A PostgreSQL backup is already running" >&2
  exit 1
}

command -v sshfs >/dev/null || {
  echo "sshfs is required for direct-to-Storage-Box backups" >&2
  exit 1
}

mounted_here=false
cleanup() {
  local rc=$?
  if (( rc != 0 )); then
    rm -f "$PARTIAL" >/dev/null 2>&1 || true
  fi
  if [[ "$mounted_here" == true ]]; then
    fusermount3 -u "$MOUNT_DIR" >/dev/null 2>&1 || true
  fi
  return "$rc"
}
trap cleanup EXIT

echo "[$(date -Is)] Streaming PostgreSQL backup to Storage Box"
if ! mountpoint -q "$MOUNT_DIR"; then
  sshfs -p "$STORAGEBOX_PORT" \
    -o IdentityFile=/root/.ssh/id_ed25519 \
    -o BatchMode=yes \
    -o ConnectTimeout=15 \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=3 \
    -o StrictHostKeyChecking=yes \
    -o reconnect \
    "${STORAGEBOX}:${STORAGEBOX_PATH}" "$MOUNT_DIR"
  mounted_here=true
fi

# The output path is an SSHFS mount, so the custom archive is written directly
# to the Storage Box and never occupies the server's root disk.
rm -f "$PARTIAL"
sudo -u postgres pg_dump --format=custom --compress=6 "$DATABASE" >"$PARTIAL"
sync -f "$PARTIAL"

remote_size="$(stat -c %s "$PARTIAL")"
if [[ ! "$remote_size" =~ ^[0-9]+$ ]] || (( remote_size < 1048576 )); then
  echo "Remote backup verification failed: invalid size '$remote_size'" >&2
  exit 1
fi

mv "$PARTIAL" "$FINAL"
sync -f "$FINAL"

# A pruning failure does not invalidate the newly verified archive.
if ! find "$MOUNT_DIR" -maxdepth 1 -type f \
  -name "${DATABASE}_*.dump" -mtime "+$RETENTION_DAYS" -delete; then
  echo "Warning: remote retention cleanup failed" >&2
fi

printf '%s %s %s\n' "$DATE" "backups/$NAME" "$remote_size" >"${STATE_DIR}/last-success"
echo "[$(date -Is)] Backup complete: backups/$NAME ($remote_size bytes)"
