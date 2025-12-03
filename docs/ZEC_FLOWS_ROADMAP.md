# ZEC Flows - Feature Roadmap

Cross-chain ZEC tracking via NEAR Intents integration.

## Current Status ✅

- [x] Page `/flows` with mock data
- [x] Inflows/Outflows breakdown by chain
- [x] Recent swaps list with IN/OUT tags
- [x] Crypto icons via CDN
- [x] Multi-chain token support (USDC (ETH), USDC (SOL))
- [x] Mainnet-only (hidden on testnet)

## API Integration (Next)

- [ ] Get NEAR Intents API key ([Form](https://docs.google.com/forms/d/e/1FAIpQLSdrSrqSkKOMb_a8XhwF0f7N5xZ0Y5CYgyzxiAuoC2g4a2N68g/viewform))
- [ ] Connect real API (set `USE_MOCK_DATA = false`)
- [ ] Test with live data

## Future Features 🚀

### 1. TX Linking (High Priority)
The NEAR Intents API returns TX hashes for both chains:
```json
{
  "originChainTxHashes": ["0x..."],      // Source chain TX
  "destinationChainTxHashes": ["0x..."], // Destination chain TX
}
```

**Implementation:**
- [ ] Link to CipherScan TX page for ZEC transactions
- [ ] Link to external explorers for other chains (Etherscan, Solscan, etc.)
- [ ] Click on swap → opens TX details

### 2. TX Page Labels
On transaction detail pages, show bridge activity:
- [ ] Label: `🌉 Bridge Entry` (other → ZEC)
- [ ] Label: `🌉 Bridge Exit` (ZEC → other)
- [ ] Show source/destination chain info
- [ ] Link back to Flows page

### 3. Address Page Integration
Show cross-chain activity on address pages:
- [ ] "Cross-Chain Activity" section
- [ ] List of bridge entries/exits for this address
- [ ] Total volume bridged

### 4. Shielded Rate Tracking
Track if bridged ZEC gets shielded:
- [ ] Match `destinationChainTxHashes` with our indexed TXs
- [ ] Check if destination address later did a shielding TX
- [ ] Calculate and display "Shielded Rate" metric

### 5. Historical Data & Charts
- [ ] Store swaps in PostgreSQL for historical data
- [ ] 7d/30d volume charts
- [ ] Volume trends over time
- [ ] Top chains by volume chart

### 6. Notifications/Alerts
- [ ] Large swap alerts (> $10k)
- [ ] Unusual activity detection
- [ ] WebSocket for real-time updates

## External Explorer Links

| Chain | Explorer |
|-------|----------|
| ETH | https://etherscan.io/tx/{hash} |
| SOL | https://solscan.io/tx/{hash} |
| BTC | https://mempool.space/tx/{hash} |
| NEAR | https://nearblocks.io/txns/{hash} |
| DOGE | https://dogechain.info/tx/{hash} |
| XRP | https://xrpscan.com/tx/{hash} |
| ARB | https://arbiscan.io/tx/{hash} |
| BASE | https://basescan.org/tx/{hash} |
| POL | https://polygonscan.com/tx/{hash} |
| AVAX | https://snowtrace.io/tx/{hash} |

## API Documentation

- [NEAR Intents Explorer API](https://docs.near-intents.org/near-intents/integration/distribution-channels/intents-explorer-api)
- [Swagger UI](https://explorer.near-intents.org/api/docs)
- [OpenAPI Spec](https://explorer.near-intents.org/api/v0/openapi.yaml)

## Bounty Alignment

This feature aligns with the **NEAR Cross-Chain Privacy Solutions bounty ($20k)**:
> Use the NEAR intents SDK and other NEAR solutions to connect Zcash with multiple chains

Differentiators from [zcash.sucks](https://zcash.sucks):
- ✅ Integrated into full explorer (not standalone)
- ✅ Bi-directional (IN and OUT)
- ✅ Privacy tracking (shielded rate)
- ✅ TX linking to our explorer
- ✅ Address-level cross-chain history

