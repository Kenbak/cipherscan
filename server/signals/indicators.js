/**
 * Trading Signals V2 — Individual Indicator Calculations
 *
 * Each function queries the DB and returns a score in [-100, +100].
 * Returns null if insufficient data is available.
 */

const config = require('./config');

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function linearScale(value, inMin, inMax, outMin, outMax) {
  if (inMax === inMin) return 0;
  const t = (value - inMin) / (inMax - inMin);
  return outMin + t * (outMax - outMin);
}

function zScoreToScore(zScore, zClamp) {
  return Math.round(linearScale(clamp(zScore, -zClamp, zClamp), -zClamp, zClamp, -100, 100));
}

/**
 * SVR — Migration-Neutral Shielded Velocity Ratio
 * Nets out Ironwood inflows against Orchard outflows to avoid counting
 * pool migrations as deshielding events.
 */
async function computeSVR(pool, targetDate, windowDays) {
  const result = await pool.query(`
    SELECT
      COALESCE(SUM(CASE WHEN flow_type = 'shield' THEN amount_zat ELSE 0 END), 0) AS shielded_zat,
      COALESCE(SUM(CASE WHEN flow_type = 'deshield' THEN amount_zat ELSE 0 END), 0) AS deshielded_zat,
      COALESCE(SUM(CASE WHEN flow_type = 'shield' AND pool = 'ironwood' THEN amount_zat ELSE 0 END), 0) AS ironwood_inflow,
      COALESCE(SUM(CASE WHEN flow_type = 'deshield' AND pool = 'orchard' THEN amount_zat ELSE 0 END), 0) AS orchard_outflow
    FROM shielded_flows
    WHERE block_time >= EXTRACT(EPOCH FROM ($1::date - ($2 || ' days')::interval))
      AND block_time < EXTRACT(EPOCH FROM ($1::date + '1 day'::interval))
      AND flow_type IN ('shield', 'deshield')
  `, [targetDate, windowDays]);

  const { shielded_zat, deshielded_zat, ironwood_inflow, orchard_outflow } = result.rows[0];
  let shielded = Number(shielded_zat);
  let deshielded = Number(deshielded_zat);
  const iwInflow = Number(ironwood_inflow);
  const orcOutflow = Number(orchard_outflow);

  if (shielded === 0 && deshielded === 0) return null;

  // Subtract migration component: if Ironwood inflows roughly match Orchard outflows,
  // they cancel out (pool migration, not a change in privacy posture)
  const migrationComponent = Math.min(iwInflow, orcOutflow);
  shielded -= migrationComponent;
  deshielded -= migrationComponent;

  if (shielded <= 0 && deshielded <= 0) return 0;
  if (deshielded <= 0) return 100;

  const ratio = shielded / deshielded;
  const { minRatio, maxRatio, neutralRatio } = config.svr;

  let score;
  if (ratio >= neutralRatio) {
    score = linearScale(ratio, neutralRatio, maxRatio, 0, 100);
  } else {
    score = linearScale(ratio, minRatio, neutralRatio, -100, 0);
  }

  return Math.round(clamp(score, -100, 100));
}

/**
 * Pool Momentum — z-score of recent pool growth vs its longer-term average.
 */
async function computePoolMomentum(pool, targetDate) {
  const { lookbackDays, shortWindow, zScoreClamp } = config.poolMomentum;

  const result = await pool.query(`
    SELECT date,
      (COALESCE(sapling_pool_size, 0) + COALESCE(orchard_pool_size, 0) + COALESCE(ironwood_pool_size, 0)) AS shielded_zat
    FROM privacy_trends_daily
    WHERE date >= ($1::date - ($2 || ' days')::interval)
      AND date <= $1::date
    ORDER BY date ASC
  `, [targetDate, lookbackDays + 1]);

  const rows = result.rows;
  if (rows.length < lookbackDays) return null;

  const deltas = [];
  for (let i = 1; i < rows.length; i++) {
    deltas.push(Number(rows[i].shielded_zat) - Number(rows[i - 1].shielded_zat));
  }

  if (deltas.length < lookbackDays) return null;

  const longMean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const variance = deltas.reduce((a, d) => a + (d - longMean) ** 2, 0) / deltas.length;
  const std = Math.sqrt(variance);

  if (std === 0) return 0;

  const shortDeltas = deltas.slice(-shortWindow);
  const shortMean = shortDeltas.reduce((a, b) => a + b, 0) / shortDeltas.length;
  const zScore = (shortMean - longMean) / std;

  return zScoreToScore(zScore, zScoreClamp);
}

