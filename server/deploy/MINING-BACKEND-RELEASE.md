# Mining backend release — production-compatible preparation

Prepared 2026-09-12 from production checkout `bf623604e5f02954a207be80dcedddcf4e0c703d`.
Status: prepared and locally tested; **not deployed**, migration not applied on mainnet.

## Scope

Only two existing runtime files change: `server/api/routes/blocks.js` and
`server/api/routes/mining.js`. New runtime files are the shared classifier
`lib/mining-software.js` and `server/api/lib/mining-software.js`. The existing
pool map, dependencies, API entrypoint, middleware, v1 layer, environment,
service definitions, frontend and domain/proxy configuration remain unchanged.
Do not deploy the redesign branch to obtain this release.

Adds `GET /api/mining/software` and opt-in filters on `GET /api/blocks/list`.
Existing requests with no new filter parameters keep the original implementation.
The new public read endpoint is discoverable once this backend is deployed;
this does not expose the preview `/v1` layer or launch the redesign. The local
redesign's v1 adapter can consume the new source endpoints while the current
public frontend continues to use its existing URLs. Existing public v1 inventory
and documentation are deliberately not expanded in this small release.

## Source endpoint parameters

`GET /api/blocks/list?software=zebra&order=oldest&limit=25`

- `software`: all (default), zebra, zakura, other (zcashd marker), unknown
  (unmarked), conflicting, missing (coinbase unavailable).
- `pool`: all (default), unattributed, or a pool name from the existing pool map.
- `order`: newest (default) or oldest, by canonical block height.
- `from` / `to`: inclusive UTC dates, YYYY-MM-DD.
- `min_height` / `max_height`: inclusive nonnegative heights.
- `limit`: existing 1–100 behavior; `cursor` is the numeric height returned in
  pagination; `direction=next|prev`. Carry all filters unchanged on subsequent
  requests. The redesign's separate v1 adapter binds its opaque cursor to filters.

`GET /api/mining/software?period=90d&bucket=week`

- `period`: 7d, 30d (default), 90d, 1y, all, custom, since-zebra, since-zakura.
- `from` / `to`: required for custom, inclusive UTC dates.
- `bucket`: auto (default), day, week. Weeks start Monday.

Returns counts, shares as 0–1 fractions, daily/weekly history, bounds, first
observations and raw coinbase coverage. Empty buckets have null counts. All
categories stay in the share denominator. Coinbase markers are self-reported,
not verified node software or hashrate. Since presets mean first observed marker,
not software launch date. Invalid filters return 400; absent/incomplete software
index returns 503 rather than zero results. No historical dollar conversions.

## Verified server baseline

Read-only inspection on 2026-09-12:

- `/root/cipherscan` was a clean, detached checkout of the baseline commit above.
- `zcash-api-mainnet.service` was active, entrypoint `server/api/server.js`.
- Node v22.23.2; PostgreSQL 16.15.
- Loopback legacy `/health`: 200. Unauthenticated `/v1/blocks`: 401 (preview
  access still required); do not change its existing gate/env configuration.
- `block_software` was absent. Observed maximum height: 3,480,522.
- Canonical `blocks.height` is bigint, difficulty numeric. Table owner postgres;
  active API/indexer connections use zcash_user with explicit table privileges.
- Only a bounded set of 1,100 public block records was exported for local QA.
  No complete production copy, migration, backfill, service restart or DNS change.

This is a point-in-time baseline. Stop and rebase/retest if production has changed.
Do not blindly cherry-pick the original redesign feature commit: it includes UI
and v1 changes that are intentionally excluded here.

## Acceptance

From repository root:

```sh
npm --prefix server/api test
npm --prefix server/api run test:v1
node --test server/tests/mining-software.test.js
MINING_RELEASE_POSTGRES=1 node --test server/tests/mining-release.test.js
```

The last command creates/drops a uniquely named schema and NOLOGIN writer role
on **local `/tmp` PostgreSQL, database postgres only**. It requires local schema/
role creation privileges. Optional `MINING_RELEASE_SAMPLE` points to a JSON array
of public canonical block rows; otherwise it uses a deterministic synthetic set.
The test never accepts a remote database URL. Do not run it against production.

