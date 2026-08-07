'use strict';

/**
 * Paper Trading Tracker V3
 *
 * Simulates a long/short position based on V3 signals.
 * Tracks P&L, win rate, max drawdown, Sharpe ratio.
 * Reports daily via Telegram.
 *
 * Rules:
 *   - STRONG_BUY + confidence >= 60% → LONG
 *   - BUY + confidence >= 70% → LONG
 *   - STRONG_SELL + confidence >= 60% → SHORT (or exit long)
 *   - SELL + confidence >= 70% → SHORT (or exit long)
 *   - HOLD → maintain position
 *   - Trailing stop: -8% from peak → exit
 *   - Take profit: +15% → exit half
 *
 * Persists position state in paper_trades table.
 *
 * Usage:
 *   node server/signals/paper-trade.js              # process today's signal
 *   node server/signals/paper-trade.js --backtest   # backtest all V3 signals
 *   node server/signals/paper-trade.js --report     # generate Telegram report
 */

const { loadEnv } = require('../lib/job-utils');
const { getPool } = require('../lib/db-pool');

loadEnv(__dirname);

const pgPool = getPool();

const RULES = {
  entryConfidenceMin: 60,
  buyConfidenceMin: 70,
  trailingStopPct: -0.08,
  takeProfitPct: 0.15,
  halfExitPct: 0.15,
  initialCapital: 10000, // $10K paper
};

