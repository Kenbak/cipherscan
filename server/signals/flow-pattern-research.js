'use strict';

/**
 * Flow Pattern Research — correlate shielded flow patterns against forward returns.
 *
 * Tests 6 hypotheses:
 *   1. Deshield volume spikes (>2σ) → forward returns
 *   2. Shield velocity surges (>2σ) → forward returns
 *   3. Net flow imbalance extremes → forward returns
 *   4. Deshield-to-exchange routing → forward returns
 *   5. Large single-tx deshields (whale exits) → forward returns
 *   6. Organic (non-migration) deshield volume → forward returns
 *
 * Output: per-pattern correlation stats, significance tests, optimal lookbacks.
 *
 * Usage: cd server/api && node ../signals/flow-pattern-research.js
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

function stats(arr) {
  if (arr.length === 0) return { mean: 0, std: 0, count: 0 };
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
  return { mean, std: Math.sqrt(variance), count: arr.length };
}

function tTest(arr) {
  const { mean, std, count } = stats(arr);
  if (count < 5 || std === 0) return { mean, std, count, tStat: 0, significant: false };
  const tStat = mean / (std / Math.sqrt(count));
  return { mean, std, count, tStat, significant: Math.abs(tStat) > 2 };
}

async function main() {
  console.log('=== Flow Pattern Research ===\n');

  // Load daily price data
  const { rows: prices } = await pool.query(`
    SELECT date, price_usd::float FROM zec_price_daily ORDER BY date
  `);
  const priceByDate = new Map();
  prices.forEach(r => {
    const d = r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date);
    priceByDate.set(d, r.price_usd);
  });

  // Precompute forward returns (1d, 3d, 7d)
  const dateList = prices.map(r => r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date));
  const fwdReturns = new Map();
  for (let i = 0; i < dateList.length; i++) {
    const d = dateList[i];
    const p = prices[i].price_usd;
    const r1 = i + 1 < prices.length ? (prices[i+1].price_usd - p) / p : null;
    const r3 = i + 3 < prices.length ? (prices[i+3].price_usd - p) / p : null;
    const r7 = i + 7 < prices.length ? (prices[i+7].price_usd - p) / p : null;
    fwdReturns.set(d, { r1, r3, r7 });
  }

  // === HYPOTHESIS 1: Deshield volume spikes ===
  console.log('--- H1: Deshield Volume Spikes ---');
  const { rows: dailyDeshield } = await pool.query(`
    SELECT to_char(to_timestamp(block_time)::date, 'YYYY-MM-DD') as date,
           SUM(amount_zat)::float / 1e8 as deshield_zec,
           COUNT(*) as tx_count
    FROM shielded_flows
    WHERE flow_type = 'deshield' AND block_time IS NOT NULL
    GROUP BY 1 ORDER BY 1
  `);
  await analyzeSpikes(dailyDeshield, 'deshield_zec', 'Deshield spike', fwdReturns);

  // === HYPOTHESIS 2: Shield velocity surges ===
  console.log('\n--- H2: Shield Velocity Surges ---');
  const { rows: dailyShield } = await pool.query(`
    SELECT to_char(to_timestamp(block_time)::date, 'YYYY-MM-DD') as date,
           SUM(amount_zat)::float / 1e8 as shield_zec,
           COUNT(*) as tx_count
    FROM shielded_flows
    WHERE flow_type = 'shield' AND block_time IS NOT NULL
    GROUP BY 1 ORDER BY 1
  `);
  await analyzeSpikes(dailyShield, 'shield_zec', 'Shield surge', fwdReturns);

  // === HYPOTHESIS 3: Net flow imbalance ===
  console.log('\n--- H3: Net Flow Imbalance ---');
  const { rows: dailyNet } = await pool.query(`
    SELECT date,
           COALESCE(SUM(CASE WHEN flow_type='shield' THEN amount END), 0) as shield,
           COALESCE(SUM(CASE WHEN flow_type='deshield' THEN amount END), 0) as deshield
    FROM (
      SELECT to_char(to_timestamp(block_time)::date, 'YYYY-MM-DD') as date,
             flow_type, amount_zat::float / 1e8 as amount
      FROM shielded_flows WHERE block_time IS NOT NULL
    ) sub
    GROUP BY date ORDER BY date
  `);
  const netFlowData = dailyNet.map(r => ({
    date: r.date,
    value: parseFloat(r.shield) - parseFloat(r.deshield)
  }));
  await analyzeSpikes(netFlowData.map(r => ({ date: r.date, net_flow: r.value })), 'net_flow', 'Net flow extreme', fwdReturns);

  // === HYPOTHESIS 4: Deshield-to-exchange routing ===
  console.log('\n--- H4: Deshield-to-Exchange Ratio ---');
  const { rows: turnstile } = await pool.query(`
    SELECT to_char(date, 'YYYY-MM-DD') as date,
           COALESCE(SUM(exchange_zat), 0)::float / 1e8 as to_exchange,
           COALESCE(SUM(deshielded_zat), 0)::float / 1e8 as total_deshield
    FROM turnstile_daily
    GROUP BY 1 ORDER BY 1
  `);
  const exchangeRatio = turnstile
    .filter(r => parseFloat(r.total_deshield) > 0)
    .map(r => ({
      date: r.date,
      exchange_ratio: parseFloat(r.to_exchange) / parseFloat(r.total_deshield)
    }));
  await analyzeSpikes(exchangeRatio, 'exchange_ratio', 'Exchange routing spike', fwdReturns);

  // === HYPOTHESIS 5: Large single-tx deshields (whale exits) ===
  console.log('\n--- H5: Whale Deshields (>1000 ZEC single tx) ---');
  const { rows: whaleDeshields } = await pool.query(`
    SELECT to_char(to_timestamp(block_time)::date, 'YYYY-MM-DD') as date,
           COUNT(*) as whale_count,
           SUM(amount_zat)::float / 1e8 as whale_volume
    FROM shielded_flows
    WHERE flow_type = 'deshield' AND amount_zat >= 100000000000 AND block_time IS NOT NULL
    GROUP BY 1 ORDER BY 1
  `);
  await analyzeSpikes(whaleDeshields, 'whale_count', 'Whale deshield day', fwdReturns, 1.0);

  // === HYPOTHESIS 6: Organic deshield (non-migration) ===
  console.log('\n--- H6: Organic Deshield Volume (non-migration) ---');
  const { rows: organicDeshield } = await pool.query(`
    SELECT to_char(to_timestamp(block_time)::date, 'YYYY-MM-DD') as date,
           SUM(amount_zat)::float / 1e8 as organic_zec
    FROM shielded_flows
    WHERE flow_type = 'deshield'
      AND (is_pool_migration IS NULL OR is_pool_migration = FALSE)
      AND block_time IS NOT NULL
    GROUP BY 1 ORDER BY 1
  `);
  await analyzeSpikes(organicDeshield, 'organic_zec', 'Organic deshield spike', fwdReturns);

  console.log('\n=== Research Complete ===');
  await pool.end();
}

async function analyzeSpikes(data, valueKey, label, fwdReturns, sigmaThreshold = 2.0) {
  if (data.length < 60) {
    console.log(`  Insufficient data (${data.length} rows, need 60+)`);
    return;
  }

  // Compute rolling 30d stats and classify each day
  const values = data.map(r => parseFloat(r[valueKey]) || 0);
  const dates = data.map(r => r.date);

  const buckets = { spike: [], quiet: [], normal: [] };

  for (let i = 30; i < values.length; i++) {
    const window = values.slice(i - 30, i);
    const { mean, std } = stats(window);
    if (std === 0) continue;

    const zScore = (values[i] - mean) / std;
    const date = dates[i];
    const fwd = fwdReturns.get(date);
    if (!fwd || fwd.r7 === null) continue;

    if (zScore > sigmaThreshold) buckets.spike.push(fwd);
    else if (zScore < -1) buckets.quiet.push(fwd);
    else buckets.normal.push(fwd);
  }

  for (const horizon of ['r1', 'r3', 'r7']) {
    const hLabel = horizon === 'r1' ? '1d' : horizon === 'r3' ? '3d' : '7d';
    const spikeReturns = buckets.spike.map(f => f[horizon]).filter(r => r !== null);
    const quietReturns = buckets.quiet.map(f => f[horizon]).filter(r => r !== null);
    const normalReturns = buckets.normal.map(f => f[horizon]).filter(r => r !== null);

    const spike = tTest(spikeReturns);
    const quiet = tTest(quietReturns);
    const normal = tTest(normalReturns);

    const sig = spike.significant ? ' ***' : '';
    console.log(`  ${label} → ${hLabel} fwd return:`);
    console.log(`    Spike (>${sigmaThreshold}σ): n=${spike.count}, avg=${(spike.mean*100).toFixed(2)}%, t=${spike.tStat.toFixed(2)}${sig}`);
    console.log(`    Quiet (<-1σ):  n=${quiet.count}, avg=${(quiet.mean*100).toFixed(2)}%, t=${quiet.tStat.toFixed(2)}`);
    console.log(`    Normal:        n=${normal.count}, avg=${(normal.mean*100).toFixed(2)}%`);
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
