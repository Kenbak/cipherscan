#!/usr/bin/env bash
set -euo pipefail

app_user="${APP_DB_USER:-zcash_user}"
app_password="${APP_DB_PASSWORD:-changeme}"

if ! [[ "$app_user" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    echo "ERROR: APP_DB_USER is not a valid PostgreSQL role name" >&2
    exit 1
fi

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    --set=ON_ERROR_STOP=1 \
    --set=app_user="$app_user" \
    --set=app_password="$app_password" <<'SQL'
SELECT format(
  'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE',
  :'app_user',
  :'app_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user')
\gexec
SQL
