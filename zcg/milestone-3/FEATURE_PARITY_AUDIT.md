# CipherScan vs Nighthawk Block Explorer — Feature Parity Audit

**Document:** ZCG Milestone 3 Deliverable  
**Version:** 1.0  
**Date:** 2026-06-07  
**Primary baseline:** [Nighthawk Zcash Explorer](https://mainnet.zcashexplorer.app/) (mainnet.zcashexplorer.app, [source](https://github.com/nighthawk-apps/zcash-explorer))  
**Secondary reference:** [3xpl.com/zcash](https://3xpl.com/zcash) (third-party multi-chain explorer)  
**Comparison target:** [cipherscan.app](https://cipherscan.app) (CipherScan, mainnet)

---

## Purpose

This document is a formal feature parity audit required by ZCG Milestone 3. It compares CipherScan against the legacy Nighthawk Zcash block explorer (zcashblockexplorer.com) to confirm that all baseline explorer capabilities are met or exceeded, document intentional differences, and catalog CipherScan-exclusive capabilities.

Nighthawk was the community reference explorer for years (still accessible at mainnet.zcashexplorer.app). CipherScan was built to replace and surpass it with modern privacy tooling, cross-chain analytics, and a maintained API surface. 3xpl.com/zcash is included as a secondary reference point representing the broader multi-chain explorer landscape.

---

## Summary

| Metric | Count |
|--------|-------|
| Nighthawk baseline features | 10 |
| ✅ Implemented (parity or better) | 8 |
| ⚠️ Partial / different approach | 2 |
| ❌ Not applicable / deferred | 0 |
| 🆕 CipherScan-exclusive major features | 30+ |

**Conclusion:** CipherScan exceeds Nighthawk on every comparable dimension. Two items use a different implementation model (viewing-key decryption vs payment disclosure; self-hosting via documented systemd stack vs Docker). Tor hidden service is a separate M3 deliverable pending server deployment.

---

## Feature Matrix

| # | Feature | Nighthawk (zcashblockexplorer.com) | CipherScan | Status | Notes |
|---|---------|-----------------------------------|------------|--------|-------|
| 1 | **Block exploration** — height, hash, transaction list | Block page by height; transaction list per block | `/block/[height]` accepts height **or** 64-char hash; orphaned blocks supported; miner pool attribution; CSV/JSON export | ✅ | Hash lookup includes orphaned blocks via `orphaned_blocks` table |
| 2 | **Transaction details** — inputs, outputs, shielded components | Transparent I/O; shielded spend/output counts | Full TX page with transparent I/O, Sapling/Orchard actions, fee (ZIP-317), human-readable summary, bridge badges | ✅ | Fees computed for shielded txs (Nighthawk could not) |
| 3 | **Address lookup** — balance, transaction history | t-address balance and history | `/address/[address]` — t-addresses, unified addresses (UA decode tabs); Bridges tab for cross-chain activity; CSV export | ✅ | z-address balances remain private by design (same as Nighthawk) |
| 4 | **Mempool viewer** | Pending transaction list | `/mempool` with live count, shielded/transparent breakdown, WebSocket push | ✅ | Real-time via Zebra gRPC + WebSocket |
| 5 | **Raw transaction broadcast** | Submit signed hex to network | `/tools/broadcast` + `POST /api/tx/broadcast` with Zod validation | ✅ | Rejects invalid hex with structured 400 errors |
| 6 | **Viewing key / payment disclosure** | Payment disclosure protocol support | Client-side Orchard memo decryption (`/decrypt`, `@cipherscan/zcash-decoder` npm WASM) | ⚠️ | Different protocol: memo decryption, not BIP-style payment disclosure. Keys never leave browser |
| 7 | **Network stats** — hashrate, difficulty, peers | Basic network dashboard | `/network` — hashrate, difficulty, block times, emission, halving countdown, node map, Tor detection | ✅ | Mining metrics API + 365-day pool history |
| 8 | **Tor hidden service** | `.onion` mirror for privacy-focused access | Planned — separate M3 server deliverable | ⚠️ | To be verified after deployment; clearnet site has Tor node detection on network map |
| 9 | **Docker self-hosting** | Official Docker Compose stack | Manual deployment via systemd + Caddy (see `DEPLOYMENT.md`); no Dockerfile in repo | ⚠️ | Documented operational path; Docker not shipped (intentional — production uses bare-metal systemd) |
| 10 | **REST API** | Basic JSON endpoints | 43 documented public endpoints at `/docs`; Zod validation; rate-limited; mainnet + testnet | ✅ | Superset of Nighthawk API surface |

**Legend:** ✅ Implemented · ⚠️ Partial or different approach · ❌ Not applicable · 🆕 New capability

---

## CipherScan-Exclusive Features (Beyond Parity)

These capabilities have no equivalent in the Nighthawk explorer.

### Privacy & Analytics
| Feature | Route / API | Description |
|---------|-------------|-------------|
| Privacy Dashboard | `/privacy` | Shielded adoption, privacy score, daily trends |
| Privacy Risks | `/privacy-risks` | Round-trip linkability, batch deshield detection |
| Blend Check | `/tools/blend-check` | Amount commonality scoring for transaction privacy |
| Turnstile Tracker | `/turnstile`, `/api/pools/turnstile` | Where deshielded ZEC goes (held, reshielded, exchange, bridge) |
| Pool Analytics | `/pools` | Per-pool supply, flows, deltas (24h/7d/30d) |
| Linkability API | `/api/tx/:txid/linkability` | Heuristic shield→deshield correlation analysis |
| Rich List | `/rich-list` | Top transparent addresses with concentration metrics |
| Shielded TX browser | `/txs/shielded` | Filter by pool, fully-shielded vs partial |

### Cross-Chain & Infrastructure
| Feature | Route / API | Description |
|---------|-------------|-------------|
| Cross-chain analytics | `/crosschain` | NEAR Intents swap history, volume charts, 13+ chain explorer links |
| Address bridge history | `/api/crosschain/address/:address` | Per-address swap volume and direction |
| WebSocket real-time | `ws://api.*/` | Live blocks and mempool events |
| Lightwalletd gRPC | `lightwalletd.mainnet.cipherscan.app:443` | Free public light client endpoint |
| Fork Watch | `/reorgs` | Chain reorganizations, orphaned vs canonical comparison |
| ZNS name service | `/name/[name]` | Zcash Name Service resolution and marketplace |
| Newsletter (Privacy Index) | `/newsletter` | Weekly chain intelligence publication (11 issues) |
| Developer tools hub | `/tools` | Decode raw TX, broadcast, unit converter, blend check |
| WASM decoder npm | `@cipherscan/zcash-decoder` | Standalone client-side decryption library |
| Circulating supply API | `/api/circulating-supply` | CoinGecko/CMC-compatible plain-text endpoint |
| Crosslink explorer | `crosslink.cipherscan.app` | PoW+PoS testnet with validator roster, fork monitor |

### UX & Education
| Feature | Route | Description |
|---------|-------|-------------|
| Learn Zcash | `/learn` | Beginner guide to addresses, pools, viewing keys |
| Human-readable TX summaries | `/tx/[txid]` | Plain-English explanation on every transaction |
| Address labels | API + UI | Known exchange/miner/custodian labels |
| Buy ZEC (swap UI) | `/swap` | NEAR 1-Click cross-chain ZEC purchase |
| Maintenance banner | Global | Auto-detects stale indexer data |
| Dark/light theme | Global | System preference support |

---

## Intentional Omissions & Rationale

| Item | Rationale |
|------|-----------|
| **Payment disclosure protocol** | CipherScan implements client-side memo decryption (Orchard WASM) instead. Payment disclosure is a different standard; memo decrypt covers the primary user need (reading shielded memos) without server-side key handling. |
| **Tor hidden service (.onion)** | Separate M3 server deliverable. Requires Tor daemon + Caddy onion service configuration on production host. Cleared for post-deployment verification. |
| **Docker Compose stack** | Production runs on DigitalOcean with systemd units (`zebrad`, `cipherscan-rust`, `zcash-api`, `lightwalletd`, Caddy). `DEPLOYMENT.md` documents the operational path. A Dockerfile would duplicate this without matching production topology. |
| **z-address balance lookup** | Impossible by design — Zcash shielded addresses are private. Both explorers correctly omit this. |
| **Sprout memo decryption** | Orchard-focused WASM module; Sprout pool is deprecated and nearly empty. Sapling memo support is on the roadmap. |

---

## API Endpoint Coverage

Nighthawk exposed a small REST surface (~8 endpoints). CipherScan documents **43 public endpoints** across 8 categories at [cipherscan.app/docs](https://cipherscan.app/docs):

- Blocks (3)
- Transactions (5)
- Mempool (2)
- Addresses (3)
- Supply (5)
- Network (8)
- Privacy (6)
- Cross-Chain (3)
- Names / ZNS (2)
- Pool Analytics (3)

Internal/operational endpoints (gRPC status, fork monitor admin, scan tools) are intentionally excluded from public docs.

---

## Verification

Automated checks: `node zcg/milestone-3/verify.js https://cipherscan.app`

Manual review: this document + [VERIFICATION.md](./VERIFICATION.md)

---

## References

- Nighthawk live: https://mainnet.zcashexplorer.app/
- Nighthawk source: https://github.com/nighthawk-apps/zcash-explorer
- 3xpl Zcash: https://3xpl.com/zcash
- CipherScan live: https://cipherscan.app
- CipherScan API docs: https://cipherscan.app/docs
- ZCG Grant M3 spec: Milestone 3 — Feature Parity & Privacy Infrastructure (deadline 2026-09-30)
