#!/bin/bash
#
# Unified Pattern Scanner Runner
# Runs both rule-based (Node.js) and ML-based (Python) pattern detectors
#
# Cron example (every 10 minutes):
# */10 * * * * /path/to/server/api/scripts/run-pattern-scanners.sh >> /var/log/pattern-scanner.log 2>&1
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "════════════════════════════════════════════════════════════"
echo "🔍 PATTERN SCANNER - $(date '+%Y-%m-%d %H:%M:%S')"
echo "════════════════════════════════════════════════════════════"

# Check if dry-run mode
DRY_RUN=""
if [[ "$1" == "--dry-run" ]]; then
    DRY_RUN="--dry-run"
    echo "⚠️  DRY RUN MODE - not saving to database"
fi

echo ""
echo "📋 Step 1/2: Rule-Based Scanner (Node.js)"
echo "─────────────────────────────────────────"
node scripts/scan-batch-patterns.js $DRY_RUN

echo ""
echo "🤖 Step 2/2: ML Clustering Scanner (Python)"
echo "─────────────────────────────────────────"

# Check if Python dependencies are installed
if ! python3 -c "import sklearn, psycopg2, numpy" 2>/dev/null; then
    echo "⚠️  Python dependencies not installed. Installing..."
    pip3 install -r scripts/requirements.txt --quiet
fi

python3 scripts/ml-pattern-detector.py $DRY_RUN

echo ""
echo "════════════════════════════════════════════════════════════"
echo "✅ SCAN COMPLETE - $(date '+%Y-%m-%d %H:%M:%S')"
echo "════════════════════════════════════════════════════════════"
