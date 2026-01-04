#!/usr/bin/env node

/**
 * Calculate Privacy Statistics
 *
 * This script calculates comprehensive privacy statistics from the PostgreSQL database
 * and stores them in the privacy_stats table.
 *
 * Now uses Zebra RPC to get real shielded pool sizes from getblockchaininfo!
 *
 * Usage:
 *   node scripts/calculate-privacy-stats.js
 *
 * Environment variables:
 *   PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD
 *   ZEBRA_RPC_URL, ZEBRA_RPC_COOKIE_FILE
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');

// Zebra RPC configuration
const ZEBRA_RPC_URL = process.env.ZEBRA_RPC_URL || 'http://127.0.0.1:18232';
const ZEBRA_COOKIE_FILE = process.env.ZEBRA_RPC_COOKIE_FILE || '/root/.cache/zebra/.cookie';

/**
 * Call Zebra RPC with cookie authentication
 */
async function callZebraRPC(method, params = []) {
  let auth = '';

  try {
    const cookie = fs.readFileSync(ZEBRA_COOKIE_FILE, 'utf8').trim();
    auth = 'Basic ' + Buffer.from(cookie).toString('base64');
  } catch (err) {
    console.warn('⚠️  Could not read Zebra cookie file:', err.message);
  }

  const headers = {
    'Content-Type': 'application/json',
  };

  if (auth) {
    headers['Authorization'] = auth;
  }

  const response = await fetch(ZEBRA_RPC_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'privacy-stats',
      method,
      params,
    }),
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(`Zebra RPC error: ${data.error.message}`);
  }

  return data.result;
}

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

    // 4️⃣ Get REAL shielded pool size from Zebra RPC (getblockchaininfo)
    console.log('💰 Fetching shielded pool size from Zebra RPC...');
    let shieldedPoolSize = 0;
    let sproutPool = 0;
    let saplingPool = 0;
    let orchardPool = 0;
    let transparentPool = 0;
    let chainSupply = 0;

    try {
      const blockchainInfo = await callZebraRPC('getblockchaininfo');

      if (blockchainInfo && blockchainInfo.valuePools) {
        for (const pool of blockchainInfo.valuePools) {
          const valueZat = parseInt(pool.chainValueZat) || 0;
          switch (pool.id) {
            case 'transparent':
              transparentPool = valueZat;
              break;
            case 'sprout':
              sproutPool = valueZat;
              break;
            case 'sapling':
              saplingPool = valueZat;
              break;
            case 'orchard':
              orchardPool = valueZat;
              break;
          }
        }

        // Total shielded = sprout + sapling + orchard
        shieldedPoolSize = sproutPool + saplingPool + orchardPool;

        // Chain supply from chainSupply field
        if (blockchainInfo.chainSupply) {
          chainSupply = parseInt(blockchainInfo.chainSupply.chainValueZat) || 0;
        }

        console.log(`   ✓ Transparent pool: ${(transparentPool / 100000000).toFixed(2)} ZEC`);
        console.log(`   ✓ Sprout pool: ${(sproutPool / 100000000).toFixed(2)} ZEC`);
        console.log(`   ✓ Sapling pool: ${(saplingPool / 100000000).toFixed(2)} ZEC`);
        console.log(`   ✓ Orchard pool: ${(orchardPool / 100000000).toFixed(2)} ZEC`);
        console.log(`   ✓ Total shielded: ${(shieldedPoolSize / 100000000).toFixed(2)} ZEC`);
        console.log(`   ✓ Chain supply: ${(chainSupply / 100000000).toFixed(2)} ZEC`);
      } else {
        console.warn('⚠️  Could not get valuePools from Zebra, using 0');
      }
    } catch (err) {
      console.error('❌ Error fetching pool size from Zebra:', err.message);
      console.warn('⚠️  Using 0 for shielded pool size');
    }

    // 5️⃣ Calculate metrics
    const totalTx = parseInt(txCounts.total_transactions);
    const shieldedTx = parseInt(txCounts.shielded_count);
    const transparentTx = parseInt(txCounts.transparent_count);
    const coinbaseTx = parseInt(txCounts.coinbase_count);
    const latestBlock = parseInt(txCounts.latest_block);

    const shieldedPercentage = totalTx > 0 ? (shieldedTx / totalTx) * 100 : 0;
    // Note: Privacy score is calculated by the indexer in privacy_trends_daily

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
          WHERE (has_sapling OR has_orchard)
          AND block_time >= EXTRACT(EPOCH FROM NOW() - INTERVAL '7 days')
        ) as recent_shielded,
        COUNT(*) FILTER (
          WHERE (has_sapling OR has_orchard)
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
        sprout_pool_size,
        sapling_pool_size,
        orchard_pool_size,
        transparent_pool_size,
        chain_supply,
        total_shielded,
        total_unshielded,
        shielded_percentage,
        privacy_score,
        avg_shielded_per_day,
        adoption_trend,
        last_block_scanned,
        calculation_duration_ms,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, NOW())
    `, [
      totalBlocks,
      totalTx,
      shieldedTx,
      transparentTx,
      coinbaseTx,
      mixedTx,
      fullyShieldedTx,
      shieldedPoolSize,
      sproutPool,
      saplingPool,
      orchardPool,
      transparentPool,
      chainSupply,
      0, // total_shielded (not calculated yet)
      0, // total_unshielded (not calculated yet)
      shieldedPercentage,
      0, // privacy_score - calculated by indexer in privacy_trends_daily
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
    console.log(`   Shielded Txs: ${shieldedTx.toLocaleString()} (${shieldedPercentage.toFixed(2)}%)`);
    console.log(`   Transparent Txs: ${transparentTx.toLocaleString()}`);
    console.log(`   Mixed Txs: ${mixedTx.toLocaleString()}`);
    console.log(`   Fully Shielded Txs: ${fullyShieldedTx.toLocaleString()}`);
    console.log('');
    console.log('💰 Pool Sizes (from Zebra RPC):');
    console.log(`   Sprout: ${(sproutPool / 100000000).toLocaleString()} ZEC`);
    console.log(`   Sapling: ${(saplingPool / 100000000).toLocaleString()} ZEC`);
    console.log(`   Orchard: ${(orchardPool / 100000000).toLocaleString()} ZEC`);
    console.log(`   Total Shielded: ${(shieldedPoolSize / 100000000).toLocaleString()} ZEC`);
    console.log(`   Transparent: ${(transparentPool / 100000000).toLocaleString()} ZEC`);
    console.log(`   Chain Supply: ${(chainSupply / 100000000).toLocaleString()} ZEC`);
    console.log('');
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
