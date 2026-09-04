/**
 * Trading Signals V2 — Backtesting Engine
 *
 * Evaluates signal quality with proper quant methodology:
 * - Walk-forward (train 6m → predict 1m → advance)
 * - Out-of-sample split (first 60% train, last 40% test)
 * - Sharpe ratio (annualized)
 * - Max drawdown and recovery time
 * - Per-regime performance breakdown
 * - Per-indicator correlation analysis
 *
 * Usage:
 *   node server/signals/backtest.js                    # full backtest
 *   node server/signals/backtest.js --horizon 7        # 7-day forward (default)
 *   node server/signals/backtest.js --walk-forward     # walk-forward simulation
 *   node server/signals/backtest.js --oos              # out-of-sample split report
 */

const { loadEnv } = require('../lib/job-utils');
const { getPool, getReadPool } = require('../lib/db-pool');

loadEnv(__dirname);

// Backtesting is entirely read-only (report/analysis over already-computed
// trading_signals) — never writes to the database, so all of it runs
// against the replica when available.
const pgPool = getReadPool();

function computeSharpe(returns, annFactor = 252) {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (returns.length - 1);
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  return (mean / std) * Math.sqrt(annFactor);
}

function computeMaxDrawdown(equityCurve) {
  let peak = equityCurve[0] || 0;
  let maxDD = 0;
  let maxDDStart = 0;
  let maxDDEnd = 0;
  let currentStart = 0;

  for (let i = 0; i < equityCurve.length; i++) {
    if (equityCurve[i] > peak) {
      peak = equityCurve[i];
      currentStart = i;
    }
    const dd = (peak - equityCurve[i]) / peak;
    if (dd > maxDD) {
      maxDD = dd;
      maxDDStart = currentStart;
      maxDDEnd = i;
    }
  }

  // Recovery time: how many days after trough to get back to peak
  let recoveryDays = null;
  for (let i = maxDDEnd; i < equityCurve.length; i++) {
    if (equityCurve[i] >= peak) {
      recoveryDays = i - maxDDEnd;
      break;
    }
  }

  return { maxDD: maxDD * 100, maxDDStart, maxDDEnd, recoveryDays };
}

function pearsonCorrelation(pairs) {
  const n = pairs.length;
  if (n < 10) return null;
  const sumX = pairs.reduce((a, p) => a + p[0], 0);
  const sumY = pairs.reduce((a, p) => a + p[1], 0);
  const sumXY = pairs.reduce((a, p) => a + p[0] * p[1], 0);
  const sumX2 = pairs.reduce((a, p) => a + p[0] ** 2, 0);
  const sumY2 = pairs.reduce((a, p) => a + p[1] ** 2, 0);
  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt((n * sumX2 - sumX ** 2) * (n * sumY2 - sumY ** 2));
  return den > 0 ? num / den : 0;
}

async function fetchSignals(horizonDays) {
  const result = await pgPool.query(`
    SELECT
      s.signal_date,
      s.composite_score,
      s.signal,
      s.regime,
      s.confidence,
      s.svr_7d,
      s.svr_30d,
      s.pool_momentum,
      s.miner_pressure,
      s.crosschain_flow,
      s.shielded_tx_momentum,
      s.exchange_velocity,
      s.whale_accumulation,
      s.mean_reversion,
      s.fee_pressure,
      s.network_momentum,
      s.volume_multiplier,
      s.price_usd AS entry_price,
      future.price_usd AS exit_price
    FROM trading_signals s
    JOIN zec_price_daily future
      ON future.date = s.signal_date + ($1 || ' days')::interval
    WHERE s.price_usd IS NOT NULL
      AND s.price_usd > 0
    ORDER BY s.signal_date ASC
  `, [horizonDays]);

  return result.rows.map(t => ({
    ...t,
    entry: Number(t.entry_price),
    exit: Number(t.exit_price),
    returnPct: ((Number(t.exit_price) - Number(t.entry_price)) / Number(t.entry_price)) * 100,
  }));
}

