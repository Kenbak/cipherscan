# Slow-page performance regression

## Baseline

The Ahrefs slow-page export from July 15, 2026 contains 179 successful,
unrendered HTML requests. Median time to first byte is 10,606 ms and p95 is
13,564 ms. The median difference between TTFB and total load time is only 46
ms, so this is a server-response problem rather than a browser rendering
problem.

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
  --threshold-ms=2000 \
  --timeout-ms=5000
```

The command exits nonzero when a response is unsuccessful, times out, or has
TTFB above 2,000 ms. Acceptance is zero failures and p95 TTFB below 2,000 ms.
Use `--base-url=http://localhost:3000` to exercise the same paths against a
local or staging frontend.

Deploy the API and frontend from the same revision. If they must be staggered,
deploy the API first so `/api/seo/tx/:txid` exists before the frontend begins
requesting it. Retain the post-deployment probe output with the deployment
record so it can be compared directly with the baseline above.
