/**
 * Trading Signals V2 — Compute Engine
 *
 * Computes all indicators, detects market regime, applies adaptive weights,
 * produces a composite score with confidence, and upserts to trading_signals.
 *
 * Usage:
 *   node server/signals/compute.js              # compute for today
 *   node server/signals/compute.js --date 2026-06-01
 *   node server/signals/compute.js --backfill   # all dates with price data
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../api/.env') });
const { Pool } = require('pg');
const config = require('./config');
const indicators = require('./indicators');

const pgPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

function classifySignal(score) {
  const { strongBuy, buy, sell, strongSell } = config.thresholds;
  if (score >= strongBuy) return 'STRONG_BUY';
  if (score >= buy) return 'BUY';
  if (score <= strongSell) return 'STRONG_SELL';
  if (score <= sell) return 'SELL';
  return 'HOLD';
}

/**
 * Regime Detection
 * Uses 30d price trend (SMA slope) and realized volatility to classify
 * the market as BULL, BEAR, or RANGE.
 */
async function detectRegime(pool, targetDate) {
  const { smaDays, volDays, slopeThreshold, volHighThreshold } = config.regime;

  const result = await pool.query(`
    SELECT date, price_usd
    FROM zec_price_daily
    WHERE date >= ($1::date - ($2 || ' days')::interval)
      AND date <= $1::date
    ORDER BY date ASC
  `, [targetDate, smaDays]);

  const rows = result.rows;
  if (rows.length < smaDays * 0.7) return { regime: 'RANGE', confidence: 0.5 };

  const prices = rows.map(r => Number(r.price_usd));

  // SMA slope: linear regression slope normalized by mean price
  const n = prices.length;
  const xMean = (n - 1) / 2;
  const yMean = prices.reduce((a, b) => a + b, 0) / n;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (prices[i] - yMean);
    denominator += (i - xMean) ** 2;
  }
  const slope = denominator > 0 ? numerator / denominator : 0;
  const normalizedSlope = slope / yMean;

  // Realized volatility: std dev of daily returns
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  const retMean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const retVariance = returns.reduce((a, r) => a + (r - retMean) ** 2, 0) / returns.length;
  const volatility = Math.sqrt(retVariance);

  let regime = 'RANGE';
  let regimeConfidence = 0.5;

  if (normalizedSlope > slopeThreshold && volatility < volHighThreshold) {
    regime = 'BULL';
    regimeConfidence = Math.min(1.0, normalizedSlope / (slopeThreshold * 3));
  } else if (normalizedSlope < -slopeThreshold && volatility < volHighThreshold) {
    regime = 'BEAR';
    regimeConfidence = Math.min(1.0, Math.abs(normalizedSlope) / (slopeThreshold * 3));
  } else {
    regime = 'RANGE';
    regimeConfidence = volatility > volHighThreshold ? 0.3 : 0.6;
  }

  return { regime, confidence: regimeConfidence, slope: normalizedSlope, volatility };
}

/**
 * Fetch adaptive weights from last computed snapshot, or fall back to defaults.
 */
async function getAdaptiveWeights(pool, targetDate) {
  const result = await pool.query(`
    SELECT weights_json
    FROM signal_weight_snapshots
    WHERE snapshot_date <= $1
    ORDER BY snapshot_date DESC
    LIMIT 1
  `, [targetDate]);

  if (result.rows.length > 0 && result.rows[0].weights_json) {
    try {
      return JSON.parse(result.rows[0].weights_json);
    } catch { /* fall through */ }
  }

  return config.weights;
}

/**
 * Compute confidence score (0-100) based on indicator concordance,
 * volume confirmation, and regime clarity.
 */
function computeConfidence(scores, volumeMultiplier, regimeConfidence) {
  const nonNull = Object.values(scores).filter(v => v !== null);
  if (nonNull.length === 0) return 0;

  // Concordance: what fraction of indicators agree on direction
  const positives = nonNull.filter(v => v > 10).length;
  const negatives = nonNull.filter(v => v < -10).length;
  const dominant = Math.max(positives, negatives);
  const concordance = dominant / nonNull.length;

  // Volume multiplier contribution (high volume = more confident)
  const volumeFactor = volumeMultiplier !== null ? volumeMultiplier : 1.0;

  // Weighted confidence
  const raw = (concordance * 0.5 + regimeConfidence * 0.3 + (volumeFactor - 0.5) * 0.2) * 100;
  return Math.round(Math.max(0, Math.min(100, raw)));
}

