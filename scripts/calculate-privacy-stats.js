#!/usr/bin/env node

/**
 * Calculate Privacy Statistics
 *
 * This script calculates comprehensive privacy statistics from the PostgreSQL database
 * and stores them in the privacy_stats table.
 *
 * Usage:
 *   node scripts/calculate-privacy-stats.js
 *
 * Environment variables:
 *   PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD
 */

require('dotenv').config();
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || process.env.PGHOST || 'localhost',
  port: parseInt(process.env.DB_PORT || process.env.PGPORT || '5432'),
  database: process.env.DB_NAME || process.env.PGDATABASE || 'zcash_explorer_testnet',
  user: process.env.DB_USER || process.env.PGUSER || 'zcash_user',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
});

async function calculatePrivacyStats() {
  const startTime = Date.now();
  console.log('🔍 Calculating privacy statistics...');

  try {
    // 1️⃣ Get basic transaction counts
    console.log('📊 Fetching transaction counts...');
    const txCountsResult = await pool.query(`
      SELECT
        COUNT(*) as total_transactions,
        COUNT(*) FILTER (WHERE is_coinbase) as coinbase_count,
        COUNT(*) FILTER (WHERE has_sapling OR has_orchard) as shielded_count,
        COUNT(*) FILTER (WHERE NOT is_coinbase AND NOT has_sapling AND NOT has_orchard) as transparent_count,
        MAX(block_height) as latest_block
      FROM transactions
      WHERE block_height > 0
    `);

    const txCounts = txCountsResult.rows[0];
    console.log(`   ✓ Total transactions: ${txCounts.total_transactions}`);
    console.log(`   ✓ Shielded: ${txCounts.shielded_count}`);
    console.log(`   ✓ Transparent: ${txCounts.transparent_count}`);
    console.log(`   ✓ Coinbase: ${txCounts.coinbase_count}`);

    // 2️⃣ Get block count
    console.log('📦 Fetching block count...');
    const blockCountResult = await pool.query(`
      SELECT COUNT(*) as total_blocks
      FROM blocks
    `);
    const totalBlocks = parseInt(blockCountResult.rows[0].total_blocks);
    console.log(`   ✓ Total blocks: ${totalBlocks}`);

    // 3️⃣ Calculate mixed vs fully shielded transactions
    console.log('🔒 Analyzing shielded transaction types...');
    const shieldedTypesResult = await pool.query(`
      SELECT
        COUNT(*) FILTER (
          WHERE (has_sapling OR has_orchard)
          AND vin_count > 0
          AND vout_count > 0
        ) as mixed_count,
        COUNT(*) FILTER (
          WHERE (has_sapling OR has_orchard)
          AND vin_count = 0
          AND vout_count = 0
        ) as fully_shielded_count
      FROM transactions
      WHERE block_height > 0
        AND (has_sapling OR has_orchard)
        AND NOT is_coinbase
    `);

    const shieldedTypes = shieldedTypesResult.rows[0];
    const mixedTx = parseInt(shieldedTypes.mixed_count) || 0;
    const fullyShieldedTx = parseInt(shieldedTypes.fully_shielded_count) || 0;
    console.log(`   ✓ Mixed (partial privacy): ${mixedTx}`);
    console.log(`   ✓ Fully shielded (max privacy): ${fullyShieldedTx}`);

    // 4️⃣ Calculate shielded pool size (sum of all unspent shielded outputs)
    console.log('💰 Calculating shielded pool size...');
    const poolSizeResult = await pool.query(`
      SELECT
        COALESCE(SUM(value), 0) as total_unspent_shielded
      FROM transaction_outputs
      WHERE spent = false
        AND address IS NULL
    `);
    const shieldedPoolSize = parseInt(poolSizeResult.rows[0].total_unspent_shielded) || 0;
    console.log(`   ✓ Shielded pool: ${(shieldedPoolSize / 100000000).toFixed(2)} ZEC`);

    // 5️⃣ Calculate metrics
    const totalTx = parseInt(txCounts.total_transactions);
    const shieldedTx = parseInt(txCounts.shielded_count);
    const transparentTx = parseInt(txCounts.transparent_count);
    const coinbaseTx = parseInt(txCounts.coinbase_count);
    const latestBlock = parseInt(txCounts.latest_block);

    const shieldedPercentage = totalTx > 0 ? (shieldedTx / totalTx) * 100 : 0;
    const privacyScore = Math.round(shieldedPercentage * 0.8); // 80% weight on shielded adoption

    // 6️⃣ Calculate average shielded per day (last 30 days)
    console.log('📈 Calculating daily averages...');
    const avgPerDayResult = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE has_sapling OR has_orchard) / 30.0 as avg_shielded_per_day
      FROM transactions
      WHERE block_height > 0
        AND block_time >= EXTRACT(EPOCH FROM NOW() - INTERVAL '30 days')
    `);
    const avgShieldedPerDay = parseFloat(avgPerDayResult.rows[0]?.avg_shielded_per_day) || 0;
    console.log(`   ✓ Avg shielded/day (30d): ${avgShieldedPerDay.toFixed(2)}`);

    // 7️⃣ Determine adoption trend (compare last 7 days vs previous 7 days)
    console.log('📊 Analyzing adoption trend...');
    const trendResult = await pool.query(`
      SELECT
        COUNT(*) FILTER (
          WHERE has_sapling OR has_orchard
          AND block_time >= EXTRACT(EPOCH FROM NOW() - INTERVAL '7 days')
        ) as recent_shielded,
        COUNT(*) FILTER (
          WHERE has_sapling OR has_orchard
          AND block_time >= EXTRACT(EPOCH FROM NOW() - INTERVAL '14 days')
          AND block_time < EXTRACT(EPOCH FROM NOW() - INTERVAL '7 days')
        ) as previous_shielded
      FROM transactions
      WHERE block_height > 0
    `);

    const recentShielded = parseInt(trendResult.rows[0]?.recent_shielded) || 0;
    const previousShielded = parseInt(trendResult.rows[0]?.previous_shielded) || 0;

    let adoptionTrend = 'stable';
    if (previousShielded > 0) {
      const change = ((recentShielded - previousShielded) / previousShielded) * 100;
      if (change > 10) adoptionTrend = 'growing';
      else if (change < -10) adoptionTrend = 'declining';
    }
    console.log(`   ✓ Trend: ${adoptionTrend} (recent: ${recentShielded}, previous: ${previousShielded})`);

    // 8️⃣ Insert/update stats in database
    console.log('💾 Saving statistics to database...');
    const calculationDuration = Date.now() - startTime;

    await pool.query(`
      INSERT INTO privacy_stats (
        total_blocks,
        total_transactions,
        shielded_tx,
        transparent_tx,
        coinbase_tx,
        mixed_tx,
        fully_shielded_tx,
        shielded_pool_size,
        total_shielded,
        total_unshielded,
        shielded_percentage,
        privacy_score,
        avg_shielded_per_day,
        adoption_trend,
        last_block_scanned,
        calculation_duration_ms,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
    `, [
      totalBlocks,
      totalTx,
      shieldedTx,
      transparentTx,
      coinbaseTx,
      mixedTx,
      fullyShieldedTx,
      shieldedPoolSize,
      0, // total_shielded (not calculated yet)
      0, // total_unshielded (not calculated yet)
      shieldedPercentage,
      privacyScore,
      avgShieldedPerDay,
      adoptionTrend,
      latestBlock,
      calculationDuration,
    ]);

    console.log('');
    console.log('✅ Privacy statistics calculated and saved!');
    console.log('');
    console.log('📊 Summary:');
    console.log(`   Total Blocks: ${totalBlocks.toLocaleString()}`);
    console.log(`   Total Transactions: ${totalTx.toLocaleString()}`);
    console.log(`   Shielded: ${shieldedTx.toLocaleString()} (${shieldedPercentage.toFixed(2)}%)`);
    console.log(`   Transparent: ${transparentTx.toLocaleString()}`);
    console.log(`   Mixed: ${mixedTx.toLocaleString()}`);
    console.log(`   Fully Shielded: ${fullyShieldedTx.toLocaleString()}`);
    console.log(`   Privacy Score: ${privacyScore}/100`);
    console.log(`   Shielded Pool: ${(shieldedPoolSize / 100000000).toFixed(2)} ZEC`);
    console.log(`   Adoption Trend: ${adoptionTrend}`);
    console.log(`   Calculation time: ${calculationDuration}ms`);
    console.log('');

  } catch (error) {
    console.error('❌ Error calculating privacy stats:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the script
calculatePrivacyStats()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