function reportBuckets(trades, label) {
  const buckets = { STRONG_BUY: [], BUY: [], HOLD: [], SELL: [], STRONG_SELL: [] };
  for (const t of trades) {
    if (buckets[t.signal]) buckets[t.signal].push(t);
  }

  console.log(`\n  ─── ${label} ───\n`);
  console.log(`  Signal         | Count | Avg Return | Win Rate | Avg Conf`);
  console.log(`  ───────────────┼───────┼────────────┼──────────┼─────────`);

  for (const signal of ['STRONG_BUY', 'BUY', 'HOLD', 'SELL', 'STRONG_SELL']) {
    const bucket = buckets[signal];
    if (bucket.length === 0) {
      console.log(`  ${signal.padEnd(15)}| ${String(0).padStart(5)} |     —      |    —     |    —`);
      continue;
    }

    const avgReturn = bucket.reduce((a, t) => a + t.returnPct, 0) / bucket.length;
    const wins = bucket.filter(t => {
      if (signal.includes('BUY')) return t.returnPct > 0;
      if (signal.includes('SELL')) return t.returnPct < 0;
      return Math.abs(t.returnPct) < 5;
    }).length;
    const winRate = (wins / bucket.length) * 100;
    const avgConf = bucket.reduce((a, t) => a + (Number(t.confidence) || 0), 0) / bucket.length;

    console.log(
      `  ${signal.padEnd(15)}| ${String(bucket.length).padStart(5)} | ` +
      `${avgReturn >= 0 ? '+' : ''}${avgReturn.toFixed(2).padStart(7)}% | ` +
      `${winRate.toFixed(0).padStart(5)}%   | ` +
      `${avgConf.toFixed(0).padStart(5)}%`
    );
  }
}

function simulateStrategy(trades) {
  let equity = 100;
  const equityCurve = [equity];
  const tradeReturns = [];
  let longTrades = 0;
  let shortTrades = 0;

  for (const t of trades) {
    let positionReturn = 0;
    if (t.signal === 'STRONG_BUY' || t.signal === 'BUY') {
      positionReturn = t.returnPct / 100;
      longTrades++;
    } else if (t.signal === 'STRONG_SELL' || t.signal === 'SELL') {
      positionReturn = -t.returnPct / 100;
      shortTrades++;
    }
    // HOLD = no position, return = 0

    tradeReturns.push(positionReturn);
    equity *= (1 + positionReturn);
    equityCurve.push(equity);
  }

  const totalReturn = ((equity - 100) / 100) * 100;
  const sharpe = computeSharpe(tradeReturns);
  const dd = computeMaxDrawdown(equityCurve);

  return { totalReturn, sharpe, equityCurve, dd, longTrades, shortTrades, tradeReturns };
}

