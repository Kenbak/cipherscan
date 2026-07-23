# Time to first byte verification

This probe measures only the time from starting an HTML `GET` until the
response headers are available. It immediately cancels the response body and
does not measure HTML transfer, rendering, hydration, or browser load time.
Use `perf:probe` and `docs/slow-page-performance.md` for the separate complete
HTML load regression.

## Run a production baseline

Run immediate pairs serially so the probe does not create its own origin-load
spike. An explicit output path is required so every run preserves its raw
observations.

```sh
npm run perf:probe:ttfb -- \
  --base-url=https://cipherscan.app \
  --targets=scripts/perf/ttfb-targets.json \
  --rounds=3 \
  --timeout-ms=12000 \
  --threshold-ms=200 \
  --output=artifacts/perf/ttfb-production.json
```

Add `--min-under-threshold-pct=80` and
`--require-core-under-threshold` when using the diagnostic population as a
deployment gate. Use `--force` only when intentionally replacing an artifact.
`--scheduling=parallel` is a separately labelled stress mode and must not be
mixed into the serial baseline.

The checked-in targets cover every path in PR #47's `CORE_PATHS` sitemap cohort,
latest and archive list variants, and representative block, transaction, and
address details. A deterministic test prevents a core sitemap path from being
added without corresponding TTFB coverage. The targets are still a diagnostic
population: their aggregate percentage does not prove that 80% of every crawled
page is below 200 ms. Use a live full-population crawl for that claim and use
this probe to explain its cache-state distribution.

## Core list route cache split

Query-free `/blocks`, `/txs`, and `/txs/shielded` requests are internally
rewritten to dedicated 30-second ISR pages. Cursor, direction, page-number, and
filter queries remain on the existing dynamic server-rendered handlers, so
their query-specific HTML, metadata, canonical policy, and crawlable pagination
links are not collapsed into the latest-page cache entry. Unknown tracking
parameters do not affect page output and may use the query-free ISR route.

The hidden `/latest` destinations are implementation details, are absent from
sitemaps, and publish canonicals for the corresponding public latest URLs. The
post-build `test:route-cache-build` check proves Next emitted the destinations
as ISR while the query-aware routes stayed dynamic. It does not prove Netlify
served a cache hit or met the TTFB objective; only preview/production response
headers and timings can establish that.

Cacheable routes surface timeout, network, non-success, and malformed upstream
responses as regeneration errors. Next can then keep serving the last
successfully generated ISR entry instead of replacing it with an empty list or
unknown detail page. This protection applies only after a successful entry
exists; a first-ever runtime miss has nothing stale to serve and can fail.
Dynamic archive-query handlers retain PR #47's bounded unavailable shells
because they have no Full Route Cache entry to preserve.

GitHub's offline build step alone sets
`CIPHERSCAN_ALLOW_BUILD_UPSTREAM_FALLBACK=1`, which permits deterministic empty
build shells. Do not set that variable in Netlify or a runtime environment: a
production build should fail closed when a cacheable static upstream is
unhealthy. Empty `generateStaticParams()` means detail APIs are not exercised
during the build, so the predeployment API health and representative detail
checks remain mandatory.

The normal server-render fetch deadline is one second. During Next's production
build phase it is ten seconds so a healthy cross-service API can seed the first
valid ISR entry despite build-runner network latency. This does not enable the
empty build fallback: HTTP errors, malformed payloads, network failures, and a
ten-second timeout still fail the build. Runtime requests and ISR regenerations
continue to use the one-second deadline so a slow origin cannot consume the
page-response budget.

## Cache-state rules

The artifact preserves Netlify edge and durable states independently from
`X-CipherScan-Cache` and `X-Vercel-Cache`. It also records Next's diagnostic
`X-Nextjs-Cache` and `X-Nextjs-Prerender` headers when present. Application or
framework cache hits never override edge misses.

