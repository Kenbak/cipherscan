#!/usr/bin/env bash
# Debian/Ubuntu prerequisite: apt-get install python3-venv
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VENV="${PATTERN_SCANNER_VENV:-/opt/cipherscan-pattern-scanner/venv}"
python3 -m venv "$VENV"
"$VENV/bin/python" -m pip install -r "$ROOT/server/jobs/requirements.txt"
"$VENV/bin/python" -m pip check
"$VENV/bin/python" -c "import sklearn, psycopg2, numpy"
