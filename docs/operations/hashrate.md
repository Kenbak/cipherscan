# Shared work-based hashrate

The headline estimate is a full trailing 24-hour window, in Sol/s, derived from
canonical block targets (`blocks.bits`). For each valid compact target T, expected
work is `floor(2^256 / (T + 1))`, matching Zcash's GetBlockProof. Sum work for
block-header timestamps in `[windowStart, windowEnd)` and divide by the full
86,400 seconds (604,800 for the optional 7-day estimate). Integer work is summed
in PostgreSQL numeric; conversion to a JavaScript number occurs only at the
final rate. This uses the node's expected-work principle; unlike the default
120-block RPC estimate, it uses a fixed time window, not timestamp extrema.

No latest-difficulty substitution, 75-second fallback or collector first-seen
timestamps participate in this calculation. Orphaned blocks are excluded. This
estimates canonical-chain mining power, not the unobservable total work spent on
all losing branches. Miner-controlled header times, block-discovery variance and
indexer lag remain limitations; the snapshot exposes indexed tip hash/height/time.

`GET /api/network/stats` retains `mining.networkHashrate` and
`networkHashrateRaw`, now the 24h estimate (raw value may be null). It adds
`mining.hashrateEstimate`: asOf, tipHash, tipHeight, tipTimestamp and windows
`24h`/`7d`. Each window includes rate, count, exact expectedWork string, start/end,
windowSeconds, method `target-work-v1`, and unavailableReason. Missing target
work, fewer than two sample blocks, or insufficient preceding history produce
null / "Unavailable". Do not relabel old cached payloads as 24h estimates.

Stats retain the existing 120-second cache, with a new `zcash:network_stats:work-v1`
key. All headline components subscribe to the same stats URL and browser query
registry. The chart's current endpoint uses that exact snapshot, not a separately
fetched historical endpoint. Current values are recomputed as the window advances,
including time without a new block; there is no midnight reset.

`GET /api/network/hashrate-history?period=1y&window=24h` accepts periods
7d/30d/90d/1y/all and windows 24h/7d. Completed trailing windows are sampled at UTC
midnight, with their actual endpoint ISO timestamp as `date`. Points now represent
full windows ending at that instant, rather than the previous daily bucket's
partially observed span. The former avgDifficulty field is replaced by exact work
and window metadata. Initial windows without coverage are omitted, not shortened.
The current point is appended in the client from stats. A numeric time axis gives
the last partial-day gap its actual duration. Missing samples remain gaps.

History has a separate method-versioned Redis key and bounded per-pool memory
cache for 10 minutes; concurrent identical misses share one calculation. On a
reorg, stats and history are regenerated from the canonical table within their
respective cache lifetimes. No new schema or migration is required.

The 7-day chart selection changes chart estimates only: the page headline remains
explicitly 24h to match the top bar and Network page. The old series is hidden while
a different window loads, so cached 24h values cannot be labeled 7d. Refresh
failures keep the last successful snapshot and its visible as-of time.

Validation includes exact target decoding against a BigInt reference (sign,
overflow, tiny/invalid targets), fixed-window boundaries and future timestamps,
actual PostgreSQL queries and API serialization, canonical replacements, and
frontend snapshot/selection regressions. Run `npm run test:hashrate-postgres` with
HASHRATE_TEST_DATABASE_URL pointing to a disposable PostgreSQL database. The test
uses a temporary blocks table in a rolled-back transaction; CI supplies PostgreSQL.