/**
 * Miner-to-Exchange Ratio
 * What fraction of miner output is flowing to exchanges vs being held/shielded.
 * High exchange ratio = sell pressure = bearish. Low = holding = bullish.
 */
async function computeMinerExchange(pool, targetDate) {
  const { windowDays, zScoreClamp } = config.minerExchange;

  const result = await pool.query(`
    SELECT
      COALESCE(SUM(exchange_zat), 0) AS exchange_total,
      COALESCE(SUM(shielded_zat), 0) AS shielded_total,
      COALESCE(SUM(other_zat), 0) AS other_total
    FROM miner_destination_daily
    WHERE date >= ($1::date - ($2 || ' days')::interval)
      AND date <= $1::date
  `, [targetDate, windowDays]);

  const { exchange_total, shielded_total, other_total } = result.rows[0];
  const exchange = Number(exchange_total);
  const shielded = Number(shielded_total);
  const other = Number(other_total);
  const total = exchange + shielded + other;

  if (total === 0) return null;

  const exchangeRatio = exchange / total;

  // Also get 30d baseline for z-score context
  const baselineResult = await pool.query(`
    SELECT
      COALESCE(SUM(exchange_zat), 0) AS exchange_total,
      COALESCE(SUM(exchange_zat + shielded_zat + other_zat), 0) AS grand_total
    FROM miner_destination_daily
    WHERE date >= ($1::date - '30 days'::interval)
      AND date <= $1::date
  `, [targetDate]);

  const baseTotal = Number(baselineResult.rows[0].grand_total);
  const baseExchange = Number(baselineResult.rows[0].exchange_total);

  if (baseTotal === 0) {
    // Fallback: just use the ratio directly, inverted (high exchange = bearish)
    const score = linearScale(exchangeRatio, 0, 1, 100, -100);
    return Math.round(clamp(score, -100, 100));
  }

  const baselineRatio = baseExchange / baseTotal;
  const deviation = exchangeRatio - baselineRatio;

  // Inverted: above-average exchange flow = bearish, below = bullish
  const score = linearScale(clamp(deviation, -0.3, 0.3), -0.3, 0.3, 100, -100);
  return Math.round(clamp(score, -100, 100));
}

/**
 * Cross-chain Net Flow (USD-denominated)
 * Uses source_amount_usd for comparable volumes. Lower threshold (5 swaps).
 */
async function computeCrosschainFlow(pool, targetDate) {
  const { windowDays, minSwaps, normClamp } = config.crosschainFlow;

  const result = await pool.query(`
    SELECT
      COALESCE(SUM(CASE WHEN direction = 'inflow' THEN COALESCE(source_amount_usd, 0) ELSE 0 END), 0) AS inflow_usd,
      COALESCE(SUM(CASE WHEN direction = 'outflow' THEN COALESCE(source_amount_usd, 0) ELSE 0 END), 0) AS outflow_usd,
      COUNT(*) AS swap_count
    FROM cross_chain_swaps
    WHERE swap_created_at >= ($1::date - ($2 || ' days')::interval)
      AND swap_created_at < ($1::date + '1 day'::interval)
      AND status = 'SUCCESS'
  `, [targetDate, windowDays]);

  const { inflow_usd, outflow_usd, swap_count } = result.rows[0];
  const inflow = Number(inflow_usd);
  const outflow = Number(outflow_usd);
  const count = Number(swap_count);

  if (count < minSwaps) return null;

  const netFlow = inflow - outflow;
  const totalVolume = inflow + outflow;
  if (totalVolume === 0) return 0;

  const normalized = netFlow / (totalVolume / 2);
  const score = linearScale(
    clamp(normalized, -normClamp, normClamp),
    -normClamp, normClamp,
    -100, 100
  );

  return Math.round(score);
}

/**
 * Exchange Deposit Velocity — z-score of recent exchange deposits vs 30d baseline.
 * High deposits = sell pressure (contrarian: extreme deposits = capitulation = buy).
 */
async function computeExchangeVelocity(pool, targetDate) {
  const { lookbackDays, shortWindow, zScoreClamp } = config.exchangeVelocity;

  const result = await pool.query(`
    SELECT date, COALESCE(exchange_zat, 0) AS exchange_zat
    FROM turnstile_daily
    WHERE date >= ($1::date - ($2 || ' days')::interval)
      AND date <= $1::date
    ORDER BY date ASC
  `, [targetDate, lookbackDays]);

  const rows = result.rows;
  if (rows.length < lookbackDays * 0.7) return null;

  const values = rows.map(r => Number(r.exchange_zat));
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);

  if (std === 0) return 0;

  const shortValues = values.slice(-shortWindow);
  const shortMean = shortValues.reduce((a, b) => a + b, 0) / shortValues.length;
  const zScore = (shortMean - mean) / std;

  // Inverted: high exchange deposits = bearish
  return zScoreToScore(-zScore, zScoreClamp);
}

