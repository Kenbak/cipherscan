#!/usr/bin/env bash
set -euo pipefail

# General ops health check: disk space, backup age, Redis, PostgreSQL
# connection-pool saturation, and indexer lag. Complements
# cipherscan-rust/deploy/check-indexer-health.sh, which focuses specifically
# on indexer process/heartbeat health — this script covers the rest of the
# box so a problem in Redis, disk space, or backups doesn't go unnoticed
# just because the indexer itself looks fine.
#
# Alert dedup/cooldown pattern matches check-indexer-health.sh: only re-alert
# on a NEW failure signature or after the cooldown elapses, and send a single
# "recovered" message when everything returns to healthy.

STATE_DIR="${OPS_HEALTH_STATE_DIR:-/var/lib/cipherscan-ops-health}"
STATE_FILE="${STATE_DIR}/health-alert-state.env"
ALERT_COOLDOWN_SECONDS="${OPS_HEALTH_ALERT_COOLDOWN_SECONDS:-1800}"

DISK_WARN_PCT="${OPS_HEALTH_DISK_WARN_PCT:-90}"
DISK_PATHS="${OPS_HEALTH_DISK_PATHS:-/ /mnt/data}"

BACKUP_STATE_FILE="${OPS_HEALTH_BACKUP_STATE_FILE:-/var/lib/cipherscan-backup/last-success}"
BACKUP_MAX_AGE_HOURS="${OPS_HEALTH_BACKUP_MAX_AGE_HOURS:-26}"

PGBACKREST_STANZA="${PGBACKREST_STANZA:-zcash_explorer_mainnet}"
PGBACKREST_MAX_BACKUP_AGE_HOURS="${OPS_HEALTH_PGBACKREST_MAX_BACKUP_AGE_HOURS:-30}"
PGBACKREST_MAX_WAL_AGE_MINUTES="${OPS_HEALTH_PGBACKREST_MAX_WAL_AGE_MINUTES:-30}"

REDIS_HOST="${REDIS_HOST:-127.0.0.1}"
REDIS_PORT="${REDIS_PORT:-6379}"

PG_DATABASE="${PG_DATABASE:-zcash_explorer_mainnet}"
PG_CONN_WARN_PCT="${OPS_HEALTH_PG_CONN_WARN_PCT:-80}"

INDEXER_MAX_LAG="${OPS_HEALTH_INDEXER_MAX_LAG:-3}"
INDEXER_MAX_HEARTBEAT_AGE_SECONDS="${OPS_HEALTH_INDEXER_MAX_HEARTBEAT_AGE_SECONDS:-600}"

TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"
TELEGRAM_API_BASE="${TELEGRAM_API_BASE:-https://api.telegram.org}"
HOST_LABEL="$(hostname -f 2>/dev/null || hostname)"

mkdir -p "${STATE_DIR}"

if [[ -z "${TELEGRAM_BOT_TOKEN}" || -z "${TELEGRAM_CHAT_ID}" ]]; then
  echo "TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set" >&2
  exit 2
fi

send_telegram() {
  local message="$1"
  curl -fsS -X POST \
    "${TELEGRAM_API_BASE}/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=${message}" \
    --data-urlencode "disable_web_page_preview=true" \
    >/dev/null
}

previous_status="unknown"
previous_fingerprint=""
previous_alert_at=0
# shellcheck disable=SC1090
[[ -f "${STATE_FILE}" ]] && source "${STATE_FILE}"

persist_state() {
  cat > "${STATE_FILE}" <<EOF
previous_status=$1
previous_fingerprint=$2
previous_alert_at=$3
EOF
}

failures=()

# --- Disk space ---
for path in ${DISK_PATHS}; do
  if [[ -d "${path}" ]]; then
    usage_pct="$(df -P "${path}" | awk 'NR==2 {gsub("%","",$5); print $5}')"
    if [[ "${usage_pct}" =~ ^[0-9]+$ ]] && (( usage_pct >= DISK_WARN_PCT )); then
      failures+=("Disk ${path} at ${usage_pct}% (threshold ${DISK_WARN_PCT}%)")
    fi
  fi
done

