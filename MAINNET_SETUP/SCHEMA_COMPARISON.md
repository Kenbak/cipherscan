# PostgreSQL Schema Comparison: Testnet vs Mainnet Setup

## ✅ SCHEMA NOW IDENTICAL

As of **November 18, 2025**, the mainnet setup now uses the **EXACT same schema** as the working testnet.

## 📊 Database Names

| Environment | Database Name | User |
|-------------|---------------|------|
| Testnet | `zcash_explorer_testnet` | `zcash_user` |
| Mainnet | `zcash_explorer_mainnet` | `zcash_user` |

## 📋 Tables

Both environments now have the **same 9 tables**:

1. ✅ `blocks` - Block data with full metadata
2. ✅ `transactions` - Transaction data with shielded pool info
3. ✅ `transaction_inputs` - Detailed input data
4. ✅ `transaction_outputs` - Detailed output data with spent tracking
5. ✅ `addresses` - Address balances and statistics
6. ✅ `mempool` - Mempool transactions
7. ✅ `privacy_stats` - Privacy metrics
8. ✅ `privacy_trends_daily` - Daily privacy trends
9. ✅ `privacy_stats_old` - (testnet only, legacy)

## 🔍 Key Schema Features

### Blocks Table
- Primary key: `height`
- Unique constraint: `hash`
- Indexes: `hash`, `previous_block_hash`, `timestamp DESC`
- Includes: difficulty, merkle_root, sapling_root, miner_address

### Transactions Table
- Primary key: `txid`
- Foreign key: `block_height` → `blocks(height)` ON DELETE CASCADE
- **Shielded pool tracking**:
  - `has_sapling`, `has_orchard`, `has_sprout`
  - `shielded_spends`, `shielded_outputs`, `orchard_actions`
  - `value_balance_sapling`, `value_balance_orchard`
- **Transaction metadata**:
  - `fee`, `total_input`, `total_output`
  - `is_coinbase`, `confirmations`
  - `tx_index` (position in block)
- Indexes: `block_height DESC`, `block_hash`, `timestamp DESC`, `block_time`

### Transaction Inputs/Outputs
- Detailed UTXO tracking
- Address indexing
- Spent tracking for outputs

### Addresses Table
- Balance tracking
- Transaction count
- First/last seen blocks

### Mempool Table
- Real-time mempool data
- Fee per byte calculation
- Shielded transaction detection

### Privacy Stats
- Aggregate privacy metrics
- Shielded percentage
- Privacy score (0-100)
- Adoption trend

## 🆚 What Changed from Initial Mainnet Setup

### ❌ Old (Incomplete) Schema
```sql
-- Missing tables:
- transaction_inputs
- transaction_outputs
- addresses
- mempool
- privacy_trends_daily

-- Missing columns in transactions:
- block_hash
- fee, total_input, total_output
- value_balance_sapling, value_balance_orchard
- binding_sig, binding_sig_sapling
- is_coinbase
- block_time, tx_index
- has_sapling, has_sprout
```

### ✅ New (Complete) Schema
- **All 9 tables** from testnet
- **All columns** match testnet exactly
- **All indexes** for performance
- **All foreign keys** for data integrity

## 🔧 Redis Integration

Both environments now use **Redis** for caching:
- Block data caching
- Transaction caching
- API response caching
- Reduces PostgreSQL load

## 📈 Performance Optimizations

### Indexes Created
- `idx_blocks_timestamp` - Fast recent blocks query
- `idx_transactions_block_height DESC` - Fast tx by block
- `idx_transactions_timestamp DESC` - Fast recent txs
- `idx_tx_outputs_address` - Fast address lookup
- `idx_addresses_balance DESC` - Fast rich list
- `idx_mempool_fee_per_byte DESC` - Fast mempool sorting

### Foreign Keys
- `transactions.block_height` → `blocks.height` (CASCADE DELETE)
- `transaction_inputs.txid` → `transactions.txid` (CASCADE DELETE)
- `transaction_outputs.txid` → `transactions.txid` (CASCADE DELETE)

## 🚀 Deployment Checklist

- [x] PostgreSQL schema matches testnet
- [x] Redis installed and configured
- [x] Indexer adapted for mainnet (port 8232)
- [x] API server adapted for mainnet
- [x] Systemd services created
- [x] Nginx config created
- [x] Environment variables template created
- [ ] Zebra synced to mainnet
- [ ] Indexer running and indexing
- [ ] API responding to requests
- [ ] Frontend deployed to Vercel

## 📝 Notes

- **Testnet has 3,683,226 blocks** (as of Nov 18, 2025)
- **Mainnet will take 24-48h** to sync from scratch
- **Snapshot download** recommended for faster sync (~350GB)
- **Lightwalletd** can be added after Zebra sync completes
