/**
 * Trading Signals — Individual Indicator Calculations
 *
 * Each function queries the DB for raw data and returns a score in [-100, +100].
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

/**
 * Shielded Velocity Ratio (SVR)
 * Measures net accumulation vs distribution over a rolling window.
 * ratio > 1 = more shielding than deshielding = bullish
 */
async function computeSVR(pool, targetDate, windowDays) {
  const result = await pool.query(`
    SELECT
      COALESCE(SUM(CASE WHEN flow_type = 'shield' THEN amount_zat ELSE 0 END), 0) AS shielded_zat,
      COALESCE(SUM(CASE WHEN flow_type = 'deshield' THEN amount_zat ELSE 0 END), 0) AS deshielded_zat
    FROM shielded_flows
    WHERE block_time >= EXTRACT(EPOCH FROM ($1::date - ($2 || ' days')::interval))
      AND block_time < EXTRACT(EPOCH FROM ($1::date + '1 day'::interval))
      AND flow_type IN ('shield', 'deshield')
  `, [targetDate, windowDays]);

  const { shielded_zat, deshielded_zat } = result.rows[0];
  const shielded = Number(shielded_zat);
  const deshielded = Number(deshielded_zat);

  if (shielded === 0 && deshielded === 0) return null;
  if (deshielded === 0) return 100;

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
 * Pool Momentum
 * Compares recent pool growth rate against its own longer-term average.
 * Accelerating growth = bullish, decelerating = bearish.
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

  // Compute daily deltas
  const deltas = [];
  for (let i = 1; i < rows.length; i++) {
    deltas.push(Number(rows[i].shielded_zat) - Number(rows[i - 1].shielded_zat));
  }

  if (deltas.length < lookbackDays) return null;

  // Long-term mean and std dev
  const longMean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const variance = deltas.reduce((a, d) => a + (d - longMean) ** 2, 0) / deltas.length;
  const std = Math.sqrt(variance);

  if (std === 0) return 0;

  // Short-term mean (last N days)
  const shortDeltas = deltas.slice(-shortWindow);
  const shortMean = shortDeltas.reduce((a, b) => a + b, 0) / shortDeltas.length;

  // Z-score of short-term vs long-term
  const zScore = (shortMean - longMean) / std;
  const score = linearScale(clamp(zScore, -zScoreClamp, zScoreClamp), -zScoreClamp, zScoreClamp, -100, 100);

  return Math.round(score);
}

/**
 * Miner Sell Pressure
 * Measures what percentage of mined ZEC is being sold quickly.
 * High sell rate = bearish (miners dumping), low = bullish (miners holding).
 */
async function computeMinerPressure(pool, targetDate) {
  const result = await pool.query(`
    SELECT
      COALESCE(SUM(earned_zat), 0) AS total_earned,
      COALESCE(SUM(spent_zat), 0) AS total_spent
    FROM mining_behavior_daily
    WHERE date >= ($1::date - '7 days'::interval)
      AND date <= $1::date
  `, [targetDate]);

  const { total_earned, total_spent } = result.rows[0];
  const earned = Number(total_earned);
  const spent = Number(total_spent);

  if (earned === 0) return null;

  const spendPct = (spent / earned) * 100;
  const { neutralSpendPct } = config.minerPressure;

  // 0% spent → +100 (very bullish), 100% spent → -100 (very bearish)
  const score = linearScale(spendPct, 100, 0, -100, 100);
  return Math.round(clamp(score, -100, 100));
}

/**
 * Cross-chain Net Flow
 * Net ZEC inflow from other chains vs outflow. Inflow = demand = bullish.
 */
async function computeCrosschainFlow(pool, targetDate) {
  const { windowDays, normClamp } = config.crosschainFlow;

  const result = await pool.query(`
    SELECT
      COALESCE(SUM(CASE WHEN direction = 'inflow' THEN COALESCE(dest_amount, 0) ELSE 0 END), 0) AS inflow_zec,
      COALESCE(SUM(CASE WHEN direction = 'outflow' THEN COALESCE(source_amount, 0) ELSE 0 END), 0) AS outflow_zec,
      COUNT(*) AS swap_count
    FROM cross_chain_swaps
    WHERE swap_created_at >= ($1::date - ($2 || ' days')::interval)
      AND swap_created_at < ($1::date + '1 day'::interval)
      AND status = 'COMPLETED'
  `, [targetDate, windowDays]);

  const { inflow_zec, outflow_zec, swap_count } = result.rows[0];
  const inflow = Number(inflow_zec);
  const outflow = Number(outflow_zec);
  const count = Number(swap_count);

  if (count < 10) return null; // insufficient activity

  const netFlow = inflow - outflow;
  const totalVolume = inflow + outflow;
  if (totalVolume === 0) return 0;

  // Normalize: net flow as fraction of total volume
  const normalized = netFlow / (totalVolume / 2);
  const score = linearScale(
    clamp(normalized, -normClamp, normClamp),
    -normClamp, normClamp,
    -100, 100
  );

  return Math.round(score);
}

/**
 * Shielded TX Momentum
 * Rising percentage of shielded transactions = growing privacy adoption = bullish.
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
  const score = linearScale(clamp(delta, -maxDelta, maxDelta), -maxDelta, maxDelta, -100, 100);

  return Math.round(score);
}

module.exports = {
  computeSVR,
  computePoolMomentum,
  computeMinerPressure,
  computeCrosschainFlow,
  computeShieldedTxMomentum,
};
