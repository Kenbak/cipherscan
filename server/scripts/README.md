# Crosslink Server Scripts

Operational scripts for the production Crosslink node at
`crosslink.cipherscan.app`.

## Why these exist

Per ShieldedLabs (Sam Smith, in the season-1 Signal group):

> *Currently we have a bug where if your sidechain is longer than 100
> blocks the finalizer roster will get corrupted. To fix this you need to
> delete the zebra cache and sync from scratch.*

And:

> *In order to have good uptime it is good to have some backup caches
> around in case the main one gets corrupted. Syncing from scratch is
> very slow and not what you want to be doing in an emergency.*

These scripts implement that backup strategy.

## Files

| File                              | Purpose                                                       |
| --------------------------------- | ------------------------------------------------------------- |
| `zebra-snapshot.sh`               | Tar.gz the Zebra cache, but only when node is healthy         |
| `zebra-restore.sh`                | Stop services, wipe cache, extract the latest snapshot        |
| `zebra-snapshot.service`          | systemd unit that runs `zebra-snapshot.sh`                    |
| `zebra-snapshot.timer`            | systemd timer firing the snapshot service hourly              |
| `zebra-public-snapshot.sh`        | Publish a SAFE public bootstrap snapshot for users to download |
| `zebra-public-snapshot.service`   | systemd unit for the public snapshotter                       |
| `zebra-public-snapshot.timer`     | systemd timer firing every 6h                                 |
| `nginx-bootstrap.conf`            | nginx location block that serves the public snapshot          |

## Install on the server

Run once as root on the Crosslink node:

```bash
# Copy the scripts into PATH
install -m 755 zebra-snapshot.sh /usr/local/bin/zebra-snapshot.sh
install -m 755 zebra-restore.sh /usr/local/bin/zebra-restore.sh

# Install the systemd timer
install -m 644 zebra-snapshot.service /etc/systemd/system/
install -m 644 zebra-snapshot.timer   /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now zebra-snapshot.timer

# Verify
systemctl status zebra-snapshot.timer
ls -lh /root/zebra-snapshots/
```

## What the snapshotter does

1. Hits zebrad's RPC to read the PoW tip and finalized height.
2. If the **finality gap is ≤ 10 blocks** (i.e. we're on the majority
   chain, not a sidechain), tars the Zebra cache directory.
3. Writes it to `/root/zebra-snapshots/zebra-<timestamp>-tip<H>.tar.gz`.
4. Rotates to keep the last **3** snapshots.
5. Skips the run silently if the node is unhealthy (so we never
   snapshot a corrupt chain state).

## Recovery

When the indexer's divergence watcher fires (see the
`divergence_events` table) or finality gap stays >100 blocks:

```bash
/usr/local/bin/zebra-restore.sh        # restore latest snapshot
# or, if the latest is also on a fork:
/usr/local/bin/zebra-restore.sh 2      # restore 2nd most recent
```

This stops zebrad + indexer, wipes the cache, extracts the snapshot,
and restarts services. Usually 30-60 seconds end-to-end vs. several
hours for a genesis resync.

## Public bootstrap snapshot

The public snapshotter exposes a sanitized cache at
`https://crosslink.cipherscan.app/bootstrap/bootstrap.tar.gz` so other
operators can skip a genesis resync. It includes ONLY public blockchain
data (`state/` + `pos.chain`) — never `secret.seed` or `zaino/`.

### Install

```bash
mkdir -p /var/www/crosslink.cipherscan.app/bootstrap
install -m 755 zebra-public-snapshot.sh /usr/local/bin/zebra-public-snapshot.sh
install -m 644 zebra-public-snapshot.service /etc/systemd/system/
install -m 644 zebra-public-snapshot.timer   /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now zebra-public-snapshot.timer
```

### Nginx

Add the rate-limit zone to `/etc/nginx/nginx.conf` (inside `http { }`):

```nginx
limit_req_zone $binary_remote_addr zone=bootstrap_dl:10m rate=6r/m;
```

Then paste the `location /bootstrap/` block from `nginx-bootstrap.conf`
into the `server { server_name crosslink.cipherscan.app; ... }` block.

```bash
nginx -t && systemctl reload nginx
```

### Verify

```bash
curl -s https://crosslink.cipherscan.app/bootstrap/bootstrap.json | jq
curl -I https://crosslink.cipherscan.app/bootstrap/bootstrap.tar.gz
```

### What gets published

- `bootstrap.tar.gz`         — the archive (state/ + pos.chain only)
- `bootstrap.tar.gz.sha256`  — the checksum file
- `bootstrap.json`           — metadata (tip/finalized heights, sha256, timestamps)

The snapshotter will **refuse to publish** if:
- The finality gap is > 5 blocks
- A configured cross-check reference explorer reports a different finalized hash

## Transaction block identity rollout

Canonical transaction APIs require both `transactions.block_height` and
`transactions.block_hash` to match the same row in `blocks`. Before deploying
the reorg-aware API queries, deploy the indexer writer change that records both
fields, then use `backfill-transaction-block-hashes.js` against each network's
database. The repository has no general database migration runner, so this is
an explicit deployment operation rather than an application-startup mutation.

The script is audit-only by default. It never derives a hash by joining on
height alone. In verify/apply mode it requires all of the following before a
row can change:

1. Zebra `getrawtransaction(txid, 1)` returns a block hash.
2. Zebra `getblock(blockhash, 1)` returns the same hash and includes the txid.
3. That exact `(height, hash)` pair exists in the local canonical `blocks`
   table.
4. The canonical block row remains locked while the transaction and optional
   denormalized rows are updated in one database transaction.

From `server/scripts`, using the same environment-file convention as the other
repair scripts:

```bash
# 1. SQL-only counts and samples. This makes no Zebra calls and never writes.
npx dotenvx run -f ../api/.env -- node backfill-transaction-block-hashes.js --audit

# 2. Pilot verification. Review would_update and all unresolved categories.
npx dotenvx run -f ../api/.env -- node backfill-transaction-block-hashes.js --verify --limit=100 --verbose

# 3. Apply the same guarded verification to a small batch.
npx dotenvx run -f ../api/.env -- node backfill-transaction-block-hashes.js --apply --limit=100 --verbose

# 4. Continue in bounded batches until missing_hash and malformed_hash are zero.
npx dotenvx run -f ../api/.env -- node backfill-transaction-block-hashes.js --apply --limit=1000
npx dotenvx run -f ../api/.env -- node backfill-transaction-block-hashes.js --audit
```

Run the sequence separately for mainnet and testnet with the corresponding
database and Zebra environment. `--all` is available for a maintenance window,
but bounded batches make RPC load and rollback scope easier to review.

Valid hashes that do not match the current local canonical block are excluded
by default because they may be intentionally retained stale/orphan identities.
Audit them separately with `--include-mismatched --verify`; even with
`--include-mismatched --apply`, the script updates a row only when Zebra and the
local canonical block mapping agree. RPC failures, transactions with no block
hash, missing local blocks, and membership mismatches remain unchanged and are
reported for investigation.

After the final audit, deploy the API reader changes and spot-check transaction
lists, shielded statistics, a confirmed transaction, and a retained stale
transaction. The production indexer must continue writing and updating height,
hash, time, and transaction index together whenever a transaction is mined or
re-mined.
