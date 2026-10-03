-- Permanent, canonical daily chain-supply archive. No estimated size/pool rows.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE IF NOT EXISTS public.chain_supply_daily (
  date date PRIMARY KEY,
  block_height bigint NOT NULL CHECK (block_height >= 0),
  block_hash text NOT NULL CHECK (block_hash ~ '^[a-f0-9]{64}$'),
  block_time bigint NOT NULL CHECK (block_time > 0),
  chain_supply_zat bigint NOT NULL CHECK (chain_supply_zat BETWEEN 0 AND 2100000000000000),
  source text NOT NULL DEFAULT 'node-getblock-chain-supply-v1'
    CHECK (source = 'node-getblock-chain-supply-v1'),
  computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.chain_supply_archive_state (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  chain text NOT NULL CHECK (chain IN ('main','test')),
  genesis_hash text NOT NULL CHECK (genesis_hash ~ '^[a-f0-9]{64}$'),
  verified_height bigint NOT NULL CHECK (verified_height > 0),
  verified_hash text NOT NULL CHECK (verified_hash ~ '^[a-f0-9]{64}$'),
  verified_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.chain_supply_daily IS 'Chain state at completed UTC header-day boundaries, reconstructed from canonical node getblock.chainSupply.chainValueZat; idle days retain the last canonical state. The shared node ancestry checkpoint is verified on every API read. Permanent history; no retention pruning.';
DO $$ DECLARE writer text; BEGIN
  SELECT pg_get_userbyid(relowner) INTO writer FROM pg_class WHERE oid='public.blocks'::regclass;
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.chain_supply_daily, public.chain_supply_archive_state TO %I', writer);
END $$;
INSERT INTO public.schema_migrations(version,description) VALUES('032','Permanent canonical daily chain-supply history') ON CONFLICT(version) DO NOTHING;
COMMIT;
