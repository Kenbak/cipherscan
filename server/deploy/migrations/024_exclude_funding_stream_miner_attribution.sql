-- ZIP-214 FPF/ZCG payments must never be attributed to the block miner.
-- Addresses: https://zips.z.cash/zip-0214 (Mainnet/Testnet revisions 1 and 2).
-- Preserve transaction outputs and address balances; repair derived attribution only.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '120s';
-- Coordinate with snapshot jobs so an in-flight old read cannot restore bad rows.
SELECT pg_advisory_xact_lock(839275);
SELECT pg_advisory_xact_lock(839276);

CREATE OR REPLACE FUNCTION public.exclude_funding_stream_miner()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.miner_address IN ('t3cFfPt1Bcvgez9ZbMBFWeZsskxTkPzGCow', 't2HifwjUj9uyxr9bknR8LFuQbc98c3vkXtu') THEN
    NEW.miner_address := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS exclude_funding_stream_miner ON public.blocks;
CREATE TRIGGER exclude_funding_stream_miner
BEFORE INSERT OR UPDATE OF miner_address ON public.blocks
FOR EACH ROW EXECUTE FUNCTION public.exclude_funding_stream_miner();
DROP TRIGGER IF EXISTS exclude_funding_stream_miner ON public.orphaned_blocks;
CREATE TRIGGER exclude_funding_stream_miner
BEFORE INSERT OR UPDATE OF miner_address ON public.orphaned_blocks
FOR EACH ROW EXECUTE FUNCTION public.exclude_funding_stream_miner();

UPDATE public.blocks SET miner_address = NULL
WHERE miner_address IN ('t3cFfPt1Bcvgez9ZbMBFWeZsskxTkPzGCow', 't2HifwjUj9uyxr9bknR8LFuQbc98c3vkXtu');
UPDATE public.orphaned_blocks SET miner_address = NULL
WHERE miner_address IN ('t3cFfPt1Bcvgez9ZbMBFWeZsskxTkPzGCow', 't2HifwjUj9uyxr9bknR8LFuQbc98c3vkXtu');

-- These optional job tables are not installed on every network.
DO $$ BEGIN
  IF to_regclass('public.mining_behavior_daily') IS NOT NULL THEN
    DELETE FROM public.mining_behavior_daily
    WHERE miner_address IN ('t3cFfPt1Bcvgez9ZbMBFWeZsskxTkPzGCow', 't2HifwjUj9uyxr9bknR8LFuQbc98c3vkXtu');
  END IF;
  IF to_regclass('public.miner_destination_daily') IS NOT NULL THEN
    -- The snapshot job previously assigned this dedicated bucket exclusively
    -- to the mainnet FPF address; no real miner shares this bucket.
    DELETE FROM public.miner_destination_daily WHERE pool_name = 'Dev Fund';
  END IF;
END $$;
COMMIT;
