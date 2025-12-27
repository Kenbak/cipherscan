#!/usr/bin/env node

/**
 * Recalculate All Privacy Scores
 *
 * This script recalculates the privacy_score for all entries in privacy_trends_daily
 * using the updated formula where 100% = fully private blockchain.
 *
 * Formula:
 * - Supply Shielded (0-40 pts): supplyShieldedPercent * 0.4
 * - Fully Shielded Ratio (0-30 pts): fullyShieldedPercent * 0.3
 * - Shielded Tx Adoption (0-30 pts): shieldedTxPercent * 0.3
 *
 * Usage:
 *   node scripts/recalculate-all-privacy-scores.js
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || process.env.PGHOST || 'localhost',
  port: parseInt(process.env.DB_PORT || process.env.PGPORT || '5432'),
  database: process.env.DB_NAME || process.env.PGDATABASE || 'zcash_explorer',
  user: process.env.DB_USER || process.env.PGUSER || 'zcash_user',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
});

/**
 * Calculate privacy score using the new formula
 */
function calculatePrivacyScore(supplyShieldedPercent, fullyShieldedPercent, shieldedTxPercent) {
  // Factor 1: Supply Shielded Score (0-40 points)
  // 100% supply shielded = 40 pts
  const supplyScore = Math.min(supplyShieldedPercent * 0.4, 40);

  // Factor 2: Fully Shielded Score (0-30 points)
  // 100% fully shielded = 30 pts
  const fullyShieldedScore = Math.min(fullyShieldedPercent * 0.3, 30);

  // Factor 3: Shielded Tx Adoption Score (0-30 points)
  // 100% shielded adoption = 30 pts
  const adoptionScore = Math.min(shieldedTxPercent * 0.3, 30);

  return Math.round(supplyScore + fullyShieldedScore + adoptionScore);
}

async function recalculateAllScores() {
  console.log('🔄 Recalculating all privacy scores with new formula...\n');

  try {
    // Get current stats for fully shielded ratio calculation
    const statsResult = await pool.query(`
      SELECT
        shielded_tx,
        fully_shielded_tx,
        chain_supply,
        shielded_percentage
      FROM privacy_stats
      ORDER BY updated_at DESC
      LIMIT 1
    `);

    if (statsResult.rows.length === 0) {
      console.error('❌ No privacy_stats found. Run the indexer first.');
      process.exit(1);
    }

    const stats = statsResult.rows[0];
    const shieldedTx = parseInt(stats.shielded_tx) || 0;
    const fullyShieldedTx = parseInt(stats.fully_shielded_tx) || 0;
    const chainSupply = parseInt(stats.chain_supply) || 0;
    const allTimeShieldedPercent = parseFloat(stats.shielded_percentage) || 0;

    // Calculate fully shielded ratio (constant for all days as we don't have historical data)
    const fullyShieldedPercent = shieldedTx > 0 ? (fullyShieldedTx / shieldedTx) * 100 : 0;

    console.log('📊 Current stats:');
    console.log(`   Shielded Tx: ${shieldedTx.toLocaleString()}`);
    console.log(`   Fully Shielded Tx: ${fullyShieldedTx.toLocaleString()}`);
    console.log(`   Fully Shielded %: ${fullyShieldedPercent.toFixed(2)}%`);
    console.log(`   All-time Shielded %: ${allTimeShieldedPercent.toFixed(2)}%`);
    console.log('');

    // Get all daily trends
    const trendsResult = await pool.query(`
      SELECT id, date, pool_size, shielded_percentage, privacy_score
      FROM privacy_trends_daily
      ORDER BY date ASC
    `);

    console.log(`📅 Found ${trendsResult.rows.length} daily records to update\n`);

    let updated = 0;
    for (const row of trendsResult.rows) {
      const poolSize = parseInt(row.pool_size) || 0;
      const dailyShieldedPercent = parseFloat(row.shielded_percentage) || 0;
      const oldScore = parseInt(row.privacy_score) || 0;

      // Calculate supply shielded percent for this day
      const supplyShieldedPercent = chainSupply > 0 ? (poolSize / chainSupply) * 100 : 0;

      // Calculate new score
      const newScore = calculatePrivacyScore(
        supplyShieldedPercent,
        fullyShieldedPercent,
        dailyShieldedPercent
      );

      if (newScore !== oldScore) {
        await pool.query(
          'UPDATE privacy_trends_daily SET privacy_score = $1 WHERE id = $2',
          [newScore, row.id]
        );
        updated++;
        console.log(`   ${row.date}: ${oldScore} → ${newScore} (supply=${supplyShieldedPercent.toFixed(1)}%, daily=${dailyShieldedPercent.toFixed(1)}%)`);
      }
    }

    console.log('');
    console.log(`✅ Updated ${updated} records`);
    console.log('');

    // Show sample calculation
    const latestTrend = trendsResult.rows[trendsResult.rows.length - 1];
    if (latestTrend) {
      const poolSize = parseInt(latestTrend.pool_size) || 0;
      const supplyShieldedPercent = chainSupply > 0 ? (poolSize / chainSupply) * 100 : 0;

      console.log('📊 Latest score breakdown:');
      console.log(`   Supply Shielded: ${supplyShieldedPercent.toFixed(1)}% × 0.4 = ${(supplyShieldedPercent * 0.4).toFixed(1)} pts (max 40)`);
      console.log(`   Fully Shielded:  ${fullyShieldedPercent.toFixed(1)}% × 0.3 = ${(fullyShieldedPercent * 0.3).toFixed(1)} pts (max 30)`);
      console.log(`   Shielded Tx %:   ${allTimeShieldedPercent.toFixed(1)}% × 0.3 = ${(allTimeShieldedPercent * 0.3).toFixed(1)} pts (max 30)`);
      console.log(`   ─────────────────────────────────`);

      const finalScore = calculatePrivacyScore(supplyShieldedPercent, fullyShieldedPercent, allTimeShieldedPercent);
      console.log(`   TOTAL: ${finalScore}/100`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

recalculateAllScores()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
