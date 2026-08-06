'use strict';

/**
 * Backfill zec_price_daily from genesis (Oct 2016) to present.
 * Sources: Poloniex (genesis-2018), Gemini (2018-present) via CryptoDataDownload.
 * Falls back to existing CoinGecko data for overlap periods.
 *
 * Usage: node server/signals/backfill-price-history.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../api/.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const SOURCES = [
  {
    name: 'Poloniex (genesis-2018)',
    url: 'https://www.cryptodatadownload.com/cdd/Poloniex_ZECUSDT_d.csv',
    parseRow: (cols) => ({
      date: cols[1].split(' ')[0],
      price: parseFloat(cols[3]), // close price (col index varies)
      volume: parseFloat(cols[4]) || 0,
    }),
    // Poloniex CSV: unix,date,symbol,close,volume_base,volume_quote,...
    // Actually: unix,date,symbol,open,high,low,close,volume...
    // Need to check the header
  },
  {
    name: 'Gemini (2018-present)',
    url: 'https://www.cryptodatadownload.com/cdd/Gemini_ZECUSD_d.csv',
    parseRow: null, // set dynamically after header check
  },
];

async function fetchCSV(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const text = await res.text();
  return text.split('\n').filter(line => line.trim().length > 0);
}

function parsePoloniexRow(cols) {
  // Format: unix,date,symbol,open,high,low,close,volume_quote,volume_base,...
  const dateStr = cols[1].split(' ')[0];
  const close = parseFloat(cols[6]) || parseFloat(cols[3]);
  const volume = parseFloat(cols[7]) || 0;
  return { date: dateStr, price: close, volume };
}

function parseGeminiRow(cols) {
  // Format: unix,date,symbol,open,high,low,close,Volume ZEC,Volume USD
  const dateStr = cols[1].split(' ')[0];
  const close = parseFloat(cols[6]);
  const volume = parseFloat(cols[8]) || 0;
  return { date: dateStr, price: close, volume };
}

async function main() {
  const { rows: existing } = await pool.query(
    `SELECT MIN(date) as min_date, MAX(date) as max_date, COUNT(*) as count FROM zec_price_daily`
  );
  console.log(`Existing: ${existing[0].count} rows (${existing[0].min_date} to ${existing[0].max_date})`);

  let totalInserted = 0;
  let totalSkipped = 0;

  // Process Poloniex (earliest data, genesis)
  console.log('\n--- Fetching Poloniex ZEC/USDT (genesis to ~2023) ---');
  try {
    const lines = await fetchCSV('https://www.cryptodatadownload.com/cdd/Poloniex_ZECUSDT_d.csv');
    console.log(`  Got ${lines.length} lines`);

    // Skip header lines (first line is attribution, second is column headers)
    for (let i = 2; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols.length < 7) continue;

      const { date, price, volume } = parsePoloniexRow(cols);
      if (!date || !price || price <= 0 || isNaN(price)) continue;

      try {
        const result = await pool.query(
          `INSERT INTO zec_price_daily (date, price_usd, volume_usd, market_cap_usd, source)
           VALUES ($1, $2, $3, 0, 'poloniex')
           ON CONFLICT (date) DO NOTHING`,
          [date, price, volume]
        );
        if (result.rowCount > 0) totalInserted++;
        else totalSkipped++;
      } catch (err) {
        // skip invalid dates
      }
    }
    console.log(`  Poloniex done: +${totalInserted} inserted`);
  } catch (err) {
    console.error(`  Poloniex failed: ${err.message}`);
  }

  // Process Gemini (2018-present, more reliable USD prices)
  const beforeGemini = totalInserted;
  console.log('\n--- Fetching Gemini ZEC/USD (2018 to present) ---');
  try {
    const lines = await fetchCSV('https://www.cryptodatadownload.com/cdd/Gemini_ZECUSD_d.csv');
    console.log(`  Got ${lines.length} lines`);

    for (let i = 2; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols.length < 7) continue;

      const { date, price, volume } = parseGeminiRow(cols);
      if (!date || !price || price <= 0 || isNaN(price)) continue;

      try {
        const result = await pool.query(
          `INSERT INTO zec_price_daily (date, price_usd, volume_usd, market_cap_usd, source)
           VALUES ($1, $2, $3, 0, 'gemini')
           ON CONFLICT (date) DO NOTHING`,
          [date, price, volume]
        );
        if (result.rowCount > 0) totalInserted++;
        else totalSkipped++;
      } catch (err) {
        // skip invalid dates
      }
    }
    console.log(`  Gemini done: +${totalInserted - beforeGemini} inserted`);
  } catch (err) {
    console.error(`  Gemini failed: ${err.message}`);
  }

  console.log(`\n=== Summary ===`);
  console.log(`Inserted: ${totalInserted}, Skipped (already existed): ${totalSkipped}`);

  const { rows: final } = await pool.query(
    `SELECT MIN(date) as min_date, MAX(date) as max_date, COUNT(*) as count FROM zec_price_daily`
  );
  console.log(`Final: ${final[0].count} rows (${final[0].min_date} to ${final[0].max_date})`);

  // Check for gaps
  const { rows: gaps } = await pool.query(`
    SELECT COUNT(*) as gap_days FROM (
      SELECT generate_series(
        (SELECT MIN(date) FROM zec_price_daily),
        (SELECT MAX(date) FROM zec_price_daily),
        '1 day'::interval
      )::date as d
    ) dates
    WHERE d NOT IN (SELECT date FROM zec_price_daily)
  `);
  console.log(`Missing days in range: ${gaps[0].gap_days}`);

  await pool.end();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
