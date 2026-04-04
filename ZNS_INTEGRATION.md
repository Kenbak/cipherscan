# ZNS Integration — Zcash Name Service for CipherScan

## Overview

Add human-readable name resolution to CipherScan via the Zcash Name Service (ZNS). Users can type a name like `alice` in the search bar and land on a name detail page showing the resolved address, registration transaction, event history, and marketplace status — or see that it's available with pricing info.

ZNS maps names to Zcash Unified Addresses via shielded Orchard memos on-chain. An indexer watches the chain, trial-decrypts notes using the registry's viewing key, and serves results over a JSON-RPC API. CipherScan talks to that API through the official TypeScript SDK.

**Testnet only for now.** Mainnet support is a config change (new indexer URL + UFVK) — the code is network-aware from day one.

---

## What we're building

### 1. Search bar — name resolution

**The killer feature.** When a user types a query into the search bar:

- If the query matches ZNS name rules (1-62 chars, lowercase alphanumeric + hyphens), resolve it via the SDK's `resolve()` in parallel with existing block/tx/address detection.
- If a name is found, show a **"ZNS Name"** suggestion in the dropdown with the name and a truncated address.
- Clicking it navigates to `/name/[name]`.
- Existing search behavior (block heights, tx hashes, addresses) is unchanged — ZNS is additive.

**Search priority:** Address > Block height > Tx hash > Block hash > ZNS name > Address label. Names should not shadow any existing result type.

### 2. `/name/[name]` — name detail page

A detail page for any ZNS name, whether registered or not.

**If the name is registered:**

- **Header:** The name in large text, with a "Registered" badge.
- **Resolved address:** Full unified address, copyable, with a link to `/address/[address]`.
- **Registration details:**
  - Transaction ID (links to `/tx/[txid]`)
  - Block height (links to `/block/[height]`)
  - Current nonce
- **Marketplace status:** If listed for sale, show the price in ZEC, listing tx, and listing block height. If not listed, show "Not for sale".
- **Event history:** Timeline of all actions (CLAIM, UPDATE, LIST, DELIST, BUY) from `events({ name })`, each with:
  - Action badge (color-coded)
  - Transaction link
  - Block height
  - Relevant data (new address for UPDATE, price for LIST/BUY, etc.)
  - Paginated if history is long

**If the name is NOT registered (availability checker):**

- **Header:** The name, with an "Available" badge in green.
- **Claim cost:** Based on name length, pulled from SDK's `claimCost()`.
- **Pricing table:** Full pricing breakdown (1 char = 6 ZEC → 7+ chars = 0.25 ZEC).
- **How to register:** Brief explanation of the claim process — send a shielded transaction with a `ZNS:CLAIM:<name>:<ua>` memo to the registry address.

**If the name is invalid** (fails `isValidName()`):

- Show "Invalid name" with the naming rules (1-62 chars, lowercase alphanumeric + hyphens, no leading/trailing/consecutive hyphens).

### 3. ZNS stats

Displayed on the `/name/[name]` page (sidebar or header section):

- **Registered names** count
- **Listed for sale** count
- **Indexer synced height**

From the SDK's `status()` method. Cached — this data changes slowly.

---

## What we're NOT building (this PR)

- Reverse resolving on address/tx pages (adds latency, low hit rate)
- Claim/buy/list/delist actions from the UI (wallet territory)
- Dedicated `/names` browse page (unclear value without more registered names)
- Homepage changes
- WebSocket live feed of new registrations

---

## Technical approach

### SDK dependency

```json
"zcashname-sdk": "github:zcashme/ZNS#main&path=sdk/typescript"
```

Zero dependencies, ~7 small files. Provides typed methods for `resolve`, `listings`, `status`, `events`, `isAvailable`, plus validation and pricing utilities.

### Architecture change — server-side API proxy (Phase 1)