# --- Backup age ---
if [[ -f "${BACKUP_STATE_FILE}" ]]; then
  backup_date_field="$(awk '{print $1}' "${BACKUP_STATE_FILE}")"
  # backup-postgres.sh writes DATE as `date -u +%Y-%m-%d_%H%M%S` (e.g.
  # 2026-08-15_000001), which `date -d` cannot parse directly (verified
  # against the real state file on production — it errors with "invalid
  # date"). Reformat to `YYYY-MM-DD HH:MM:SS` first.
  backup_date_part="${backup_date_field%_*}"
  backup_time_part="${backup_date_field#*_}"
  backup_epoch=0
  if [[ "${backup_time_part}" =~ ^[0-9]{6}$ ]]; then
    backup_formatted="${backup_date_part} ${backup_time_part:0:2}:${backup_time_part:2:2}:${backup_time_part:4:2}"
    backup_epoch="$(date -u -d "${backup_formatted}" +%s 2>/dev/null || echo 0)"
  fi
  now_epoch="$(date -u +%s)"
  age_hours=$(( (now_epoch - backup_epoch) / 3600 ))
  if (( backup_epoch == 0 )); then
    failures+=("Backup state file unparseable: ${BACKUP_STATE_FILE}")
  elif (( age_hours >= BACKUP_MAX_AGE_HOURS )); then
    failures+=("Last successful backup is ${age_hours}h old (threshold ${BACKUP_MAX_AGE_HOURS}h)")
  fi
else
  failures+=("No backup state file found at ${BACKUP_STATE_FILE} — has a backup ever succeeded?")
fi

# --- pgBackRest backup age + WAL archiving freshness (added 2026-08-15) ---
if command -v pgbackrest >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
  pgbackrest_json="$(sudo -u postgres pgbackrest --stanza="${PGBACKREST_STANZA}" info --output=json 2>&1 || true)"
  stanza_status_code="$(echo "${pgbackrest_json}" | jq -r '.[0].status.code' 2>/dev/null || echo "")"
  if [[ "${stanza_status_code}" != "0" ]]; then
    failures+=("pgBackRest stanza ${PGBACKREST_STANZA} status not ok (code=${stanza_status_code:-unknown})")
  else
    latest_backup_stop="$(echo "${pgbackrest_json}" | jq -r '.[0].backup[-1].timestamp.stop' 2>/dev/null || echo "")"
    if [[ "${latest_backup_stop}" =~ ^[0-9]+$ ]]; then
      now_epoch="$(date -u +%s)"
      pgbackrest_age_hours=$(( (now_epoch - latest_backup_stop) / 3600 ))
      if (( pgbackrest_age_hours >= PGBACKREST_MAX_BACKUP_AGE_HOURS )); then
        failures+=("Last pgBackRest backup is ${pgbackrest_age_hours}h old (threshold ${PGBACKREST_MAX_BACKUP_AGE_HOURS}h)")
      fi
    else
      failures+=("Could not read latest pgBackRest backup timestamp")
    fi
  fi
else
  failures+=("pgbackrest or jq not found — cannot check PITR backup status")
fi

# --- Redis ---
if command -v redis-cli >/dev/null 2>&1; then
  redis_reply="$(redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" ping 2>&1 || true)"
  if [[ "${redis_reply}" != "PONG" ]]; then
    failures+=("Redis ping failed: ${redis_reply}")
  fi
else
  failures+=("redis-cli not found — cannot check Redis")
fi

