# Cross-chain data: authority, validation and staged rollout

Updated: 2026-09-28. Implemented locally on `new/crosschain-data-depth`, based on
`codex/zecblock-assay-rebrand`. **Not deployed; production schema, cron and reader
flags have not changed.** Do not deploy this whole branch as an API hotfix: it
also inherits the unshipped ZecBlock redesign.

## What the data means

The authority is the authenticated [NEAR 1Click Explorer API](https://docs.near-intents.org/api-reference/get-transactions),
not all NEAR Intents activity. Token identities come from
`https://1click.chaindefuser.com/v0/tokens`. Index all six documented statuses in
both directions involving native ZEC. Store the complete upstream JSON, retaining
fields that are not currently visualized. Identity is `(depositAddress, depositMemo)`;
an address alone is insufficient. Wrapped assets keep their reported chain identity.
Internal ZEC-to-ZEC routes remain searchable but are excluded from external-route
analytics. An Intents-balance asset route does not prove an on-chain deposit or withdrawal.

Historical traversal has no arbitrary year/week cutoff. It follows address+memo
cursors against a fixed upper timestamp until the provider returns an empty page.
Short pages do not terminate traversal. Empty calendar intervals do not terminate
traversal. A checkpoint and its entire page commit atomically; invalid data or a
non-advancing cursor fails without skipping the page. Completed history is proof
of traversal, **not proof that upstream has exposed every swap**.

Only SUCCESS contributes volume, distributions, routes and timing. USD is reported
source-side USD; native ZEC is destination quantity for inflow and source quantity
for outflow. Decimal amounts stay PostgreSQL numeric / JSON strings; charts convert
only for rendering. Legacy zero sentinels become unavailable values. Missing values
are counted, not silently replaced by zero; aggregates with no valued rows are null.
A partially valued aggregate explicitly covers only reported values. Median uses
PostgreSQL percentile interpolation; it is a statistical value, not a transfer amount.

Daily/hourly UTC series have a row for each bucket. Absent buckets remain null unless
completed historical and live traversals cover the entire bucket continuously and
the live sync is fresh. A coverage range ledger detects gaps between a historical
snapshot and later overlapping live windows. First/current partial buckets are not
fabricated as zero. 24h/7d default to hourly; longer periods use daily resolution.
“All indexed” means the observed index, not a claim about all historical volume.

PENDING_DEPOSIT can be an unfunded quote. Observed status counts are not a venue-wide
success/failure rate. In-flight amounts are unavailable, not zero. `firstSeenAt`,
`lastSeenAt` and `statusObservedAt` are local observation times, not execution times.
`last_checked_at` also advances for an unsuccessful refresh without claiming a new
upstream observation. Recent pending deposits and processing/incomplete records
are refreshed; reconciliation revisits older abandoned quotes and terminal outcomes.

Timing measures swap creation to the reported Zcash transaction's block timestamp,
using matched positive samples under 24 hours, with sample count/p50/p90. The outbound
measurement is the Zcash deposit leg. **It is not end-to-end settlement latency.**
Do not substitute heuristic linked hashes. Sender counts distinguish chain+address,
not people or wallets. Application fees are reported basis points, not total cost.
Wrapped token supply remains a separate contract observation, not unique backing or
proof of reserves.

## Compatible read surfaces

- `/api/crosschain/analytics` and `/v1/crosschain/analytics`: period and granularity;
  summary, coverage, dense series, distribution, exact-asset routes, outcomes,
  referrals and sampled timing. A bounded per-process single-flight cache lasts 60s.
- `/api/crosschain/swaps` and `/v1/crosschain/swaps`: period, direction, status,
  chain, symbol, exact source/destination asset, referral, min/max USD, UTC from/to,
  exact address/transaction/NEAR-intent search, limit and opaque cursor. Date intervals are
  `[from,to)`. Cursor fixes the original time window and filter fingerprint; sorting
  uses timestamp+address+memo, avoiding tied-row loss and offset ceilings.
- Default readers use the existing `cross_chain_swaps` table. Set
  `CROSSCHAIN_V2_READ_ENABLED=1` only after acceptance checks. Existing API endpoints,
  legacy jobs and their consumers retain their contracts; their old historical
  limitations are not silently rewritten by this change.
- The redesign calls the new v1 routes. Publish compatible API routes before shipping
  the frontend. Before API availability, the new UI shows unavailable, never fake zeros.

## Additive schema and writer

`server/scripts/create-crosschain-v2.sql` is an explicit application SQL migration,
not a numbered Rust indexer migration. It creates three new tables only:
`crosschain_swaps_v2`, `crosschain_sync_v2`, `crosschain_coverage_v2`. PostgreSQL 14+
is required for multirange aggregation. It uses a two-second DDL lock timeout. It
never truncates, renames or updates legacy tables. Run with `ON_ERROR_STOP=1` against
`zcash_explorer_mainnet`; inspect the database identity before applying.

`node server/jobs/sync-crosschain-v2.js` is dry-run by default. Writing requires all
of `--apply`, `NETWORK=mainnet`, `CROSSCHAIN_V2_WRITER_ENABLED=1`, and an exact database
name of `zcash_explorer_mainnet`. Credentials are loaded by the existing job utilities.
A PostgreSQL session advisory lock prevents competing v2 jobs. Each invocation is
bounded to five pages per direction by default (1,000 provider records/page), with
`--max-pages=1..100`. Provider calls are spaced at least 5.5 seconds, retry at most five
times on transient errors, honor Retry-After, and abort resumably if cooldown exceeds
60 seconds. Token catalog failure aborts rather than inventing chains.

## Production rollout and rollback

1. Verify the actual mainnet release branch, API process working directory, deployed
   commit, database host/name/version, disk space and cron ownership. Keep the
   unrelated redesign out of an API-only release. Deploy the compatible API modules
   with both v2 flags unset; check existing routes plus both new legacy-backed routes.
2. Apply the additive SQL with a low lock timeout. Confirm the new empty tables and
   indexes. Retain existing source tables; no legacy data copy is required or assumed
   to preserve memo identity.
3. **Coordinate the partner-wide provider quota before enabling the writer.** NEAR
   documents one request per five seconds per partner. The local limiter and advisory
   lock do not coordinate with the legacy job or other hosts using the same key.
   Use a provider-approved separate quota or a scheduled, non-overlapping execution
   window shared by every job using that partner key. Do not run the v2 backfill
   concurrently with the legacy ingester at full quota, or disable legacy indefinitely:
   its transaction labels and other consumers still depend on it. No cron is installed
   by this change. Measure per-window duration and leave time for legacy updates.
4. Run one bounded `--apply --backfill --max-pages=1` in that coordinated window.
   Verify rows, memo identities, payloads, numeric amounts and checkpoint. Continue
   bounded backfill invocations until both directions have `completed_at`. The first
   history snapshot is fixed; it can take multiple invocations to traverse all statuses.
5. Run bounded `--apply` live sync invocations to completion, then schedule sufficiently
   frequently to remain within the 20-minute freshness threshold. Live windows overlap
   seven days and resume unfinished windows. Their start follows prior completed-through,
   so interrupted periods are caught up. Check continuous coverage through both directions;
   if the initial backfill took more than seven days, run a full `--apply --reconcile`
   sweep to close any gap to the live window. Reconciliation is resumable and starts
   a new full sweep after completion. Schedule according to measured volume and quota.
6. Compare legacy and v2 SUCCESS rows over the SAME exact time window; explain
   memo-collision recovery, revised provider statuses, missing values and internal ZEC
   exclusions. Check histogram count equals valued SUCCESS external rows, native-ZEC
   sums equal the relevant token amounts, both traversal checkpoints complete, live
   freshness, continuous coverage and representative source/destination hash links.
   Confirm failed/refunded/pending rows and missing-value behavior using real payloads.
7. Enable the reader flag only after these gates pass. Check API latency/load at the
   resulting all-status index size, database pool headroom, errors, coverage and UI.
   Ship the redesign on its own reviewed release path. Do not claim “complete history”
   until the provider's exposed history has actually been traversed.
8. Roll back by unsetting `CROSSCHAIN_V2_READ_ENABLED` and restarting the API through
   its normal release mechanism. Disable only the new writer schedule/flag if needed.
   Legacy data and jobs remain intact. Retain v2 tables/checkpoints for diagnosis and
   resumable recovery; no destructive down migration is required.

## Validation evidence (2026-09-28)

- Read-only production probe: 87,603 legacy records, earliest
  `2026-06-13T23:21:15.344Z`, 1,499 internal routes, 10,159 records without an
  upstream-reported ZEC hash. Counts are a point-in-time observation.
- New legacy-backed 30-day analytics and 25-row explorer read together took 831 ms
  in one measured remote invocation. Both successful external count and valued
  histogram count were 49,799. Native ZEC total `210537.77734986`; USD total
  `266143507.544119209861`. This is not a sustained load benchmark.
- Authenticated provider probes found successful ZEC swaps on 2025-12-31, proving
  older data exists; no earliest-provider-date claim is made. A later probe validated
  five recent records in each direction against 198 catalog tokens; all ten were
  pending deposits with unavailable amounts.
- Real PostgreSQL regression fixtures cover memo identity, status changes, history
  older than the former 84-day bound, checkpoint recovery/rollback, cursor exhaustion,
  repeat-cursor failure, UTC buckets under a Tokyo database timezone, coverage gaps,
  counts, exact sums, internal exclusion, unknown values, lifecycle observation,
  pagination ties and actual legacy/v1 HTTP adapters.
- Browser validation uses a separate localhost API and 60,000 explicitly synthetic
  records; these are not production data. No fixture is included in a production job.

Run `CROSSCHAIN_TEST_POSTGRES=1 NODE_PATH=$PWD/server/api/node_modules node --test
server/tests/crosschain-v2.test.js` with a local PostgreSQL socket at `/tmp`. The test
creates and drops its own uniquely named test database. Without the opt-in, only the
pure validation and rate-limit tests run. Also run frontend tests, lint, typecheck,
v1 contract/OpenAPI checks and a production build before release.

Final local release checks: optimized webpack production build passed after replacing
a shared dependency symlink with a local copy; TypeScript passed. Full frontend suite:
226 passed. Server regressions: 116 passed, 3 skipped. API tests: 135 passed, 2 skipped.
v1 contract tests: 282 passed. Cross-chain PostgreSQL suite: 3 passed (including the
integration scenario); route-cache build checks: 5 passed. Full lint passed with
227 existing warnings and no errors; targeted changed-file lint had no output.
The build used the repository's allowed upstream fallback; an unrelated rich-list
request timed out during prerendering, while the build completed successfully.
Optimized-build browser verification had no console errors. Raw HTML checks found
one H1, complete sharing metadata and two JSON-LD blocks; the clean route was
index/follow and filtered variants noindex/follow, both canonical to the clean URL.