> **What changed:** The original integration had the browser calling the ZNS indexer directly via the SDK inside a `useEffect`. This was wrong. It caused CORS failures (the indexer is a JSON-RPC service, not a web app — it doesn't serve CORS headers) and broke the pattern every other data source in CipherScan follows.
>
> **The fix:** The SDK now lives entirely server-side. A new Next.js API route (`/api/zns`) proxies requests to the indexer. The browser only talks to CipherScan's own API, same as blocks, transactions, and addresses.
>
> **Before:** `browser → SDK → indexer` (CORS blocked)
> **After:** `browser → /api/zns → SDK → indexer` (server-to-server, no CORS)

#### Files changed

```
app/api/zns/route.ts               — NEW: API proxy, forwards JSON-RPC to indexer via SDK
lib/zns.ts                          — CHANGED: server-only, env var renamed to ZNS_URL
app/name/[name]/page.tsx            — CHANGED: fetches from /api/zns instead of SDK
app/docs/endpoints.ts               — CHANGED: new "Names" category documenting ZNS endpoints
.env.example                        — CHANGED: added ZNS_URL (server-only)
```

#### `app/api/zns/route.ts` — API proxy

Accepts POST requests with `{ method, params }`, forwards to the indexer via the SDK client, returns the JSON-RPC result. Follows the same error handling and caching pattern as `/api/tx/`, `/api/block/`, etc.

Supported methods:
- `resolve` — resolve a name to its registration + listing
- `status` — indexer health, registered/listed counts, pricing
- `events` — event history for a name

#### `lib/zns.ts` — server-only client

The SDK singleton is now only imported by the API route. The `NEXT_PUBLIC_ZNS_URL` env var was renamed to `ZNS_URL` — no reason to expose the indexer URL to the browser anymore.

`isZnsEnabled()` remains available client-side (it checks the network, not the URL).

```ts
// Server-only — imported by app/api/zns/route.ts
const ZNS_URL = process.env.ZNS_URL || ZNS_URLS[NETWORK];

export async function getZnsClient(): Promise<ZNSClient> {
  if (!ZNS_URL) throw new Error('ZNS is not available on this network');
  if (!client) {
    client = await createClient(ZNS_URL);
  }
  return client;
}
```

#### `app/name/[name]/page.tsx` — client component

No longer imports the SDK. The `useEffect` now calls CipherScan's own API:

```ts
const [resolved, status] = await Promise.all([
  fetch('/api/zns', { method: 'POST', body: JSON.stringify({ method: 'resolve', params: { query: name } }) }),
  fetch('/api/zns', { method: 'POST', body: JSON.stringify({ method: 'status' }) }),
]);
```

### Search bar integration

In `SearchBar.tsx`, after existing detection logic:

```ts
import { isValidName } from 'zcashname-sdk';

// Pure regex check — no network call, safe on every keystroke
if (isZnsEnabled() && isValidName(trimmedQuery.toLowerCase())) {
  router.push(`/name/${encodeURIComponent(trimmedQuery.toLowerCase())}`);
}
```

ZNS name detection is the lowest priority in the search chain: Address > Block height > Tx hash > Block hash > Address label > ZNS name.

### Name detail page

`page.tsx` is a `'use client'` component that fetches from `/api/zns` and handles all states (loading / error / registered / not found / invalid).

`layout.tsx` is a server component that generates SEO metadata.

Uses existing UI components: `Card`, `Badge`, monospace text for addresses/hashes, `Link` for cross-references to `/tx/` and `/block/`.

### Caching strategy

- `resolve` — 60s cache (names change rarely, but can be updated)
- `status` — 60s cache (counts change slowly)
- `events` — no cache (fresh per page load)

### Error handling

- ZNS indexer down: Search bar silently skips ZNS results (no error shown). Name page shows "Unable to reach ZNS indexer" with retry button.
- Network mismatch: SDK's UIVK verification catches this at client creation time (server-side).
- Invalid names: Caught client-side by `isValidName()` before any network call.

---

## Design notes

### Colors & badges

- **Registered** name badge: `cipher-cyan` (matches primary accent)
- **Available** name badge: `cipher-green`
- **For sale** listing badge: `cipher-yellow`
- **Invalid** name: `cipher-orange` or muted
- Event action badges: CLAIM=green, LIST=yellow, BUY=cyan, UPDATE=purple, DELIST=muted

### Typography

- Name displayed in large monospace: `font-mono text-2xl`
- Addresses in monospace with truncation + copy button
- Prices formatted as ZEC with 2-8 decimal places

### Responsive

- Single column on mobile
- Event history as stacked cards on mobile, table-like on desktop
- Pricing table stays readable at all breakpoints

---

## Network support

The integration is network-aware from day one:

| Network | ZNS URL | Status |
|---------|---------|--------|
| Testnet | `https://light.zcash.me/zns-testnet` | Active |
| Mainnet | `null` (disabled) | When mainnet indexer launches |
| Crosslink | `https://light.zcash.me/zns-testnet` | Same testnet indexer |

Switching networks is a URL change in `lib/zns.ts`. Override with `ZNS_URL` env var (server-only). The SDK handles UIVK verification per-network.

---

## Testing checklist

- [ ] Search "alice" → ZNS suggestion appears → navigates to `/name/alice`
- [ ] Search a block height → ZNS does not interfere
- [ ] Search an invalid name (uppercase, double hyphens) → no ZNS suggestion
- [ ] `/name/alice` with registered name → shows address, tx, events
- [ ] `/name/nonexistent` → shows "Available" + pricing
- [ ] `/name/INVALID` → shows naming rules
- [ ] `/name/alice` when indexer is down → graceful error
- [ ] Name with active listing → shows marketplace info
- [ ] Event history pagination works
- [ ] All links to `/tx/` and `/block/` resolve correctly
- [ ] Mobile layout renders cleanly