async function runFullBacktest(horizonDays) {
  const trades = await fetchSignals(horizonDays);
  if (trades.length === 0) {
    console.log('[backtest] No signal data found. Run compute.js --backfill first.');
    return;
  }

  const firstDate = trades[0].signal_date.toISOString().split('T')[0];
  const lastDate = trades[trades.length - 1].signal_date.toISOString().split('T')[0];

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ZEC ON-CHAIN SIGNAL V2 BACKTEST`);
  console.log(`  Horizon: ${horizonDays}d | Signals: ${trades.length} days`);
  console.log(`  Period: ${firstDate} → ${lastDate}`);
  console.log(`${'═'.repeat(70)}`);

  // Overall performance
  reportBuckets(trades, 'OVERALL PERFORMANCE');

  // Per-regime breakdown
  const regimes = { BULL: [], BEAR: [], RANGE: [] };
  for (const t of trades) {
    const r = t.regime || 'RANGE';
    if (regimes[r]) regimes[r].push(t);
  }

  for (const [regime, regimeTrades] of Object.entries(regimes)) {
    if (regimeTrades.length > 0) {
      reportBuckets(regimeTrades, `REGIME: ${regime} (${regimeTrades.length} days)`);
    }
  }

  // Strategy simulation
  console.log(`\n  ─── STRATEGY SIMULATION (compounded) ───\n`);

  const strat = simulateStrategy(trades);
  const holdReturn = ((trades[trades.length - 1].exit - trades[0].entry) / trades[0].entry) * 100;

  console.log(`  Buy & Hold return:     ${holdReturn >= 0 ? '+' : ''}${holdReturn.toFixed(2)}%`);
  console.log(`  Strategy return:       ${strat.totalReturn >= 0 ? '+' : ''}${strat.totalReturn.toFixed(2)}%`);
  console.log(`  Sharpe ratio:          ${strat.sharpe.toFixed(3)}`);
  console.log(`  Max drawdown:          -${strat.dd.maxDD.toFixed(2)}%`);
  console.log(`  Recovery (days):       ${strat.dd.recoveryDays !== null ? strat.dd.recoveryDays : 'not recovered'}`);
  console.log(`  Active trades:         ${strat.longTrades + strat.shortTrades} (${strat.longTrades} long, ${strat.shortTrades} short)`);
  console.log(`  HOLD days:             ${trades.length - strat.longTrades - strat.shortTrades}`);

  // Per-indicator correlations
  console.log(`\n  ─── INDICATOR CORRELATIONS (${horizonDays}d forward return) ───\n`);

  const indicatorNames = [
    'svr_7d', 'svr_30d', 'pool_momentum', 'miner_pressure',
    'crosschain_flow', 'shielded_tx_momentum',
    'exchange_velocity', 'whale_accumulation', 'mean_reversion',
    'fee_pressure', 'network_momentum', 'composite_score',
  ];

  for (const ind of indicatorNames) {
    const pairs = trades
      .filter(t => t[ind] !== null && t[ind] !== undefined)
      .map(t => [Number(t[ind]), t.returnPct]);

    const r = pearsonCorrelation(pairs);
    if (r === null) {
      console.log(`  ${ind.padEnd(25)} | insufficient data`);
      continue;
    }

    const barLen = Math.round(Math.abs(r) * 20);
    const bar = r > 0 ? '+'.repeat(barLen) : '-'.repeat(barLen);
    console.log(`  ${ind.padEnd(25)} | r = ${r >= 0 ? '+' : ''}${r.toFixed(3)} ${bar}`);
  }

  console.log(`\n${'═'.repeat(70)}\n`);
}

async function runOutOfSample(horizonDays) {
  const trades = await fetchSignals(horizonDays);
  if (trades.length < 60) {
    console.log('[backtest] Need at least 60 data points for OOS split.');
    return;
  }

  const splitIdx = Math.floor(trades.length * 0.6);
  const trainSet = trades.slice(0, splitIdx);
  const testSet = trades.slice(splitIdx);

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  OUT-OF-SAMPLE ANALYSIS`);
  console.log(`  Train: ${trainSet.length} days (${trainSet[0].signal_date.toISOString().split('T')[0]} → ${trainSet[trainSet.length - 1].signal_date.toISOString().split('T')[0]})`);
  console.log(`  Test:  ${testSet.length} days (${testSet[0].signal_date.toISOString().split('T')[0]} → ${testSet[testSet.length - 1].signal_date.toISOString().split('T')[0]})`);
  console.log(`${'═'.repeat(70)}`);

  reportBuckets(trainSet, 'IN-SAMPLE (Train 60%)');
  const trainStrat = simulateStrategy(trainSet);
  console.log(`\n  Train Sharpe: ${trainStrat.sharpe.toFixed(3)} | Return: ${trainStrat.totalReturn >= 0 ? '+' : ''}${trainStrat.totalReturn.toFixed(2)}% | MaxDD: -${trainStrat.dd.maxDD.toFixed(2)}%`);

  reportBuckets(testSet, 'OUT-OF-SAMPLE (Test 40%)');
  const testStrat = simulateStrategy(testSet);
  console.log(`\n  Test Sharpe: ${testStrat.sharpe.toFixed(3)} | Return: ${testStrat.totalReturn >= 0 ? '+' : ''}${testStrat.totalReturn.toFixed(2)}% | MaxDD: -${testStrat.dd.maxDD.toFixed(2)}%`);

  const degradation = trainStrat.sharpe !== 0
    ? ((testStrat.sharpe - trainStrat.sharpe) / Math.abs(trainStrat.sharpe)) * 100
    : 0;
  console.log(`\n  Sharpe degradation (train→test): ${degradation >= 0 ? '+' : ''}${degradation.toFixed(1)}%`);
  if (degradation < -50) {
    console.log(`  ⚠ Significant overfitting detected (>50% Sharpe degradation)`);
  } else if (degradation < -20) {
    console.log(`  ⚠ Moderate overfitting (20-50% degradation)`);
  } else {
    console.log(`  ✓ Signal appears robust out-of-sample`);
  }

  console.log(`\n${'═'.repeat(70)}\n`);
}