/**
 * Whale Accumulation — tracks aggregate balance change of large transparent holders.
 * Rising = accumulation = bullish. Falling = distribution = bearish.
 */
async function computeWhaleAccumulation(pool, targetDate) {
  const { minBalance, lookbackDays, zScoreClamp } = config.whaleAccumulation;

  // Get current aggregate whale balance and compare to lookback period
  // We use total_received - total_sent as a proxy for balance change trajectory
  const result = await pool.query(`
    SELECT
      SUM(balance) AS current_balance,
      COUNT(*) AS whale_count
    FROM addresses
    WHERE balance >= $1
  `, [minBalance]);

  if (!result.rows[0] || Number(result.rows[0].whale_count) === 0) return null;

  // Get recent large transparent outputs to whale addresses (accumulation signal)
  const recentActivity = await pool.query(`
    SELECT
      COALESCE(SUM(CASE WHEN to_balance >= $1 THEN value_zat ELSE 0 END), 0) AS whale_inflow,
      COALESCE(SUM(CASE WHEN from_balance >= $1 THEN value_zat ELSE 0 END), 0) AS whale_outflow
    FROM (
      SELECT
        o.value AS value_zat,
        COALESCE(addr_to.balance, 0) AS to_balance,
        COALESCE(addr_from.balance, 0) AS from_balance
      FROM transaction_outputs o
      JOIN transactions t ON t.txid = o.txid
      LEFT JOIN addresses addr_to ON addr_to.address = o.address
      LEFT JOIN transaction_inputs i ON i.txid = t.txid
      LEFT JOIN addresses addr_from ON addr_from.address = i.address
      WHERE t.block_time >= EXTRACT(EPOCH FROM ($2::date - ($3 || ' days')::interval))
        AND t.block_time < EXTRACT(EPOCH FROM ($2::date + '1 day'::interval))
        AND o.value >= 10000000000
      LIMIT 10000
    ) sub
  `, [minBalance, targetDate, lookbackDays]);

  const { whale_inflow, whale_outflow } = recentActivity.rows[0];
  const inflow = Number(whale_inflow);
  const outflow = Number(whale_outflow);

  if (inflow === 0 && outflow === 0) return null;

  const netFlow = inflow - outflow;
  const totalFlow = inflow + outflow;
  if (totalFlow === 0) return 0;

  const ratio = netFlow / totalFlow;
  const score = linearScale(clamp(ratio, -1, 1), -1, 1, -100, 100);
  return Math.round(score);
}

/**
 * Mean Reversion — price z-score from 60d SMA.
 * Far below = oversold = buy. Far above = overbought = sell (contrarian).
 */
async function computeMeanReversion(pool, targetDate) {
  const { smaDays, zScoreClamp } = config.meanReversion;

  const result = await pool.query(`
    SELECT date, price_usd
    FROM zec_price_daily
    WHERE date >= ($1::date - ($2 || ' days')::interval)
      AND date <= $1::date
    ORDER BY date ASC
  `, [targetDate, smaDays]);

  const rows = result.rows;
  if (rows.length < smaDays * 0.8) return null;

  const prices = rows.map(r => Number(r.price_usd));
  const currentPrice = prices[prices.length - 1];
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
  const variance = prices.reduce((a, p) => a + (p - mean) ** 2, 0) / prices.length;
  const std = Math.sqrt(variance);

  if (std === 0) return 0;

  const zScore = (currentPrice - mean) / std;

  // Contrarian: below mean = buy opportunity, above = caution
  return zScoreToScore(-zScore, zScoreClamp);
}

/**
 * Shielded TX Momentum — rising shielded percentage = bullish.
 */
async function computeShieldedTxMomentum(pool, targetDate) {
  const { shortWindow, longWindow, maxDelta } = config.shieldedTxMomentum;

  const result = await pool.query(`
    SELECT date, shielded_percentage
    FROM privacy_trends_daily
    WHERE date >= ($1::date - ($2 || ' days')::interval)
      AND date <= $1::date
    ORDER BY date ASC
  `, [targetDate, longWindow]);

  const rows = result.rows;
  if (rows.length < longWindow) return null;

  const longAvg = rows.reduce((a, r) => a + Number(r.shielded_percentage), 0) / rows.length;
  const shortRows = rows.slice(-shortWindow);
  const shortAvg = shortRows.reduce((a, r) => a + Number(r.shielded_percentage), 0) / shortRows.length;

  const delta = shortAvg - longAvg;
  return zScoreToScore(delta / (maxDelta / 3), 3);
}

