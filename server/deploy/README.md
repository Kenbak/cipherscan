# CipherScan mainnet operations

These files are the version-controlled source for the mainnet API, Zebra,
scheduled jobs, and PostgreSQL backups. Deployment-local secrets remain outside
Git in `server/api/.env`.

## Install services

```bash
sudo cp server/deploy/zebrad-mainnet.service /etc/systemd/system/
sudo cp server/deploy/zcash-api-mainnet.service /etc/systemd/system/
sudo cp server/deploy/Caddyfile.example /etc/caddy/Caddyfile
sudo systemctl daemon-reload
sudo systemctl enable --now zebrad-mainnet zcash-api-mainnet caddy
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

## PostgreSQL backups

The backup script streams a custom-format dump directly to the Hetzner Storage
Box. It never creates a full dump on the server's root disk.

Prerequisites:

1. Add the server's SSH public key to the Storage Box.
2. Verify key-only access on port 23.
3. Run `server/deploy/backup-postgres.sh` once manually.
4. Confirm a non-empty `.dump` exists remotely and record a restore drill.

Override `DATABASE`, `STORAGEBOX`, `STORAGEBOX_PORT`, `REMOTE_DIR`, or
`RETENTION_DAYS` through the environment when needed.

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
