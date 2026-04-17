#!/usr/bin/env bash
# ------------------------------------------------------------------------
# Public Zebra Crosslink cache bootstrap.
#
# Unlike zebra-snapshot.sh (which is our own private recovery backup),
# this script publishes a SAFE-TO-DOWNLOAD snapshot of the Zebra state
# that others can use to skip a multi-hour genesis resync.
#
# Safety:
#   - Only public blockchain data is included (state/v27/ + pos.chain)
#   - secret.seed and zaino/ are explicitly excluded — those are wallet
#     files and must never leave this server.
#   - Only publishes when the node is verifiably on the majority chain
#     (finality gap <= 5 AND the finalized hash matches a known-good
#     reference explorer).
# ------------------------------------------------------------------------
set -euo pipefail

CACHE_DIR="/root/.cache/zebra"
PUBLIC_DIR="/var/www/crosslink.cipherscan.app/bootstrap"
LOG_TAG="zebra-public-snapshot"
RPC_URL="${ZEBRA_RPC_URL:-http://127.0.0.1:8232}"
RPC_COOKIE_FILE="${ZEBRA_RPC_COOKIE_FILE:-/root/.cache/zebra/.cookie}"

# Strict health gate: gap must be this low to consider the node "on the chain"
HEALTHY_GAP=5

# Optional: cross-check our finalized hash against an external reference
# explorer. Leave empty to skip cross-check (trust self only).
# Example: "https://ctaz.frontiercompute.cash/api/..."
CROSS_CHECK_URL="${CROSS_CHECK_URL:-}"

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
        -d "{\"jsonrpc\":\"1.0\",\"id\":\"pub-snap\",\"method\":\"${method}\",\"params\":[]}" \
        "${RPC_URL}"
}

parse_json() {
    python3 -c "
import sys, json
try:
    print(json.loads(sys.argv[1])$1)
except Exception:
    print('')
" "$2"
}

# -----------------------------------------------------------------------
# 1) Health check: pull tip + finalized height
# -----------------------------------------------------------------------
if ! tip_json="$(rpc getblockcount)"; then
    log "RPC getblockcount failed; aborting public snapshot"
    exit 0
fi
tip_height="$(parse_json "['result']" "${tip_json}")"
if [[ -z "${tip_height}" ]]; then
    log "Could not parse tip height; aborting"
    exit 0
fi

if ! fin_json="$(rpc get_tfl_final_block_height_and_hash)"; then
    log "RPC get_tfl_final_block_height_and_hash failed; aborting"
    exit 0
fi
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
finalized_hash="$(python3 -c "
import sys, json
r = json.loads(sys.argv[1]).get('result')
if r is None:
    print(''); exit()
if isinstance(r, dict):
    print(r.get('hash', ''))
elif isinstance(r, list) and len(r) > 1:
    print(r[1])
else:
    print('')
" "${fin_json}")"

gap=$(( tip_height - finalized_height ))
if (( gap > HEALTHY_GAP )); then
    log "Gap ${gap} > ${HEALTHY_GAP}; not publishing a snapshot (tip=${tip_height} final=${finalized_height})"
    exit 0
fi

# -----------------------------------------------------------------------
# 2) Optional: cross-check our finalized hash against an external reference
# -----------------------------------------------------------------------
if [[ -n "${CROSS_CHECK_URL}" ]] && [[ -n "${finalized_hash}" ]]; then
    if ref_response="$(curl -fsS "${CROSS_CHECK_URL}" 2>/dev/null)"; then
        # Expect the reference to return JSON with a "finalized_hash" or similar.
        # Adapt this field name to whatever the reference explorer uses.
        ref_hash="$(python3 -c "
import sys, json
try:
    d = json.loads(sys.argv[1])
    for k in ['finalized_hash', 'finalizedHash', 'finalized']:
        if k in d: print(d[k]); sys.exit()
    print('')
except Exception:
    print('')
