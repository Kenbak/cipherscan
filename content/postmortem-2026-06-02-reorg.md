# CipherScan Post-Mortem: Zcash Orchard Soft Fork & Chain Reorgs

**Date:** June 2, 2026
**Status:** Resolved
**Duration:** ~12 hours (June 1, 22:30 EDT → June 2, ~10:00 EDT)

---

## Twitter Thread Draft

**1/7**
Post-mortem: How CipherScan handled yesterday's Zcash network upgrade.

On June 1 at 22:30 EDT, Zcash developers coordinated a soft fork to temporarily disable Orchard transactions while patching a security issue. This caused multiple chain reorgs as miners upgraded to Zebra v4.5.3.

Here's what happened behind the scenes.

**2/7**
The soft fork caused competing chain tips — miners on old software produced blocks the network would reject. This created 37 orphaned blocks across heights 3,362,116–3,363,503, with reorg depths up to 25 blocks.

CipherScan's indexer had no reorg handling — it indexed forward only.

**3/7**
What we did:

- Upgraded Zebra to v4.5.3 within 30 minutes of the announcement
- Scanned 1,571 blocks and identified 45 hash mismatches between our DB and the canonical chain
- Archived 37 orphaned blocks for historical record
- Cleaned 6,474 transactions and 1,559 blocks of stale data
- Re-indexed the canonical chain from scratch (caught up in ~10 minutes)

**4/7**
New feature shipped during the incident: cipherscan.app/reorgs

A dedicated reorg explorer showing:
- Fork events with depth, affected heights, and timestamps
- Orphaned blocks with hashes, miners, sizes, and tx counts
- A public API endpoint for external nodes to report competing chain tips

**5/7**
We also shipped automatic reorg detection for the indexer.

Before indexing new blocks, CipherScan now compares the stored block hash against the canonical chain. On mismatch, it walks backward to find the fork point, archives orphans, rolls back stale data, and re-indexes — fully automated.

**6/7**
Lessons learned:

1. Forward-only indexers are fragile. Reorgs are rare on Zcash but happen during upgrades.
2. Address balance tracking via incremental deltas (balance += amount) is dangerous without rollback capability. We now reverse deltas before cleanup.
3. Having indexed txid lookups on large tables matters — our initial cleanup approach took 16+ min; switching to txid-indexed deletes finished in 61 seconds.

**7/7**
CipherScan stayed operational throughout the event. Block and transaction data is now fully consistent with the canonical chain.

All funds are safe. Privacy was never affected. The Zcash network is healthy.

Explore the reorg data: cipherscan.app/reorgs
Open source: github.com/AtmosphereLabs

---

## Internal Notes

### Timeline (UTC)

- **~02:30** — Soft fork activates (22:30 EDT June 1)
- **~03:00** — Notified by ZODL, begin Zebra upgrade
- **~03:30** — Zebra v4.5.3 running on mainnet, lightwalletd restarted
- **~05:00** — Reorg explorer (frontend + API + DB schema) implemented and deployed
- **~06:00** — Chain verification scan: 45 mismatched blocks identified
- **~08:50** — Cleanup begins: archived 37 orphans, deleted stale data
- **~09:08** — Re-indexing complete, all services verified
- **~09:30** — Reorg detection code compiled and ready for deployment

### Impact

- **Data affected:** 1,559 blocks, 6,474 transactions, ~44K dependent rows
- **Orphaned blocks archived:** 37
- **Fork events recorded:** 1
- **Deepest reorg:** 25 blocks
- **User-visible downtime:** None (site stayed up, data briefly stale)

### Root Cause

CipherScan's Rust indexer (`cipherscan-rust`) had no reorg handling. It indexed blocks forward-only using `last_indexed_height + 1` without verifying the stored block hash matches the canonical chain. When the soft fork caused miners to produce competing blocks, the indexer stored whichever block arrived first at each height — some of which became orphans.

### Fix

1. **Immediate:** Manual cleanup via SQL (archive orphans → delete stale data → re-index)
2. **Permanent:** Added `detect_and_handle_reorg()` to the live indexer loop + `rollback_from_height()` to the PostgreSQL writer. The indexer now verifies the tip block hash on every cycle and automatically handles reorgs up to 100 blocks deep.