/**
 * Apply regime-based weight adjustments.
 * In BULL: boost momentum indicators, suppress SELL signals.
 * In BEAR: boost mean-reversion and miner flow.
 */
function applyRegimeWeights(baseWeights, regime) {
  const adjusted = { ...baseWeights };

  if (regime === 'BULL') {
    adjusted.pool_momentum = (adjusted.pool_momentum || 0) * 1.3;
    adjusted.crosschain_flow = (adjusted.crosschain_flow || 0) * 1.2;
    adjusted.network_momentum = (adjusted.network_momentum || 0) * 1.3;
    adjusted.mean_reversion = (adjusted.mean_reversion || 0) * 0.6;
    adjusted.exchange_velocity = (adjusted.exchange_velocity || 0) * 0.8;
  } else if (regime === 'BEAR') {
    adjusted.mean_reversion = (adjusted.mean_reversion || 0) * 1.4;
    adjusted.miner_exchange = (adjusted.miner_exchange || 0) * 1.3;
    adjusted.exchange_velocity = (adjusted.exchange_velocity || 0) * 1.3;
    adjusted.pool_momentum = (adjusted.pool_momentum || 0) * 0.7;
    adjusted.network_momentum = (adjusted.network_momentum || 0) * 0.7;
  }

  // Renormalize to sum to 1.0
  const total = Object.values(adjusted).reduce((a, b) => a + b, 0);
  if (total > 0) {
    for (const key of Object.keys(adjusted)) {
      adjusted[key] /= total;
    }
  }

  return adjusted;
}

