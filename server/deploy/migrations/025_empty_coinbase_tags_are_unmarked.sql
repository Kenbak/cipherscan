-- Correct classifier v1's empty optional-tag handling. No transaction data changes.
-- Zebra separates the required coinbase height from optional Input::Coinbase data.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '120s';
-- Exclude live writers/reorgs while correcting daily counters.
SELECT pg_advisory_xact_lock(73982158587218);
CREATE OR REPLACE FUNCTION public.classify_mining_software_v1(h text) RETURNS text
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
DECLARE b bytea; t text; z boolean; k boolean; d boolean;
BEGIN
  IF h = '' THEN RETURN 'unknown'; END IF;
  IF h IS NULL OR length(h) % 2 <> 0 OR h !~ '^[0-9a-fA-F]+$' THEN RETURN 'missing'; END IF;
  b := decode(h, 'hex'); t := lower(encode(b, 'escape'));
  z := position(decode('f09fa693','hex') in b) > 0 OR t ~ '/zebra[: ]?v?[0-9]+\.[0-9]+(\.[0-9]+)?(-[a-z0-9.]+)?/';
  k := position(decode('f09f8cb8','hex') in b) > 0 OR t ~ '/zakura[: ]?v?[0-9]+\.[0-9]+(\.[0-9]+)?(-[a-z0-9.]+)?/';
  d := t ~ '/zcashd[: ]?v?[0-9]+\.[0-9]+(\.[0-9]+)?(-[a-z0-9.]+)?/';
  IF z::int + k::int + d::int > 1 THEN RETURN 'conflicting'; END IF;
  IF z THEN RETURN 'zebra'; ELSIF k THEN RETURN 'zakura'; ELSIF d THEN RETURN 'other'; END IF;
  RETURN 'unknown';
END $$;

UPDATE public.block_software s SET software='unknown'
FROM public.blocks b
WHERE b.height=s.height AND b.coinbase_hex='' AND s.software='missing';
-- The existing daily-count trigger moves the observations without changing totals.
COMMIT;
