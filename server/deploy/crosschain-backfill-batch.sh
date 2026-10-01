#!/bin/bash
set -euo pipefail
# Installed release is immutable; the current symlink is switched only explicitly.
release=/opt/cipherscan-crosschain/current
exec 9>/run/cipherscan-sync-swaps.lock
if ! flock -n 9; then
  echo 'Live swap sync busy; skipping backfill batch'
  exit 0
fi
export NODE_PATH=/root/cipherscan/server/api/node_modules
export NETWORK=mainnet CROSSCHAIN_V2_WRITER_ENABLED=1 NEAR_EXPLORER_SHARED_LIMIT=1
export NODE_OPTIONS="--require=$release/server/lib/crosschain/provider-preload.js"
exec /usr/bin/node "$release/server/jobs/sync-crosschain-v2.js" --apply --backfill --max-pages=3
