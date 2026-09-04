#!/usr/bin/env bash
# Private operator report for normalized PostgreSQL workload costs.
# Deliberately excludes SQL text and bind values from output.

set -euo pipefail

LIMIT="${1:-25}"
if ! [[ "$LIMIT" =~ ^[1-9][0-9]*$ ]] || (( LIMIT > 100 )); then
  echo "Usage: $0 [limit: 1-100]" >&2
  exit 2
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 2
fi

psql "$DATABASE_URL" -X --set=ON_ERROR_STOP=1 --set=limit="$LIMIT" <<'SQL'
SELECT
  queryid,
  calls,
  ROUND(total_exec_time::numeric, 1) AS total_exec_ms,
  ROUND(mean_exec_time::numeric, 2) AS mean_exec_ms,
  rows,
  shared_blks_hit,
  shared_blks_read,
  temp_blks_written,
  wal_bytes
FROM pg_stat_statements
WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
  AND calls > 0
ORDER BY total_exec_time DESC
LIMIT :'limit';
SQL

