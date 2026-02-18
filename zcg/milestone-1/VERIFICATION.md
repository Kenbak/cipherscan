# CipherScan — Milestone 1 Verification Guide

## Deliverables

| # | Deliverable | Where | Status |
|---|------------|-------|--------|
| 1 | Decode UA tool | `/address/u1...` | Done |
| 2 | Mempool Explorer | `/mempool` | Done |
| 3 | Fee calculation | `/api/tx/:txid` | Verified |
| 4 | Supply & Circulating Supply APIs | `/api/supply`, `/api/circulating-supply` | Done |
| 5 | WASM decryption module (npm) | `@cipherscan/zcash-decoder` | Done |
| 6 | Decode Binary TX tool | `/tools/decode` | Done |
| 7 | Broadcast TX tool | `/tools/broadcast` | Done |
| 8 | Developer Tools page | `/tools` | Done |

## Automated Verification

```bash
node zcg/milestone-1/verify.js https://cipherscan.app
```

One command, 29 checks across all 8 deliverables. Exit code 0 = all passed.

---

## Manual Verification

### 1. Decode UA Tool

**Try it**: [cipherscan.app/address/u1fh3kwyl9...](https://cipherscan.app/address/u1fh3kwyl9hq9q907rx9j8mdy2r7gz4xh0y4yt63dxykk2856gr0238vxsegemyfu8s5a77ycq72tcnzkxa75ykjtcn6wp2w9rtuu3ssdzpe2fyghl8wlk3vh6f67304xe4lrxtvywtudy5t434zc07u6mh27ekufx7ssr55l8875z7f4k76c3tk23s3jzf8rxdlkequlta8lwsv09gxm)

Visit the link above. The page decodes the unified address into its component receivers (Unified, Transparent, Sapling) and shows each in a tabbed interface.

### 2. Mempool Explorer

- [cipherscan.app/mempool](https://cipherscan.app/mempool)

Shows live unconfirmed transactions from the Zebra node. The script verifies the page loads and the API returns a valid transaction count.

### 3. Fee Calculation

Fees are cross-referenced against external explorers to verify the Rust indexer computes them correctly.

**Transparent tx** — automated cross-reference with Blockchair:

| Source | Fee |
|--------|-----|
| CipherScan | 186,959 zatoshi |
| [Blockchair](https://blockchair.com/zcash/transaction/66c677bfb9501a99c5f85be08a69ca8a6b0c13b55cdf028d62759b09d23ef4d7) | 186,960 zatoshi |
| [3xpl](https://3xpl.com/zcash/transaction/66c677bfb9501a99c5f85be08a69ca8a6b0c13b55cdf028d62759b09d23ef4d7) | 186,960 zatoshi |

1 zatoshi difference is floating point serialization in the JSON response.

**Shielded tx** (external explorers can't compute shielded fees):

| Source | Fee |
|--------|-----|
| CipherScan | 10,000 zatoshi (0.0001 ZEC) |
| [3xpl](https://3xpl.com/zcash/transaction/09a50d6e41d3cc405ec847dbcbf7930f01873d520a2bcc6019942a7990298d85) | 10,000 zatoshi |

**Mixed tx**:

| Source | Fee |
|--------|-----|
| CipherScan | 15,000 zatoshi (0.00015 ZEC) |
| [3xpl](https://3xpl.com/zcash/transaction/7f6128309d6be25fc9c4b32f7a9c4d39ae882631dd0da14d2c73d5f4963f2637) | 15,000 zatoshi |

All fees match ZIP-317 expectations.

### 4. Supply & Circulating Supply APIs

```bash
# Pool breakdown
curl https://api.mainnet.cipherscan.app/api/supply

# Circulating supply (plain text, for CoinGecko/CMC)
curl https://api.mainnet.cipherscan.app/api/circulating-supply

# Circulating supply (JSON)
curl https://api.mainnet.cipherscan.app/api/circulating-supply?format=json
```

The script verifies:
- All pools returned (transparent, sprout, sapling, orchard, lockbox)
- Total pool value > 1M ZEC
- Circulating supply between 10M and 21M ZEC
- Max supply = 21,000,000 ZEC

### 5. WASM Decryption Module

**npm package**: [@cipherscan/zcash-decoder](https://www.npmjs.com/package/@cipherscan/zcash-decoder)

The script verifies the package exists on npm and checks the latest version.

**Try it on the frontend**: [cipherscan.app/decrypt](https://cipherscan.app/decrypt)

Paste a viewing key and transaction data to decrypt shielded memos entirely client-side using WASM.

### 6. Decode Binary TX Tool

**Try it**: [cipherscan.app/tools/decode](https://cipherscan.app/tools/decode)

Paste a raw transaction hex to decode it into human-readable fields. Entirely client-side, no server calls.

Test vectors (fetch raw hex via `curl https://api.mainnet.cipherscan.app/api/tx/<txid>/raw | jq -r .hex`):

| Type | Txid |
|------|------|
| Transparent (v4) | `66c677bfb9501a99c5f85be08a69ca8a6b0c13b55cdf028d62759b09d23ef4d7` |
| Shielded (v5/NU6.1) | `09a50d6e41d3cc405ec847dbcbf7930f01873d520a2bcc6019942a7990298d85` |
| Mixed (v5/NU6.1) | `7f6128309d6be25fc9c4b32f7a9c4d39ae882631dd0da14d2c73d5f4963f2637` |

### 7. Broadcast TX Tool

**Try it**: [cipherscan.app/tools/broadcast](https://cipherscan.app/tools/broadcast)

The script verifies the API rejects:
- Empty body (400)
- Invalid hex (400)
- Malformed transaction data (400 from Zebra)

To test a successful broadcast, construct a signed transaction on testnet using Zingo CLI and paste the raw hex.

### 8. Developer Tools Page

**Try it**: [cipherscan.app/tools](https://cipherscan.app/tools)

Hub page linking to all developer tools:
- Decode Raw Transaction (client-side)
- Broadcast Transaction (API)
- Decrypt Shielded Memo (client-side WASM)

The script verifies the page loads, all three tools are listed, and the navbar links to `/tools` from the homepage.

---

## Running the Script

```bash
# Mainnet
node zcg/milestone-1/verify.js https://cipherscan.app

# Testnet
node zcg/milestone-1/verify.js https://testnet.cipherscan.app
```

Exit codes: `0` = passed, `1` = failed, `2` = fatal error
