#!/usr/bin/env bash
set -Eeuo pipefail

readonly DATABASE="${DATABASE:-zcash_explorer_mainnet}"
readonly STORAGEBOX="${STORAGEBOX:-u630383@u630383.your-storagebox.de}"
readonly STORAGEBOX_PORT="${STORAGEBOX_PORT:-23}"
readonly REMOTE_DIR="${REMOTE_DIR:-backups}"
readonly RETENTION_DAYS="${RETENTION_DAYS:-7}"
readonly STATE_DIR="${STATE_DIR:-/var/lib/cipherscan-backup}"
readonly DATE="$(date -u +%Y-%m-%d_%H%M%S)"
readonly NAME="${DATABASE}_${DATE}.dump"
readonly PARTIAL="${REMOTE_DIR}/.${NAME}.partial"
readonly FINAL="${REMOTE_DIR}/${NAME}"

mkdir -p "$STATE_DIR"
exec 9>"${STATE_DIR}/backup.lock"
flock -n 9 || {
  echo "A PostgreSQL backup is already running" >&2
  exit 1
}

ssh_options=(
  -p "$STORAGEBOX_PORT"
  -o BatchMode=yes
  -o ConnectTimeout=15
  -o ServerAliveInterval=30
  -o ServerAliveCountMax=3
  -o StrictHostKeyChecking=yes
)

cleanup_partial() {
  ssh "${ssh_options[@]}" "$STORAGEBOX" "rm -f '$PARTIAL'" >/dev/null 2>&1 || true
}
trap cleanup_partial ERR INT TERM

echo "[$(date -Is)] Streaming PostgreSQL backup to Storage Box"
ssh "${ssh_options[@]}" "$STORAGEBOX" "mkdir -p '$REMOTE_DIR' && rm -f '$PARTIAL'"

# Stream directly to remote storage. No dump is ever written to the server's
# root disk, and pipefail makes a broken SSH connection fail the whole backup.
sudo -u postgres pg_dump --format=custom --compress=6 "$DATABASE" |
  ssh "${ssh_options[@]}" "$STORAGEBOX" "cat > '$PARTIAL'"

remote_size="$(
  ssh "${ssh_options[@]}" "$STORAGEBOX" \
    "wc -c < '$PARTIAL' | tr -d '[:space:]'"
)"
if [[ ! "$remote_size" =~ ^[0-9]+$ ]] || (( remote_size < 1048576 )); then
  echo "Remote backup verification failed: invalid size '$remote_size'" >&2
  exit 1
fi

ssh "${ssh_options[@]}" "$STORAGEBOX" "mv '$PARTIAL' '$FINAL'"
trap - ERR INT TERM

# Storage Box provides a restricted shell; failure to prune must not invalidate
# a verified backup, but it is surfaced in the job log.
if ! ssh "${ssh_options[@]}" "$STORAGEBOX" \
  "find '$REMOTE_DIR' -type f -name '${DATABASE}_*.dump' -mtime +$RETENTION_DAYS -delete"; then
  echo "Warning: remote retention cleanup failed" >&2
fi

printf '%s %s %s\n' "$DATE" "$FINAL" "$remote_size" >"${STATE_DIR}/last-success"
echo "[$(date -Is)] Backup complete: $FINAL ($remote_size bytes)"
