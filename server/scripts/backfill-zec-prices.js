#!/usr/bin/env node
/**
 * Backfill zec_price_daily table from CoinGecko.
 * Free tier limited to 365 days of history.
 *
 * Creates the table if it doesn't exist.
 * Safe to run multiple times (ON CONFLICT DO UPDATE).
 *
 * Usage: node backfill-zec-prices.js
 * Cron (daily): 0 1 * * * node backfill-zec-prices.js --daily
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'api', '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const DAILY_MODE = process.argv.includes('--daily');

async function ensureTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS zec_price_daily (
      date DATE PRIMARY KEY,
      price_usd NUMERIC(12, 4) NOT NULL,
      market_cap_usd BIGINT,
      volume_usd BIGINT,
      source VARCHAR(50) DEFAULT 'coingecko',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

async function fetchCoinGecko(days) {
  const url = `https://api.coingecko.com/api/v3/coins/zcash/market_chart?vs_currency=usd&days=${days}&interval=daily`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CoinGecko API error (${res.status}): ${text}`);
  }
  return res.json();
}

async function main() {
  const client = await pool.connect();
  try {
    await ensureTable(client);

    const days = DAILY_MODE ? 7 : 365;
    console.log(`Fetching ${days} days of ZEC price history from CoinGecko...`);

    const data = await fetchCoinGecko(days);
    const prices = data.prices || [];
    const marketCaps = data.market_caps || [];
    const volumes = data.total_volumes || [];

    console.log(`Received ${prices.length} price points`);

    await client.query('BEGIN');

    let upserted = 0;
    for (let i = 0; i < prices.length; i++) {
      const ts = prices[i][0];
      const price = prices[i][1];
      const cap = marketCaps[i] ? Math.round(marketCaps[i][1]) : null;
      const vol = volumes[i] ? Math.round(volumes[i][1]) : null;

      const date = new Date(ts).toISOString().split('T')[0];

      await client.query(`
        INSERT INTO zec_price_daily (date, price_usd, market_cap_usd, volume_usd)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (date) DO UPDATE SET
          price_usd = EXCLUDED.price_usd,
          market_cap_usd = EXCLUDED.market_cap_usd,
          volume_usd = EXCLUDED.volume_usd
      `, [date, price.toFixed(4), cap, vol]);
      upserted++;
    }

    await client.query('COMMIT');

    const count = await client.query('SELECT COUNT(*) as total, MIN(date) as first, MAX(date) as last FROM zec_price_daily');
    const row = count.rows[0];
    console.log(`Done: ${upserted} rows upserted`);
    console.log(`Table now has ${row.total} rows (${row.first} to ${row.last})`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('ERROR:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
