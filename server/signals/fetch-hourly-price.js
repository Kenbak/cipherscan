/**
 * Hourly Price Fetch — CoinGecko Free Tier
 *
 * Fetches ZEC/USD price hourly and stores it in zec_price_hourly.
 * Used for intraday volatility regime detection.
 *
 * Run via cron: every hour
 *   0 * * * * node /path/to/server/signals/fetch-hourly-price.js
 *
 * Table must exist (created out-of-band):
 *   zec_price_hourly (id, timestamp, price_usd, volume_24h_usd)
 */

const { loadEnv } = require('../lib/job-utils');
const { getPool } = require('../lib/db-pool');

loadEnv(__dirname);

const pgPool = getPool();

const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=zcash&vs_currencies=usd&include_24hr_vol=true';

async function main() {
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
