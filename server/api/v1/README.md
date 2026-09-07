# ZecBlock API v1

The frontend now uses `/v1` for explorer HTTP data, with one checked `{data, meta}`
parser for browser and server consumers. The manifest has 142 entries: 137 adapters,
4 native name routes, and one superseded legacy blocks alias. No implemented
capability is represented by a v1 stub. Production activation is a separate release.

## Contract and coverage

- `inventory/manifest.js` is the route/method/authority registry. Routes with literal
  names register before parameter routes, so `/uncles/stats` is not a hash lookup.
- `inventory/query-parameters.json` includes direct query reads and the shared
  limit/offset and limit/page helpers. Unknown, repeated or structured parameters
  receive HTTP 400. Source handlers retain their domain-specific value validation.
- Successful responses use `{data, meta}`. Top-level legacy `success` is removed;
  nested fields, arrays, zero and null retain their meaning. Errors use RFC 9457
  `application/problem+json`, preserve HTTP status and are never cached.
- `meta.generatedAt` is response generation time. Unknown source observation time
  and source height stay null. A current indexer tip is not a historical snapshot
  height. Missing age is `freshness.status=unknown`, not an invented fresh reading.
- Declared authoritative zatoshi fields are decimal strings. Address totals use
  exact source `*Zat` fields before legacy numeric fields; unsafe numeric amounts
  fail closed. Existing formatted ZEC/USD/percentage fields remain field-defined.
  Do not multiply a formatted float to manufacture an authoritative zatoshi value.
- Blocks, transactions, shielded flows and names expose `meta.page` with opaque
  cursors. Chain cursors bind the route and filters. Lists probe beyond the source's
  100-row ceiling and use complete tie-break keys, including transaction hashes
  when fully shielded transactions share a timestamp. Other domain-specific
  paginated payloads retain their documented bounded page/offset semantics.
- Name routes use the configured ZNS JSON-RPC service, normalize keys and expose
  bounded pagination. Voting-chain RPC and WebSockets remain separate protocols.
- Fork-monitor writes forward the caller's ownership token. Paid signal routes
  forward only their existing authorization/payment headers and never receive
  the adapter's internal service key. Payment challenge/receipt headers survive;
  HTTP 402 includes the original challenge in `problem.paymentRequired`.
  Authenticated responses use `private, no-store`. No payment is made by v1 itself.
- Scans have bounded block windows and rate limits. The wallet UI divides its
  supported 50,000-block window into 10,000-block requests and honors Retry-After
  and cancellation. Viewing keys remain in the browser.

Generate the API reference and OpenAPI from their source registries:

```sh
node server/api/v1/tools/query-inventory.js
node server/api/v1/tools/write-reference.js
node server/api/v1/tools/write-openapi.js
```

`server/api/openapi/v1.yaml` and `lib/generated/api-reference.json` are checked
artifacts. Core envelope, errors, queries and units are specified; domain payloads
retain their established fields. Generic domain schemas are not evidence that
all possible payload states have been validated.

## Private local testing

Run `npm run dev:v1` and `npm run dev` in separate terminals. The preview binds
only `127.0.0.1:3002`, fetching deployed mainnet data. Keep the ignored `.env.local`:

```dotenv
NEXT_PUBLIC_NETWORK=mainnet
NEXT_PUBLIC_API_URL=http://127.0.0.1:3002
CIPHERSCAN_API_URL=http://127.0.0.1:3002
NEXT_PUBLIC_WS_URL=wss://api.mainnet.cipherscan.app
```

Consumers append `/v1/...`, so base URLs omit that suffix. The preview rejects
foreign browser origins, non-loopback Host headers and writes. No shared preview
secret enters a browser bundle. Restart the Node preview after backend edits;
Next.js normally picks up frontend edits automatically.

For new source-handler validation against server-held data, the optional
`dev-mainnet-source.js` runs in a separate temporary checkout on the server.
It requires `V1_PRIVATE_SOURCE=true`, an explicit `V1_SOURCE_ENV_FILE`, and binds
only `127.0.0.1:3003`. It mounts the changed transaction-list/address handlers and the new search-interest read,
with a two-connection PostgreSQL pool enforcing read-only transactions and
8-second statement deadlines. It starts no indexer, Redis worker or production
service. Remaining reads use the existing local legacy API. Reach it through an
SSH local forward, then start `dev:v1` with
`V1_PREVIEW_UPSTREAM=http://127.0.0.1:<forwarded-port>`.
Never expose either development entry point publicly. Stop both with Ctrl-C.
No schema changes are applied by these helpers.

## Deployment and compatibility

`server/api/server.js` mounts the router under `/v1`, behind the existing CORS,
security and request limiter. V1 owns its 1 MB JSON parser and problem errors.
The feature gate defaults closed. `API_V1_ENABLED=true` requires
`X-API-Preview-Key` until `API_V1_LAUNCHED=true`; an absent preview key fails closed.
A publicly reachable preview gate can reveal its existence through a 401, so
use loopback/SSH access when the hostname must remain undiscoverable.

The intended mainnet base is `https://api.zecblock.com`. This code does not create
DNS/TLS or change production flags. Configure the host, allowed web origins,
WebSocket origin, and backend before shipping a frontend that depends on them.
Testnet and Crosslink retain explicit network configuration and indexation policy.

Adapters still call the existing handlers over bounded internal HTTP. They reuse
business logic but add a hop and JSON serialization; inspect `Server-Timing` and
measure release latency. Native shared service extraction can remove that hop
later. **Do not delete the legacy handlers while adapters depend on them.** Keep
external legacy compatibility until its consumers have migrated; no sunset date
has been selected. Do not redirect old URLs to incompatible payload shapes.

Relevant settings are documented in `config.js`: internal origin, timeout
(default 8 seconds), response limit (50 MiB), network, and scan limits.
`V1_INTERNAL_SERVICE_KEY` can bypass the legacy read limiter in a trusted deployment;
it must not bypass ownership or payments. Dedicated deployments need their own
CORS and global request limiting; the private development server is not a public
hosting configuration. Writes preserve source behavior and are not automatically
retried after an ambiguous timeout.

## Verification

```sh
npm run test:v1 --prefix server/api
npm run test:frontend
npm run test:server-regressions
npm run lint
npx tsc --noEmit
npm run build
npm run test:route-cache-build
# Optional local PostgreSQL integration; only temporary tables are created:
npm run test:v1-postgres
```

The route suite exercises every adapter with controlled source fixtures, payment
and ownership boundaries, name pagination, cursor traversal and malformed/error
responses. Browser checks and private mainnet reads complement these tests;
neither mock tests nor HTTP 200 alone establish production readiness. Database
migrations, new data feeds, write flows and each deployed network still require
release acceptance. See the private wiki's ZecBlock launch checklist.
