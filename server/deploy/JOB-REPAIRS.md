# Auxiliary job compatibility

Apply `sql/030_job_summary_compatibility.sql` as the schema owner before running
node snapshots or the incremental turnstile writer on legacy deployments. The
canonical copy is migration 030 in cipherscan-rust. It is safe to repeat and is a
no-op for an existing writable turnstile table. It keeps the old materialized
view as `turnstile_daily_legacy_030`, copies all rows and grants, and refuses
conversion if other views depend on it. Retain that archive until a separate
backup/retention review. Back up `node_snapshots`, `turnstile_daily` and
`indexer_state` before applying; do not reset chain tables or node state.

`node server/jobs/refresh-turnstile.js --date=YYYY-MM-DD` repairs one UTC date
under the normal advisory lock without advancing the live bookmark. Use it for
bounded catch-up, checking each completion, rather than an unbounded rebuild.
The normal job still runs on its existing cron schedule. Node snapshot write
failures now fail the job instead of printing a successful sync summary.

On testnet (`NETWORK=testnet`), NEAR Intents is unavailable. Transaction detail
skips bridge enrichment. Cross-chain endpoints and chain-filtered privacy tools
return HTTP 404 with `available:false` and
`code:FEATURE_UNAVAILABLE_ON_NETWORK`. Precomputed privacy, Pulse, and market
valuation analytics also have no testnet producer and return the same explicit
unavailability response. Raw on-chain common amounts, fee lanes, wallet
fingerprints, privacy statistics and turnstile data remain available. Current
and historical testnet price endpoints return null prices with
`available:false`; test coins are not assigned a ZEC market price.

## Pattern scanner runtime

On Debian/Ubuntu install `python3-venv`, then run:

```sh
bash server/deploy/install-pattern-scanner.sh
flock -n /run/cipherscan-pattern-scanners.lock bash server/jobs/run-pattern-scanners.sh --dry-run
flock -n /run/cipherscan-pattern-scanners.lock bash server/jobs/run-pattern-scanners.sh
```

The installer provisions `/opt/cipherscan-pattern-scanner/venv` using the pinned
requirements. Override `PATTERN_SCANNER_VENV` for installation and
`PATTERN_SCANNER_PYTHON` for the cron interpreter if using another location.
The cron runner never installs packages. Python writes must succeed for the
job to report completion. BLAS/OpenMP concurrency defaults to one thread.

## Legacy Zebra service retirement

Zakura may still use `/var/lib/zebra` as its configured state directory. That
name does **not** mean it is unused. Verify the active Zakura configuration and
lightwalletd dependencies, back up both units, change lightwalletd's `Wants` and
`After` to `zakurad-mainnet.service`, and reload systemd before stopping/removing
an obsolete `zebrad-mainnet.service`. Preserve `/var/lib/zebra`, both node cache
directories, and all database data. The dependency update requires no restart
of a healthy Zakura or lightwalletd process.
