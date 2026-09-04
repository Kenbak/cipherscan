# CipherScan API v1 — contract foundation

Status: **preview / not launched**. Nothing in this directory is wired into
`server/api/server.js` yet — that file was intentionally left untouched (see
"Mount instructions" below for exactly what the parent change needs to do).

## Architecture status: transitional dark-launch bridge — NOT the final design

**Read this before treating anything below as a permanent architecture.**
`/v1` is currently implemented as a **loopback reverse proxy** in front of
the legacy Express API: every adapter forwards the request over an internal
HTTP call (`lib/internal-client.js`) to the already-running legacy handler,
then reshapes the JSON response into the v1 contract. This is a deliberate,
temporary bridge chosen because it lets a stable public contract ship
*today*, without editing `server/api/server.js` or any legacy route file,
and without duplicating a single line of business SQL.

It is **not** presented as top-class or final. Concretely, it costs:

- **An extra network hop + JSON re-serialization per request.** This is
  measured, not hand-waved: every adapter response carries a
  `Server-Timing: internal;dur=<ms>` entry for exactly this hop (see
  `lib/headers.js`), so the cost is visible in production, not buried.
- **A second place a contract can drift.** If a legacy response shape
  changes, a v1 adapter's assumptions can silently break. Mitigated (not
  eliminated) by the contract tests in `server/api/test/v1/`.
- **No ability to make a slow legacy query fast.** v1 inherits whatever
  performance and caching the legacy handler already has.

**Intended migration path**, once `/v1` traffic and the contract shape are
validated in dark launch: migrate individual adapters, one at a time, off
the loopback proxy and onto a real data-access layer (shared query modules
callable directly from `/v1`, or a proper internal gateway/service) —
deleting `lib/internal-client.js`'s role for each migrated route as it
goes, rather than proxying indefinitely. Do not build new, permanent
product surface on top of the proxy pattern; treat every route currently
marked `status: 'adapter'` in the manifest as "correct today, due for a
native implementation later."

## What this is

A versioned, contract-stable API layer that sits in front of the legacy
Express routes in `server/api/routes/**`. It does not duplicate any business
SQL. Every `/v1` route either:

1. **adapts** — proxies to the equivalent legacy endpoint over the internal
   HTTP bridge described above and reshapes the response into the standard
   envelope (optionally after v1-layer request validation and/or rate
   limiting — see "Scan endpoints" below), or
2. **stubs** — is inventoried as a NON-public endpoint that isn't safe to
   expose under `/v1` yet, and returns `501` (RFC 9457 problem+json). As of
   this revision, **every `public`-classified manifest entry is an
   adapter** — there are no public stubs; see "Scan endpoints" below for
   why the two scan endpoints, in particular, are adapters-with-guardrails
   rather than stubs, and `server/api/test/v1/manifest.test.js` for the
   test that enforces this invariant going forward, or
3. is simply **excluded** — internal/ops/private/deprecated legacy endpoints
   that are out of the v1 public-contract scope, or superseded by another
   entry that IS adapted.

The full classification lives in [`inventory/manifest.js`](./inventory/manifest.js)
and is the single source of truth for both the mounted routes
(`routes/index.js` builds the router straight from it) and the generated
OpenAPI 3.1 spec at [`server/api/openapi/v1.yaml`](../openapi/v1.yaml).

## Directory map

```
server/api/v1/
  index.js                  factory: createV1Router(envOverrides?) -> express.Router
  config.js                 env var parsing (API_V1_ENABLED, preview key, ...)
  openapi.js                builds the OpenAPI document from the manifest
  tools/write-openapi.js    regenerates server/api/openapi/v1.yaml
  inventory/manifest.js     the endpoint inventory + v1 route mapping (source of truth)
  middleware/
    feature-gate.js         API_V1_ENABLED / preview-key gate
    request-context.js      requestId, network, lazy indexedHeight resolution
  lib/
    internal-client.js      loopback HTTP dispatcher to the legacy API (no SQL, no imports of route files) — TRANSITIONAL, see above
    build-route.js          generic adapter/stub handler factory driven by manifest entries
    envelope.js              {data, meta} success envelope
    problem.js               RFC 9457 error envelope
    cursor.js                opaque cursor encode/decode + page meta builder
    zatoshi.js                decimal-string zatoshi serialization helpers
    headers.js                relays the allowlisted legacy response headers + adds Server-Timing for the internal hop
    rate-limit.js             dependency-free per-IP sliding-window limiter (currently: scan endpoints)
    scan-validation.js        v1-layer cost/range validation for the two scan endpoints
  routes/index.js            assembles the Express Router from the manifest
server/api/openapi/v1.yaml   generated OpenAPI 3.1 spec (do not hand-edit)
server/api/test/v1/          node:test suites (manifest, envelope/zatoshi/cursor, routing, internal-client, OpenAPI drift)
```

