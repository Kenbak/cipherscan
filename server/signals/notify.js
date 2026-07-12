/**
 * Trading Signals — Daily Telegram Notification
 *
 * Sends the current signal to Telegram once per day.
 * Usage: node server/signals/notify.js
 * Cron: 0 8 * * * (daily at 8 AM)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../api/.env') });
const { Pool } = require('pg');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const SIGNAL_EMOJI = {
  STRONG_BUY: '🟢🟢',
  BUY: '🟢',
  HOLD: '⚪',
  SELL: '🔴',
  STRONG_SELL: '🔴🔴',
};

async function sendTelegram(message) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) throw new Error(`Telegram API ${res.status}: ${await res.text()}`);
}

async function fetchLivePrice() {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=zcash&vs_currencies=usd&include_24hr_change=true');
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
    await pool.end();
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

  await sendTelegram(message);
  console.log(`[notify] Sent: ${latest.signal} (${score})`);

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