async function runWalkForward(horizonDays) {
  const trades = await fetchSignals(horizonDays);
  if (trades.length < 210) {
    console.log('[backtest] Need at least 210 data points for walk-forward (6m train + 1m test × 1).');
    return;
  }

  const trainDays = 180;
  const testDays = 30;

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  WALK-FORWARD ANALYSIS`);
  console.log(`  Train window: ${trainDays}d | Test window: ${testDays}d | Step: ${testDays}d`);
  console.log(`${'═'.repeat(70)}\n`);

  console.log(`  Window       | Test Period              | Sharpe | Return  | Win%  | MaxDD`);
  console.log(`  ─────────────┼──────────────────────────┼────────┼─────────┼───────┼──────`);

  const windowResults = [];
  let windowIdx = 0;

  for (let start = trainDays; start + testDays <= trades.length; start += testDays) {
    const testSlice = trades.slice(start, start + testDays);
    const strat = simulateStrategy(testSlice);

    const testStart = testSlice[0].signal_date.toISOString().split('T')[0];
    const testEnd = testSlice[testSlice.length - 1].signal_date.toISOString().split('T')[0];

    windowIdx++;
    const winRate = testSlice.filter(t => {
      if (t.signal.includes('BUY')) return t.returnPct > 0;
      if (t.signal.includes('SELL')) return t.returnPct < 0;
      return true;
    }).length / testSlice.length * 100;

    console.log(
      `  ${String(windowIdx).padStart(3)}         | ${testStart} → ${testEnd} | ` +
      `${strat.sharpe >= 0 ? '+' : ''}${strat.sharpe.toFixed(2).padStart(5)} | ` +
      `${strat.totalReturn >= 0 ? '+' : ''}${strat.totalReturn.toFixed(1).padStart(6)}% | ` +
      `${winRate.toFixed(0).padStart(4)}% | ` +
      `-${strat.dd.maxDD.toFixed(1)}%`
    );

    windowResults.push({ sharpe: strat.sharpe, totalReturn: strat.totalReturn, winRate });
  }

  if (windowResults.length > 0) {
    const avgSharpe = windowResults.reduce((a, w) => a + w.sharpe, 0) / windowResults.length;
    const avgReturn = windowResults.reduce((a, w) => a + w.totalReturn, 0) / windowResults.length;
    const consistency = windowResults.filter(w => w.sharpe > 0).length / windowResults.length * 100;

    console.log(`\n  ─── WALK-FORWARD SUMMARY ───\n`);
    console.log(`  Windows tested:        ${windowResults.length}`);
    console.log(`  Avg Sharpe:            ${avgSharpe >= 0 ? '+' : ''}${avgSharpe.toFixed(3)}`);
    console.log(`  Avg window return:     ${avgReturn >= 0 ? '+' : ''}${avgReturn.toFixed(2)}%`);
    console.log(`  Positive Sharpe %:     ${consistency.toFixed(0)}%`);
  }

  console.log(`\n${'═'.repeat(70)}\n`);
}

async function main() {
  const args = process.argv.slice(2);
  const horizonIdx = args.indexOf('--horizon');
  const horizon = horizonIdx >= 0 ? parseInt(args[horizonIdx + 1], 10) : 7;

  if (args.includes('--walk-forward')) {
    await runWalkForward(horizon);
  } else if (args.includes('--oos')) {
    await runOutOfSample(horizon);
  } else {
    await runFullBacktest(horizon);
    await runOutOfSample(horizon);
  }

  await pgPool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