| Explicit `Cache-Status` member | Normalized state |
| --- | --- |
| `"Netlify Edge"; hit` | `HIT` |
| `"Netlify Edge"; hit; fwd=stale` | `STALE_HIT` |
| `"Netlify Edge"; fwd=stale` | `STALE_MISS` |
| `fwd=miss`, `fwd=uri-miss`, or `fwd=vary-miss` | `MISS` |
| `fwd=bypass` | `BYPASS` |
| Missing or unrecognized explicit status | `UNKNOWN` |

`Age`, cache policy headers, and pair position are diagnostic context, not
proof of a hit or miss. In particular, the first request is not assumed cold
and the second request is not assumed warm. A cancelled first response may not
populate every streaming cache, and repeated requests can reach different edge
nodes, so only response headers classify cache state.

## API list-response cache

Query-bearing `/blocks`, `/txs`, and `/txs/shielded` pages remain dynamic HTML,
but their normalized list API identities use a shared Redis cache. Latest list
responses are fresh for 15 seconds; cursor/archive responses are fresh for 300
seconds. `/api/rich-list` is fresh for 60 seconds. Each family retains a
last-known-good stale response beyond the fresh window and refreshes it in the
background under a short distributed lock. Failed refreshes leave the stale
entry intact. Concurrent first misses within one API process share a single
database load.

The cache is opt-in with `API_LIST_CACHE_ENABLED=1`, namespaced by network, and
bounded per route family. A 50 ms Redis-operation deadline keeps a slow or down
cache from extending API latency; requests then run the original PostgreSQL
path. Only successful response payloads are stored. Redis must remain private
and persistent—it is not an Internet-facing response cache.

Every covered API response emits `X-CipherScan-Cache: HIT|MISS|STALE` and a
`Server-Timing` breakdown. Next consumes but does not forward these upstream
headers, so an HTML response cannot directly expose the API cache state. Use
paired public-API requests for that evidence and the HTML probe for resulting
page TTFB. The API headers remain independent of Netlify edge and Next
route-cache headers, and no state should be inferred from request position.

## Artifact and acceptance

The JSON artifact includes the target manifest, revision label, timing and
scheduling parameters, every observation, diagnostic response headers, and
summaries split by route, pair position, Netlify edge state, Netlify durable
state, application cache state, and exact target. Responses without headers have
`ttfbMs: null`; their elapsed failure time is stored separately and never mixed
into TTFB percentiles.

The threshold is strict: 199.9 ms passes and 200 ms does not. Failed HTTP
responses, redirects, and timeouts remain in the denominator so a fast error
cannot improve the percentage. Generated artifacts are ignored by Git; attach
the raw file to the deployment or release record before removing local output.

## Deterministic validation

```sh
npm run test:ttfb-probe
npm run test:isr-warmup
TEST_REDIS_URL=redis://127.0.0.1:6379 npm --prefix server/api run test:redis
npm run build
npm run test:route-cache-build
```

Require zero skipped tests from `test:redis`. These tests validate the
header/body boundary, body cancellation, timeout and
HTTP error handling, multi-layer cache parsing, serial pair ordering, summary
math, target validation, atomic artifact writes, and the generated Next ISR
manifest. They do not contact production and do not establish live performance.

## Prepare an ISR warm-up plan

The warm-up command is validation-only by default and performs zero network
requests. It accepts absolute, same-origin page URLs from JSON, CSV, TSV, or a
line-delimited file, deduplicates them, and writes an auditable plan.

```sh
npm run perf:warm:isr -- \
  --origin=https://cipherscan.app \
  --input=/path/to/ahrefs-full-export.csv \
  --output=artifacts/perf/isr-warm-plan.json \
  --max-urls=5000 \
  --skip-query
```

`--skip-query` records and drops query-string rows. Without it, any query row
fails validation. The command never warms query variants because the archive
handlers intentionally keep query-dependent HTML dynamic. Relative URLs,
credentials, fragments, redirects, cross-origin URLs, and `/api`, `/_next`, or
`/.netlify` paths are rejected.

