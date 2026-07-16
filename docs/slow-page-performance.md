# Slow-page performance regression

## Baseline

The Ahrefs slow-page export from July 15, 2026 contains the 179 successful,
unrendered HTML requests that took longer than one second. This is the slow
tail of the 3,783-page crawl, not the population baseline. Median total load
time is 10,622 ms (p95 13,629 ms), while median time to first byte is 10,606
ms (p95 13,564 ms). The median difference between TTFB and total load time is
only 46 ms, so this tail is dominated by server response time rather than HTML
body transfer.

Reproduce the baseline analysis with:

```sh
npm run perf:analyze -- /path/to/slow-page-export.csv
```

The main affected groups are `/tx/[txid]`, `/txs`, `/blocks`,
`/txs/shielded`, and `/block/[id]`. Transaction metadata previously fetched
the full API detail payload during server rendering. Archive and metadata
fetches could also consume the platform timeout when the API was slow.

## Fix and regression coverage

Server-rendered archive and metadata requests now have a one-second deadline.
Archive pages keep their cursor-aware initial HTML when the API responds in
time; otherwise they render the existing unavailable state and their client
components retry. Transaction metadata uses `/api/seo/tx/:txid`, a single-query
summary endpoint. Block metadata continues to use `/api/block/:id?summary=1`,
which avoids loading transaction details.

Run the deterministic regression suite with:

```sh
npm run test:performance
```

The suite simulates a hung upstream, exercises all three archive page fetches,
checks the metadata endpoints and deadlines, and verifies that transaction
metadata performs one database query without input, output, or bridge fan-out.

## Deployment verification

Probe a representative, round-robin sample of route groups from the same
export after deployment:

```sh
npm run perf:probe -- /path/to/slow-page-export.csv \
  --limit=20 \
  --load-threshold-ms=2000 \
  --ttfb-threshold-ms=2000 \
  --timeout-ms=5000
```

The probe records TTFB when the response headers arrive, then consumes the
full HTML response body and records total load time separately. It exits
nonzero when a response is unsuccessful, times out, exceeds either threshold,
or fails while reading the body. Acceptance for the slow-load regression is
zero failures, p95 total load below 2,000 ms, and no shift of the old >2s
cohort into the 1-2s bucket. Use `--base-url=http://localhost:3000` to exercise
the same paths against a local or staging frontend. The legacy
`--threshold-ms` option still sets both thresholds for compatibility.

Deploy the API and frontend from the same revision. If they must be staggered,
deploy the API first so `/api/seo/tx/:txid` exists before the frontend begins
requesting it. Retain the post-deployment probe output with the deployment
record so it can be compared directly with the baseline above.
