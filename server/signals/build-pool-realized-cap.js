'use strict';

/**
 * Build Pool Realized Cap — iterate shielded_flows to compute pool cost basis.
 *
 * For each shield/deshield event:
 *   - Shield: pool += amount, pool_cap += amount * spot_price
 *   - Deshield: pool -= amount, pool_cap -= amount * pool_avg_price
 *   - Pool migration: transfer cost basis from source to dest at source avg
 *
 * Snapshots state daily into pool_realized_cap_daily.
 *
 * Usage: cd server/api && node ../signals/build-pool-realized-cap.js
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

async function main() {
  console.log('Building pool realized cap from shielded_flows...\n');

  // Load price lookup: date -> price_usd
  const priceRows = await pool.query(`SELECT date, price_usd FROM zec_price_daily ORDER BY date`);
  const priceMap = new Map();
  for (const r of priceRows.rows) {
    const d = r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date);
    priceMap.set(d, parseFloat(r.price_usd));
  }
  console.log(`Loaded ${priceMap.size} daily prices (${priceRows.rows[0]?.date} to ${priceRows.rows[priceRows.rows.length-1]?.date})`);

  // Pool state accumulators
  const pools = {};
  function getPool(name) {
    if (!pools[name]) pools[name] = { balance_zat: 0, realized_cap_usd: 0 };
    return pools[name];
  }
  function avgPrice(p) {
    if (p.balance_zat <= 0) return 0;
    return p.realized_cap_usd / (p.balance_zat / 1e8);
  }

  // Stream all shielded_flows ordered by block_time
  const BATCH = 50000;
  let offset = 0;
  let totalProcessed = 0;
  let lastDate = null;
  let snapshotCount = 0;

  const startTime = Date.now();

  while (true) {
    const { rows } = await pool.query(`
      SELECT f.flow_type, f.pool, f.amount_zat, f.block_time,
             f.is_pool_migration, f.migration_from_pool, f.migration_to_pool,
             t.value_balance_sapling, t.value_balance_orchard, t.value_balance_ironwood
      FROM shielded_flows f
      LEFT JOIN transactions t ON t.txid = f.txid
      WHERE f.block_time IS NOT NULL
      ORDER BY f.block_time ASC, f.txid
      LIMIT $1 OFFSET $2
    `, [BATCH, offset]);

    if (rows.length === 0) break;

    for (const row of rows) {
      const date = new Date(row.block_time * 1000).toISOString().split('T')[0];
      const price = priceMap.get(date);
      if (!price) continue; // skip if no price data for this day

      const amountZat = parseInt(row.amount_zat);
      const amountZec = amountZat / 1e8;

      // Snapshot at date boundaries
      if (lastDate && date !== lastDate) {
        await snapshotPools(lastDate);
        snapshotCount++;
      }
      lastDate = date;

      // Handle pool migrations separately
      if (row.is_pool_migration && row.migration_from_pool && row.migration_to_pool) {
        const src = getPool(row.migration_from_pool);
        const dst = getPool(row.migration_to_pool);
        const srcAvg = avgPrice(src);
        const transferCost = amountZec * srcAvg;

        src.balance_zat -= amountZat;
        src.realized_cap_usd -= transferCost;
        dst.balance_zat += amountZat;
        dst.realized_cap_usd += transferCost;

        // Clamp to prevent negative from rounding
        if (src.balance_zat < 0) src.balance_zat = 0;
        if (src.realized_cap_usd < 0) src.realized_cap_usd = 0;
      } else if (row.flow_type === 'shield') {
        const p = getPool(row.pool);
        p.balance_zat += amountZat;
        p.realized_cap_usd += amountZec * price;
      } else if (row.flow_type === 'deshield') {
        const p = getPool(row.pool);
        const pAvg = avgPrice(p);
        p.balance_zat -= amountZat;
        p.realized_cap_usd -= amountZec * pAvg;

        if (p.balance_zat < 0) p.balance_zat = 0;
        if (p.realized_cap_usd < 0) p.realized_cap_usd = 0;
      }

      totalProcessed++;
    }

    offset += rows.length;
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = Math.round(totalProcessed / elapsed);
    process.stdout.write(`\r  Processed: ${totalProcessed} flows | ${snapshotCount} days | ${rate} flows/s`);
  }

  // Final snapshot
  if (lastDate) {
    await snapshotPools(lastDate);
    snapshotCount++;
  }

  console.log(`\n\nDone! ${totalProcessed} flows processed, ${snapshotCount} daily snapshots written.`);
  console.log('Pool state at end:');
  for (const [name, state] of Object.entries(pools)) {
    console.log(`  ${name}: ${(state.balance_zat / 1e8).toFixed(2)} ZEC, realized cap $${state.realized_cap_usd.toFixed(0)}, avg price $${avgPrice(state).toFixed(2)}`);
  }

  await pool.end();

  async function snapshotPools(date) {
    for (const [name, state] of Object.entries(pools)) {
      await pool.query(`
        INSERT INTO pool_realized_cap_daily (date, pool, balance_zat, realized_cap_usd, avg_acquisition_price)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (date, pool) DO UPDATE SET
          balance_zat = EXCLUDED.balance_zat,
          realized_cap_usd = EXCLUDED.realized_cap_usd,
          avg_acquisition_price = EXCLUDED.avg_acquisition_price
      `, [date, name, state.balance_zat, state.realized_cap_usd, avgPrice(state)]);
    }
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
