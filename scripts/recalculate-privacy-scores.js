#!/usr/bin/env node

/**
 * Recalculate Privacy Scores
 *
 * Updates all entries in privacy_trends_daily with the new privacy score formula.
 * Uses current pool size and fully_shielded data from privacy_stats.
 *
 * Usage:
 *   node scripts/recalculate-privacy-scores.js
 */

require('dotenv').config();
const { Pool } = require('pg');

const config = {
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'zcash_explorer_testnet',
    user: process.env.DB_USER || 'zcash_user',
    password: process.env.DB_PASSWORD,
  },
};

const pool = new Pool(config.db);

/**
 * New privacy score formula (same as in indexer)
 */
function calculatePrivacyScore(params) {
  const {
    dailyShieldedPercent = 0,
    allTimeShieldedPercent = 0,
    totalShieldedZat = 0,
    chainSupplyZat = 0,
    fullyShieldedTx = 0,
    shieldedTx = 0,
  } = params;

  // Factor 1: Supply Shielded Score (0-40 points)
  const supplyShieldedPercent = chainSupplyZat > 0
    ? (totalShieldedZat / chainSupplyZat) * 100
    : 0;
  const supplyScore = Math.min(supplyShieldedPercent * 1.33, 40);

  // Factor 2: Fully Shielded Score (0-30 points)
  const fullyShieldedPercent = shieldedTx > 0
    ? (fullyShieldedTx / shieldedTx) * 100
    : 0;
  const fullyShieldedScore = Math.min(fullyShieldedPercent * 3, 30);

  // Factor 3: Adoption Score (0-30 points)
  const combinedAdoption = (dailyShieldedPercent * 0.6) + (allTimeShieldedPercent * 0.4);
  const adoptionScore = Math.min(combinedAdoption * 3, 30);

  return Math.min(Math.round(supplyScore + fullyShieldedScore + adoptionScore), 100);
}

async function recalculate() {
  console.log('🔄 Recalculate Privacy Scores');
  console.log(`Database: ${config.db.database}`);
  console.log('');

  // Get current privacy stats (for pool size, chain supply, etc.)
  const statsResult = await pool.query(`
    SELECT
      shielded_pool_size,
      chain_supply,
      shielded_tx,
      fully_shielded_tx,
      shielded_percentage as all_time_shielded_percent
    FROM privacy_stats
    ORDER BY updated_at DESC
    LIMIT 1
  `);

  if (statsResult.rows.length === 0) {
    console.log('❌ No privacy_stats found. Run calculate-privacy-stats.js first.');
    process.exit(1);
  }

  const stats = statsResult.rows[0];
  console.log('📊 Current Stats:');
  console.log(`   Pool Size: ${(parseInt(stats.shielded_pool_size) / 100000000 / 1000000).toFixed(2)}M ZEC`);
  console.log(`   Chain Supply: ${(parseInt(stats.chain_supply) / 100000000 / 1000000).toFixed(2)}M ZEC`);
  console.log(`   Shielded Txs: ${parseInt(stats.shielded_tx).toLocaleString()}`);
  console.log(`   Fully Shielded: ${parseInt(stats.fully_shielded_tx).toLocaleString()}`);
  console.log(`   All-time Shielded %: ${parseFloat(stats.all_time_shielded_percent).toFixed(2)}%`);
  console.log('');

  // Get all daily entries
  const trendsResult = await pool.query(`
    SELECT id, date, shielded_percentage, pool_size, privacy_score
    FROM privacy_trends_daily
    ORDER BY date DESC
  `);

  console.log(`📅 Found ${trendsResult.rows.length} daily entries to update`);
  console.log('');

  let updated = 0;
  for (const row of trendsResult.rows) {
    const newScore = calculatePrivacyScore({
      dailyShieldedPercent: parseFloat(row.shielded_percentage),
      allTimeShieldedPercent: parseFloat(stats.all_time_shielded_percent),
      totalShieldedZat: parseInt(stats.shielded_pool_size),
      chainSupplyZat: parseInt(stats.chain_supply),
      fullyShieldedTx: parseInt(stats.fully_shielded_tx),
      shieldedTx: parseInt(stats.shielded_tx),
    });

    // Also update pool_size to current value (better than wrong historical value)
    await pool.query(`
      UPDATE privacy_trends_daily
      SET privacy_score = $2, pool_size = $3
      WHERE id = $1
    `, [row.id, newScore, stats.shielded_pool_size]);

    console.log(`   ${row.date}: ${row.privacy_score} → ${newScore} (shielded: ${parseFloat(row.shielded_percentage).toFixed(1)}%)`);
    updated++;
  }

  console.log('');
  console.log(`✅ Updated ${updated} entries!`);
  console.log('');

  // Show sample of new scores
  const sampleResult = await pool.query(`
    SELECT date, shielded_percentage, privacy_score
    FROM privacy_trends_daily
    ORDER BY date DESC
    LIMIT 5
  `);

  console.log('📊 Sample (last 5 days):');
  sampleResult.rows.forEach(row => {
    console.log(`   ${row.date}: Score ${row.privacy_score} (${parseFloat(row.shielded_percentage).toFixed(1)}% shielded)`);
  });

  await pool.end();
  process.exit(0);
}

recalculate().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
