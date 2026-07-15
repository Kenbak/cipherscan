# CipherScan SEO implementation plan

This document maps the Ahrefs findings to the code that controls crawling,
indexation, metadata, and discoverability. It is the implementation reference
for the SEO foundation branch; editorial wording is reviewed separately in
`docs/seo-editorial-review.md`.

## Goals and ordering

1. Establish `CipherScan` as the unambiguous site and organization name.
2. Rank the homepage and useful explorer pages for Zcash explorer searches.
3. Make real block, transaction, address, and name entities discoverable by
   their exact identifiers without creating infinite empty URL spaces.
4. Support the indexable Zcash testnet/TAZ experience while keeping the
   Crosslink deployment out of the index for now.
5. Improve typo recovery through strong brand/entity signals and redirects,
   not keyword-stuffed typo pages.

## SEO control surface

| Concern | Primary files | Responsibility |
| --- | --- | --- |
| Site identity and defaults | `app/layout.tsx`, `lib/seo.ts` | Site URL, network identity, complete social defaults, robots defaults, and site JSON-LD |
| Crawler policy | `app/robots.ts`, route metadata | Mainnet/testnet allow crawling; Crosslink remains blocked and noindex; `/api/` is excluded |
| XML discovery | `app/sitemap.ts`, `lib/newsletter/index.ts` | Deployment-specific static URLs, all newsletter issues and registered Zcash Names, recent canonical chain entities, persistent orphan hashes, and a bounded set of active transparent addresses |
| Redirects | `next.config.ts` | Permanent legacy-route aliases and canonical host/path consolidation |
| Static page metadata | Route `layout.tsx` and `page.tsx` files | Unique title, description, canonical, OG, Twitter, robots, and page intent |
| Dynamic entity metadata | `lib/seo.ts`, `app/block/[height]/layout.tsx`, `app/tx/[txid]/layout.tsx`, address/name layouts | Entity validation, state-aware indexation, immutable canonical identity, and exact identifier copy |
| Dynamic rendering/status | Dynamic `page.tsx` files and API routes | Server-rendered H1/core facts, real 404/5xx behavior, and hydrated live data |
| Crawl graph | List pages, pagination, block/tx/address links, footer/navigation | Stable links to detail entities and URL-backed cursor pagination |
| Structured data | Root and route layouts/pages | `WebSite`, `Organization`, `WebPage`, `CollectionPage`, `ItemList`, `Article`, breadcrumbs, and entity properties |
| Social imagery | `public/og-image.png`, future route `opengraph-image.tsx` files | Correct fallback now; route/entity-specific cards in a later image pass |
| API cache/state | Next API routes, `server/api/routes/*`, indexer state | Distinguish found, pending, confirming, dropped, absent, and unavailable states |

## Indexation policy

| Entity or route | Mainnet | Testnet | Crosslink |
| --- | --- | --- | --- |
| Homepage | Index | Index; explicitly describe Zcash testnet and TAZ | Noindex |
| Canonical-chain block heights | Index; primary canonical URL | Index; primary canonical URL | Noindex |
| Canonical block-hash lookup aliases | Index/follow; canonical to current height | Same | Noindex |
| Persistent orphan block hashes | Index with explicit orphan status | Index with explicit orphan status | Noindex |
| Confirmed transactions | Index | Index | Noindex |
| Mempool and confirming transactions | Index with short cache | Index with short cache | Noindex |
| Known dropped/reorg-removed transactions | Persistent explanatory page, noindex/follow | Same | Noindex |
| Unknown or malformed entities | Real 404; no canonical | Real 404; no canonical | Real 404 |
| Active public addresses | Index after checksum validation and evidence of activity | Index where supported | Noindex |
| Empty or shielded addresses without public evidence | Noindex/follow | Noindex/follow | Noindex |
| Registered Zcash names | Index | Noindex until testnet support is confirmed | Noindex |
| Available names | Useful 200 tool page, noindex/follow | Noindex | Noindex |
| Crosslink-only routes | Noindex or unavailable outside their deployment | Noindex | Noindex while the deployment is blocked |

## Canonical rules

- `/block/<height>` is the self-canonical URL for the block currently on the
  canonical chain at that height. Lists, pagination, navigation, and rolling
  sitemap entries use height URLs as their primary block links.
- `/block/<hash>` remains a supported lookup URL. When the hash is on the
  canonical chain, it renders the block and canonicalizes to `/block/<height>`;
  it does not permanently redirect, so direct hash lookup remains usable and a
  later reorg can change the hash page's state safely.
- A persistent orphan block at `/block/<hash>` is self-canonical and indexable,
  clearly identifies its orphan status, and links to the replacement block's
  canonical height URL.
