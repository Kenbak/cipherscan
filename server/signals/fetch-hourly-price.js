/**
 * Hourly Price Fetch — CoinGecko Free Tier
 *
 * Fetches ZEC/USD price hourly and stores it in zec_price_hourly.
 * Used for intraday volatility regime detection.
 *
 * Run via cron: every hour
 *   0 * * * * node /path/to/server/signals/fetch-hourly-price.js
 *
 * Requires table:
 *   CREATE TABLE IF NOT EXISTS zec_price_hourly (
 *     id BIGSERIAL PRIMARY KEY,
 *     timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *     price_usd NUMERIC NOT NULL,
 *     volume_24h_usd NUMERIC,
 *     CONSTRAINT zec_price_hourly_ts UNIQUE (timestamp)
 *   );
 *   CREATE INDEX IF NOT EXISTS idx_zec_price_hourly_ts ON zec_price_hourly (timestamp DESC);
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

const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=zcash&vs_currencies=usd&include_24hr_vol=true';

async function ensureTable() {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS zec_price_hourly (
      id BIGSERIAL PRIMARY KEY,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      price_usd NUMERIC NOT NULL,
      volume_24h_usd NUMERIC,
      CONSTRAINT zec_price_hourly_ts UNIQUE (timestamp)
    )
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS idx_zec_price_hourly_ts ON zec_price_hourly (timestamp DESC)
  `);
}

async function main() {
  await ensureTable();

  try {
    const response = await fetch(COINGECKO_URL);
    if (!response.ok) {
      throw new Error(`CoinGecko API returned ${response.status}`);
    }

    const data = await response.json();
    const price = data?.zcash?.usd;
    const volume = data?.zcash?.usd_24h_vol;

    if (!price || price <= 0) {
      console.error('[hourly-price] Invalid price received:', data);
      process.exit(1);
    }

    // Round timestamp to the hour to deduplicate
    const now = new Date();
    now.setMinutes(0, 0, 0);

    await pgPool.query(`
      INSERT INTO zec_price_hourly (timestamp, price_usd, volume_24h_usd)
      VALUES ($1, $2, $3)
      ON CONFLICT (timestamp) DO UPDATE SET
        price_usd = EXCLUDED.price_usd,
        volume_24h_usd = EXCLUDED.volume_24h_usd
    `, [now.toISOString(), price, volume || null]);

    console.log(`[hourly-price] ${now.toISOString()}: $${price} (vol: $${volume ? Math.round(volume).toLocaleString() : 'n/a'})`);
  } catch (err) {
    console.error('[hourly-price] Error:', err.message);
    process.exit(1);
  }

  await pgPool.end();
}

main();
