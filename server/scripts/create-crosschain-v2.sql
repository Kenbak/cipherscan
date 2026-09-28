-- Additive, opt-in cross-chain index. No changes to legacy tables or cron.
-- Apply explicitly with psql -v ON_ERROR_STOP=1; see docs/crosschain-data.md.
BEGIN;
SET LOCAL lock_timeout = '2s';
CREATE TABLE IF NOT EXISTS crosschain_swaps_v2 (
  deposit_address text NOT NULL,
  deposit_memo text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('SUCCESS','FAILED','REFUNDED','PROCESSING','PENDING_DEPOSIT','INCOMPLETE_DEPOSIT')),
  swap_created_at timestamptz NOT NULL,
  source_chain text NOT NULL,
  source_token text NOT NULL,
  dest_chain text NOT NULL,
  dest_token text NOT NULL,
  source_amount numeric,
  dest_amount numeric,
  source_amount_usd numeric,
  dest_amount_usd numeric,
  payload jsonb NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  status_observed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (deposit_address, deposit_memo)
);
CREATE INDEX IF NOT EXISTS crosschain_v2_created ON crosschain_swaps_v2 (swap_created_at DESC, deposit_address, deposit_memo);
CREATE INDEX IF NOT EXISTS crosschain_v2_unsettled ON crosschain_swaps_v2 (last_checked_at)
  WHERE status IN ('PROCESSING','PENDING_DEPOSIT','INCOMPLETE_DEPOSIT');
CREATE TABLE IF NOT EXISTS crosschain_sync_v2 (
  mode text NOT NULL CHECK (mode IN ('sync','backfill','reconcile')),
  direction text NOT NULL CHECK (direction IN ('inflow','outflow')),
  cursor_address text,
  cursor_memo text,
  window_start timestamptz,
  window_end timestamptz,
  completed_at timestamptz,
  completed_through timestamptz,
  pages bigint NOT NULL DEFAULT 0,
  records bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mode, direction)
);
CREATE TABLE IF NOT EXISTS crosschain_coverage_v2 (
  direction text NOT NULL CHECK (direction IN ('inflow','outflow')),
  window_start timestamptz,
  window_end timestamptz NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (direction, window_end),
  CHECK (window_start IS NULL OR window_start < window_end)
);
COMMIT;
