#!/usr/bin/env bash
#
# Unified Pattern Scanner Runner
# Runs the precomputed privacy linkage pipeline plus the ML explorer
#
# Cron example (every 10 minutes):
# */10 * * * * /path/to/server/jobs/run-pattern-scanners.sh >> /var/log/pattern-scanner.log 2>&1
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/../api" || exit 1

# Load environment variables from .env file.
# Source it (set -a exports every assignment) instead of `export $(... | xargs)`,
# which word-splits and glob-expands secret values.
if [ -f .env ]; then
    set -a
    # shellcheck disable=SC1091  # .env is deployment-local, not in the repo
    . ./.env
    set +a
fi

echo "════════════════════════════════════════════════════════════"
echo "🔍 PATTERN SCANNER - $(date '+%Y-%m-%d %H:%M:%S')"
echo "════════════════════════════════════════════════════════════"

# Check if dry-run mode
DRY_RUN_ARGS=()
if [[ "${1:-}" == "--dry-run" ]]; then
    DRY_RUN_ARGS=(--dry-run)
    echo "⚠️  DRY RUN MODE - not saving to database"
fi

echo ""
echo "📋 Step 1/3: Pair Linkage Edges"
echo "─────────────────────────────────────────"
node "$SCRIPT_DIR/build-privacy-linkage-edges.js" "${DRY_RUN_ARGS[@]}"

echo ""
echo "📦 Step 2/3: Batch Clusters"
echo "─────────────────────────────────────────"
node "$SCRIPT_DIR/build-privacy-batch-clusters.js" "${DRY_RUN_ARGS[@]}"

echo ""
echo "🤖 Step 3/3: ML Clustering Explorer (Python)"
echo "─────────────────────────────────────────"

# Check if Python dependencies are installed
if ! python3 -c "import sklearn, psycopg2, numpy" 2>/dev/null; then
    echo "⚠️  Python dependencies not installed. Installing..."
    pip3 install -r "$SCRIPT_DIR/requirements.txt" --quiet
fi

python3 "$SCRIPT_DIR/ml-pattern-detector.py" "${DRY_RUN_ARGS[@]}"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "✅ SCAN COMPLETE - $(date '+%Y-%m-%d %H:%M:%S')"
echo "════════════════════════════════════════════════════════════"
