/**
 * Trading Signals — Compute Engine
 *
 * Computes all indicators for a given date, produces a composite score,
 * and upserts the result into trading_signals.
 *
 * Usage:
 *   node server/signals/compute.js              # compute for today
 *   node server/signals/compute.js --date 2026-06-01  # compute for specific date
 *   node server/signals/compute.js --backfill   # compute for all dates with price data
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

async function computeForDate(targetDate) {
  const dateStr = targetDate.toISOString().split('T')[0];

  // Compute each indicator
  const [svr7, svr30, poolMom, minerP, crossFlow, txMom] = await Promise.all([
    indicators.computeSVR(pgPool, dateStr, 7),
    indicators.computeSVR(pgPool, dateStr, 30),
    indicators.computePoolMomentum(pgPool, dateStr),
    indicators.computeMinerPressure(pgPool, dateStr),
    indicators.computeCrosschainFlow(pgPool, dateStr),
    indicators.computeShieldedTxMomentum(pgPool, dateStr),
  ]);

  // Compute weighted composite (skip null indicators, redistribute weight)
  const scores = {
    svr_7d: svr7,
    svr_30d: svr30,
    pool_momentum: poolMom,
    miner_pressure: minerP,
    crosschain_flow: crossFlow,
    shielded_tx_momentum: txMom,
  };

  let totalWeight = 0;
  let weightedSum = 0;
  for (const [key, value] of Object.entries(scores)) {
    if (value !== null) {
      totalWeight += config.weights[key];
      weightedSum += value * config.weights[key];
    }
  }

  const composite = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  const signal = classifySignal(composite);

  // Fetch price and pool % for context
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
      price_usd, shielded_pool_pct
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
      shielded_pool_pct = EXCLUDED.shielded_pool_pct
  `, [dateStr, svr7, svr30, poolMom, minerP, crossFlow, txMom, composite, signal, price, poolPct]);

  return { date: dateStr, scores, composite, signal, price };
}

async function main() {
  const args = process.argv.slice(2);
  const isBackfill = args.includes('--backfill');
  const dateIdx = args.indexOf('--date');
  const specificDate = dateIdx >= 0 ? args[dateIdx + 1] : null;

  // Ensure table exists
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
      composite_score NUMERIC NOT NULL,
      signal TEXT NOT NULL,
      price_usd NUMERIC,
      shielded_pool_pct NUMERIC,
      notes TEXT,
      CONSTRAINT trading_signals_date_unique UNIQUE (signal_date)
    );
    CREATE INDEX IF NOT EXISTS idx_trading_signals_date ON trading_signals (signal_date DESC);
  `);

  if (isBackfill) {
    // Get all dates with price data (need at least 30 days of prior data)
    const datesResult = await pgPool.query(`
      SELECT date FROM zec_price_daily
      WHERE date >= (SELECT MIN(date) + 31 FROM privacy_trends_daily)
      ORDER BY date ASC
    `);

    const dates = datesResult.rows.map(r => r.date);
    console.log(`[signals] Backfilling ${dates.length} dates...`);

    let processed = 0;
    for (const d of dates) {
      const result = await computeForDate(new Date(d));
      processed++;
      if (processed % 30 === 0 || processed === dates.length) {
        console.log(`  ${processed}/${dates.length} | ${result.date}: ${result.signal} (${result.composite})`);
      }
    }

    console.log(`[signals] Backfill complete: ${processed} days.`);
  } else {
    const target = specificDate ? new Date(specificDate) : new Date();
    const result = await computeForDate(target);
    console.log(`[signals] ${result.date}: ${result.signal} (composite: ${result.composite})`);
    console.log(`  SVR-7d: ${result.scores.svr_7d}, SVR-30d: ${result.scores.svr_30d}`);
    console.log(`  Pool momentum: ${result.scores.pool_momentum}`);
    console.log(`  Miner pressure: ${result.scores.miner_pressure}`);
    console.log(`  Cross-chain flow: ${result.scores.crosschain_flow}`);
    console.log(`  Shielded TX momentum: ${result.scores.shielded_tx_momentum}`);
    console.log(`  Price: $${result.price}`);
  }

  await pgPool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