- Transaction IDs are separate immutable entities at `/tx/<txid>`.
- Hashes and transaction IDs are normalized to lowercase. Zcash addresses are
  not case-normalized. Zcash names are normalized to lowercase.
- Parameterized filters canonicalize to a dedicated stable path when one
  exists; otherwise they remain noindex. Cursor pagination is self-canonical.
- Canonical and `og:url` values must always match the current deployment.

## Delivery phases

### Phase 1 — foundation (this branch)

- Unify deployment-aware metadata and robots policy.
- Fix broken internal routes with permanent redirects.
- Fix nested and hardcoded canonical errors.
- Complete OG/Twitter fallbacks and newsletter metadata.
- Include omitted static routes/newsletters plus recent height-based block and
  transaction URLs, orphan hashes, active transparent addresses, and registered
  Zcash Names in the sitemap.
- Correct block-to-transaction association to use block hashes during reorgs.
- Improve block hash linking and canonical identity.
- Add an SEO shipping checklist for future routes and features.
- Record every proposed visible/meta copy change for editorial approval.

### Phase 2 — crawlable archives (implemented in this branch)

- Make block and transaction cursor pagination URL-backed and server-rendered.
- Give forward archive pages stable canonical crawl paths while keeping
  filtered and reverse-navigation variants out of the index.

### Phase 3 — expanded discovery and notifications

- Add sharded historical block, orphan block, and confirmed transaction
  sitemaps (maximum 50,000 URLs per shard).
- Expand address discovery beyond the bounded rolling set only after
  cryptographic checksum validation and crawl-budget review.
- Add IndexNow notifications for durable state transitions: new block, pending
  transaction first-seen, confirmation, drop/reorg, and newsletter publication.

### Phase 4 — authoritative dynamic responses (partially implemented)

- Block, transaction, address, and name routes now server-render their identity
  and share cached resolution with metadata. The Crosslink finalizer remains a
  noindex client route while that deployment is blocked.
- Invalid and authoritatively absent entities now return a real 404. A route
  stays 200/noindex only when a required upstream lookup is unavailable or its
  absence cannot yet be treated as authoritative.
- Persist transaction lifecycle states (`pending`, `confirming`, `confirmed`,
  `dropped`) from mempool/indexer events so indexation can follow a retained
  history instead of live API state alone.
- Block, transaction, address, and name routes now server-render the unique H1,
  full identifier, core status/facts, and structured data.

### Phase 5 — cards, performance, and measurement

- Create route/entity-specific Open Graph images in a separate design pass.
- Expand validated page-level JSON-LD beyond the implemented site, article,
  tool, block, transaction, address, and name entities; add JSON API alternates
  for machine readers where the representation is stable.
- Verify Brotli or gzip at the edge, immutable asset caching, and unused CSS;
  do not add a browser compression library for the small compiled stylesheet.
- Validate with Google Search Console and Bing Webmaster Tools: brand query,
  indexed pages, canonical selection, crawl errors, and exact-identifier tests.

## Deployment gates and operational follow-ups

- Deploy the indexer writer that records `transactions.block_height` and
  `transactions.block_hash` together before enabling the reorg-aware API
  readers. On mainnet and testnet separately, run the audit, pilot verify,
  pilot apply, bounded apply, and final audit documented in
  `server/scripts/README.md`. The backfill accepts only Zebra-verified block
  membership and must never infer a transaction's hash from height alone.
- Replace the unfiltered transaction-list `pg_class.reltuples` estimates with
  a cached canonical-row count. Result rows and crawl progression are already
  canonical, but the estimated UI total can temporarily overstate pages while
  legacy null or retained stale rows exist.
- Configure a single-hop `https://www.cipherscan.app/*` to
  `https://cipherscan.app/*` permanent redirect at the Netlify/DNS edge; the
  application cannot enforce the first host-level hop by itself.
- Implement IndexNow only after the durable block/transaction lifecycle event
  source is available. Use separate mainnet/testnet host keys and do not submit
  Crosslink, APIs, noindex URLs, filters, or canonical block-hash aliases.
- The current compiled main stylesheet is approximately 19.3 KB with Brotli;
  Next.js already performs production CSS minification, so no compression
  dependency is required for the Ahrefs transfer-size finding.

## Acceptance checks

- Raw HTML has one unique H1 and the intended title/description for every
  indexable template.
- Every indexable URL has a self or intentional entity canonical; `og:url`
  agrees with it and social images are present.
- Mainnet and testnet robots files advertise their own sitemap; Crosslink
  remains disallowed and emits page-level noindex.
- Invalid dynamic identifiers do not return indexable 200 responses.
- Height and hash aliases do not form duplicate indexed block pages.
- New routes cannot ship without an explicit sitemap, indexation, canonical,
  social metadata, structured-data, internal-link, and status-code decision.