## Mount instructions (for the parent change)

`server/api/server.js` is intentionally unmodified. To go live, the parent
change needs exactly this, added near the other route mounts (after
`app.locals.pool` / other locals are set up — the v1 router does not read
`app.locals`, but mounting it after body-parser/CORS/helmet keeps behavior
consistent with the rest of the app):

```js
// server/api/server.js  (illustrative — not applied by this change)
const createV1Router = require('./v1');
app.use('/v1', createV1Router());
```

That's the entire integration surface. `createV1Router()`:

- reads its own env vars (see `config.js`) — it does not need anything
  from `app.locals`,
- brings its own body parser (`express.json()`) scoped to the `/v1`
  sub-router,
- proxies to the legacy endpoints via internal HTTP calls to
  `V1_INTERNAL_API_BASE_URL` (defaults to `http://127.0.0.1:3001`, i.e. the
  same process/port `server.js` already listens on) — so mounting it
  in-process on the existing server, exactly as shown above, works with
  zero additional infrastructure.

### Required/relevant env vars

| Var | Default | Purpose |
|---|---|---|
| `API_V1_ENABLED` | `false` | Master switch. `false` → every `/v1/*` request gets a generic 404 (indistinguishable from an unmounted route). |
| `API_V1_LAUNCHED` | `false` | Once `true`, the preview-key requirement is dropped (general availability). |
| `API_V1_PREVIEW_KEY` | *(unset)* | Shared secret preview testers send as `X-API-Preview-Key`. If `API_V1_ENABLED=true` and this is unset, the gate **fails closed** (401 on every request) rather than failing open. |
| `V1_INTERNAL_API_BASE_URL` | `http://127.0.0.1:3001` | Where adapters proxy to. Only needs to change if `/v1` is later split onto a genuinely separate host/process from the legacy monolith (see "Dedicated API hosts" below). |
| `V1_INTERNAL_SERVICE_KEY` | *(unset)* | If set, sent as `X-Service-Key` on internal proxy calls so they bypass the legacy rate limiter, matching how Vercel ISR/CipherPay already bypass it (`SERVICE_API_KEYS` in `server.js`). Recommended for production. |
| `V1_INTERNAL_TIMEOUT_MS` | `8000` | Per-request timeout for the internal proxy hop. |
| `V1_INTERNAL_MAX_RESPONSE_BYTES` | `52428800` (50MB) | Max buffered size of one internal-dispatch response. Matches the existing upstream Zebra RPC cap (`MAX_RPC_RESPONSE_BYTES` in `server/lib/zebra-rpc.js`) — chosen specifically so v1 does not reject a legacy payload the rest of the stack already treats as valid (e.g. the measured **~10.4MB** `/api/migration/scatter` response, or a large block). A transport safety net against a truly runaway response, not a product-level size limit. |
| `NEXT_PUBLIC_NETWORK` | `testnet` | Reused as-is; surfaced in every response's `meta.network`. |
| `V1_SCAN_ORCHARD_MAX_RANGE` | `50000` | Max block-height range per `/v1/scan/orchard` request (legacy allows up to 1,000,000; v1 tightens this — see "Scan endpoints" below). |
| `V1_SCAN_ORCHARD_RATE_LIMIT_MAX` / `_WINDOW_MS` | `5` / `60000` | Per-IP rate limit for `/v1/scan/orchard`. |
| `V1_SCAN_LIGHTWALLETD_MAX_RANGE` | `10000` | Max block-height range per `/v1/scan/lightwalletd` request (legacy allows up to 50,000). |
| `V1_SCAN_LIGHTWALLETD_RATE_LIMIT_MAX` / `_WINDOW_MS` | `3` / `60000` | Per-IP rate limit for `/v1/scan/lightwalletd`. |

### Recommended rollout sequence

1. Deploy with `API_V1_ENABLED=false` (no-op; safe to ship immediately).
2. Set `API_V1_ENABLED=true`, `API_V1_PREVIEW_KEY=<secret>`, and
   `V1_INTERNAL_SERVICE_KEY=<one of SERVICE_API_KEYS>`. Share the preview
   key with invited testers only — this stage intentionally reveals that
   `/v1` exists (401, not 404) to anyone who probes it, which is fine for a
   named preview but is why step 1's default must stay `false` until you're
   ready for that.
