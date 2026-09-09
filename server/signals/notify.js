/**
 * Trading Signals — Daily Telegram Notification
 *
 * Sends the current signal to Telegram once per day.
 * Usage: node server/signals/notify.js
 * Cron: 0 8 * * * (daily at 8 AM)
 */

const { loadEnv } = require('../lib/job-utils');
const { getReadPool } = require('../lib/db-pool');
const { telegramConfig, sendSignalReport, checkSignalTelegram } = require('../lib/signal-telegram');

loadEnv(__dirname);


// This job only reads the latest signals and pushes a Telegram message —
// it never writes to the database, so it runs entirely against the replica.
const pool = getReadPool();

const SIGNAL_EMOJI = {
  STRONG_BUY: '🟢🟢',
  BUY: '🟢',
  HOLD: '⚪',
  SELL: '🔴',
  STRONG_SELL: '🔴🔴',
};

async function fetchLivePrice() {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=zcash&vs_currencies=usd&include_24hr_change=true', { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      price: data.zcash?.usd || null,
      change24h: data.zcash?.usd_24h_change || null,
    };
  } catch {
    return null;
  }
}

async function main() {
  telegramConfig();
  if (process.argv.includes('--check')) {
    await checkSignalTelegram();
    console.log('[notify] Bot and destination verified; no message sent.');
    return;
  }
  const result = await pool.query(`
    SELECT signal_date, composite_score, signal, svr_7d, svr_30d,
           pool_momentum, miner_pressure, crosschain_flow,
           shielded_tx_momentum, price_usd, shielded_pool_pct
    FROM trading_signals
    ORDER BY signal_date DESC
    LIMIT 3
  `);

  if (result.rows.length === 0) {
    console.log('[notify] No signals to report.');
    return;
  }

  const latest = result.rows[0];
  const prev = result.rows[1];

  const live = await fetchLivePrice();
  const emoji = SIGNAL_EMOJI[latest.signal] || '⚪';
  const score = Number(latest.composite_score);
  const price = live?.price ? `$${live.price.toFixed(2)}` : (latest.price_usd ? `$${Number(latest.price_usd).toFixed(2)}` : '—');
  const change24h = live?.change24h ? ` (${live.change24h >= 0 ? '+' : ''}${live.change24h.toFixed(1)}%)` : '';
  const poolPct = latest.shielded_pool_pct ? `${Number(latest.shielded_pool_pct).toFixed(1)}%` : '—';

  // Trend arrow
  let trend = '';
  if (prev) {
    const diff = score - Number(prev.composite_score);
    if (diff > 5) trend = ' ↑';
    else if (diff < -5) trend = ' ↓';
    else trend = ' →';
  }

  // Format indicators
  const ind = (val) => val !== null ? String(Number(val)) : '—';

  const message = [
    `${emoji} *ZEC Signal: ${latest.signal}*${trend}`,
    `Score: ${score}/100 | Price: ${price}${change24h}`,
    ``,
    `*Indicators:*`,
    `• SVR 7d: ${ind(latest.svr_7d)} | 30d: ${ind(latest.svr_30d)}`,
    `• Pool momentum: ${ind(latest.pool_momentum)}`,
    `• Miner pressure: ${ind(latest.miner_pressure)}`,
    `• Cross-chain flow: ${ind(latest.crosschain_flow)}`,
    `• Shielded TX: ${ind(latest.shielded_tx_momentum)}`,
    ``,
    `Shielded pool: ${poolPct}`,
    `_${latest.signal_date.toISOString().split('T')[0]}_`,
  ].join('\n');

  await sendSignalReport(message);
  console.log(`[notify] Sent: ${latest.signal} (${score})`);

}

if (require.main === module) main().catch(err => { console.error(err.message); process.exitCode = 1; }).finally(() => pool.end());