async function computeForDate(targetDate) {
  const dateStr = targetDate.toISOString().split('T')[0];

  // Compute all indicators in parallel
  const [svr7, svr30, poolMom, minerExch, crossFlow, exchVel,
         whaleAcc, meanRev, txMom, feePres, netMom, volZ] = await Promise.all([
    indicators.computeSVR(pgPool, dateStr, 7),
    indicators.computeSVR(pgPool, dateStr, 30),
    indicators.computePoolMomentum(pgPool, dateStr),
    indicators.computeMinerExchange(pgPool, dateStr),
    indicators.computeCrosschainFlow(pgPool, dateStr),
    indicators.computeExchangeVelocity(pgPool, dateStr),
    indicators.computeWhaleAccumulation(pgPool, dateStr),
    indicators.computeMeanReversion(pgPool, dateStr),
    indicators.computeShieldedTxMomentum(pgPool, dateStr),
    indicators.computeFeePressure(pgPool, dateStr),
    indicators.computeNetworkMomentum(pgPool, dateStr),
    indicators.computeVolumeZscore(pgPool, dateStr),
  ]);

  const scores = {
    svr_7d: svr7,
    svr_30d: svr30,
    pool_momentum: poolMom,
    miner_exchange: minerExch,
    crosschain_flow: crossFlow,
    exchange_velocity: exchVel,
    whale_accumulation: whaleAcc,
    mean_reversion: meanRev,
    shielded_tx_momentum: txMom,
    fee_pressure: feePres,
    network_momentum: netMom,
    volume_zscore: volZ,
  };

  // Detect regime
  const regimeResult = await detectRegime(pgPool, dateStr);
  const { regime, confidence: regimeConfidence } = regimeResult;

  // Get weights (adaptive or default)
  let baseWeights = await getAdaptiveWeights(pgPool, dateStr);
  const weights = applyRegimeWeights(baseWeights, regime);

  // Compute weighted composite (skip null indicators and volume_zscore which is a multiplier)
  let totalWeight = 0;
  let weightedSum = 0;
  for (const [key, value] of Object.entries(scores)) {
    if (key === 'volume_zscore') continue;
    if (value !== null && weights[key]) {
      totalWeight += weights[key];
      weightedSum += value * weights[key];
    }
  }

  let composite = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Apply volume multiplier to composite
  const volumeMultiplier = volZ !== null ? volZ : 1.0;
  composite = composite * volumeMultiplier;
  composite = Math.round(Math.max(-100, Math.min(100, composite)));

  // Signal classification with regime suppression
  let signal = classifySignal(composite);
  if (regime === 'BULL' && (signal === 'SELL' || signal === 'STRONG_SELL') && composite > -60) {
    signal = 'HOLD';
  }
  if (regime === 'BEAR' && (signal === 'BUY' || signal === 'STRONG_BUY') && composite < 60) {
    signal = 'HOLD';
  }

  // Confidence
  const confidence = computeConfidence(scores, volumeMultiplier, regimeConfidence);

  // Fetch price context
  const priceResult = await pgPool.query(
    `SELECT price_usd FROM zec_price_daily WHERE date = $1`, [dateStr]
  );
  const poolResult = await pgPool.query(
    `SELECT shielded_percentage FROM privacy_trends_daily WHERE date = $1`, [dateStr]
  );

  const price = priceResult.rows[0]?.price_usd || null;
  const poolPct = poolResult.rows[0]?.shielded_percentage || null;

  // Upsert
  await pgPool.query(`
    INSERT INTO trading_signals (
      signal_date, svr_7d, svr_30d, pool_momentum, miner_pressure,
      crosschain_flow, shielded_tx_momentum, composite_score, signal,
      price_usd, shielded_pool_pct,
      exchange_velocity, whale_accumulation, mean_reversion,
      fee_pressure, network_momentum, volume_multiplier,
      regime, confidence, weights_used
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
    ON CONFLICT (signal_date) DO UPDATE SET
      computed_at = NOW(),
      svr_7d = EXCLUDED.svr_7d,
      svr_30d = EXCLUDED.svr_30d,
      pool_momentum = EXCLUDED.pool_momentum,
      miner_pressure = EXCLUDED.miner_pressure,
      crosschain_flow = EXCLUDED.crosschain_flow,
      shielded_tx_momentum = EXCLUDED.shielded_tx_momentum,
      composite_score = EXCLUDED.composite_score,
      signal = EXCLUDED.signal,
      price_usd = EXCLUDED.price_usd,
      shielded_pool_pct = EXCLUDED.shielded_pool_pct,
      exchange_velocity = EXCLUDED.exchange_velocity,
      whale_accumulation = EXCLUDED.whale_accumulation,
      mean_reversion = EXCLUDED.mean_reversion,
      fee_pressure = EXCLUDED.fee_pressure,
      network_momentum = EXCLUDED.network_momentum,
      volume_multiplier = EXCLUDED.volume_multiplier,
      regime = EXCLUDED.regime,
      confidence = EXCLUDED.confidence,
      weights_used = EXCLUDED.weights_used
  `, [
    dateStr, svr7, svr30, poolMom, minerExch, crossFlow, txMom,
    composite, signal, price, poolPct,
    exchVel, whaleAcc, meanRev, feePres, netMom, volumeMultiplier,
    regime, confidence, JSON.stringify(weights),
  ]);

  return { date: dateStr, scores, composite, signal, regime, confidence, price, volumeMultiplier };
}

/**
 * Compute adaptive weights based on rolling correlation of each indicator
 * against forward 7d returns over the past 90 days.
 */