3. Once the contract is stable, set `API_V1_LAUNCHED=true` to drop the
   preview-key requirement for general availability.

### "Dedicated API hosts" — what this does and doesn't set up

The task called for a router "intended for mounting at `/v1` on dedicated
API hosts." This implementation supports that without requiring it on day
one:

- **Today**: mount it in the existing `server.js` process, as shown above.
  `V1_INTERNAL_API_BASE_URL` defaults to the same loopback address, so this
  works with zero extra infrastructure.
- **Later, if desired**: run `createV1Router()` in a *separate* Node
  process/container (its own tiny `app.use('/v1', createV1Router())` on a
  new Express app, or behind Caddy on a new subdomain) and point
  `V1_INTERNAL_API_BASE_URL` at the legacy monolith's internal address. No
  code changes are required to move from one topology to the other — the
  adapter layer only ever talks to the legacy API over HTTP, never via
  direct imports, in-process function calls, or its own DB/Redis
  connections. This is also why `server/api/server.js` didn't need editing
  beyond the one `app.use('/v1', ...)` line: the two layers are decoupled
  by an HTTP boundary, not a module boundary.

## Contract conventions

- **Success envelope**: `{ "data": ..., "meta": {...} }`. See
  `lib/envelope.js` / `openapi.js` (`Meta` schema) for the exact fields
  (`requestId`, `network`, `generatedAt`, `indexedHeight`, `cache`,
  optional `dataAgeSeconds`/`warnings`/`page`).
- **Errors**: RFC 9457 `application/problem+json`. See `lib/problem.js`
  for the registry of `type` slugs (`validation-error`, `not-found`,
  `not-migrated`, `upstream-error`, etc.).
- **Cursors**: opaque, base64url-encoded, versioned envelopes
  (`lib/cursor.js`). Clients must treat `meta.page.nextCursor` /
  `prevCursor` as opaque — internally they carry exactly the legacy
  endpoint's own pagination params, re-encoded, so the proxy never needs
  per-route cursor-field logic beyond the small `cursorMap` declared in the
  manifest entry.
- **Zatoshi values**: represented as decimal strings (never floats), via
  `lib/zatoshi.js`. **Important caveat**: this can only be done losslessly
  where the legacy handler still returns the raw integer column. Several
  legacy endpoints (documented per-entry in the manifest via
  `zatoshiConfidence` / `knownPrecisionCaveat`, e.g. `/api/tx/:txid` and
  `/api/rich-list`) already convert to a ZEC float (`value / 100000000`)
  *before* this proxy ever sees the response — that precision loss already
  happened upstream and cannot be undone here without querying the database
  directly, which would duplicate business SQL (explicitly out of scope).
  Those responses are passed through with a `meta.warnings` entry rather
  than silently mis-labeled as authoritative zatoshi integers.
- **Response headers**: only an explicit allowlist of legacy response
  headers is relayed onto the v1 response — `Cache-Control`, `ETag`,
  `Retry-After`, the `RateLimit-*`/`X-RateLimit-*` quota families, and any
  `X-CipherScan-*` header (see `ALLOWED_RESPONSE_HEADERS` in
  `lib/internal-client.js`). This is deliberate: caching and rate-limit
  semantics must survive the proxy hop (so v1 doesn't silently disable
  CDN/browser caching or quota signaling that already works today), but
  arbitrary legacy headers — `Set-Cookie`, `Server`, `X-Powered-By`, etc. —
  must never leak through. v1 also strips its own host framework's
  `X-Powered-By` and adds its own `Server-Timing: internal;dur=<ms>` entry
  for the internal-hop cost (kept distinct from any legacy timing so it's
  unambiguous which hop a given number measures). See
  `server/api/test/v1/routes.test.js` ("header relay: ...") and
  `server/api/test/v1/internal-client.test.js` for the allowlist tests.

## Scan endpoints: public coverage with v1-only guardrails