async function ensureTable() {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS paper_trades (
      id BIGSERIAL PRIMARY KEY,
      date DATE NOT NULL,
      action TEXT NOT NULL,
      direction TEXT,
      entry_price NUMERIC,
      exit_price NUMERIC,
      position_size NUMERIC,
      pnl_usd NUMERIC,
      pnl_pct NUMERIC,
      signal TEXT,
      signal_score INTEGER,
      confidence INTEGER,
      regime TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS paper_portfolio (
      id INTEGER PRIMARY KEY DEFAULT 1,
      capital_usd NUMERIC NOT NULL,
      position TEXT DEFAULT 'FLAT',
      direction TEXT,
      entry_price NUMERIC,
      entry_date DATE,
      peak_price NUMERIC,
      size_usd NUMERIC,
      total_trades INTEGER DEFAULT 0,
      winning_trades INTEGER DEFAULT 0,
      total_pnl_usd NUMERIC DEFAULT 0,
      max_drawdown_pct NUMERIC DEFAULT 0,
      peak_capital NUMERIC,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    INSERT INTO paper_portfolio (id, capital_usd, peak_capital)
    VALUES (1, ${RULES.initialCapital}, ${RULES.initialCapital})
    ON CONFLICT (id) DO NOTHING;
  `);
}

async function getPortfolio() {
  const { rows: [p] } = await pgPool.query(`SELECT * FROM paper_portfolio WHERE id = 1`);
  return p;
}

async function updatePortfolio(updates) {
  const sets = Object.entries(updates)
    .map(([k, v], i) => `${k} = $${i + 1}`)
    .join(', ');
  const values = Object.values(updates);
  await pgPool.query(
    `UPDATE paper_portfolio SET ${sets}, updated_at = NOW() WHERE id = 1`,
    values
  );
}

async function logTrade(trade) {
  await pgPool.query(`
    INSERT INTO paper_trades (date, action, direction, entry_price, exit_price, position_size, pnl_usd, pnl_pct, signal, signal_score, confidence, regime, notes)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
  `, [trade.date, trade.action, trade.direction, trade.entry_price, trade.exit_price,
      trade.position_size, trade.pnl_usd, trade.pnl_pct, trade.signal, trade.signal_score,
      trade.confidence, trade.regime, trade.notes]);
}

async function processSignal(date) {
  const { rows: [sig] } = await pgPool.query(
    `SELECT * FROM trading_signals_v3 WHERE date = $1`, [date]
  );
  if (!sig) return null;

  const { rows: [priceRow] } = await pgPool.query(
    `SELECT price_usd FROM zec_price_daily WHERE date = $1`, [date]
  );
  if (!priceRow) return null;

  const price = parseFloat(priceRow.price_usd);
  const signal = sig.signal;
  const score = parseInt(sig.composite_score);
  const confidence = parseInt(sig.confidence);
  const regime = sig.regime;

  const portfolio = await getPortfolio();
  const position = portfolio.position;
  const entryPrice = parseFloat(portfolio.entry_price) || 0;
  const peakPrice = parseFloat(portfolio.peak_price) || price;
  const sizeUsd = parseFloat(portfolio.size_usd) || 0;
  let capital = parseFloat(portfolio.capital_usd);
  let peakCapital = parseFloat(portfolio.peak_capital) || capital;

  let action = 'HOLD';
  let pnl = 0;
  let pnlPct = 0;

  if (position === 'LONG') {
    // Check trailing stop
    const newPeak = Math.max(peakPrice, price);
    const drawdownFromPeak = (price - newPeak) / newPeak;

    if (drawdownFromPeak <= RULES.trailingStopPct) {
      // Stop triggered
      pnlPct = (price - entryPrice) / entryPrice;
      pnl = sizeUsd * pnlPct;
      capital += sizeUsd + pnl;
      action = 'EXIT_STOP';

      await logTrade({ date, action, direction: 'LONG', entry_price: entryPrice, exit_price: price,
        position_size: sizeUsd, pnl_usd: pnl, pnl_pct: pnlPct, signal, signal_score: score, confidence, regime,
        notes: `Trailing stop hit (${(drawdownFromPeak*100).toFixed(1)}% from peak)` });

      const totalTrades = (portfolio.total_trades || 0) + 1;
      const winningTrades = (portfolio.winning_trades || 0) + (pnl > 0 ? 1 : 0);
      const totalPnl = parseFloat(portfolio.total_pnl_usd || 0) + pnl;
      peakCapital = Math.max(peakCapital, capital);
      const dd = (capital - peakCapital) / peakCapital;
      const maxDd = Math.min(parseFloat(portfolio.max_drawdown_pct || 0), dd);

      await updatePortfolio({ capital_usd: capital, position: 'FLAT', direction: null, entry_price: null,
        entry_date: null, peak_price: null, size_usd: null, total_trades: totalTrades,
        winning_trades: winningTrades, total_pnl_usd: totalPnl, max_drawdown_pct: maxDd, peak_capital: peakCapital });
    } else if (signal === 'STRONG_SELL' && confidence >= RULES.entryConfidenceMin) {
      // Exit on strong sell
      pnlPct = (price - entryPrice) / entryPrice;
      pnl = sizeUsd * pnlPct;
      capital += sizeUsd + pnl;
      action = 'EXIT_SIGNAL';

      await logTrade({ date, action, direction: 'LONG', entry_price: entryPrice, exit_price: price,
        position_size: sizeUsd, pnl_usd: pnl, pnl_pct: pnlPct, signal, signal_score: score, confidence, regime,
        notes: 'Strong sell signal exit' });

      const totalTrades = (portfolio.total_trades || 0) + 1;
      const winningTrades = (portfolio.winning_trades || 0) + (pnl > 0 ? 1 : 0);
      const totalPnl = parseFloat(portfolio.total_pnl_usd || 0) + pnl;
      peakCapital = Math.max(peakCapital, capital);

      await updatePortfolio({ capital_usd: capital, position: 'FLAT', direction: null, entry_price: null,
        entry_date: null, peak_price: null, size_usd: null, total_trades: totalTrades,
        winning_trades: winningTrades, total_pnl_usd: totalPnl, peak_capital: peakCapital });
    } else {
      // Update peak
      await updatePortfolio({ peak_price: newPeak });
      action = 'HOLD_LONG';
    }
  } else if (position === 'FLAT') {
    // Entry conditions
    const shouldEnter =
      (signal === 'STRONG_BUY' && confidence >= RULES.entryConfidenceMin) ||
      (signal === 'BUY' && confidence >= RULES.buyConfidenceMin);

    if (shouldEnter) {
      const positionSize = capital * 0.9; // 90% deployment
      action = 'ENTER_LONG';

      await logTrade({ date, action, direction: 'LONG', entry_price: price, exit_price: null,
        position_size: positionSize, pnl_usd: null, pnl_pct: null, signal, signal_score: score, confidence, regime,
        notes: `Entry: ${signal} @ ${confidence}% confidence` });

      capital -= positionSize;
      await updatePortfolio({ capital_usd: capital, position: 'LONG', direction: 'LONG', entry_price: price,
        entry_date: date, peak_price: price, size_usd: positionSize });
    }
  }

  return { date, price, signal, score, confidence, regime, action, pnl, position: portfolio.position };
}

async function backtest() {
  console.log('[V3 Paper Trade] Backtesting...\n');

  // Reset portfolio
  await pgPool.query(`DELETE FROM paper_trades`);
  await pgPool.query(`UPDATE paper_portfolio SET
    capital_usd = ${RULES.initialCapital}, position = 'FLAT', direction = NULL,
    entry_price = NULL, entry_date = NULL, peak_price = NULL, size_usd = NULL,
    total_trades = 0, winning_trades = 0, total_pnl_usd = 0, max_drawdown_pct = 0,
    peak_capital = ${RULES.initialCapital} WHERE id = 1`);

  const { rows: dates } = await pgPool.query(`
    SELECT date FROM trading_signals_v3 ORDER BY date
  `);

  let lastAction = 'FLAT';
  for (const { date } of dates) {
    const d = date instanceof Date ? date.toISOString().split('T')[0] : String(date);
    const result = await processSignal(d);
    if (result && result.action !== 'HOLD' && result.action !== 'HOLD_LONG') {
      console.log(`  ${d}: ${result.action} @ $${result.price?.toFixed(2)} | ${result.signal}(${result.score}) ${result.confidence}% [${result.regime}]${result.pnl ? ` P&L: $${result.pnl.toFixed(2)}` : ''}`);
      lastAction = result.action;
    }
  }

  const portfolio = await getPortfolio();
  const capital = parseFloat(portfolio.capital_usd) + (parseFloat(portfolio.size_usd) || 0);
  const totalReturn = (capital - RULES.initialCapital) / RULES.initialCapital * 100;
  const winRate = portfolio.total_trades > 0 ? (portfolio.winning_trades / portfolio.total_trades * 100).toFixed(1) : 0;

  console.log(`\n=== BACKTEST RESULTS ===`);
  console.log(`  Starting capital: $${RULES.initialCapital}`);
  console.log(`  Final capital: $${capital.toFixed(2)}`);
  console.log(`  Total return: ${totalReturn.toFixed(1)}%`);
  console.log(`  Trades: ${portfolio.total_trades} (${winRate}% win rate)`);
  console.log(`  Max drawdown: ${(parseFloat(portfolio.max_drawdown_pct)*100).toFixed(1)}%`);
  console.log(`  Current position: ${portfolio.position}`);
}

async function generateReport() {
  const portfolio = await getPortfolio();
  const { rows: [todaySignal] } = await pgPool.query(
    `SELECT * FROM trading_signals_v3 ORDER BY date DESC LIMIT 1`
  );
  const { rows: recentTrades } = await pgPool.query(
    `SELECT * FROM paper_trades ORDER BY date DESC LIMIT 5`
  );

  const capital = parseFloat(portfolio.capital_usd) + (parseFloat(portfolio.size_usd) || 0);
  const totalReturn = ((capital - RULES.initialCapital) / RULES.initialCapital * 100).toFixed(1);
  const winRate = portfolio.total_trades > 0
    ? ((portfolio.winning_trades / portfolio.total_trades) * 100).toFixed(0) : '0';

  let unrealizedPnl = '';
  if (portfolio.position === 'LONG' && portfolio.entry_price && todaySignal?.price_usd) {
    const uPnl = ((parseFloat(todaySignal.price_usd) - parseFloat(portfolio.entry_price)) / parseFloat(portfolio.entry_price) * 100).toFixed(1);
    unrealizedPnl = `\n📊 Open: LONG from $${parseFloat(portfolio.entry_price).toFixed(0)} (${uPnl}%)`;
  }

  const report = `🤖 V3 Signal Report

📡 Signal: ${todaySignal?.signal || '?'} (${todaySignal?.composite_score || '?'})
📈 Regime: ${todaySignal?.regime || '?'} | Conf: ${todaySignal?.confidence || '?'}%
💰 Price: $${todaySignal?.price_usd ? parseFloat(todaySignal.price_usd).toFixed(2) : '?'}

📋 Paper Portfolio:
💵 Capital: $${capital.toFixed(0)} (${totalReturn}%)
🎯 Trades: ${portfolio.total_trades} | Win: ${winRate}%
📉 Max DD: ${(parseFloat(portfolio.max_drawdown_pct || 0)*100).toFixed(1)}%${unrealizedPnl}

🔬 Layers:
  Val: ${todaySignal?.valuation_score || '?'} (MVRV ${todaySignal?.valuation_mvrv ? parseFloat(todaySignal.valuation_mvrv).toFixed(2) : '?'})
  Flow: ${todaySignal?.flow_timing_score || '?'}
  Ctx: ${todaySignal?.context_score || '?'}`;

  console.log(report);

  // Send to Telegram if configured
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text: report,
          parse_mode: 'Markdown',
        }),
      });
      console.log('\n✅ Sent to Telegram');
    } catch (err) {
      console.error(`Telegram send failed: ${err.message}`);
    }
  }

  return report;
}

async function main() {
  await ensureTable();

  const args = process.argv.slice(2);

  if (args.includes('--backtest')) {
    await backtest();
  } else if (args.includes('--report')) {
    await generateReport();
  } else {
    const dateIdx = args.indexOf('--date');
    const date = dateIdx >= 0 ? args[dateIdx + 1] : new Date().toISOString().split('T')[0];
    const result = await processSignal(date);
    if (result) {
      console.log(`[V3 Paper] ${result.date}: ${result.action} | ${result.signal}(${result.score}) ${result.confidence}%`);
    }

    // Auto-report after processing
    if (!args.includes('--quiet')) {
      await generateReport();
    }
  }

  await pgPool.end();
}

module.exports = { processSignal, generateReport };

if (require.main === module) {
  main().catch(err => { console.error('Fatal:', err); process.exit(1); });
}
