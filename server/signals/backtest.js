/**
 * Trading Signals — Backtesting Engine
 *
 * Evaluates signal quality by comparing signal predictions against actual
 * future price changes. Computes hit rate, average return, and Sharpe-like metrics.
 *
 * Usage:
 *   node server/signals/backtest.js              # run full backtest
 *   node server/signals/backtest.js --horizon 7  # 7-day forward returns (default)
 *   node server/signals/backtest.js --horizon 14 # 14-day forward returns
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../api/.env') });
const { Pool } = require('pg');

const pgPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function runBacktest(horizonDays = 7) {
  // Fetch all signals with prices
  const result = await pgPool.query(`
    SELECT
      s.signal_date,
      s.composite_score,
      s.signal,
      s.svr_7d,
      s.svr_30d,
      s.pool_momentum,
      s.miner_pressure,
      s.crosschain_flow,
      s.shielded_tx_momentum,
      s.price_usd AS entry_price,
      future.price_usd AS exit_price
    FROM trading_signals s
    JOIN zec_price_daily future
      ON future.date = s.signal_date + ($1 || ' days')::interval
    WHERE s.price_usd IS NOT NULL
      AND s.price_usd > 0
    ORDER BY s.signal_date ASC
  `, [horizonDays]);

  const trades = result.rows;
  if (trades.length === 0) {
    console.log('[backtest] No signal data found. Run compute.js --backfill first.');
    await pgPool.end();
    return;
  }

  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(`  ZEC ON-CHAIN SIGNAL BACKTEST`);
  console.log(`  Horizon: ${horizonDays} days | Signals: ${trades.length} days`);
  console.log(`  Period: ${trades[0].signal_date.toISOString().split('T')[0]} → ${trades[trades.length - 1].signal_date.toISOString().split('T')[0]}`);
  console.log(`══════════════════════════════════════════════════════════════\n`);

  // Classify trades by signal
  const buckets = { STRONG_BUY: [], BUY: [], HOLD: [], SELL: [], STRONG_SELL: [] };

  for (const t of trades) {
    const entry = Number(t.entry_price);
    const exit = Number(t.exit_price);
    const returnPct = ((exit - entry) / entry) * 100;
    buckets[t.signal].push({ ...t, returnPct, entry, exit });
  }

  // Report per-signal performance
  console.log(`  Signal         | Count | Avg Return | Win Rate | Avg Score`);
  console.log(`  ───────────────┼───────┼────────────┼──────────┼──────────`);

  const signalOrder = ['STRONG_BUY', 'BUY', 'HOLD', 'SELL', 'STRONG_SELL'];
  const allReturns = [];

  for (const signal of signalOrder) {
    const bucket = buckets[signal];
    if (bucket.length === 0) {
      console.log(`  ${signal.padEnd(15)}| ${String(0).padStart(5)} |     —      |    —     |    —`);
      continue;
    }

    const avgReturn = bucket.reduce((a, t) => a + t.returnPct, 0) / bucket.length;
    const wins = bucket.filter(t => {
      if (signal.includes('BUY')) return t.returnPct > 0;
      if (signal.includes('SELL')) return t.returnPct < 0;
      return Math.abs(t.returnPct) < 5; // HOLD is correct if price stays flat-ish
    }).length;
    const winRate = (wins / bucket.length) * 100;
    const avgScore = bucket.reduce((a, t) => a + Number(t.composite_score), 0) / bucket.length;

    console.log(
      `  ${signal.padEnd(15)}| ${String(bucket.length).padStart(5)} | ` +
      `${avgReturn >= 0 ? '+' : ''}${avgReturn.toFixed(2).padStart(7)}% | ` +
      `${winRate.toFixed(0).padStart(5)}%   | ` +
      `${avgScore.toFixed(0).padStart(5)}`
    );

    allReturns.push(...bucket.map(t => ({ signal, returnPct: t.returnPct })));
  }

  // Strategy simulation: go long on BUY/STRONG_BUY, short on SELL/STRONG_SELL
  console.log(`\n  ─── STRATEGY SIMULATION ───\n`);

  let strategyReturn = 0;
  let holdReturn = 0;
  let longTrades = 0;
  let shortTrades = 0;

  const firstPrice = Number(trades[0].entry_price);
  const lastPrice = Number(trades[trades.length - 1].entry_price);
  holdReturn = ((lastPrice - firstPrice) / firstPrice) * 100;

  for (const t of trades) {
    const ret = Number(((Number(t.exit_price) - Number(t.entry_price)) / Number(t.entry_price)) * 100);
    if (t.signal === 'STRONG_BUY' || t.signal === 'BUY') {
      strategyReturn += ret;
      longTrades++;
    } else if (t.signal === 'STRONG_SELL' || t.signal === 'SELL') {
      strategyReturn -= ret; // short = inverse return
      shortTrades++;
    }
    // HOLD = no position
  }

  const activeTrades = longTrades + shortTrades;
  const avgTradeReturn = activeTrades > 0 ? strategyReturn / activeTrades : 0;

  console.log(`  Buy & Hold return:     ${holdReturn >= 0 ? '+' : ''}${holdReturn.toFixed(2)}%`);
  console.log(`  Strategy cum. return:  ${strategyReturn >= 0 ? '+' : ''}${strategyReturn.toFixed(2)}%`);
  console.log(`  Avg trade return:      ${avgTradeReturn >= 0 ? '+' : ''}${avgTradeReturn.toFixed(2)}%`);
  console.log(`  Active trades:         ${activeTrades} (${longTrades} long, ${shortTrades} short)`);
  console.log(`  Inactive (HOLD) days:  ${trades.length - activeTrades}`);

  // Per-indicator correlation with forward returns
  console.log(`\n  ─── INDICATOR CORRELATIONS (${horizonDays}d forward return) ───\n`);

  const indicatorNames = ['svr_7d', 'svr_30d', 'pool_momentum', 'miner_pressure', 'crosschain_flow', 'shielded_tx_momentum', 'composite_score'];

  for (const ind of indicatorNames) {
    const pairs = trades
      .filter(t => t[ind] !== null)
      .map(t => [Number(t[ind]), Number(((Number(t.exit_price) - Number(t.entry_price)) / Number(t.entry_price)) * 100)]);

    if (pairs.length < 30) {
      console.log(`  ${ind.padEnd(25)} | insufficient data (${pairs.length})`);
      continue;
    }

    const n = pairs.length;
    const sumX = pairs.reduce((a, p) => a + p[0], 0);
    const sumY = pairs.reduce((a, p) => a + p[1], 0);
    const sumXY = pairs.reduce((a, p) => a + p[0] * p[1], 0);
    const sumX2 = pairs.reduce((a, p) => a + p[0] ** 2, 0);
    const sumY2 = pairs.reduce((a, p) => a + p[1] ** 2, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX ** 2) * (n * sumY2 - sumY ** 2));
    const correlation = denominator > 0 ? numerator / denominator : 0;

    const bar = correlation > 0
      ? '█'.repeat(Math.round(Math.abs(correlation) * 20))
      : '░'.repeat(Math.round(Math.abs(correlation) * 20));

    console.log(`  ${ind.padEnd(25)} | r = ${correlation >= 0 ? '+' : ''}${correlation.toFixed(3)} ${bar}`);
  }

  console.log(`\n══════════════════════════════════════════════════════════════\n`);

  await pgPool.end();
}

const args = process.argv.slice(2);
const horizonIdx = args.indexOf('--horizon');
const horizon = horizonIdx >= 0 ? parseInt(args[horizonIdx + 1], 10) : 7;

runBacktest(horizon).catch(err => { console.error(err); process.exit(1); });
