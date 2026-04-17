#!/usr/bin/env bash
# ------------------------------------------------------------------------
# Zebra Crosslink cache restorer.
#
# Restores the most recent healthy snapshot taken by zebra-snapshot.sh.
# Much faster than syncing from genesis when we hit the ~1120-block
# finalizer-roster-corruption bug or any other cache corruption.
#
# Usage:
#   ./zebra-restore.sh              # restore latest snapshot
#   ./zebra-restore.sh 2             # restore the 2nd most recent (in case
#                                      the latest was also taken on a fork)
#
# This script STOPS zebrad + indexer, wipes the corrupt cache, extracts
# the snapshot, and starts everything again.
# ------------------------------------------------------------------------
set -euo pipefail

CACHE_DIR="/root/.cache/zebra"
SNAPSHOT_DIR="/root/zebra-snapshots"
SECONDARY_DIR="/tmp/cipherscan-rocks-secondary"
SERVICES=(zebrad-crosslink cipherscan-indexer-crosslink)

# N-th most recent snapshot (default: 1 = latest)
idx="${1:-1}"
if ! [[ "${idx}" =~ ^[0-9]+$ ]] || (( idx < 1 )); then
    echo "Usage: $0 [snapshot_index>=1]" >&2
    exit 2
fi

mapfile -t snapshots < <(ls -1t "${SNAPSHOT_DIR}"/zebra-*.tar.gz 2>/dev/null || true)
if (( idx > ${#snapshots[@]} )); then
    echo "Only ${#snapshots[@]} snapshot(s) available; cannot restore #${idx}" >&2
    exit 1
fi

snapshot="${snapshots[idx-1]}"
echo "[restore] Using snapshot: ${snapshot}"
echo "[restore] This will stop zebrad and the indexer, wipe ${CACHE_DIR}, and restore."
echo "[restore] Press Enter to continue or Ctrl-C to abort."
read -r

echo "[restore] Stopping services..."
for svc in "${SERVICES[@]}"; do
    systemctl stop "${svc}" || true
done
sleep 2

echo "[restore] Wiping Zebra cache + RocksDB secondary..."
rm -rf "${CACHE_DIR:?}"/* "${SECONDARY_DIR:?}" || true

echo "[restore] Extracting snapshot (~30-60s)..."
tar -C "${CACHE_DIR}" -xzf "${snapshot}"

echo "[restore] Starting services..."
systemctl start zebrad-crosslink
sleep 5
systemctl start cipherscan-indexer-crosslink

echo "[restore] Done. Check logs:"
echo "  journalctl -u zebrad-crosslink -f"
echo "  journalctl -u cipherscan-indexer-crosslink -f"
