-- Coinbase marker observations v1. Install first, then run the API repository's
-- server/scripts/backfill-mining-software.js. Reads stay unavailable until complete.
-- New tables only; no rewrite of blocks. Trigger also follows canonical reorgs.
BEGIN;
SET LOCAL lock_timeout = '2s';
CREATE OR REPLACE FUNCTION public.classify_mining_software_v1(h text) RETURNS text
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
DECLARE b bytea; t text; z boolean; k boolean; d boolean;
BEGIN
  IF h IS NULL OR h = '' OR length(h) % 2 <> 0 OR h !~ '^[0-9a-fA-F]+$' THEN RETURN 'missing'; END IF;
  b := decode(h, 'hex'); t := lower(encode(b, 'escape'));
  z := position(decode('f09fa693','hex') in b) > 0 OR t ~ '/zebra[: ]?v?[0-9]+\.[0-9]+(\.[0-9]+)?(-[a-z0-9.]+)?/';
  k := position(decode('f09f8cb8','hex') in b) > 0 OR t ~ '/zakura[: ]?v?[0-9]+\.[0-9]+(\.[0-9]+)?(-[a-z0-9.]+)?/';
  d := t ~ '/zcashd[: ]?v?[0-9]+\.[0-9]+(\.[0-9]+)?(-[a-z0-9.]+)?/';
  IF z::int + k::int + d::int > 1 THEN RETURN 'conflicting'; END IF;
  IF z THEN RETURN 'zebra'; ELSIF k THEN RETURN 'zakura'; ELSIF d THEN RETURN 'other'; END IF;
  RETURN 'unknown';
END $$;
CREATE TABLE IF NOT EXISTS public.block_software (
  height integer PRIMARY KEY REFERENCES public.blocks(height) ON DELETE CASCADE,
  hash text NOT NULL,
  timestamp bigint NOT NULL,
  day integer NOT NULL,
  software text NOT NULL CHECK (software IN ('zebra','zakura','other','unknown','conflicting','missing'))
);
CREATE TABLE IF NOT EXISTS public.block_software_daily (
  day integer NOT NULL,
  software text NOT NULL,
  blocks bigint NOT NULL CHECK (blocks >= 0),
  PRIMARY KEY (day, software)
);
CREATE TABLE IF NOT EXISTS public.block_software_state (
  version integer PRIMARY KEY CHECK (version = 1),
  ready boolean NOT NULL DEFAULT false,
  completed_at timestamptz
);
INSERT INTO public.block_software_state(version) VALUES(1) ON CONFLICT DO NOTHING;
-- Preserve existing explicit/group ACLs inside the same transaction as trigger
-- installation, so a separate indexer login can keep inserting blocks immediately.
-- Never copy PUBLIC grants onto the new tables.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT grantee FROM information_schema.role_table_grants
    WHERE table_schema = (SELECT n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.oid='public.blocks'::regclass)
      AND table_name='blocks' AND grantee <> 'PUBLIC'
  LOOP
    IF has_table_privilege(r.grantee,'public.blocks','SELECT') THEN
      EXECUTE format('GRANT SELECT ON public.block_software, public.block_software_daily, public.block_software_state TO %I',r.grantee);
    END IF;
    IF has_table_privilege(r.grantee,'public.blocks','INSERT') OR has_table_privilege(r.grantee,'public.blocks','UPDATE') OR has_table_privilege(r.grantee,'public.blocks','DELETE') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.block_software, public.block_software_daily TO %I',r.grantee);
    END IF;
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.sync_block_software_daily() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    UPDATE public.block_software_daily SET blocks = blocks - 1 WHERE day = OLD.day AND software = OLD.software;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    INSERT INTO public.block_software_daily(day, software, blocks) VALUES(NEW.day, NEW.software, 1)
      ON CONFLICT(day, software) DO UPDATE SET blocks = block_software_daily.blocks + 1;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS block_software_daily_sync ON public.block_software;
CREATE TRIGGER block_software_daily_sync AFTER INSERT OR UPDATE OR DELETE ON public.block_software
FOR EACH ROW EXECUTE FUNCTION public.sync_block_software_daily();
CREATE OR REPLACE FUNCTION public.sync_block_software() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.block_software(height, hash, timestamp, day, software)
    VALUES(NEW.height, NEW.hash, NEW.timestamp, floor(NEW.timestamp / 86400.0)::int, public.classify_mining_software_v1(NEW.coinbase_hex))
    ON CONFLICT(height) DO UPDATE SET hash = EXCLUDED.hash, timestamp = EXCLUDED.timestamp, day = EXCLUDED.day, software = EXCLUDED.software
    WHERE (block_software.hash,block_software.timestamp,block_software.software) IS DISTINCT FROM (EXCLUDED.hash,EXCLUDED.timestamp,EXCLUDED.software);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS blocks_software_sync ON public.blocks;
CREATE TRIGGER blocks_software_sync AFTER INSERT OR UPDATE OF hash, timestamp, coinbase_hex ON public.blocks
FOR EACH ROW EXECUTE FUNCTION public.sync_block_software();
COMMIT;
CREATE INDEX CONCURRENTLY IF NOT EXISTS block_software_category_height_idx ON public.block_software(software, height);
CREATE INDEX CONCURRENTLY IF NOT EXISTS block_software_category_time_idx ON public.block_software(software, timestamp);
CREATE INDEX CONCURRENTLY IF NOT EXISTS block_software_time_idx ON public.block_software(timestamp, height);
CREATE INDEX CONCURRENTLY IF NOT EXISTS blocks_miner_height_idx ON public.blocks(miner_address, height);
