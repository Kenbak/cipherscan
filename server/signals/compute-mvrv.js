'use strict';

/**
 * Compute MVRV daily — combines pool realized cap with transparent approximation
 * to produce daily MVRV, realized price, SOPR, and NUPL.
 *
 * Until UTXO backfill completes, uses scaling approximation for transparent cap.
 * After backfill: uses actual transparent unspent set with cost basis.
 *
 * Usage: cd server/api && node ../signals/compute-mvrv.js [--date 2026-08-01]
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

async function computeForDate(targetDate) {
  // 1. Get spot price and chain supply
  const { rows: [priceRow] } = await pool.query(
    `SELECT price_usd FROM zec_price_daily WHERE date = $1`, [targetDate]
  );
  if (!priceRow) return null;
  const spotPrice = parseFloat(priceRow.price_usd);

  // Get chain supply from privacy_trends_daily or chain_snapshots
  const { rows: [supplyRow] } = await pool.query(`
    SELECT chain_supply, transparent_pool_size,
           sapling_pool_size, orchard_pool_size, ironwood_pool_size, sprout_pool_size
    FROM privacy_trends_daily WHERE date = $1
  `, [targetDate]);

  let chainSupplyZat, transparentZat;
  if (supplyRow) {
    chainSupplyZat = parseInt(supplyRow.chain_supply) || 0;
    transparentZat = parseInt(supplyRow.transparent_pool_size) || 0;
  } else {
    // Fallback to nearest available
    const { rows: [nearest] } = await pool.query(`
      SELECT chain_supply, transparent_pool_size
      FROM privacy_trends_daily WHERE date <= $1 ORDER BY date DESC LIMIT 1
    `, [targetDate]);
    if (!nearest) return null;
    chainSupplyZat = parseInt(nearest.chain_supply) || 0;
    transparentZat = parseInt(nearest.transparent_pool_size) || 0;
  }

  const chainSupplyZec = chainSupplyZat / 1e8;
  const marketCap = spotPrice * chainSupplyZec;

  // 2. Get shielded pool realized cap for this date
  const { rows: poolCaps } = await pool.query(`
    SELECT pool, realized_cap_usd, balance_zat, avg_acquisition_price
    FROM pool_realized_cap_daily WHERE date = $1
  `, [targetDate]);

  let shieldedRealizedCap = 0;
  let shieldedBalanceZat = 0;
  const poolData = {};
  for (const p of poolCaps) {
    const cap = parseFloat(p.realized_cap_usd) || 0;
    shieldedRealizedCap += cap;
    shieldedBalanceZat += parseInt(p.balance_zat) || 0;
    poolData[p.pool] = { cap, avgPrice: parseFloat(p.avg_acquisition_price) || 0 };
  }

  // 3. Transparent realized cap
  // Check if UTXO backfill is complete enough for direct computation
  const { rows: [spentCount] } = await pool.query(
    `SELECT COUNT(*) as c FROM transaction_outputs WHERE spent = TRUE LIMIT 1`
  );
  const hasBackfill = parseInt(spentCount.c) > 10000000; // >10M means backfill in progress/done

  let transparentRealizedCap;
  if (hasBackfill) {
    // Direct computation from unspent outputs with creation prices
    const { rows: [trc] } = await pool.query(`
      SELECT SUM(o.value::numeric / 1e8 * p.price_usd) as realized_cap
      FROM transaction_outputs o
      JOIN transactions t ON o.txid = t.txid
      JOIN zec_price_daily p ON p.date = to_timestamp(t.block_time)::date
      WHERE o.spent = FALSE
      LIMIT 1
    `);
    transparentRealizedCap = trc?.realized_cap ? parseFloat(trc.realized_cap) : null;
  }

  if (!transparentRealizedCap && shieldedRealizedCap > 0 && shieldedBalanceZat > 0) {
    // Scaling approximation: assume transparent has similar avg cost basis
    const shieldedAvgPrice = shieldedRealizedCap / (shieldedBalanceZat / 1e8);
    transparentRealizedCap = (transparentZat / 1e8) * shieldedAvgPrice;
  } else if (!transparentRealizedCap) {
    transparentRealizedCap = 0;
  }

  // 4. Total realized cap and MVRV
  const totalRealizedCap = shieldedRealizedCap + transparentRealizedCap;
  const mvrv = totalRealizedCap > 0 ? marketCap / totalRealizedCap : null;
  const realizedPrice = chainSupplyZec > 0 ? totalRealizedCap / chainSupplyZec : 0;
  const nupl = marketCap > 0 ? (marketCap - totalRealizedCap) / marketCap : 0;

  // 5. Shielded SOPR: spot / avg shielded acquisition price
  const totalShieldedZec = shieldedBalanceZat / 1e8;
  const avgShieldedAcqPrice = totalShieldedZec > 0 ? shieldedRealizedCap / totalShieldedZec : spotPrice;
  const shieldedSopr = avgShieldedAcqPrice > 0 ? spotPrice / avgShieldedAcqPrice : 1;

  // 6. Transparent SOPR: from spent outputs today vs their creation price
  // (simplified: uses day-level spent outputs if available)
  let sopr = null;
  if (hasBackfill) {
    const { rows: [soprRow] } = await pool.query(`
      SELECT
        SUM(o.value::numeric / 1e8 * sp.price_usd) as spend_value,
        SUM(o.value::numeric / 1e8 * cp.price_usd) as creation_value
      FROM transaction_outputs o
      JOIN transactions ct ON o.txid = ct.txid
      JOIN zec_price_daily cp ON cp.date = to_timestamp(ct.block_time)::date
      JOIN transactions st ON o.spent_txid = st.txid
      JOIN zec_price_daily sp ON sp.date = to_timestamp(st.block_time)::date
      WHERE o.spent = TRUE
        AND to_timestamp(st.block_time)::date = $1
    `, [targetDate]);
    if (soprRow?.spend_value && soprRow?.creation_value && parseFloat(soprRow.creation_value) > 0) {
      sopr = parseFloat(soprRow.spend_value) / parseFloat(soprRow.creation_value);
    }
  }

  return {
    date: targetDate,
    market_cap_usd: marketCap,
    realized_cap_usd: totalRealizedCap,
    transparent_realized_cap_usd: transparentRealizedCap,
    shielded_realized_cap_usd: shieldedRealizedCap,
    mvrv,
    realized_price: realizedPrice,
    sopr,
    shielded_sopr: shieldedSopr,
    nupl,
  };
}

async function main() {
  const dateArg = process.argv.find(a => a.startsWith('--date'));
  let targetDate = dateArg ? dateArg.split('=')[1] || process.argv[process.argv.indexOf('--date') + 1] : null;

  if (targetDate) {
    // Single date mode
    console.log(`Computing MVRV for ${targetDate}...`);
    const result = await computeForDate(targetDate);
    if (result) {
      await upsertMvrv(result);
      printResult(result);
    } else {
      console.log('No data available for this date.');
    }
  } else {
    // Backfill mode: compute for all dates with pool_realized_cap_daily data
    console.log('Backfilling MVRV for all available dates...');
    const { rows: dates } = await pool.query(`
      SELECT DISTINCT date FROM pool_realized_cap_daily ORDER BY date
    `);
    console.log(`${dates.length} dates to process`);

    let count = 0;
    for (const { date } of dates) {
      const d = date instanceof Date ? date.toISOString().split('T')[0] : String(date);
      const result = await computeForDate(d);
      if (result && result.mvrv !== null) {
        await upsertMvrv(result);
        count++;
        if (count % 100 === 0) {
          process.stdout.write(`\r  ${count}/${dates.length} (${(count/dates.length*100).toFixed(1)}%)`);
        }
      }
    }
    console.log(`\nDone! ${count} MVRV rows computed.`);

    // Print latest
    const { rows: [latest] } = await pool.query(
      `SELECT * FROM mvrv_daily ORDER BY date DESC LIMIT 1`
    );
    if (latest) {
      console.log('\nLatest MVRV:');
      printResult(latest);
    }
  }

  await pool.end();
}

async function upsertMvrv(r) {
  await pool.query(`
    INSERT INTO mvrv_daily (date, market_cap_usd, realized_cap_usd, transparent_realized_cap_usd,
                            shielded_realized_cap_usd, mvrv, realized_price, sopr, shielded_sopr, nupl)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (date) DO UPDATE SET
      market_cap_usd = EXCLUDED.market_cap_usd,
      realized_cap_usd = EXCLUDED.realized_cap_usd,
      transparent_realized_cap_usd = EXCLUDED.transparent_realized_cap_usd,
      shielded_realized_cap_usd = EXCLUDED.shielded_realized_cap_usd,
      mvrv = EXCLUDED.mvrv,
      realized_price = EXCLUDED.realized_price,
      sopr = EXCLUDED.sopr,
      shielded_sopr = EXCLUDED.shielded_sopr,
      nupl = EXCLUDED.nupl
  `, [r.date, r.market_cap_usd, r.realized_cap_usd, r.transparent_realized_cap_usd,
      r.shielded_realized_cap_usd, r.mvrv, r.realized_price, r.sopr, r.shielded_sopr, r.nupl]);
}

function printResult(r) {
  const mvrv = r.mvrv ? parseFloat(r.mvrv).toFixed(3) : '?';
  const rp = r.realized_price ? `$${parseFloat(r.realized_price).toFixed(2)}` : '?';
  const sopr = r.shielded_sopr ? parseFloat(r.shielded_sopr).toFixed(3) : '?';
  const nupl = r.nupl ? `${(parseFloat(r.nupl)*100).toFixed(1)}%` : '?';
  const mc = r.market_cap_usd ? `$${(parseFloat(r.market_cap_usd)/1e9).toFixed(2)}B` : '?';
  const rc = r.realized_cap_usd ? `$${(parseFloat(r.realized_cap_usd)/1e9).toFixed(2)}B` : '?';

  console.log(`  Date: ${r.date}`);
  console.log(`  MVRV: ${mvrv} | Realized Price: ${rp}`);
  console.log(`  Market Cap: ${mc} | Realized Cap: ${rc}`);
  console.log(`  Shielded SOPR: ${sopr} | NUPL: ${nupl}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