async function computeAdaptiveWeights(targetDate) {
  const dateStr = targetDate.toISOString().split('T')[0];
  const { correlationWindow, minCorrelation, minWeight } = config.adaptiveWeights;

  const result = await pgPool.query(`
    SELECT
      s.signal_date,
      s.svr_7d, s.svr_30d, s.pool_momentum, s.miner_pressure,
      s.crosschain_flow, s.shielded_tx_momentum,
      s.exchange_velocity, s.whale_accumulation, s.mean_reversion,
      s.fee_pressure, s.network_momentum,
      ((future.price_usd - s.price_usd) / NULLIF(s.price_usd, 0)) * 100 AS forward_return
    FROM trading_signals s
    JOIN zec_price_daily future ON future.date = s.signal_date + '7 days'::interval
    WHERE s.signal_date >= ($1::date - ($2 || ' days')::interval)
      AND s.signal_date < $1::date
      AND s.price_usd > 0
    ORDER BY s.signal_date ASC
  `, [dateStr, correlationWindow]);

  const rows = result.rows;
  if (rows.length < 30) return null;

  const indicatorKeys = [
    'svr_7d', 'svr_30d', 'pool_momentum', 'miner_pressure',
    'crosschain_flow', 'shielded_tx_momentum',
    'exchange_velocity', 'whale_accumulation', 'mean_reversion',
    'fee_pressure', 'network_momentum',
  ];

  // Map old miner_pressure column to miner_exchange weight key
  const keyMapping = { miner_pressure: 'miner_exchange' };

  const correlations = {};
  for (const ind of indicatorKeys) {
    const pairs = rows
      .filter(r => r[ind] !== null && r.forward_return !== null)
      .map(r => [Number(r[ind]), Number(r.forward_return)]);

    if (pairs.length < 20) {
      correlations[keyMapping[ind] || ind] = 0;
      continue;
    }

    const n = pairs.length;
    const sumX = pairs.reduce((a, p) => a + p[0], 0);
    const sumY = pairs.reduce((a, p) => a + p[1], 0);
    const sumXY = pairs.reduce((a, p) => a + p[0] * p[1], 0);
    const sumX2 = pairs.reduce((a, p) => a + p[0] ** 2, 0);
    const sumY2 = pairs.reduce((a, p) => a + p[1] ** 2, 0);
    const num = n * sumXY - sumX * sumY;
    const den = Math.sqrt((n * sumX2 - sumX ** 2) * (n * sumY2 - sumY ** 2));
    const r = den > 0 ? num / den : 0;

    correlations[keyMapping[ind] || ind] = r;
  }

  // Volume zscore is not directional — keep fixed
  const newWeights = { volume_zscore: config.weights.volume_zscore || 0.05 };

  // Assign weights proportional to absolute correlation, with minimum floor
  let totalCorr = 0;
  for (const [key, r] of Object.entries(correlations)) {
    const absR = Math.max(Math.abs(r), minCorrelation);
    totalCorr += absR;
  }

  for (const [key, r] of Object.entries(correlations)) {
    const absR = Math.max(Math.abs(r), minCorrelation);
    const rawWeight = absR / totalCorr;
    newWeights[key] = Math.max(minWeight, rawWeight * (1 - newWeights.volume_zscore));
  }

  // Normalize all weights to sum to 1.0
  const totalW = Object.values(newWeights).reduce((a, b) => a + b, 0);
  for (const key of Object.keys(newWeights)) {
    newWeights[key] = Math.round((newWeights[key] / totalW) * 1000) / 1000;
  }

  // Store snapshot
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS signal_weight_snapshots (
      id BIGSERIAL PRIMARY KEY,
      snapshot_date DATE NOT NULL,
      weights_json TEXT NOT NULL,
      correlations_json TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT signal_weights_date_unique UNIQUE (snapshot_date)
    )
  `);

  await pgPool.query(`
    INSERT INTO signal_weight_snapshots (snapshot_date, weights_json, correlations_json)
    VALUES ($1, $2, $3)
    ON CONFLICT (snapshot_date) DO UPDATE SET
      weights_json = EXCLUDED.weights_json,
      correlations_json = EXCLUDED.correlations_json,
      created_at = NOW()
  `, [dateStr, JSON.stringify(newWeights), JSON.stringify(correlations)]);

  return { weights: newWeights, correlations };
}

async function main() {
  const args = process.argv.slice(2);
  const isBackfill = args.includes('--backfill');
  const dateIdx = args.indexOf('--date');
  const specificDate = dateIdx >= 0 ? args[dateIdx + 1] : null;

  // Ensure tables exist
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS trading_signals (
      id BIGSERIAL PRIMARY KEY,
      computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      signal_date DATE NOT NULL,
      svr_7d NUMERIC,
      svr_30d NUMERIC,
      pool_momentum NUMERIC,
      miner_pressure NUMERIC,
      crosschain_flow NUMERIC,
      shielded_tx_momentum NUMERIC,
      exchange_velocity NUMERIC,
      whale_accumulation NUMERIC,
      mean_reversion NUMERIC,
      fee_pressure NUMERIC,
      network_momentum NUMERIC,
      volume_multiplier NUMERIC,
      composite_score NUMERIC NOT NULL,
      signal TEXT NOT NULL,
      regime TEXT,
      confidence INTEGER,
      weights_used TEXT,
      price_usd NUMERIC,
      shielded_pool_pct NUMERIC,
      notes TEXT,
      CONSTRAINT trading_signals_date_unique UNIQUE (signal_date)
    );
    CREATE INDEX IF NOT EXISTS idx_trading_signals_date ON trading_signals (signal_date DESC);
  `);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS signal_weight_snapshots (
      id BIGSERIAL PRIMARY KEY,
      snapshot_date DATE NOT NULL,
      weights_json TEXT NOT NULL,
      correlations_json TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT signal_weights_date_unique UNIQUE (snapshot_date)
    )
  `);

  if (isBackfill) {
    const datesResult = await pgPool.query(`
      SELECT date FROM zec_price_daily
      WHERE date >= (SELECT MIN(date) + 31 FROM privacy_trends_daily)
      ORDER BY date ASC
    `);

    const dates = datesResult.rows.map(r => r.date);
    console.log(`[signals-v2] Backfilling ${dates.length} dates...`);

    let processed = 0;
    let lastAdaptiveCompute = null;

    for (const d of dates) {
      const target = new Date(d);
      const dateStr = target.toISOString().split('T')[0];

      // Recompute adaptive weights every 30 days
      if (!lastAdaptiveCompute || processed - lastAdaptiveCompute >= 30) {
        const adaptive = await computeAdaptiveWeights(target);
        if (adaptive) lastAdaptiveCompute = processed;
      }

      const result = await computeForDate(target);
      processed++;
      if (processed % 30 === 0 || processed === dates.length) {
        console.log(`  ${processed}/${dates.length} | ${result.date}: ${result.signal} (${result.composite}) [${result.regime}] conf:${result.confidence}%`);
      }
    }

    console.log(`[signals-v2] Backfill complete: ${processed} days.`);
  } else {
    const target = specificDate ? new Date(specificDate) : new Date();

    // Check if adaptive weights need recomputing
    const lastSnapshot = await pgPool.query(`
      SELECT snapshot_date FROM signal_weight_snapshots ORDER BY snapshot_date DESC LIMIT 1
    `);
    const daysSinceSnapshot = lastSnapshot.rows.length > 0
      ? Math.floor((target - new Date(lastSnapshot.rows[0].snapshot_date)) / 86400000)
      : 999;

    if (daysSinceSnapshot >= config.adaptiveWeights.recomputeEveryDays) {
      console.log(`[signals-v2] Recomputing adaptive weights (${daysSinceSnapshot} days since last)...`);
      const adaptive = await computeAdaptiveWeights(target);
      if (adaptive) {
        console.log(`  Correlations: ${JSON.stringify(adaptive.correlations)}`);
      }
    }

    const result = await computeForDate(target);
    console.log(`[signals-v2] ${result.date}: ${result.signal} (composite: ${result.composite}) [${result.regime}] confidence: ${result.confidence}%`);
    console.log(`  SVR-7d: ${result.scores.svr_7d}, SVR-30d: ${result.scores.svr_30d}`);
    console.log(`  Pool momentum: ${result.scores.pool_momentum}`);
    console.log(`  Miner→Exchange: ${result.scores.miner_exchange}`);
    console.log(`  Cross-chain flow: ${result.scores.crosschain_flow}`);
    console.log(`  Exchange velocity: ${result.scores.exchange_velocity}`);
    console.log(`  Whale accumulation: ${result.scores.whale_accumulation}`);
    console.log(`  Mean reversion: ${result.scores.mean_reversion}`);
    console.log(`  Fee pressure: ${result.scores.fee_pressure}`);
    console.log(`  Network momentum: ${result.scores.network_momentum}`);
    console.log(`  Shielded TX momentum: ${result.scores.shielded_tx_momentum}`);
    console.log(`  Volume multiplier: ${result.volumeMultiplier}x`);
    console.log(`  Price: $${result.price}`);
  }

  await pgPool.end();
}

module.exports = { computeForDate, computeAdaptiveWeights, detectRegime };

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}
