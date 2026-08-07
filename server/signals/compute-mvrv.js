'use strict';

/**
 * Compute MVRV daily — uses shielded pool realized cap + transparent approximation.
 *
 * Strategy:
 *   1. Compute current transparent realized cap ONCE from UTXO set
 *   2. For historical dates, use shielded realized cap (exact) + transparent
 *      approximation (transparent_balance * shielded_avg_price)
 *   3. For recent dates (post-backfill), use actual transparent realized cap
 *
 * Usage: cd server/api && node ../signals/compute-mvrv.js [--today-only]
 */

const { loadEnv } = require('../lib/job-utils');
const { getPool } = require('../lib/db-pool');

loadEnv(__dirname);

const pool = getPool();

async function computeCurrentTransparentRealizedCap() {
  console.log('Computing current transparent realized cap from UTXO set...');
  const { rows: [result] } = await pool.query(`
    SELECT SUM(o.value::numeric / 1e8 * p.price_usd) as realized_cap,
           COUNT(*) as utxo_count,
           SUM(o.value)::numeric / 1e8 as total_zec
    FROM transaction_outputs o
    JOIN transactions t ON o.txid = t.txid
    JOIN zec_price_daily p ON p.date = to_timestamp(t.block_time)::date
    WHERE o.spent = FALSE AND o.value > 0
  `);
  const cap = result?.realized_cap ? parseFloat(result.realized_cap) : 0;
  const count = parseInt(result?.utxo_count) || 0;
  const totalZec = parseFloat(result?.total_zec) || 0;
  const avgPrice = totalZec > 0 ? cap / totalZec : 0;
  console.log(`  Transparent realized cap: $${(cap/1e6).toFixed(1)}M`);
  console.log(`  UTXOs: ${count.toLocaleString()}, Total: ${totalZec.toFixed(0)} ZEC, Avg cost: $${avgPrice.toFixed(2)}`);
  return { cap, count, totalZec, avgPrice };
}

async function main() {
  const todayOnly = process.argv.includes('--today-only');

  // Step 1: Compute current transparent realized cap once
  const transparentNow = await computeCurrentTransparentRealizedCap();

  if (todayOnly) {
    const today = new Date().toISOString().split('T')[0];
    const result = await computeForDate(today, transparentNow);
    if (result) {
      await upsertMvrv(result);
      printResult(result);
    }
    await pool.end();
    return;
  }

  // Step 2: Backfill all dates using shielded (exact) + transparent (approx)
  console.log('\nBackfilling MVRV for all available dates...');
  const { rows: dates } = await pool.query(`
    SELECT DISTINCT date FROM pool_realized_cap_daily ORDER BY date
  `);
  console.log(`${dates.length} dates to process`);

  let count = 0;
  const startTime = Date.now();
  for (const { date } of dates) {
    const d = date instanceof Date ? date.toISOString().split('T')[0] : String(date);
    const result = await computeForDate(d, transparentNow);
    if (result && result.mvrv !== null) {
      await upsertMvrv(result);
      count++;
      if (count % 200 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = Math.round(count / elapsed * 60);
        console.log(`  ${count}/${dates.length} (${(count/dates.length*100).toFixed(1)}%) — ${rate}/min`);
      }
    }
  }
  console.log(`\nDone! ${count} MVRV rows computed in ${((Date.now()-startTime)/1000).toFixed(0)}s.`);

  // Print latest 5
  const { rows: latest } = await pool.query(
    `SELECT * FROM mvrv_daily ORDER BY date DESC LIMIT 5`
  );
  console.log('\nLatest MVRV values:');
  for (const r of latest) printResult(r);

  await pool.end();
}

async function computeForDate(targetDate, transparentNow) {
  // Get spot price
  const { rows: [priceRow] } = await pool.query(
    `SELECT price_usd FROM zec_price_daily WHERE date = $1`, [targetDate]
  );
  if (!priceRow) return null;
  const spotPrice = parseFloat(priceRow.price_usd);

  // Get chain supply
  const { rows: [supplyRow] } = await pool.query(`
    SELECT chain_supply, transparent_pool_size
    FROM privacy_trends_daily WHERE date <= $1 ORDER BY date DESC LIMIT 1
  `, [targetDate]);
  if (!supplyRow) return null;

  const chainSupplyZat = parseInt(supplyRow.chain_supply) || 0;
  const transparentZat = parseInt(supplyRow.transparent_pool_size) || 0;
  const chainSupplyZec = chainSupplyZat / 1e8;
  const transparentZec = transparentZat / 1e8;
  const marketCap = spotPrice * chainSupplyZec;

  // Get shielded pool realized cap (latest available on or before target date)
  const { rows: poolCaps } = await pool.query(`
    SELECT DISTINCT ON (pool) pool, realized_cap_usd, balance_zat
    FROM pool_realized_cap_daily WHERE date <= $1
    ORDER BY pool, date DESC
  `, [targetDate]);

  let shieldedRealizedCap = 0;
  let shieldedBalanceZat = 0;
  for (const p of poolCaps) {
    shieldedRealizedCap += parseFloat(p.realized_cap_usd) || 0;
    shieldedBalanceZat += parseInt(p.balance_zat) || 0;
  }

  // Transparent realized cap: use proportional scaling from current snapshot
  // Historical transparent cap ≈ (historical transparent balance / current transparent balance) * current transparent cap
  // Adjusted by price ratio to account for different cost basis eras
  let transparentRealizedCap;
  if (transparentNow.totalZec > 0 && transparentZec > 0) {
    // Scale by balance ratio
    const balanceRatio = transparentZec / transparentNow.totalZec;
    transparentRealizedCap = transparentNow.cap * balanceRatio;
  } else {
    transparentRealizedCap = 0;
  }

  // Total realized cap
  const totalRealizedCap = shieldedRealizedCap + transparentRealizedCap;
  const mvrv = totalRealizedCap > 0 ? marketCap / totalRealizedCap : null;
  const realizedPrice = chainSupplyZec > 0 ? totalRealizedCap / chainSupplyZec : 0;
  const nupl = marketCap > 0 ? (marketCap - totalRealizedCap) / marketCap : 0;

  // Shielded SOPR
  const shieldedZec = shieldedBalanceZat / 1e8;
  const avgShieldedAcq = shieldedZec > 0 ? shieldedRealizedCap / shieldedZec : spotPrice;
  const shieldedSopr = avgShieldedAcq > 0 ? spotPrice / avgShieldedAcq : 1;

  return {
    date: targetDate,
    market_cap_usd: marketCap,
    realized_cap_usd: totalRealizedCap,
    transparent_realized_cap_usd: transparentRealizedCap,
    shielded_realized_cap_usd: shieldedRealizedCap,
    mvrv,
    realized_price: realizedPrice,
    sopr: null,
    shielded_sopr: shieldedSopr,
    nupl,
  };
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
  const mc = r.market_cap_usd ? `$${(parseFloat(r.market_cap_usd)/1e6).toFixed(1)}M` : '?';
  const rc = r.realized_cap_usd ? `$${(parseFloat(r.realized_cap_usd)/1e6).toFixed(1)}M` : '?';
  console.log(`  ${r.date} | MVRV: ${mvrv} | RP: ${rp} | SOPR: ${sopr} | NUPL: ${nupl} | MC: ${mc} | RC: ${rc}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