`/v1/scan/orchard` and `/v1/scan/lightwalletd` are `public` in the
manifest, so per the "complete public coverage" requirement they are
**adapters**, not stubs. Their legacy handlers already bound worst-case
cost (max 1,000,000 / 50,000 block ranges respectively — see
`server/api/routes/scan.js`), but that's a bigger cost knob than is prudent
to hand out on a newly-discoverable `/v1` surface with no other write
history. Rather than reclassify them non-public without concrete product
evidence to justify it, v1 adds two independent layers in front of the
existing legacy protections (`lib/scan-validation.js`, `lib/rate-limit.js`,
wired in per-entry via the manifest's `validateKey`/`rateLimitKey`):

1. **Stricter range validation, evaluated before any legacy dispatch:**
   - `/v1/scan/orchard`: range capped at `V1_SCAN_ORCHARD_MAX_RANGE`
     (default 50,000 blocks vs. legacy's 1,000,000).
   - `/v1/scan/lightwalletd`: range capped at `V1_SCAN_LIGHTWALLETD_MAX_RANGE`
     (default 10,000 — tighter than orchard, because lightwalletd scanning
     is far more expensive per block: gRPC + parallel streaming + optional
     disk cache writes). **v1 also requires an explicit `endHeight`** —
     unlike legacy, which defaults a missing `endHeight` to the current
     chain tip (an open-ended-until-resolved request shape v1 does not
     accept from a public, unauthenticated caller).
2. **Per-IP rate limiting**, independent of the legacy API's own global
   limiter: 5/minute (orchard) and 3/minute (lightwalletd) by default.
   In-memory, per-process — see `lib/rate-limit.js`'s docblock for why
   `express-rate-limit` was deliberately not used, and the same
   multi-instance caveat the existing WebSocket fallback limiter in
   `server.js` already carries.

If product data later shows these should be non-public instead (e.g. abuse
patterns, negligible legitimate public usage), that's a valid outcome too —
but it needs to be a decision backed by that evidence, not a default taken
to avoid building the guardrails.

## Known caveats / follow-ups (read before relying on this in production)

1. **Query-parameter forwarding is verbatim, not allowlisted.** Adapters
   forward the client's full query string to the legacy endpoint as-is.
   Safety currently relies entirely on each legacy handler already
   validating/clamping its own inputs (true today for every adapted route,
   per repo convention). A follow-up should add explicit per-route query
   schemas at the v1 layer itself instead of depending solely on the
   legacy side.
2. **Write-route retry semantics are not idempotent at the v1 layer.**
   `/v1/transactions/broadcast`, `/v1/uncles/reports`, and
   `/v1/crosslink/fork-monitor/nodes` proxy straight through to legacy
   handlers that already have their own safeguards (mempool-level
   idempotency, IP/name rate limiting), but the v1 proxy itself adds no
   idempotency key. A client retry after an internal-hop timeout could
   theoretically double-submit; for `/v1/transactions/broadcast` this is
   low-risk (re-broadcasting an unchanged signed tx is harmless), but it's
   worth a dedicated idempotency-key design before GA.
3. **One endpoint is excluded for a reason worth escalating, not just
   engineering convenience:** `DELETE /api/crosslink/fork-monitor/report/:name`
   has **no authentication upstream** — anyone who knows/guesses a node
   name can delete its report today. This was not introduced by this
   change; it's flagged here because v1 deliberately does *not* extend
   that unauthenticated destructive mutation onto a new, more discoverable
   surface. Recommend adding an ownership token or service-key requirement
   to the legacy endpoint, then revisiting inclusion. (The two scan
   endpoints are no longer excluded/stubbed — see "Scan endpoints" above.)
4. **Paid/gated `signals` endpoints are out of scope.** `/api/signals/*`
   uses an x402/CipherPay payment flow (`Authorization: Bearer`/`Payment`
   headers). Proxying a payment-gated endpoint correctly needs its own
   design (header forwarding, replay considerations) and was deliberately
   left out of this first contract pass — see the manifest entries
   (`classification: 'private'`) for the exact endpoints.
5. **`indexedHeight` is best-effort.** It's resolved via one extra internal
   call to legacy `/api/info` per request that asks for it, and is `null`
   on failure rather than fabricated. Under load this adds one additional
   proxied request for any adapter that opts in — currently only the
   request-context helper exists; individual adapters don't yet call
   `req.v1.resolveIndexedHeight()` (wiring that in per-route, or batching it
   once per process on a short interval instead of per-request, is a good
   next step before GA).
6. **This inventory only covers files under `server/api/routes/**` and
   `server/signals/api.js`.** `/api/grpc-status`, registered directly in
   `server/api/server.js` rather than a route file, is out of scope per the
   task's own boundary ("inventory... from route files") — flagging it
   explicitly rather than silently omitting it.
7. **CORS/rate-limiting**: this router does not apply its own CORS or rate
   limiting. Mounted in-process (per the default instructions above), it
   inherits `server.js`'s `helmet()`, CORS, and `express-rate-limit`
   middleware, which run before `app.use('/v1', ...)` in the middleware
   chain. If `/v1` is later split onto a genuinely separate host, that host
   needs its own equivalent CORS/rate-limit configuration — nothing here
   provides it standalone.