/**
 * Fee Market Pressure — rising fee per tx = genuine demand for block space = bullish.
 */
async function computeFeePressure(pool, targetDate) {
  const { shortWindow, longWindow, zScoreClamp } = config.feePressure;

  const result = await pool.query(`
    SELECT
      AVG(CASE WHEN date >= ($1::date - ($2 || ' days')::interval)
          THEN avg_fee_per_tx END) AS short_avg,
      AVG(avg_fee_per_tx) AS long_avg,
      STDDEV(avg_fee_per_tx) AS long_std
    FROM (
      SELECT
        DATE(TO_TIMESTAMP(timestamp)) AS date,
        CASE WHEN transaction_count > 0 THEN total_fees::float / transaction_count ELSE 0 END AS avg_fee_per_tx
      FROM blocks
      WHERE timestamp >= EXTRACT(EPOCH FROM ($1::date - ($3 || ' days')::interval))
        AND timestamp < EXTRACT(EPOCH FROM ($1::date + '1 day'::interval))
    ) daily_fees
  `, [targetDate, shortWindow, longWindow]);

  const { short_avg, long_avg, long_std } = result.rows[0];
  if (!short_avg || !long_avg || !long_std || Number(long_std) === 0) return null;

  const zScore = (Number(short_avg) - Number(long_avg)) / Number(long_std);
  return zScoreToScore(zScore, zScoreClamp);
}

/**
 * Network Activity Momentum — 7d avg tx count vs 30d, z-score.
 */
async function computeNetworkMomentum(pool, targetDate) {
  const { shortWindow, longWindow, zScoreClamp } = config.networkMomentum;

  const result = await pool.query(`
    SELECT date, tx_count
    FROM (
      SELECT
        DATE(TO_TIMESTAMP(timestamp)) AS date,
        SUM(transaction_count) AS tx_count
      FROM blocks
      WHERE timestamp >= EXTRACT(EPOCH FROM ($1::date - ($2 || ' days')::interval))
        AND timestamp < EXTRACT(EPOCH FROM ($1::date + '1 day'::interval))
      GROUP BY DATE(TO_TIMESTAMP(timestamp))
    ) daily
    ORDER BY date ASC
  `, [targetDate, longWindow]);

  const rows = result.rows;
  if (rows.length < longWindow * 0.7) return null;

  const values = rows.map(r => Number(r.tx_count));
  const longMean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, v) => a + (v - longMean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);

  if (std === 0) return 0;

  const shortValues = values.slice(-shortWindow);
  const shortMean = shortValues.reduce((a, b) => a + b, 0) / shortValues.length;
  const zScore = (shortMean - longMean) / std;

  return zScoreToScore(zScore, zScoreClamp);
}

/**
 * Volume Z-Score — not directional, used as confidence multiplier.
 * Returns a multiplier between 0.5 (very low volume) and 1.5 (very high volume).
 */
async function computeVolumeZscore(pool, targetDate) {
  const { lookbackDays } = config.volumeZscore;

  const result = await pool.query(`
    SELECT date, volume_usd
    FROM zec_price_daily
    WHERE date >= ($1::date - ($2 || ' days')::interval)
      AND date <= $1::date
    ORDER BY date ASC
  `, [targetDate, lookbackDays]);

  const rows = result.rows;
  if (rows.length < lookbackDays * 0.7) return null;

  const volumes = rows.map(r => Number(r.volume_usd));
  const mean = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  const variance = volumes.reduce((a, v) => a + (v - mean) ** 2, 0) / volumes.length;
  const std = Math.sqrt(variance);

  if (std === 0) return 1.0;

  const currentVol = volumes[volumes.length - 1];
  const zScore = (currentVol - mean) / std;

  // Clamp to [0.5, 1.5] multiplier range
  return Math.round(clamp(0.5 + (zScore + 2) * (1.0 / 4), 0.5, 1.5) * 100) / 100;
}

module.exports = {
  computeSVR,
  computePoolMomentum,
  computeMinerExchange,
  computeCrosschainFlow,
  computeExchangeVelocity,
  computeWhaleAccumulation,
  computeMeanReversion,
  computeShieldedTxMomentum,
  computeFeePressure,
  computeNetworkMomentum,
  computeVolumeZscore,
};
