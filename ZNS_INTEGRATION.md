# ZNS Integration

CipherScan integrates the [Zcash Name System](https://github.com/zcashme/ZNS) (ZNS) so users can resolve human-readable names (e.g. `alice`) to Zcash Unified Addresses, and inspect the on-chain history of a name.

This document describes the shipped integration. For protocol details see the ZNS repo.

---

## Trust model

CipherScan trusts the configured ZNS indexer URL. We do not call the SDK's `verify()` (UIVK whitelist check) and we do not render cryptographic-attestation badges. The indexer URL is set per-network by the operator; if you trust the operator you trust the data.

If we ever want stronger guarantees, the path is: pin admin pubkeys per network in code, call `verify()` at boot, surface verification status in the UI.

---

## Network model

ZNS namespaces are per-network. Mainnet `alice` and testnet `alice` are unrelated registrations indexed by separate indexers against separate chains. Crosslink testnet shares the testnet indexer.

| CipherScan network | ZNS indexer URL | Env override |
|---|---|---|
| `mainnet` | `https://light.zcash.me/zns-mainnet-test` | `ZNS_MAINNET_URL` |
| `testnet` | `https://light.zcash.me/zns-testnet` | `ZNS_TESTNET_URL` |
| `crosslink-testnet` | testnet indexer (shared) | `ZNS_TESTNET_URL` |

Env vars are server-only — the SDK never runs in the browser.

The SDK's own `network` field controls action-URI generation (write paths). It must stay paired with the URL choice — the `crosslink-testnet → testnet` collapse in `lib/zns.ts` does both jobs.

---

## SDK usage

Dependency: `zcashname-sdk@^0.6.0` (npm). Transitive deps: `@noble/ed25519`, `bech32`.

The SDK is touched in exactly one cipherscan file: `lib/zns.ts`. It exports two things:

- `getClient()` — server-only singleton, configured per-network. Used by API routes and (planned) server components.
- `isValidName(name)` — client-safe pure validator. Wraps the SDK's instance method without leaking network/env access. Used by `SearchBar` to decide whether to route a query to `/name/[name]`.

This mirrors the `lib/api-config.ts` pattern: one file, both scopes.

---

## Search bar

`components/SearchBar.tsx` does explicit format detection on submit. The detection chain (in order):

1. Address → `/address/[addr]`
2. All-digits → `/block/[height]`
3. 64-char hex with leading zeros → `/block/[hash]`
4. 64-char hex → `/tx/[hash]`
5. Curated label match → `/address/[addr]`
6. **Matches `isValidName` → `/name/[name]`**
7. Otherwise → no match

ZNS names appear in the chain as a peer to the other format checks, not as a fallthrough. Garbage input does not route anywhere.

ZNS does **not** appear in the search dropdown's autocomplete suggestions. The label autocomplete works because all official labels are pulled in one bulk fetch and filtered client-side. The SDK exposes no equivalent "list all names" method, and we are not adding the indexer feature for this PR. Names are submit-only.

---

## API surface

Public API routes:

| Route | SDK method | Purpose |
|---|---|---|
| `GET /api/name/:name` | `resolveName(name)` | Registration record (or 404) |
| `GET /api/name/:name/events` | `events({name})` | Event history for a name |

Both are thin server-side proxies. They exist for external API consumers; cipherscan's own pages will (post-rewrite) call the SDK directly via server components rather than going through these routes.

Cache headers are set per route in `app/api/name/...`.

---

## Name page (`/name/[name]`)

> **Status: under rewrite.** The previous client-component implementation has been deleted. The new shape is a Next.js async server component.

Target architecture:
- Server component calls `getClient().resolveName(name)` and `events({name})` in parallel
- Renders fully populated HTML on first paint — no spinner, no waterfall
- Three branches: registered / available / error (via Next.js `error.tsx`)
- Only interactive widgets (e.g. copy button) are client components
- `generateMetadata` in `layout.tsx` resolves the name once to set a data-aware document title

Decisions bound for the rewrite:

- **Registered view** renders identity (name + resolved address + custody), last-action provenance (txid, block), and marketplace status (listing + price, link to zcashnames.com to buy). No `nonce` in UI — it's protocol state, not user information. Last action surfaces as the page's status badge (CLAIM / BUY / UPDATE / DELIST). Custody (sovereign vs admin-registered, derived from `pubkey`) surfaces as a secondary badge.
- **Available view** renders the name + an "Available" badge, the claim cost for that length, and the full pricing tier table. The CTA is a link to zcashnames.com — cipherscan does not render claim URIs or memo strings (footgun risk we don't own a recovery path for).
- **Invalid names** (those that fail `isValidName`) get the same `notFound()` response as unregistered names. SearchBar's format check prevents invalid names from being routed in the normal flow; direct URL hits get a clean 404.
- **Errors** (indexer unreachable, etc.) throw to Next.js's nearest error boundary; no per-route error file added in this PR.

ZNS stats (registered count, listed count, synced height) are deferred — undecided whether they belong on the name page or a future `/zns` overview page.

Pagination of event history is deferred — current implementation passes `limit: 50`, which covers expected name activity. If that proves insufficient, add pagination using the SDK's `EventsResult.total`.

---

## Out of scope (this PR)

- Reverse resolution on `/address/[addr]` pages
- Wallet-side claim/buy/list/delist flows (live at zcashnames.com)
- Dedicated names browse or marketplace page
- ZNS suggestions in the search dropdown (needs indexer feature)
- Live updates via WebSocket
- Verified-attestation badges (would require admin pubkey pinning)

---

## Files

```
lib/zns.ts                          — SDK singleton (server) + isValidName (client-safe)
components/SearchBar.tsx            — name detection in submit chain
app/api/name/[name]/route.ts        — public API proxy
app/api/name/[name]/events/route.ts — public API proxy
app/name/[name]/                    — server component page + layout (under rewrite)
app/docs/endpoints.ts               — Names category for API docs
```
