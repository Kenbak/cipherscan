# Milestone 3.5 — Verification Guide

**Grant:** CipherScan Zcash Block Explorer  
**Milestone:** 3.5 — Incident Response & Ironwood Preparation ($14,700)  
**Context:** Built and shipped during NU6.2 consensus emergency (June 1–5, 2026)  
**Live:** [cipherscan.app](https://cipherscan.app)

---

## Deliverable Checklist

| # | Deliverable | Status | Live URL |
|---|-------------|--------|----------|
| 1 | Fork Watch — Reorg monitoring | ✅ | [cipherscan.app/reorgs](https://cipherscan.app/reorgs) |
| 2 | Turnstile Tracker — Deshielded ZEC breakdown | ✅ | [cipherscan.app/turnstile](https://cipherscan.app/turnstile) |
| 3 | Pool flow analytics — Hourly granularity | ✅ | [cipherscan.app/pools](https://cipherscan.app/pools) |
| 4 | Reorg-proof indexer — Auto detection & rollback | ✅ | Evidence in Fork Watch data |
| 5 | Zebra upgrade & full resync | ✅ | Running Zebra 6.0.0-rc.3 |
| 6 | Ironwood pool support | ✅ | [testnet.cipherscan.app/ironwood](https://testnet.cipherscan.app/ironwood) |
| 7 | Dedicated database server | ✅ | Sub-100ms API response times |

---

## Independent Verification

All commands below can be run by anyone with `curl` and `jq`. No CipherScan code required.

---

### 1. Fork Watch — Reorg Monitoring

```bash
curl -s "https://api.mainnet.cipherscan.app/api/uncles/forks" | jq '{success, forkCount: (.forks | length), latestFork: .forks[0] | {forkHeight, depth, description, detectedAt, orphanedBlock: .comparisons[0].orphaned.hash, canonicalBlock: .comparisons[0].canonical.hash, orphanedMiner: .comparisons[0].orphaned.minerPool, canonicalMiner: .comparisons[0].canonical.minerPool}}'
```

**Expected output (as of 2026-07-23):**

```json
{
  "success": true,
  "forkCount": 7,
  "latestFork": {
    "forkHeight": 3422202,
    "depth": 1,
    "description": "Chain reorg detected: depth 1, rolling back heights 3422202-3422202",
    "detectedAt": "2026-07-23T07:37:50.964Z",
    "orphanedBlock": "000000000037411473ce225a7bff59129741dbeb043b1aea45f3b426e55024c9",
    "canonicalBlock": "0000000000598071918a6a2d653f60ff1791bb58fac3a50bdf35e7d737900e7f",
    "orphanedMiner": "Foundry USA",
    "canonicalMiner": "Unidentified (Dominant)"
  }
}
```

**What this shows:** Real reorg events detected and archived by the indexer, with full orphaned vs canonical block comparison and mining pool attribution.

**Frontend:** Visit [cipherscan.app/reorgs](https://cipherscan.app/reorgs) and [cipherscan.app/fork-monitor](https://cipherscan.app/fork-monitor)

---

### 2. Turnstile Tracker — Deshielded ZEC Spend Status

```bash
curl -s "https://api.mainnet.cipherscan.app/api/pools/turnstile" | jq '.summary'
```

**Expected output (as of 2026-07-23):**

```json
{
  "totalDeshielded": 42024131.21749382,
  "totalHeld": 1053676.79765774,
  "totalReshielded": 9182999.641595,
  "totalExchange": 303277.89020535,
  "totalBridge": 2499061.85574026,
  "totalTransferred": 28985115.03229547,
  "totalMoved": 40970454.41983608,
  "heldPercent": 2.51,
  "reshieldedPercent": 21.85,
  "exchangePercent": 0.72,
  "bridgePercent": 5.95,
  "transferredPercent": 68.97,
  "movedPercent": 97.49,
  "txCount": 934229
}
```

**What this shows:** Every ZEC that ever left a shielded pool is tracked and categorized — still held at original address, reshielded, sent to exchange, bridged cross-chain, or transferred. Updated every 5 minutes.

**Frontend:** Visit [cipherscan.app/turnstile](https://cipherscan.app/turnstile)

---

### 3. Pool Flow Analytics — Hourly Granularity

```bash
curl -s "https://api.mainnet.cipherscan.app/api/pools/flows?period=7d&granularity=hourly" | jq '{success, pointCount: (.points | length), samplePoint: .points[0]}'
```

**Expected output:**

```json
{
  "success": true,
  "pointCount": 169,
  "samplePoint": {
    "date": "2026-07-16T13:00:00.000Z",
    "shield": 150.79329882,
    "deshield": 204.57051416,
    "shieldTx": 23,
    "deshieldTx": 28,
    "net": -53.77721534
  }
}
```

**What this shows:** Per-hour inflow/outflow data for all shielded pools. 169 hourly data points for 7 days. Supports period selectors: `since_nu62`, `7d`, `30d`, `90d`, `1y`, `all`.

**Pool overview with all pools including Ironwood:**

```bash
curl -s "https://api.mainnet.cipherscan.app/api/pools/overview" | jq '.current'
```

```json
{
  "sprout": 2540891821914,
  "sapling": 58983872235064,
  "orchard": 376711434678073,
  "ironwood": 0,
  "transparent": 1240296855319429,
  "shielded": 438236198735051,
  "chainSupply": 1683707360304480,
  "updatedAt": "2026-07-23T13:00:06.941Z"
}
```

**Frontend:** Visit [cipherscan.app/pools](https://cipherscan.app/pools) — interactive charts with period selectors and per-pool breakdown.

---

### 4. Reorg-Proof Indexer

The Fork Watch data above (Section 1) is the evidence. Those 7 reorgs were **automatically** detected, rolled back, and re-indexed without manual intervention. Each entry shows:

- The exact height where the fork occurred
- Which block was orphaned and which became canonical
- The mining pool that mined each competing block
- Timestamp of detection

The indexer walks backward to find the common ancestor, rolls back all affected blocks/transactions/flows in a single database transaction, archives the orphaned blocks, and re-indexes from the fork point.

**Source:** [`cipherscan-rust/src/indexer/mod.rs` — `detect_and_handle_reorg()`](https://github.com/Kenbak/cipherscan-rust/blob/main/src/indexer/mod.rs)

---

### 5. Ironwood Pool Support (Testnet — Live)

Ironwood activated on testnet at height 4,134,000. Full indexing, API, and frontend support is live:

```bash
curl -s "https://api.testnet.cipherscan.app/api/migration/overview" | jq '{activated, activationHeight, tipHeight, poolSizes: {orchardZat: .poolSizes.orchardZat, ironwoodZat: .poolSizes.ironwoodZat}, migration: .migration}'
```

**Expected output (as of 2026-07-23):**

```json
{
  "activated": true,
  "activationHeight": 4134000,
  "tipHeight": 4195649,
  "poolSizes": {
    "orchardZat": 25120825432770,
    "ironwoodZat": 1812832322552
  },
  "migration": {
    "totalMigratedZat": 3194023477988,
    "txCount": 3803,
    "firstHeight": 4134683,
    "lastHeight": 4195600,
    "migratedPercent": 6.73
  }
}
```

**What this shows:** 3,803 migration transactions indexed, 18,128 TAZ in the Ironwood pool, 6.73% of Orchard pool migrated.

**Additional Ironwood endpoints:**

```bash
# Migration cohort analysis
curl -s "https://api.testnet.cipherscan.app/api/migration/cohorts" | jq '.success'

# Denomination histogram
curl -s "https://api.testnet.cipherscan.app/api/migration/denominations" | jq '.success'

# Pool balance in privacy stats
curl -s "https://api.testnet.cipherscan.app/api/privacy-stats" | jq '.shieldedPool.ironwood'
# Returns: 18128.32322552
```

**Mainnet readiness (pre-activation, Ironwood activates July 28):**

```bash
curl -s "https://api.mainnet.cipherscan.app/api/pools/overview" | jq '.current.ironwood'
# Returns: 0 (schema ready, awaiting activation)
```

**Frontend:** Visit [testnet.cipherscan.app/ironwood](https://testnet.cipherscan.app/ironwood) for the full migration tracker with cohort analysis and denomination histogram.

---

### 6. Dedicated Database Server — Performance

API response times demonstrate dedicated database performance. All heavy analytics queries respond under 100ms:

```bash
# Privacy stats (aggregates across millions of rows)
time curl -s "https://api.mainnet.cipherscan.app/api/privacy-stats" > /dev/null
# real: ~0.044s

# Blocks list with pagination
time curl -s "https://api.mainnet.cipherscan.app/api/blocks?limit=50" > /dev/null
# real: ~0.084s

# Pool flows (30 days of hourly aggregates)
time curl -s "https://api.mainnet.cipherscan.app/api/pools/flows?period=30d" > /dev/null
# real: ~0.044s

# Turnstile (scans 900k+ classified outputs)
time curl -s "https://api.mainnet.cipherscan.app/api/pools/turnstile" > /dev/null
# real: ~0.796s
```

Infrastructure is documented in [`DEPLOYMENT.md`](../../DEPLOYMENT.md).

---

## Automated Verification (Optional)

A convenience script is also provided:

```bash
# Mainnet (all checks except Ironwood live balance)
node zcg/milestone-3.5/verify.js https://cipherscan.app

# Testnet (all checks including Ironwood live verification)
node zcg/milestone-3.5/verify.js https://testnet.cipherscan.app
```

---

## Context

On June 1, 2026, an Orchard soundness vulnerability triggered a coordinated soft fork, a 25-block reorganization, 37 orphaned blocks, and mandatory node upgrades. CipherScan was the first explorer back online. The Turnstile Tracker and pool analytics shipped during those days helped counter FUD with verifiable on-chain facts.

None of this work was in the original grant scope (M1–M4). $1,500 of the milestone covers infrastructure costs (dedicated database hosting for ~8 months).

---

## Source Code

- Explorer: [github.com/Kenbak/cipherscan](https://github.com/Kenbak/cipherscan)
- Rust Indexer: [github.com/Kenbak/cipherscan-rust](https://github.com/Kenbak/cipherscan-rust)
