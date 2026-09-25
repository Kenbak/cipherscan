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
foreign browser origins, non-loopback Host headers and writes. The one POST
exception is `/v1/ask/chat`, forced to reviewed-guide mode with paid AI disabled.
No shared preview
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

## Ask contextual assistant

Mainnet `POST /v1/ask/chat` accepts a validated page ID, question (1,000 characters),
optional analysis recipe, response locale and at most four previous questions.
The server selects reviewed public knowledge and/or fetches allowlisted analytics.
It exposes no SQL, arbitrary URL, shell, wallet or write tools to the model.
Sources come from `lib/ask-knowledge.js`; update their review dates when reviewing
official material. The private wiki is not a retrieval source. Dynamic record
pages currently receive conceptual guides, not analysis of that specific record.
Answer schemas permit only known numeric fact placeholders and supplied source
IDs. Citations are separate from prose. Final validation still rejects all Unicode
numeric literals, unknown placeholders and markup; schemas do not prove semantic
accuracy. Both answer paths constrain decoding to exact fact placeholders. Explanation caches
use v3. `lib/ask-insights.js` derives combined pool growth/share, observed lead dates,
complete rolling-week changes, recent pace, peaks/concentration and coverage with
integer arithmetic. Stock intervals require both endpoints and consecutive dates;
flow/count comparisons sum complete daily buckets. Missing observations stay unknown.
Narration leads with comparative findings; generic limitations are optional. No
extra model calls, SQL access or new public datasets are introduced.

The global mainnet widget and full Ask workspace share this endpoint. Opening the
widget or changing chart controls does not invoke paid inference. With no provider,
exact page-guide/product prompts and guided chart recipes remain usable in English.
Multilingual contextual answers require a configured and evaluated model.

Paid mode requires all of these **backend** settings:

- `ASK_ENABLED=true`, `ASK_PROVIDER=openai|anthropic`, `ASK_MODEL`, `ASK_API_KEY`.
- `ASK_DAILY_CALL_LIMIT` (1–10,000), `ASK_DAILY_BUDGET_USD`,
  `ASK_MONTHLY_BUDGET_USD` (each positive, at most 1,000 USD).
- `ASK_MAX_INPUT_USD_PER_MILLION`, `ASK_MAX_OUTPUT_USD_PER_MILLION`: reviewed
  upper bounds covering the selected model's applicable regional/cache premiums.
- `ASK_ABUSE_SECRET` (at least 32 characters), `ASK_TURNSTILE_SECRET`,
  `ASK_TURNSTILE_SITE_KEY`, `ASK_TURNSTILE_HOSTNAME` (exact frontend hostname).
- Ready shared `app.locals.redisClient`. Configure durable, non-evicting storage
  for allowance counters; losing/resetting them invalidates cumulative limits.
- Optional OpenAI `ASK_REASONING_EFFORT`, supported by the selected model.

Only the public Turnstile site key is returned to browsers. Server verification
requires the configured hostname and `ask` action. Distributed limits admit five
requests per UTC minute and twenty per day per daily HMAC of the trusted client IP.
Verify reverse-proxy attribution before launch. IP quotas are not user identity;
attackers can rotate IPs or exhaust the shared allowance.

Atomic Redis reservations charge each provider call's conservative maximum against
both UTC day/month budgets before dispatch, including selection and explanation
separately. They use UTF-8 request bytes plus wrapper headroom, reviewed price
bounds and 500 output tokens. This is a conservative reservation ledger, not
measured invoice reconciliation; uncertain/failed calls receive no refund.
There are no automatic retries; three concurrent calls, 15-second provider
deadlines, 35-second operation deadlines and bounded bodies limit work. Missing
configuration, Redis failures or exhausted allowances fail closed. Also configure
provider-side controls; deployment-reviewed tokenization/pricing remains necessary.

Only generic public explanations are cached for five minutes by model, locale,
recipe, reviewed documents and evidence fingerprint. Arbitrary questions/history
are not cached or logged by Ask. Audit infrastructure/APM logging separately.
The provider processes submitted text; `store:false` is not zero retention or
end-to-end privacy. Off-topic intent filtering and provenance checks do not prove
jailbreak resistance or semantic accuracy. Real-model multilingual/adversarial
evaluation, least-privilege runtime/egress review and live bot/cost tests remain
launch gates. No paid configuration or production deployment is included here.

A September 25 private GPT-6 Luna probe (`reasoning_effort=none`) passed the final
15 scripted knowledge/analytics/language/refusal cases and four repeated French
follow-ups after fixing citation/fact-placeholder confusion. These bounded live
checks do not establish comprehensive jailbreak resistance, live Turnstile
verification or production spending enforcement. The key was held only in the
test process memory; the public feature and loopback preview remain provider-off.

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
