# Mining software markers v1

Implementation: `/blocks` filters and `/mining#software`. Not deployed by the
implementation task. This is an additive v1 feature; legacy production remains
available, and the public v1 launch gate must stay unchanged during private QA.

## Authority and categories

Raw canonical `blocks.coinbase_hex` is the source, not peer user-agent data.
The version-1 classifier detects byte-aligned UTF-8 🦓 / 🌸 and slash-delimited
Zebra, Zakura or zcashd numeric version tags (optional colon or space and `v`).
Multiple distinct recognized client markers are `conflicting`; repeated markers
for one client are not. `other` means zcashd, `unknown` means valid bytes without
a recognized marker, and `missing` means absent/empty/malformed hex. Markers are
self-reported and do not authenticate mining software.

Blocks are counted once in the denominator, including unknown/conflicting/missing.
All percentages are count-weighted, not averages of daily percentages. Dates use
UTC calendar days, inclusive `from` and `to`; weekly buckets start Monday and
include only selected days at the boundaries. Empty buckets have null counts.
Since presets start on the first observed marker day in the indexed data, not a
software release date. Zebra's automatic marker arrived July 2026; earlier
unmarked blocks may still be Zebra. Counts are neither node counts nor measured
hashrate. Software markers and pool payout-address attribution are independent.

## Deployment order (mainnet and testnet separately)

1. Review/apply Rust repository migration `023_mining_software.sql` using the
   normal migration runner. It installs new tables and insert/update/delete
   maintenance; it does not rewrite `blocks`. The trigger installation has a
   2-second lock timeout. Indexes build concurrently after the transaction.
   On a failed concurrent index build, inspect `pg_index.indisvalid`, drop only
   the invalid new index concurrently, and retry before marking migration done.
2. Migration 023 copies existing explicit/group block-table read/write grants
   to the corresponding new tables inside the trigger-installation transaction;
   it excludes PUBLIC. Verify the actual indexer role can maintain observations
   and daily counts, and the API role can SELECT all three new tables. Trigger
   functions run with invoker privileges. The explicit backfill operator also
   needs block row locking and state UPDATE privileges. If roles change later,
   update their new-table grants before changing the writer login.
3. Run `DATABASE_URL=<operator connection> npm run mining:backfill` from the API
   repository. Do not place credentials in committed files or command logs.
   The job takes one session advisory lock, reads in 5,000-row batches with row
   share locks, and inserts missing observations idempotently. Each batch is a
   single statement/transaction. It uses a 2-second lock/120-second statement
   timeout; retry the job if either expires. A restart can rescan existing rows
   without doubling counts. No RPC backfill is needed.
4. The job checks every stored canonical block's hash/timestamp against the
   observation table before setting version 1 `ready=true`. Before this, software
   reads return 503, not an empty chart or a misleading zero share. Missing raw
   coinbase data is a counted category even after indexing completes.
5. Check raw-data coverage, daily count totals and representative Zebra/Zakura/
   zcashd/conflicting/missing samples against actual mainnet data. Benchmark
   filtered pages (including pool+date combinations) with EXPLAIN ANALYZE on the
   real server before enabling the UI. The local synthetic benchmark is not a
   production latency promise.
6. Deploy the API route/helper, the shared `lib/mining-software.js`, mining-pool
   mapping and v1 manifest/query inventory/OpenAPI as one version. The isolated
   `dev-mainnet-source.js` mounts the new source handlers read-only; redeploy that
   private process for private testing while the public API remains unchanged.
7. Deploy the frontend with its generated API reference, pool choices and
   downloadable OpenAPI. Verify `/blocks?software=zebra&order=oldest` pagination,
   software links with date ranges, custom/since presets, chart copy/share, and
   unknown/missing rows. All filter/sort variants are noindex and canonicalize
   to `/blocks`; the clean route retains its existing ISR behavior.

## Integrity and operations

`block_software` follows canonical height/hash/time. Deleting a canonical block
cascades its observation; the observation trigger decrements its day/category.
Updating coinbase or replacing hash/time rewrites the observation and adjusts
both old/new buckets. A failed transaction rolls all changes back together.
The Rust indexer's reorg path uses DELETE, which is covered. Operational TRUNCATE
or disabling triggers requires resetting `ready=false`, clearing/rebuilding the
observation and daily tables, and rerunning the backfill before exposing results.
Do not edit daily counts by hand.

Software-only whole-day totals read `block_software_daily`. Height and pool
combinations count the selected indexed rows; a separate pool/height index is
provided. Cache keys bind filters plus tip height/hash. Blocks cache for 15 seconds
with at most one additional second stale; history caches for 60+1 seconds.
Software history freshness is displayed with latest indexed height/date.

Rollback the UI/API first if needed. Disable the feature by setting `ready=false`
using an operator connection. Keep the additive tables/triggers unless an operator
explicitly schedules their removal. Do not drop the shared canonical block table.

## Verification

- `npm run test:mining-software`
- `npm run test:mining-software-postgres` (isolated local schema; requires local
  PostgreSQL on `/tmp`, database `postgres`, and schema creation privileges)
- `npm --prefix server/api run test:v1`
- `npm run test:v1-frontend`, typecheck, design lint and production build

Integration tests exercise SQL/JS classifier parity, incomplete-index 503,
backfill idempotence, weighted shares, replacements/deletions, UTC ranges, pool
intersection, both cursor directions and orderings at limits 1/25/100, opaque
cursor filter binding, real parent intervals and indexed lookup plans. A local
100,525-block synthetic all-history read measured 27.3 ms on September 12, 2026;
real mainnet backfill coverage and performance remain to be measured.
