'use strict';

/**
 * Backfill zec_price_daily from genesis (Oct 2016) to present.
 * Sources: Poloniex (genesis-2025), Gemini (2018-present) via CryptoDataDownload.
 *
 * Usage: cd server/api && node ../signals/backfill-price-history.js
 */

const { loadEnv } = require('../lib/job-utils');
const { getPool } = require('../lib/db-pool');

loadEnv(__dirname);

const pool = getPool();

async function fetchCSV(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const text = await res.text();
  return text.split('\n').filter(line => line.trim().length > 0);
}

async function insertPrice(date, price, volumeUsd, source) {
  const vol = Math.round(volumeUsd);
  const result = await pool.query(
    `INSERT INTO zec_price_daily (date, price_usd, volume_usd, market_cap_usd, source)
     VALUES ($1, $2, $3, 0, $4)
     ON CONFLICT (date) DO NOTHING`,
    [date, price, vol, source]
  );
  return result.rowCount > 0;
}

async function main() {
  const { rows: existing } = await pool.query(
    `SELECT MIN(date) as min_date, MAX(date) as max_date, COUNT(*) as count FROM zec_price_daily`
  );
  console.log(`Existing: ${existing[0].count} rows (${existing[0].min_date} to ${existing[0].max_date})`);

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  console.log('\n--- Fetching Poloniex ZEC/USDT (genesis to ~2025) ---');
  try {
    const lines = await fetchCSV('https://www.cryptodatadownload.com/cdd/Poloniex_ZECUSDT_d.csv');
    console.log(`  Got ${lines.length} lines`);

    for (let i = 2; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols.length < 9) continue;

      const date = cols[1].split(' ')[0];
      const close = parseFloat(cols[6]);
      const volUsd = parseFloat(cols[8]) || 0;

      if (!date || !close || close <= 0 || isNaN(close)) continue;

      try {
        const inserted = await insertPrice(date, close, volUsd, 'poloniex');
        if (inserted) totalInserted++;
        else totalSkipped++;
      } catch (err) {
        totalErrors++;
        if (totalErrors <= 3) console.error(`  Error on ${date}: ${err.message}`);
      }
    }
    console.log(`  Poloniex: +${totalInserted} inserted, ${totalSkipped} skipped, ${totalErrors} errors`);
  } catch (err) {
    console.error(`  Poloniex fetch failed: ${err.message}`);
  }

  const beforeGemini = totalInserted;
  const beforeErrors = totalErrors;
  console.log('\n--- Fetching Gemini ZEC/USD (2018 to present) ---');
  try {
    const lines = await fetchCSV('https://www.cryptodatadownload.com/cdd/Gemini_ZECUSD_d.csv');
    console.log(`  Got ${lines.length} lines`);

    for (let i = 2; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols.length < 9) continue;

      const date = cols[1].split(' ')[0];
      const close = parseFloat(cols[6]);
      const volUsd = parseFloat(cols[8]) || 0;

      if (!date || !close || close <= 0 || isNaN(close)) continue;

      try {
        const inserted = await insertPrice(date, close, volUsd, 'gemini');
        if (inserted) totalInserted++;
        else totalSkipped++;
      } catch (err) {
        totalErrors++;
        if (totalErrors - beforeErrors <= 3) console.error(`  Error on ${date}: ${err.message}`);
      }
    }
    console.log(`  Gemini: +${totalInserted - beforeGemini} inserted, ${totalErrors - beforeErrors} errors`);
  } catch (err) {
    console.error(`  Gemini fetch failed: ${err.message}`);
  }

  console.log(`\n=== Summary ===`);
  console.log(`Inserted: ${totalInserted}, Skipped: ${totalSkipped}, Errors: ${totalErrors}`);

  const { rows: final } = await pool.query(
    `SELECT MIN(date) as min_date, MAX(date) as max_date, COUNT(*) as count FROM zec_price_daily`
  );
  console.log(`Final: ${final[0].count} rows (${final[0].min_date} to ${final[0].max_date})`);

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
