-- Rebuild turnstile_daily with bridge_zat column.
-- Usage: psql -U postgres -d zcash_explorer_mainnet -f rebuild-turnstile-daily.sql

DROP MATERIALIZED VIEW IF EXISTS turnstile_daily;

CREATE MATERIALIZED VIEW turnstile_daily AS
WITH pure_deshields AS (
  SELECT
    DATE(TO_TIMESTAMP(sf.block_time)) AS date,
    sf.pool,
    sf.txid,
    txo.vout_index,
    txo.value
  FROM shielded_flows sf
  JOIN transaction_outputs txo ON txo.txid = sf.txid
  WHERE sf.flow_type = 'deshield'
    AND txo.address LIKE 't%'
    AND NOT EXISTS (
      SELECT 1 FROM transaction_inputs ti_check
      WHERE ti_check.txid = sf.txid
    )
),
with_spend AS (
  SELECT
    pd.date,
    pd.pool,
    pd.txid,
    pd.vout_index,
    pd.value,
    ti.txid AS spending_txid
  FROM pure_deshields pd
  LEFT JOIN transaction_inputs ti
    ON ti.prev_txid = pd.txid AND ti.prev_vout = pd.vout_index
),
reshield_txids AS (
  SELECT DISTINCT ws.spending_txid
  FROM with_spend ws
  JOIN shielded_flows sf ON sf.txid = ws.spending_txid
  WHERE ws.spending_txid IS NOT NULL
    AND sf.flow_type = 'shield'
),
exchange_txids AS (
  SELECT DISTINCT ws.spending_txid
  FROM with_spend ws
  JOIN transaction_outputs txo ON txo.txid = ws.spending_txid
  JOIN address_labels al ON al.address = txo.address
  WHERE ws.spending_txid IS NOT NULL
    AND al.category = 'exchange'
    AND ws.spending_txid NOT IN (SELECT spending_txid FROM reshield_txids)
),
bridge_txids AS (
  SELECT DISTINCT ws.spending_txid
  FROM with_spend ws
  JOIN transaction_outputs txo ON txo.txid = ws.spending_txid
  JOIN address_labels al ON al.address = txo.address
  WHERE ws.spending_txid IS NOT NULL
    AND al.category = 'bridge'
    AND ws.spending_txid NOT IN (SELECT spending_txid FROM reshield_txids)
    AND ws.spending_txid NOT IN (SELECT spending_txid FROM exchange_txids)
)
SELECT
  ws.date,
  ws.pool,
  SUM(ws.value) AS deshielded_zat,
  SUM(CASE WHEN ws.spending_txid IS NULL THEN ws.value ELSE 0 END) AS held_zat,
  SUM(CASE WHEN rt.spending_txid IS NOT NULL THEN ws.value ELSE 0 END) AS reshielded_zat,
  SUM(CASE WHEN et.spending_txid IS NOT NULL THEN ws.value ELSE 0 END) AS exchange_zat,
  SUM(CASE WHEN bt.spending_txid IS NOT NULL THEN ws.value ELSE 0 END) AS bridge_zat,
  SUM(CASE
    WHEN ws.spending_txid IS NOT NULL
     AND rt.spending_txid IS NULL
     AND et.spending_txid IS NULL
     AND bt.spending_txid IS NULL
    THEN ws.value ELSE 0
  END) AS transferred_zat,
  COUNT(DISTINCT ws.txid) AS tx_count
FROM with_spend ws
LEFT JOIN reshield_txids rt ON rt.spending_txid = ws.spending_txid
LEFT JOIN exchange_txids et ON et.spending_txid = ws.spending_txid
LEFT JOIN bridge_txids bt ON bt.spending_txid = ws.spending_txid
GROUP BY ws.date, ws.pool;

CREATE UNIQUE INDEX idx_turnstile_daily_date_pool ON turnstile_daily (date, pool);

ALTER MATERIALIZED VIEW turnstile_daily OWNER TO zcash_user;
GRANT SELECT ON turnstile_daily TO zcash_user;
