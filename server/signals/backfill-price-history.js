'use strict';

/**
 * Backfill zec_price_daily from genesis (Oct 2016) to present.
 * Uses CryptoCompare free API for historical daily OHLCV.
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

const CRYPTOCOMPARE_API = 'https://min-api.cryptocompare.com/data/v2/histoday';
const ZEC_GENESIS_DATE = new Date('2016-10-28');
const BATCH_DAYS = 2000;

async function fetchBatch(toTimestamp) {
  const url = `${CRYPTOCOMPARE_API}?fsym=ZEC&tsym=USD&limit=${BATCH_DAYS}&toTs=${toTimestamp}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CryptoCompare API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (data.Response !== 'Success') throw new Error(`CryptoCompare error: ${data.Message}`);
  return data.Data.Data;
}

async function main() {
  const { rows: existing } = await pool.query(
    `SELECT MIN(date) as min_date, MAX(date) as max_date, COUNT(*) as count FROM zec_price_daily`
  );
  console.log(`Existing prices: ${existing[0].count} rows (${existing[0].min_date} to ${existing[0].max_date})`);

  const now = new Date();
  let toTs = Math.floor(now.getTime() / 1000);
  const genesisTs = Math.floor(ZEC_GENESIS_DATE.getTime() / 1000);

  let totalInserted = 0;
  let totalSkipped = 0;

  while (toTs > genesisTs) {
    const batch = await fetchBatch(toTs);
    if (!batch || batch.length === 0) break;

    let batchInserted = 0;
    for (const day of batch) {
      if (day.time < genesisTs) continue;
      if (day.close === 0 && day.open === 0) continue;

      const date = new Date(day.time * 1000).toISOString().split('T')[0];
      const price = day.close;
      const volume = day.volumeto || 0;

      try {
        const result = await pool.query(
          `INSERT INTO zec_price_daily (date, price_usd, volume_usd, market_cap_usd, source)
           VALUES ($1, $2, $3, 0, 'cryptocompare')
           ON CONFLICT (date) DO NOTHING`,
          [date, price, volume]
        );
        if (result.rowCount > 0) {
          batchInserted++;
          totalInserted++;
        } else {
          totalSkipped++;
        }
      } catch (err) {
        console.error(`Error inserting ${date}: ${err.message}`);
      }
    }

    const oldestInBatch = new Date(batch[0].time * 1000).toISOString().split('T')[0];
    const newestInBatch = new Date(batch[batch.length - 1].time * 1000).toISOString().split('T')[0];
    console.log(`Batch: ${oldestInBatch} -> ${newestInBatch} | inserted: ${batchInserted} | total: ${totalInserted}`);

    toTs = batch[0].time - 86400;
    await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`\nDone! Inserted: ${totalInserted}, Skipped (already existed): ${totalSkipped}`);

  const { rows: final } = await pool.query(
    `SELECT MIN(date) as min_date, MAX(date) as max_date, COUNT(*) as count FROM zec_price_daily`
  );
  console.log(`Final: ${final[0].count} rows (${final[0].min_date} to ${final[0].max_date})`);

  await pool.end();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
