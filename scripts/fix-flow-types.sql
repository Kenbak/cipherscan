-- ============================================================================
-- Fix inverted flow_types in shielded_flows table
-- ============================================================================
-- The original backfill script had inverted logic:
--   - It classified positive valueBalance as 'shield' (wrong)
--   - It classified negative valueBalance as 'deshield' (wrong)
--
-- Correct logic (from Zcash protocol):
--   - Positive valueBalance = ZEC LEAVING shielded pool = DESHIELD
--   - Negative valueBalance = ZEC ENTERING shielded pool = SHIELD
--
-- This script swaps all 'shield' ↔ 'deshield' values.
-- ============================================================================

-- First, check current distribution
SELECT
  'BEFORE FIX' as status,
  flow_type,
  COUNT(*) as count,
  ROUND(SUM(amount_zat) / 100000000.0, 2) as total_zec
FROM shielded_flows
GROUP BY flow_type
ORDER BY flow_type;

-- Temporarily disable the constraint
ALTER TABLE shielded_flows DROP CONSTRAINT IF EXISTS shielded_flows_flow_type_check;

-- Swap values using a temporary value
UPDATE shielded_flows SET flow_type = 'temp_shield' WHERE flow_type = 'shield';
UPDATE shielded_flows SET flow_type = 'shield' WHERE flow_type = 'deshield';
UPDATE shielded_flows SET flow_type = 'deshield' WHERE flow_type = 'temp_shield';

-- Re-add the constraint
ALTER TABLE shielded_flows ADD CONSTRAINT shielded_flows_flow_type_check
  CHECK (flow_type IN ('shield', 'deshield'));

-- Verify the fix
SELECT
  'AFTER FIX' as status,
  flow_type,
  COUNT(*) as count,
  ROUND(SUM(amount_zat) / 100000000.0, 2) as total_zec
FROM shielded_flows
GROUP BY flow_type
ORDER BY flow_type;

-- Sanity check: shields should be much fewer than deshields on testnet
-- (Most testnet activity is claiming faucet funds = deshielding)
