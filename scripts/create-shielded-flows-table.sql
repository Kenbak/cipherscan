-- ============================================================================
-- Shielded Flows Table
-- ============================================================================
-- Tracks all shielding and deshielding transactions for linkability detection.
-- Used by the "Round-Trip Transaction Linking (Privacy Education)" feature.
--
-- Flow Types:
--   - 'shield': Transparent → Shielded (valueBalance < 0)
--   - 'deshield': Shielded → Transparent (valueBalance > 0)
--
-- Amount Logic (from Zcash protocol):
--   - valueBalance = shielded_outputs - shielded_inputs
--   - Positive valueBalance = ZEC LEAVING shielded pool → transparent (DESHIELD)
--   - Negative valueBalance = ZEC ENTERING shielded pool ← transparent (SHIELD)
--   - We store ABSOLUTE amounts for easier matching
--
-- Reference:
--   - https://cipherscan.app/docs (transaction API)
--   - Zooko's endorsement: https://twitter.com/zooko/...
-- ============================================================================

-- Drop table if exists (for fresh start during development)
-- DROP TABLE IF EXISTS shielded_flows;

CREATE TABLE IF NOT EXISTS shielded_flows (
  id SERIAL PRIMARY KEY,

  -- Transaction identification
  txid TEXT NOT NULL,
  block_height INTEGER NOT NULL,
  block_time INTEGER NOT NULL, -- Unix timestamp

  -- Flow classification
  flow_type TEXT NOT NULL CHECK (flow_type IN ('shield', 'deshield')),

  -- Amount in zatoshis (absolute value, for easier matching)
  amount_zat BIGINT NOT NULL,

  -- Pool information (which shielded pool was used)
  pool TEXT NOT NULL CHECK (pool IN ('sapling', 'orchard', 'sprout', 'mixed')),

  -- Breakdown by pool (when mixed transactions occur)
  amount_sapling_zat BIGINT DEFAULT 0,
  amount_orchard_zat BIGINT DEFAULT 0,

  -- Related transparent addresses (for deshielding, these are the recipients)
  -- For shielding, these are the source addresses
  transparent_addresses TEXT[], -- Array of addresses involved

  -- Total transparent value involved (for validation)
  transparent_value_zat BIGINT DEFAULT 0,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),

  -- Constraints
  UNIQUE(txid, flow_type) -- A tx can have both shield and deshield (pass-through)
);

-- ============================================================================
-- INDEXES for fast lookups
-- ============================================================================

-- Primary lookup: Find matching amounts (the core of linkability detection)
-- B-tree on amount for range queries (±1% tolerance)
CREATE INDEX IF NOT EXISTS idx_shielded_flows_amount
  ON shielded_flows(amount_zat);

-- Filter by flow type (shield vs deshield)
CREATE INDEX IF NOT EXISTS idx_shielded_flows_type
  ON shielded_flows(flow_type);

-- Time-based queries (find flows within a time window)
CREATE INDEX IF NOT EXISTS idx_shielded_flows_time
  ON shielded_flows(block_time);

-- Compound index for the most common query:
-- "Find deshields with similar amount after this shield"
CREATE INDEX IF NOT EXISTS idx_shielded_flows_type_amount_time
  ON shielded_flows(flow_type, amount_zat, block_time);

-- Lookup by transaction
CREATE INDEX IF NOT EXISTS idx_shielded_flows_txid
  ON shielded_flows(txid);

-- Lookup by pool type
CREATE INDEX IF NOT EXISTS idx_shielded_flows_pool
  ON shielded_flows(pool);

-- Block height for syncing/backfill progress
CREATE INDEX IF NOT EXISTS idx_shielded_flows_height
  ON shielded_flows(block_height);

-- ============================================================================
-- HELPER VIEWS (optional, for debugging/analysis)
-- ============================================================================

-- View: Recent shielding activity
CREATE OR REPLACE VIEW recent_shields AS
SELECT
  txid,
  block_height,
  to_timestamp(block_time) as time,
  amount_zat / 100000000.0 as amount_zec,
  pool
FROM shielded_flows
WHERE flow_type = 'shield'
ORDER BY block_time DESC
LIMIT 100;

-- View: Recent deshielding activity
CREATE OR REPLACE VIEW recent_deshields AS
SELECT
  txid,
  block_height,
  to_timestamp(block_time) as time,
  amount_zat / 100000000.0 as amount_zec,
  pool
FROM shielded_flows
WHERE flow_type = 'deshield'
ORDER BY block_time DESC
LIMIT 100;

-- View: Potential round-trips (basic detection)
-- This is a simple query to find exact or near-exact matches
CREATE OR REPLACE VIEW potential_roundtrips AS
SELECT
  s.txid as shield_txid,
  d.txid as deshield_txid,
  s.amount_zat / 100000000.0 as shield_amount,
  d.amount_zat / 100000000.0 as deshield_amount,
  ABS(s.amount_zat - d.amount_zat) / 100000000.0 as difference,
  (d.block_time - s.block_time) / 3600.0 as hours_between,
  s.pool as shield_pool,
  d.pool as deshield_pool
FROM shielded_flows s
JOIN shielded_flows d ON
  d.flow_type = 'deshield'
  AND s.flow_type = 'shield'
  AND d.block_time > s.block_time
  -- Within 1% tolerance
  AND d.amount_zat BETWEEN s.amount_zat * 0.99 AND s.amount_zat * 1.01
  -- Within 30 days
  AND d.block_time - s.block_time < 30 * 24 * 3600
ORDER BY hours_between ASC
LIMIT 1000;

-- ============================================================================
-- STATISTICS
-- ============================================================================

-- After running the backfill, check stats with:
-- SELECT
--   flow_type,
--   pool,
--   COUNT(*) as count,
--   SUM(amount_zat) / 100000000.0 as total_zec
-- FROM shielded_flows
-- GROUP BY flow_type, pool
-- ORDER BY flow_type, pool;