# --- PostgreSQL connections ---
if command -v psql >/dev/null 2>&1; then
  pg_stats="$(sudo -u postgres psql -d "${PG_DATABASE}" -Atc \
    "SELECT (SELECT count(*) FROM pg_stat_activity), (SELECT setting FROM pg_settings WHERE name = 'max_connections')" \
    2>&1 || true)"
  if [[ "${pg_stats}" =~ ^([0-9]+)\|([0-9]+)$ ]]; then
    active="${BASH_REMATCH[1]}"
    max_conn="${BASH_REMATCH[2]}"
    conn_pct=$(( active * 100 / max_conn ))
    if (( conn_pct >= PG_CONN_WARN_PCT )); then
      failures+=("PostgreSQL connections at ${active}/${max_conn} (${conn_pct}%, threshold ${PG_CONN_WARN_PCT}%)")
    fi
  else
    failures+=("Could not read PostgreSQL connection stats: ${pg_stats}")
  fi

  # --- WAL archiving freshness (added 2026-08-15) ---
  archiver_stats="$(sudo -u postgres psql -d "${PG_DATABASE}" -Atc \
    "SELECT archive_mode, failed_count, COALESCE(EXTRACT(EPOCH FROM (now() - last_archived_time))::bigint, -1) FROM pg_settings, pg_stat_archiver WHERE name = 'archive_mode'" \
    2>&1 || true)"
  if [[ "${archiver_stats}" =~ ^([a-z]+)\|([0-9]+)\|(-?[0-9]+)$ ]]; then
    archive_mode="${BASH_REMATCH[1]}"
    archive_failed_count="${BASH_REMATCH[2]}"
    archive_age_seconds="${BASH_REMATCH[3]}"
    if [[ "${archive_mode}" != "on" && "${archive_mode}" != "always" ]]; then
      failures+=("PostgreSQL archive_mode is '${archive_mode}', not on/always — WAL archiving (PITR) is not active")
    elif (( archive_age_seconds >= 0 )) && (( archive_age_seconds > PGBACKREST_MAX_WAL_AGE_MINUTES * 60 )); then
      # A stale last-archived-WAL timestamp on an otherwise idle database is
      # not itself abnormal (no WAL segment has filled recently); this
      # threshold is generous (default 30 min) to avoid false positives on
      # a quiet chain, while still catching a genuinely stuck archiver.
      failures+=("Last WAL archive was $((archive_age_seconds / 60))m ago (threshold ${PGBACKREST_MAX_WAL_AGE_MINUTES}m) — archive_command may be failing")
    fi
    if (( archive_failed_count > 0 )); then
      failures+=("pg_stat_archiver reports ${archive_failed_count} failed archive attempts since last reset")
    fi
  else
    failures+=("Could not read pg_stat_archiver: ${archiver_stats}")
  fi

  # --- Indexer lag (direct DB check, independent of the indexer binary —
  # a redundant signal to cipherscan-rust-health.timer in case the indexer
  # process is wedged in a way its own CLI health check can't observe) ---
  lag_stats="$(sudo -u postgres psql -d "${PG_DATABASE}" -Atc \
    "SELECT
       (SELECT value::bigint FROM indexer_state WHERE key = 'last_indexed_height'),
       (SELECT value::bigint FROM indexer_state WHERE key = 'last_seen_rpc_tip'),
       (SELECT value::bigint FROM indexer_state WHERE key = 'last_success_at')" \
    2>&1 || true)"
  if [[ "${lag_stats}" =~ ^([0-9]+)\|([0-9]+)\|([0-9]+)$ ]]; then
    indexed="${BASH_REMATCH[1]}"
    tip="${BASH_REMATCH[2]}"
    last_success_at="${BASH_REMATCH[3]}"
    lag=$(( tip - indexed ))
    now_epoch="$(date -u +%s)"
    heartbeat_age=$(( now_epoch - last_success_at ))
    if (( lag > INDEXER_MAX_LAG )); then
      failures+=("Indexer lag ${lag} blocks (indexed ${indexed}, tip ${tip}, threshold ${INDEXER_MAX_LAG})")
    fi
    if (( heartbeat_age > INDEXER_MAX_HEARTBEAT_AGE_SECONDS )); then
      failures+=("Indexer heartbeat stale: ${heartbeat_age}s since last success (threshold ${INDEXER_MAX_HEARTBEAT_AGE_SECONDS}s)")
    fi
  else
    failures+=("Could not read indexer_state for lag check: ${lag_stats}")
  fi
else
  failures+=("psql not found — cannot check PostgreSQL/indexer state")
fi

timestamp="$(date -u '+%Y-%m-%d %H:%M:%S UTC')"
now="$(date +%s)"

if (( ${#failures[@]} == 0 )); then
  if [[ "${previous_status}" == "unhealthy" ]]; then
    send_telegram "$(cat <<EOF
Ops health recovered
Host: ${HOST_LABEL}
Time: ${timestamp}
All checks passing (disk, backup age, Redis, PostgreSQL connections, indexer lag).
EOF
)"
  fi
  persist_state "healthy" "" "${now}"
  exit 0
fi

summary="$(printf '%s\n' "${failures[@]}")"
fingerprint="$(printf '%s' "${summary}" | shasum -a 256 | awk '{print $1}')"

should_alert=0
if [[ "${previous_status}" != "unhealthy" ]]; then
  should_alert=1
elif [[ "${previous_fingerprint}" != "${fingerprint}" ]]; then
  should_alert=1
elif (( now - previous_alert_at >= ALERT_COOLDOWN_SECONDS )); then
  should_alert=1
fi

if (( should_alert == 1 )); then
  send_telegram "$(cat <<EOF
Ops health check failed
Host: ${HOST_LABEL}
Time: ${timestamp}

${summary}
EOF
)"
  persist_state "unhealthy" "${fingerprint}" "${now}"
else
  persist_state "unhealthy" "${previous_fingerprint}" "${previous_alert_at}"
fi

exit 1
