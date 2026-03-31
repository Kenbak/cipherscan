# Milestone 2 — Verification Guide

**Grant:** CipherScan Zcash Block Explorer  
**Milestone:** 2 — NEAR Intents Expansion & Cross-Chain UX ($14,700)  
**Live:** [cipherscan.app](https://cipherscan.app)

---

## Quick Verification

```bash
# Run automated checks against mainnet
node zcg/milestone-2/verify.js https://cipherscan.app

# Or testnet
node zcg/milestone-2/verify.js https://testnet.cipherscan.app
```

The script tests all 7 deliverables and prints PASS/FAIL for each.

---

## Deliverable Checklist

| # | Deliverable | Status | Evidence |
|---|-------------|--------|----------|
| 1 | TX Linking — external explorer links | ✅ | `/api/tx/:txid` returns `bridge.explorerUrl` pointing to Etherscan, Solscan, etc. |
| 2 | TX Page Labels — BRIDGE IN/OUT badges | ✅ | Frontend renders `BRIDGE IN` or `BRIDGE OUT` badge with chain icons |
| 3 | Address Page Integration — cross-chain activity | ✅ | `/api/crosschain/address/:address` returns swap history; address page shows Bridges tab |
| 4 | Historical Swap Data — PostgreSQL + charts | ✅ | `/api/crosschain/history` with pagination; `/api/crosschain/trends?period=7d\|30d` with volume charts |
| 5 | Human-readable TX explanations | ✅ | `generateTxSummary()` on all TX pages — shielded, transparent, bridge, coinbase, mixed |
| 6 | Database optimizations — materialized views | ✅ | 5 materialized views: `mv_crosschain_summary`, `mv_crosschain_volume_24h`, `mv_crosschain_latency`, `mv_crosschain_trends`, `mv_crosschain_popular_pairs` |
| 7 | API input validation — Zod schemas | ✅ | 10+ routes validated: txById, addressById, crosschainTrends, crosschainHistory, etc. |

---

## Detailed Verification

### 1. TX Linking (External Explorer Links)

**What:** When a transaction is involved in a cross-chain swap, the TX page shows a clickable link to the other chain's block explorer (Etherscan, Solscan, Mempool.space, NearBlocks, etc.).

**How to verify:**

1. Go to `/crosschain` and find a swap with a ZEC txid
2. Click the ZEC txid to view the TX page
3. In the "Bridge Details" section, verify an external explorer link is shown
4. Click it — it should open the source/destination chain's tx on the correct explorer

**API test:**
```bash
# Replace TXID with a known bridge tx
curl -s https://api.mainnet.cipherscan.app/api/tx/TXID | jq '.bridge.explorerUrl'
# Should return a URL like "https://etherscan.io/tx/0x..."
```

**Supported explorers:**
- Ethereum → etherscan.io
- Solana → solscan.io
- Bitcoin → mempool.space
- NEAR → nearblocks.io
- Arbitrum → arbiscan.io
- Base → basescan.org
- Polygon → polygonscan.com
- Avalanche → snowtrace.io
- BSC → bscscan.com
- Optimism → optimistic.etherscan.io
- Tron → tronscan.org
- Dogecoin → dogechain.info
- XRP → xrpscan.com

**Code:** `server/api/routes/transactions.js` (explorerUrls map + bridge object)

---

### 2. TX Page Labels (BRIDGE IN / BRIDGE OUT)

**What:** Bridge transactions display a colored badge in the TX header indicating direction.

**How to verify:**

1. Open a bridge TX page (find one via `/crosschain`)
2. Look for a cyan badge reading **"BRIDGE IN"** (entry to ZEC) or **"BRIDGE OUT"** (exit from ZEC)
3. The badge appears alongside existing badges (Shielded, Sapling, Orchard, etc.)

**API test:**
```bash
curl -s https://api.mainnet.cipherscan.app/api/tx/TXID | jq '.bridge.direction'
# Returns "entry" (BRIDGE IN) or "exit" (BRIDGE OUT)
```

**Code:** `app/tx/[txid]/page.tsx` (Badge component, `direction === 'entry' ? 'BRIDGE IN' : 'BRIDGE OUT'`)

---

### 3. Address Page Integration

**What:** Addresses involved in cross-chain swaps show a "Bridges" tab with entry/exit history and total volume.

**How to verify:**

1. Find a ZEC address involved in a bridge swap (from `/crosschain` or a bridge TX page)
2. Navigate to that address page
3. Verify a "Bridges" tab appears (if the address has bridge activity)
4. Click it to see swap history with direction, chains, amounts, and timestamps

**API test:**
```bash
curl -s "https://api.mainnet.cipherscan.app/api/crosschain/address/ADDRESS" | jq '{totalSwaps, totalVolumeUsd, entryCount, exitCount}'
```

**Response shape:**
```json
{
  "success": true,
  "address": "t1...",
  "totalSwaps": 5,
  "totalVolumeUsd": 1234.56,
  "entryCount": 3,
  "exitCount": 2,
  "swaps": [...]
}
```

**Code:** `server/api/routes/crosschain.js` (GET `/api/crosschain/address/:address`)

---

### 4. Historical Swap Data

**What:** All cross-chain swaps are stored in PostgreSQL. The `/crosschain` page shows 7d/30d volume charts with trend data.

**How to verify:**

1. Go to `/crosschain`
2. Verify the volume chart displays with 7d/30d toggle
3. Verify historical swap count and total volume are shown
4. Verify the swap history table has pagination

**API tests:**
```bash
# Paginated history
curl -s "https://api.mainnet.cipherscan.app/api/crosschain/history?limit=5&page=1" | jq '{total, page, totalPages}'

# 7-day trends
curl -s "https://api.mainnet.cipherscan.app/api/crosschain/trends?period=7d" | jq '{period, volumeChange, dataPoints: (.data | length)}'

# 30-day trends
curl -s "https://api.mainnet.cipherscan.app/api/crosschain/trends?period=30d" | jq '{period, volumeChange, dataPoints: (.data | length)}'
```

**Database:** `cross_chain_swaps` table with indexes on `swap_created_at`, `source_chain`, `dest_chain`, `zec_txid`, `zec_address`.

**Code:**
- `server/jobs/sync-crosschain-swaps.js` (ingestion with lockfile)
- `server/api/routes/crosschain.js` (history + trends endpoints)

---

### 5. Human-readable TX Explanations

**What:** Every transaction page shows a one-line natural language summary explaining what the transaction did.

**How to verify:**

1. **Shielded TX:** "This is a fully shielded transaction..."
2. **Transparent TX:** "X ZEC was sent from t1... to t1..."
3. **Shielding TX:** "X ZEC was shielded from transparent to Sapling/Orchard pool"
4. **Deshielding TX:** "X ZEC was deshielded from Sapling/Orchard to transparent"
5. **Bridge TX:** "X TOKEN was bridged from CHAIN to ZEC via NEAR Intents"
6. **Coinbase TX:** "Miner reward of X ZEC..."

**Code:** `app/tx/[txid]/page.tsx` → `generateTxSummary()` function (handles all tx types)

---

### 6. Database Optimizations (Materialized Views)

**What:** Heavy crosschain analytics queries use materialized views instead of live table scans, reducing query time from seconds to milliseconds.

**How to verify:**

**Views (queried by the API via `SELECT FROM mv_*`):**

| View | Purpose |
|------|---------|
| `mv_crosschain_summary` | Aggregate swap counts, volumes, chain breakdowns |
| `mv_crosschain_volume_24h` | Rolling 24h volume by chain |
| `mv_crosschain_latency` | Average swap completion time by chain |
| `mv_crosschain_trends` | Daily volume aggregates for charting |
| `mv_crosschain_popular_pairs` | Most traded chain pairs |

**Refresh:** Views are refreshed by the `sync-crosschain-swaps.js` cron job after each sync cycle.

**Code:**
- `server/scripts/create-crosschain-views.sql` (view definitions)
- `server/api/routes/crosschain.js` (queries reference views)

---

### 7. API Input Validation (Zod)

**What:** All API routes validate inputs using Zod schemas. Invalid requests return 400 with structured error details.

**How to verify:**

```bash
# Invalid txid → 400
curl -s "https://api.mainnet.cipherscan.app/api/tx/NOT-VALID" | jq '{error, details}'

# Invalid address → 400
curl -s "https://api.mainnet.cipherscan.app/api/address/<script>" | jq '{error, details}'

# Invalid period → 400
curl -s "https://api.mainnet.cipherscan.app/api/crosschain/trends?period=999years" | jq '{error, details}'

# Valid request → 200
curl -s -o /dev/null -w "%{http_code}" "https://api.mainnet.cipherscan.app/api/tx/66c677bfb9501a99c5f85be08a69ca8a6b0c13b55cdf028d62759b09d23ef4d7"
```

**Error response format:**
```json
{
  "error": "Invalid path parameters",
  "details": [
    { "field": "txid", "message": "Invalid hex string" }
  ]
}
```

**Validated routes (10+):**
- `GET /api/tx/:txid` — txid hex format
- `GET /api/tx/shielded` — pagination params
- `GET /api/address/:address` — address format
- `GET /api/crosschain/trends` — period enum
- `GET /api/crosschain/history` — limit/page bounds
- `GET /api/crosschain/volume-by-chain` — period enum
- `GET /api/privacy/recommended-swap-amounts` — amount bounds
- `GET /api/privacy/risks` — period enum
- `GET /api/tx/:txid/linkability` — txid hex format
- `POST /api/tx/broadcast` — rawTx hex format
- `POST /api/tx/raw/batch` — txids array

**Code:** `server/api/validation.js` (Zod schemas + `validate` middleware)

---

## Forum Progress Report

The Milestone 2 deliverables are fully implemented and deployed on both mainnet and testnet. The verification script can be run against either deployment to confirm all deliverables are functional.

Key technical achievements:
- Cross-chain swap indexing via NEAR Intents API with lockfile-based concurrency control
- 5 materialized views for sub-millisecond analytics queries
- Zod validation on all public API endpoints preventing injection and abuse
- Human-readable transaction summaries covering 6+ transaction types
- External explorer linking for 13+ blockchain networks
