#!/usr/bin/env bash
# ------------------------------------------------------------------------
# Zebra Crosslink cache snapshotter.
#
# Creates a timestamped tar.gz of the Zebra state cache ONLY when the node
# is healthy (finality gap <= HEALTHY_GAP). Keeps the most recent N
# snapshots. Designed to run via a systemd timer every hour.
#
# Rationale (per Sam Smith in the SL Signal group): the ~1120-block
# finalizer-roster-corruption bug forces a full resync when the node drifts
# onto a minority chain. Keeping a recent healthy snapshot turns a
# multi-hour resync into a 30-second tar extract.
# ------------------------------------------------------------------------
set -euo pipefail

CACHE_DIR="/root/.cache/zebra"
SNAPSHOT_DIR="/root/zebra-snapshots"
LOG_TAG="zebra-snapshot"
KEEP=3
HEALTHY_GAP=10
RPC_URL="${ZEBRA_RPC_URL:-http://127.0.0.1:8232}"
RPC_COOKIE_FILE="${ZEBRA_RPC_COOKIE_FILE:-/root/.cache/zebra/.cookie}"

log() {
    logger -t "${LOG_TAG}" -- "$*"
    printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*"
}

rpc() {
    local method="$1"
    local auth=""
    if [[ -f "${RPC_COOKIE_FILE}" ]]; then
        auth="-u $(cat "${RPC_COOKIE_FILE}")"
    fi
    # shellcheck disable=SC2086
    curl -fsS ${auth} -H 'Content-Type: application/json' \
        -d "{\"jsonrpc\":\"1.0\",\"id\":\"snap\",\"method\":\"${method}\",\"params\":[]}" \
        "${RPC_URL}"
}

require_json_field() {
    # $1 = json blob, $2 = jq path
    python3 -c "import sys,json; print(json.loads(sys.argv[1])[sys.argv[2]])" "$1" "$2"
}

# 1) Verify node is healthy before taking a snapshot
if ! blocks_json="$(rpc getblockcount)"; then
    log "RPC getblockcount failed; skipping snapshot"
    exit 0
fi
tip_height="$(python3 -c "import sys,json; print(json.loads(sys.argv[1])['result'])" "${blocks_json}")"

if ! fin_json="$(rpc get_tfl_final_block_height_and_hash)"; then
    log "RPC get_tfl_final_block_height_and_hash failed; skipping snapshot"
    exit 0
fi

# get_tfl_final_block_height_and_hash may return {"height":..., "hash":...} or null
finalized_height="$(python3 -c "
import sys, json
r = json.loads(sys.argv[1]).get('result')
if r is None:
    print(0); exit()
if isinstance(r, dict):
    print(r.get('height', 0))
elif isinstance(r, list) and r:
    print(r[0])
else:
    print(0)
" "${fin_json}")"

gap=$(( tip_height - finalized_height ))
if (( gap > HEALTHY_GAP )); then
    log "finality gap ${gap} > ${HEALTHY_GAP}, node not healthy; skipping snapshot (tip=${tip_height} final=${finalized_height})"
    exit 0
fi

# 2) Find the active cache directory (there's only ever one but the suffix
#    changes per workshop release)
cache_subdir="$(find "${CACHE_DIR}" -maxdepth 1 -mindepth 1 -type d -name 'zebra_crosslink_workshop*' | head -n1)"
if [[ -z "${cache_subdir}" ]]; then
    log "No zebra_crosslink_workshop* cache directory found under ${CACHE_DIR}; skipping"
    exit 0
fi

mkdir -p "${SNAPSHOT_DIR}"
ts="$(date -u +%Y%m%dT%H%M%SZ)"
snapshot_file="${SNAPSHOT_DIR}/zebra-${ts}-tip${tip_height}.tar.gz"

log "Taking snapshot: tip=${tip_height} finalized=${finalized_height} gap=${gap} → ${snapshot_file}"

# 3) tar.gz the cache. We don't stop zebrad — tar will happily read files
#    while they're being written to; RocksDB can tolerate this for a
#    snapshot used as a recovery baseline (we'd do a proper
#    flush+copy-checkpoint if we were more sophisticated).
tar --warning=no-file-changed \
    -C "${CACHE_DIR}" \
    -czf "${snapshot_file}.tmp" \
    "$(basename "${cache_subdir}")"
mv "${snapshot_file}.tmp" "${snapshot_file}"

size="$(du -sh "${snapshot_file}" | awk '{print $1}')"
log "Snapshot complete: ${snapshot_file} (${size})"

# 4) Rotate: keep the ${KEEP} most recent
mapfile -t snapshots < <(ls -1t "${SNAPSHOT_DIR}"/zebra-*.tar.gz 2>/dev/null || true)
if (( ${#snapshots[@]} > KEEP )); then
    for old in "${snapshots[@]:KEEP}"; do
        log "Pruning old snapshot ${old}"
        rm -f "${old}"
    done
fi
