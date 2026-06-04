-- Turnstile + flow daily materialized views for /pools page.
-- Run manually on mainnet + testnet before deploying the pools feature.
--
-- Pre-aggregates deshield UTXO spend status by joining:
--   shielded_flows -> transaction_outputs -> transaction_inputs

CREATE MATERIALIZED VIEW IF NOT EXISTS turnstile_daily AS
WITH daily_deshields AS (
  SELECT
    DATE(TO_TIMESTAMP(sf.block_time)) AS date,
    sf.pool,
    sf.txid,
    txo.vout_index,
    txo.value,
    txo.address
  FROM shielded_flows sf
  JOIN transaction_outputs txo ON txo.txid = sf.txid
  WHERE sf.flow_type = 'deshield'
    AND txo.address LIKE 't%'
)
SELECT
  dd.date,
  dd.pool,
  SUM(dd.value) AS deshielded_zat,
  SUM(CASE WHEN ti.prev_txid IS NULL THEN dd.value ELSE 0 END) AS held_zat,
  SUM(CASE WHEN ti.prev_txid IS NOT NULL THEN dd.value ELSE 0 END) AS moved_zat,
  COUNT(DISTINCT dd.txid) AS tx_count
FROM daily_deshields dd
LEFT JOIN transaction_inputs ti
  ON ti.prev_txid = dd.txid AND ti.prev_vout = dd.vout_index
GROUP BY dd.date, dd.pool;

CREATE UNIQUE INDEX IF NOT EXISTS idx_turnstile_daily_date_pool
  ON turnstile_daily (date, pool);

CREATE MATERIALIZED VIEW IF NOT EXISTS flow_daily AS
SELECT
  DATE(TO_TIMESTAMP(block_time)) AS date,
  flow_type,
  pool,
  SUM(amount_zat) AS total_zat,
  COUNT(*) AS tx_count
FROM shielded_flows
GROUP BY date, flow_type, pool;

CREATE UNIQUE INDEX IF NOT EXISTS idx_flow_daily_date_type_pool
  ON flow_daily (date, flow_type, pool);
