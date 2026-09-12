-- Emergency operator recovery only, after migration 023 is installed.
-- Not a routine feature toggle. Derived statistics MUST be rebuilt afterwards.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
DROP TRIGGER IF EXISTS blocks_software_sync ON public.blocks;
DROP TRIGGER IF EXISTS block_software_daily_sync ON public.block_software;
UPDATE public.block_software_state SET ready=false, completed_at=NULL WHERE version=1;
COMMIT;