Execution requires both an explicit switch and an exact normalized origin
confirmation. It starts at one request per second with one active request,
stops on HTTP 429 or three operational failures, and drains each eligible HTML
body to EOF so a streaming response has a chance to populate ISR. It sends no
cookies, cache busters, custom cache-control, or retries.

```sh
npm run perf:warm:isr -- \
  --origin=https://cipherscan.app \
  --confirm-origin=https://cipherscan.app \
  --input=/path/to/isr-canary.csv \
  --output=artifacts/perf/isr-warm-canary.json \
  --execute
```

The default 500-URL maximum is the production canary bound. Raise `--max-urls`
only after the canary, API health, deployment revision, split sitemaps, and live
cache headers are verified. Populate inputs in this order:

1. The 49 static core, content, and tools sitemap URLs.
2. Bounded cacheable cohorts: up to 100 addresses, 100 recent transactions, and
   100 orphan blocks.
3. Canonical 200 HTML block, transaction, address, and static URLs from the
   complete Ahrefs population export, interleaved by route family.

Exclude names, archive queries, errors, redirects, testnet URLs, API paths, and
unbounded sitemap-shard enumeration. The bounded first two cohorts cover at
most 349 URLs, only 9.2% of the 3,783-page baseline. More than 80% therefore
requires at least 3,027 eligible population URLs from the full export; the
179-row slow-tail export cannot establish that result.

Warm-up artifacts deliberately contain no TTFB score or performance verdict.
A completed request does not prove a URL is globally warm: Netlify edge caches
are node-local and the durable cache is a distinct shared layer. The current
30–60 second detail revalidation windows expire during a population-sized pass;
Next should serve an existing stale ISR entry immediately while regenerating it
in the background, but that behavior still needs confirmation through the live
Netlify cache headers. Treat the separate probe and subsequent Ahrefs crawl as
the only acceptance evidence. See [Next.js ISR](https://nextjs.org/docs/app/guides/incremental-static-regeneration), [Netlify caching](https://docs.netlify.com/build/caching/caching-overview/)
and [Netlify Next.js support](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/).

## Release order

The Express API is deployed separately from the Netlify frontend. A merge or
successful frontend deploy does not release `server/api` changes.

1. Confirm the public API hostname resolves to the intended provider and host,
   and that external TCP 80/443 reach the expected TLS proxy. A repository
   merge cannot repair stale DNS, a stopped server, or a provider firewall.
2. Deploy PR #47 with human approval, verify its revision, and require successful
   `/sitemap-core.xml`, `/sitemap-content.xml`, and `/sitemap-tools.xml`
   responses before generating a new population manifest.
3. Capture the post-PR #47 paired baseline before deploying the separate TTFB
   change.
4. Deploy the frontend-only TTFB change with human approval and record its
   revision in every probe and warm-up artifact.
5. Validate a warm-up plan and execute a 500-URL, full-body canary. Only then
   consider the full eligible population. The header-only TTFB probe cancels
   response bodies and must not be used as the cache population step.
6. Run the serial probe for the scored cache-state distribution. Do not call a
   repeated response warm unless its explicit headers prove a cache hit.
7. Deploy the API list cache as a separate backend rollout only after the real
   Redis integration suite passes. Confirm a representative request exposes a
   `MISS`, its repeat exposes `HIT` or `STALE`, and the public JSON is unchanged.
8. Repeat the serial HTML probe, including archive-query routes. Its application
   cache state remains `UNKNOWN` because Next does not forward the API header;
   correlate it with the separate paired API evidence instead of combining the
   two populations.
9. Run the full-population Ahrefs crawl. Only that crawl can prove the greater
   than 80% all-page target; attach its export, probe artifact, and warm-up
   artifact to the release record.

Paired direct-API probes after the frontend TTFB deployment confirmed that
archive list responses remain the bottleneck, so the API cache ships as a
separate backend rollout.

Stop the rollout if the API health check is unreachable, core routes return a
non-success status, or the frontend revision does not match the intended
release. Caching cannot compensate for an unreachable origin.