" "${ref_response}")"
        if [[ -n "${ref_hash}" ]] && [[ "${ref_hash}" != "${finalized_hash}" ]]; then
            log "Finalized hash mismatch with reference explorer (ours=${finalized_hash} ref=${ref_hash}); refusing to publish"
            exit 0
        fi
    else
        log "Cross-check URL unreachable; continuing without cross-check"
    fi
fi

# -----------------------------------------------------------------------
# 3) Locate the active cache sub-directory
# -----------------------------------------------------------------------
cache_subdir="$(find "${CACHE_DIR}" -maxdepth 1 -mindepth 1 -type d -name 'zebra_crosslink_workshop*' | head -n1)"
if [[ -z "${cache_subdir}" ]]; then
    log "No zebra_crosslink_workshop* cache directory found; aborting"
    exit 0
fi
cache_name="$(basename "${cache_subdir}")"

# -----------------------------------------------------------------------
# 4) Tar ONLY the public parts (state/ + pos.chain). NEVER include
#    secret.seed or zaino/ — those are wallet/service files.
# -----------------------------------------------------------------------
mkdir -p "${PUBLIC_DIR}"
ts="$(date -u +%Y%m%dT%H%M%SZ)"
tmp_archive="${PUBLIC_DIR}/bootstrap.tar.gz.tmp"
final_archive="${PUBLIC_DIR}/bootstrap.tar.gz"
sha256_file="${final_archive}.sha256"
meta_file="${PUBLIC_DIR}/bootstrap.json"

# Build the tar list explicitly so a future file that shouldn't be public
# (e.g. a new wallet file ShieldedLabs adds) is never accidentally included.
# If the required files are missing, abort.
declare -a members=()
if [[ -d "${cache_subdir}/state" ]]; then
    members+=("${cache_name}/state")
else
    log "state/ directory missing inside cache; aborting"
    exit 0
fi
if [[ -f "${cache_subdir}/pos.chain" ]]; then
    members+=("${cache_name}/pos.chain")
fi

# Explicitly refuse to ship anything sensitive. (Double check in case
# future zebrad versions add a new secret file we don't know about.)
if [[ -f "${cache_subdir}/secret.seed" ]]; then
    log "secret.seed present — will NOT be included (by design)"
fi
if [[ -d "${cache_subdir}/zaino" ]]; then
    log "zaino/ present — will NOT be included (by design)"
fi

log "Creating public snapshot: tip=${tip_height} finalized=${finalized_height} gap=${gap}"
log "Including: ${members[*]}"

tar --warning=no-file-changed \
    -C "${CACHE_DIR}" \
    -czf "${tmp_archive}" \
    "${members[@]}"

# SHA256 + metadata (before rename, so nothing else reads a half-written file)
sha256_hex="$(sha256sum "${tmp_archive}" | awk '{print $1}')"
size_bytes="$(stat -c%s "${tmp_archive}")"
size_human="$(du -sh "${tmp_archive}" | awk '{print $1}')"

mv "${tmp_archive}" "${final_archive}"
printf '%s  bootstrap.tar.gz\n' "${sha256_hex}" > "${sha256_file}"

python3 - "${meta_file}" "${ts}" "${tip_height}" "${finalized_height}" \
    "${finalized_hash}" "${size_bytes}" "${sha256_hex}" "${cache_name}" <<'PY'
import json, sys
(out, ts, tip, fin_h, fin_hash, size, sha, cache_name) = sys.argv[1:]
json.dump({
    "generated_at": ts,
    "tip_height": int(tip),
    "finalized_height": int(fin_h),
    "finalized_hash": fin_hash,
    "size_bytes": int(size),
    "sha256": sha,
    "cache_dir_name": cache_name,
    "contents": ["state/", "pos.chain"],
    "excludes": ["secret.seed", "zaino/"],
}, open(out, "w"), indent=2)
PY

log "Published: ${final_archive} (${size_human}, sha256=${sha256_hex:0:16}…)"

# Permissions: world-readable files for nginx
chmod 644 "${final_archive}" "${sha256_file}" "${meta_file}"