Acceptance run: 123 legacy API tests passed, 1 Redis integration test skipped
(no dedicated test Redis configured); 74 unchanged production v1 tests passed;
2 classifier/filter tests passed; 9 release acceptance tests passed. The release
acceptance includes 13 legacy requests compared against the baseline before and
after migration, exact response payload/status/cache-policy comparison (excluding
only generatedAt wall-clock values), real bigint/numeric columns, separate
writer grants, concurrent index syntax, repeatable backfill, JS/SQL classifier
agreement, both sort orders across all categories, reorg replacement/deletion,
transaction rollback and emergency trigger detachment. Test mocks now include the newly consumed pool-map
export; production pool attribution did not change.

Database acceptance used PostgreSQL 14.18 locally. It validates a bounded mainnet
sample, not full 3.48-million-row load or production PostgreSQL 16 timings. The
production-scale backfill, query plans, backup restore readiness and lock/IO
headroom still need pre-deployment checks. No zero-downtime guarantee is claimed.

## Deployment sequence — operator action, not executed by preparation

1. Run `node server/scripts/check-mining-release.js --baseline /root/cipherscan`
   from the release checkout to check production commit, clean tracked files and
   runtime fingerprints without writing anything. Confirm service/dependency paths
   and baseline responses again. Confirm a restorable backup/recovery path and disk/IO/lock
   headroom. Coordinate shared-schema deployment with the indexer owner.
2. Make a separate release checkout at this release commit, retaining the old
   checkout for rollback. Use the same dependency lockfile and Node environment.
   Do not overwrite `.env`, switch the public frontend, change DNS, proxy routes,
   service ports or preview gate settings. Verify all required root/shared files
   are included; copying just the two route files is insufficient.
3. Review ONLY the bundled `server/deploy/migrations/023_mining_software.sql`.
   It is an exact copy from Rust commit `0d24060`; check its SHA-256 against
   the release manifest. Inspect the server migration ledger before registering
   023, using its normal bookkeeping. Do not run all pending migrations from
   another branch. Do not wrap the whole SQL file in one transaction: the index
   builds after COMMIT use CREATE INDEX CONCURRENTLY.
4. Apply 023 with an operator connection and ON_ERROR_STOP. Trigger installation
   has a 2-second lock timeout. Verify actual writer/API privileges and successful
   new canonical block ingestion immediately. On index failure, inspect validity
   and drop/retry only the failed new index concurrently; IF NOT EXISTS alone
   does not repair invalid indexes.
5. Run `node server/scripts/backfill-mining-software.js` with DATABASE_URL supplied
   securely to the operator process, not in shell history. One session, batches
   of 5,000, 2-second lock and 120-second statement timeout, advisory-lock protected.
   Monitor indexing lag, query latency, WAL/disk/IO and lock waits. If contention
   rises, stop the backfill and investigate; rerunning is idempotent. Verify
   canonical coverage/daily totals and ready=true before enabling consumers.
6. Measure real filtered query plans and all-history response time, including
   pool/date intersections. Smoke-test existing and new API endpoints from the
   separate checkout using a read-only connection and bounded private listener.
7. Switch ONLY the backend service to the verified release, preserving its env,
   port and proxy configuration. Check legacy block/transaction/address/mining
   requests, health, websocket delivery and unchanged unauthenticated v1 status.
   A restart can briefly reconnect clients; retain the prior service path.
8. Test the local redesign through the existing private v1 tunnel. Public
   frontend deployment and the api.zecblock.com launch are separate later work.

## Rollback

- API regression: restore the prior backend checkout/service path and restart.
  Existing API code does not query the new tables. Leave frontend/DNS unchanged.
- `ready=false` hides new statistics but **does not disable triggers**. API rollback
  likewise does not undo production write-path changes.
- If trigger maintenance itself interrupts indexing, an operator can detach only
  the new maintenance triggers using `mining-backend-detach.sql` after inspecting
  the problem. It uses a short lock timeout and marks statistics unavailable.
  The existing FK can still cascade deletion of observation rows. Daily totals
  are no longer maintained, so they are unusable until rebuilt.
- After detachment, do not merely set ready=true or run the insert-only backfill:
  old observations/aggregates may be stale. Rebuild ONLY the derived observation
  and daily tables, reinstall maintenance, backfill and verify again. Never clear
  the canonical blocks table. Schedule this recovery deliberately.
