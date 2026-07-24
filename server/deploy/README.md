# CipherScan mainnet operations

These files are the version-controlled source for the mainnet API, Zebra,
scheduled jobs, and PostgreSQL backups. Deployment-local secrets remain outside
Git in `server/api/.env`.

The list-response cache uses the host's private Redis instance. Install Redis,
keep it bound to loopback/private interfaces, and enable persistence before
enabling `API_LIST_CACHE_ENABLED=1`. The API fails open to PostgreSQL if Redis
is unavailable, but archive TTFB will regress until Redis recovers.

Set the rollout controls in `server/api/.env`; the systemd unit deliberately
does not override them so changing the flag to `0` and restarting the API is a
quick rollback:

```dotenv
API_LIST_CACHE_ENABLED=1
API_CACHE_NAMESPACE=mainnet
API_LIST_CACHE_MAX_ENTRIES=1000
API_LIST_CACHE_REDIS_TIMEOUT_MS=50
```

## Install services

```bash
sudo cp server/deploy/zebrad-mainnet.service /etc/systemd/system/
sudo cp server/deploy/zcash-api-mainnet.service /etc/systemd/system/
sudo cp server/deploy/Caddyfile.example /etc/caddy/Caddyfile
sudo systemctl daemon-reload
sudo systemctl enable --now redis-server zebrad-mainnet zcash-api-mainnet caddy
```

## Scheduled jobs

During a full database rebuild, install the reduced profile so analytics do not
publish incomplete aggregates:

```bash
sudo mkdir -p /var/log/cipherscan
crontab server/deploy/crontab.backfill
```

After block coverage is complete and validated:

```bash
crontab server/deploy/crontab.production
```

## Node map

The node map resolves peer IP geolocation via the free ip-api.com batch endpoint
(no API key required). Lookups happen server-side during the cron job; no client
IPs are exposed to the frontend.

1. Apply `cipherscan-rust/schema/migrations/010_node_map.sql`.
2. Run `node server/jobs/sync-nodes.js` once and verify the aggregated node
   endpoints before installing the production crontab.

## PostgreSQL backups

The backup script mounts the Hetzner Storage Box over SSHFS and writes a
custom-format dump directly to that mount. It never creates a full dump on the
server's root disk. The temporary remote filename is verified and atomically
renamed before the success marker is updated.

Prerequisites:

1. Add the server's SSH public key to the Storage Box.
2. Verify key-only access on port 23.
3. Install SSHFS (`apt install sshfs` on Ubuntu).
4. Run `server/deploy/backup-postgres.sh` once manually.
5. Confirm a non-empty `.dump` exists remotely and record a restore drill.

Override `DATABASE`, `STORAGEBOX`, `STORAGEBOX_PORT`, `STORAGEBOX_PATH`,
`MOUNT_DIR`, or `RETENTION_DAYS` through the environment when needed.

Restore into a new database:

```bash
scp -P 23 u630383@u630383.your-storagebox.de:backups/<backup>.dump /tmp/
sudo -u postgres createdb zcash_explorer_restore_test
sudo -u postgres pg_restore \
  --exit-on-error \
  --no-owner \
  --dbname zcash_explorer_restore_test \
  /tmp/<backup>.dump
```

Never treat an upload as verified until a restore drill succeeds.
