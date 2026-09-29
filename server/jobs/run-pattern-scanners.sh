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
if [[ "${1:-}" == "--dry-run" ]]; then
    set -- --dry-run
    echo "⚠️  DRY RUN MODE - not saving to database"
else
    set --
fi

echo ""
echo "📋 Step 1/3: Pair Linkage Edges"
echo "─────────────────────────────────────────"
node "$SCRIPT_DIR/build-privacy-linkage-edges.js" "$@"

echo ""
echo "📦 Step 2/3: Batch Clusters"
echo "─────────────────────────────────────────"
node "$SCRIPT_DIR/build-privacy-batch-clusters.js" "$@"

echo ""
echo "🤖 Step 3/3: ML Clustering Explorer (Python)"
echo "─────────────────────────────────────────"

# Dependencies are provisioned once, outside cron, in an isolated environment.
PYTHON="${PATTERN_SCANNER_PYTHON:-/opt/cipherscan-pattern-scanner/venv/bin/python}"
if ! "$PYTHON" -c "import sklearn, psycopg2, numpy" 2>/dev/null; then
    echo "Pattern scanner runtime missing. Run server/deploy/install-pattern-scanner.sh" >&2
    exit 1
fi
export OMP_NUM_THREADS="${OMP_NUM_THREADS:-1}"
export OPENBLAS_NUM_THREADS="${OPENBLAS_NUM_THREADS:-1}"
"$PYTHON" "$SCRIPT_DIR/ml-pattern-detector.py" "$@"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "✅ SCAN COMPLETE - $(date '+%Y-%m-%d %H:%M:%S')"
echo "════════════════════════════════════════════════════════════"
