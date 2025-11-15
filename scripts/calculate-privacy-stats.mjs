#!/usr/bin/env node

/**
 * Privacy Statistics Calculator for Zcash Blockchain
 *
 * This script calculates privacy metrics by analyzing the blockchain:
 * - Shielded vs Transparent transaction ratio
 * - Shielded pool size (TAZ in shielded addresses)
 * - Privacy adoption trends over time
 * - Privacy score (0-100)
 *
 * Algorithm: INCREMENTAL
 * - First run: Scans all blocks (30-60 min)
 * - Subsequent runs: Only scans new blocks (1-5 min)
 * - Saves state to privacy-stats.json
 *
 * Usage:
 *   node scripts/calculate-privacy-stats.js
 *
 * Cron (daily at 3 AM):
 *   0 3 * * * cd /path/to/project && node scripts/calculate-privacy-stats.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const RPC_URL = process.env.ZCASH_RPC_URL || 'http://localhost:18232';
const RPC_COOKIE = process.env.ZCASH_RPC_COOKIE;
const STATS_FILE = path.join(__dirname, '../data/privacy-stats.json');
const BATCH_SIZE = 100; // Process blocks in batches

// Ensure data directory exists
const dataDir = path.dirname(STATS_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

/**
 * Make RPC call to Zebrad
 */
async function rpcCall(method, params = []) {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (RPC_COOKIE) {
    headers['Authorization'] = `Basic ${Buffer.from(RPC_COOKIE).toString('base64')}`;
  }

  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '1.0',
      id: method,
      method,
      params,
    }),
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(`RPC Error: ${data.error.message}`);
  }

  return data.result;
}

/**
 * Load existing stats or create new
 */
function loadStats() {
  if (fs.existsSync(STATS_FILE)) {
    const data = fs.readFileSync(STATS_FILE, 'utf8');
    return JSON.parse(data);
  }

  // Initial state
  return {
    version: '1.0',
    lastUpdated: null,
    lastBlockScanned: 0,
    totals: {
      blocks: 0,
      shieldedTx: 0,
      transparentTx: 0,
      mixedTx: 0, // Has both shielded and transparent components
      fullyShieldedTx: 0, // 100% shielded
    },
    shieldedPool: {
      currentSize: 0, // Current TAZ in shielded pool
      totalShielded: 0, // Cumulative shielded (minted to pool)
      totalUnshielded: 0, // Cumulative unshielded (spent from pool)
    },
    metrics: {
      shieldedPercentage: 0,
      privacyScore: 0,
      avgShieldedPerDay: 0,
      adoptionTrend: 'stable', // growing, stable, declining
    },
    trends: {
      daily: [], // Last 365 days
      weekly: [], // Last 52 weeks
      monthly: [], // Last 12 months
    },
  };
}

/**
 * Save stats to file
 */
function saveStats(stats) {
  stats.lastUpdated = new Date().toISOString();
  fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2), 'utf8');
  console.log(`✅ Stats saved to ${STATS_FILE}`);
}

/**
 * Determine if transaction is shielded, transparent, or mixed
 */
function analyzeTransaction(tx) {
  const hasShieldedSpend = (tx.vShieldedSpend && tx.vShieldedSpend.length > 0);
  const hasShieldedOutput = (tx.vShieldedOutput && tx.vShieldedOutput.length > 0);
  const hasTransparentInput = (tx.vin && tx.vin.length > 0 && !tx.vin[0].coinbase);
  const hasTransparentOutput = (tx.vout && tx.vout.length > 0);

  const hasShielded = hasShieldedSpend || hasShieldedOutput;
  const hasTransparent = hasTransparentInput || hasTransparentOutput;

  // Calculate shielded pool delta
  let shieldedDelta = 0;

  // Shielded outputs = money going INTO pool
  if (tx.vShieldedOutput) {
    // Note: We can't see the actual values of shielded outputs
    // We'll use valueBalance as a proxy (negative = into pool)
    shieldedDelta += tx.vShieldedOutput.length; // Count as indicator
  }

  // Shielded spends = money coming OUT of pool
  if (tx.vShieldedSpend) {
    shieldedDelta -= tx.vShieldedSpend.length; // Count as indicator
  }

  // Use valueBalance for better accuracy (Sapling/Orchard)
  // valueBalance: positive = transparent to shielded, negative = shielded to transparent
  if (tx.valueBalance) {
    shieldedDelta += parseFloat(tx.valueBalance);
  }

  return {
    type: hasShielded && !hasTransparent ? 'fully-shielded' :
          hasTransparent && !hasShielded ? 'transparent' :
          hasShielded && hasTransparent ? 'mixed' : 'transparent',
    shieldedDelta, // Approximate change in shielded pool
    hasShielded,
    hasTransparent,
  };
}

/**
 * Process a single block
 */
function processBlock(block, stats) {
  stats.totals.blocks++;

  for (const tx of block.tx || []) {
    // Skip coinbase (mining reward)
    if (tx.vin && tx.vin[0]?.coinbase) {
      continue;
    }

    const analysis = analyzeTransaction(tx);

    // Update counters
    switch (analysis.type) {
      case 'fully-shielded':
        stats.totals.fullyShieldedTx++;
        stats.totals.shieldedTx++;
        break;
      case 'mixed':
        stats.totals.mixedTx++;
        stats.totals.shieldedTx++; // Count as shielded (has shielded component)
        break;
      case 'transparent':
        stats.totals.transparentTx++;
        break;
    }

    // Update shielded pool (approximate)
    if (analysis.shieldedDelta > 0) {
      stats.shieldedPool.totalShielded += Math.abs(analysis.shieldedDelta);
    } else if (analysis.shieldedDelta < 0) {
      stats.shieldedPool.totalUnshielded += Math.abs(analysis.shieldedDelta);
    }
  }

  // Recalculate pool size
  stats.shieldedPool.currentSize =
    stats.shieldedPool.totalShielded - stats.shieldedPool.totalUnshielded;
}

/**
 * Calculate derived metrics
 */
async function calculateMetrics(stats, currentBlock) {
  const totalTx = stats.totals.shieldedTx + stats.totals.transparentTx;

  // Shielded percentage
  stats.metrics.shieldedPercentage = totalTx > 0
    ? (stats.totals.shieldedTx / totalTx) * 100
    : 0;

  // Get shielded pool size from the latest block's value pools (most accurate)
  try {
    const blockHash = await rpcCall('getblockhash', [currentBlock]);
    const block = await rpcCall('getblock', [blockHash, 1]);

    if (block && block.valuePools) {
      const saplingPool = block.valuePools.find(p => p.id === 'sapling');
      const orchardPool = block.valuePools.find(p => p.id === 'orchard');

      const saplingValue = saplingPool ? saplingPool.chainValue : 0;
      const orchardValue = orchardPool ? orchardPool.chainValue : 0;

      stats.shieldedPool.currentSize = saplingValue + orchardValue;
      stats.shieldedPool.saplingPool = saplingValue;
      stats.shieldedPool.orchardPool = orchardValue;

      console.log(`📊 Shielded Pool: ${stats.shieldedPool.currentSize.toFixed(2)} TAZ (Sapling: ${saplingValue.toFixed(2)}, Orchard: ${orchardValue.toFixed(2)})`);
    }
  } catch (error) {
    console.error('Error fetching value pools:', error);
    // Fallback to 0 if we can't get the value pools
    stats.shieldedPool.currentSize = 0;
  }

  // Privacy score (0-100)
  // Based on: shielded %, fully shielded %, pool size, adoption trend
  const shieldedRatio = stats.metrics.shieldedPercentage / 100;
  const fullyShieldedRatio = totalTx > 0
    ? stats.totals.fullyShieldedTx / totalTx
    : 0;
  const poolSizeScore = Math.min(Math.max(stats.shieldedPool.currentSize, 0) / 10000000, 1); // 10M TAZ = 100%

  stats.metrics.privacyScore = Math.round(
    (shieldedRatio * 40) +          // 40% weight
    (fullyShieldedRatio * 40) +     // 40% weight
    (poolSizeScore * 20)            // 20% weight
  ); // Score is already 0-100, don't multiply by 100!

  // Adoption trend
  if (stats.trends.daily.length >= 7) {
    const recent = stats.trends.daily.slice(-7);
    const older = stats.trends.daily.slice(-14, -7);

    const recentAvg = recent.reduce((sum, d) => sum + d.shielded, 0) / recent.length;
    const olderAvg = older.reduce((sum, d) => sum + d.shielded, 0) / older.length;

    const change = ((recentAvg - olderAvg) / olderAvg) * 100;

    stats.metrics.adoptionTrend =
      change > 10 ? 'growing' :
      change < -10 ? 'declining' : 'stable';

    stats.metrics.avgShieldedPerDay = Math.round(recentAvg);
  }
}

/**
 * Add daily data point
 */
function updateTrends(stats) {
  const today = new Date().toISOString().split('T')[0];

  // Remove today if exists (in case of re-run)
  stats.trends.daily = stats.trends.daily.filter(d => d.date !== today);

  // Add today's data
  stats.trends.daily.push({
    date: today,
    blocks: stats.totals.blocks,
    shielded: stats.totals.shieldedTx,
    transparent: stats.totals.transparentTx,
    fullyShielded: stats.totals.fullyShieldedTx,
    mixed: stats.totals.mixedTx,
    poolSize: stats.shieldedPool.currentSize,
    shieldedPercentage: stats.metrics.shieldedPercentage,
  });

  // Keep only last 365 days
  if (stats.trends.daily.length > 365) {
    stats.trends.daily = stats.trends.daily.slice(-365);
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🔍 Starting privacy stats calculation...\n');

  try {
    // Load existing stats
    const stats = loadStats();
    console.log(`📊 Last scanned block: ${stats.lastBlockScanned}`);

    // Get current block height
    const currentBlock = await rpcCall('getblockcount');
    console.log(`📍 Current block height: ${currentBlock}`);

    // TEST MODE: Only scan last 100 blocks
    const TEST_MODE = process.env.TEST_MODE === 'true';
    const TEST_LIMIT = parseInt(process.env.TEST_LIMIT || '100');

    let startBlock = stats.lastBlockScanned + 1;
    let endBlock = currentBlock;

    if (TEST_MODE) {
      // Test mode: scan only last N blocks
      startBlock = Math.max(1, currentBlock - TEST_LIMIT + 1);
      endBlock = currentBlock;
      console.log(`🧪 TEST MODE: Scanning last ${TEST_LIMIT} blocks`);
    } else if (stats.lastBlockScanned === 0) {
      // First run: scan ALL blocks (can take 30-60 minutes)
      startBlock = 1;
      endBlock = currentBlock;
      console.log(`🚀 FULL SCAN: Scanning all ${currentBlock} blocks (this will take a while...)`);
    }

    const blocksToScan = endBlock - startBlock + 1;
    console.log(`🔄 Blocks to scan: ${blocksToScan} (from ${startBlock} to ${endBlock})\n`);

    if (blocksToScan === 0) {
      console.log('✅ Already up to date!');
      return;
    }

    let processed = 0;
    const startTime = Date.now();

    for (let height = startBlock; height <= endBlock; height++) {
      // Get block hash
      const blockHash = await rpcCall('getblockhash', [height]);

      // Get block with full transactions
      const block = await rpcCall('getblock', [blockHash, 2]);

      // Process block
      processBlock(block, stats);

      processed++;

      // Progress update every 100 blocks
      if (processed % 100 === 0 || height === endBlock) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const rate = (processed / (Date.now() - startTime) * 1000).toFixed(2);
        const remaining = ((blocksToScan - processed) / rate).toFixed(0);

        console.log(
          `Progress: ${processed}/${blocksToScan} blocks ` +
          `(${((processed / blocksToScan) * 100).toFixed(1)}%) | ` +
          `${rate} blocks/s | ` +
          `ETA: ${remaining}s`
        );
      }

      stats.lastBlockScanned = height;
    }

    // Calculate metrics
    console.log('\n📊 Calculating metrics...');
    await calculateMetrics(stats, currentBlock);

    // Update trends
    console.log('📈 Updating trends...');
    updateTrends(stats);

    // Save stats
    saveStats(stats);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 PRIVACY STATISTICS SUMMARY');
    console.log('='.repeat(60));
    console.log(`Blocks scanned: ${stats.totals.blocks.toLocaleString()}`);
    console.log(`Shielded transactions: ${stats.totals.shieldedTx.toLocaleString()} (${stats.metrics.shieldedPercentage.toFixed(1)}%)`);
    console.log(`Fully shielded: ${stats.totals.fullyShieldedTx.toLocaleString()}`);
    console.log(`Mixed transactions: ${stats.totals.mixedTx.toLocaleString()}`);
    console.log(`Transparent transactions: ${stats.totals.transparentTx.toLocaleString()}`);
    console.log(`Shielded pool size: ${stats.shieldedPool.currentSize.toFixed(2)} TAZ`);
    console.log(`Privacy score: ${stats.metrics.privacyScore}/100`);
    console.log(`Adoption trend: ${stats.metrics.adoptionTrend}`);
    console.log('='.repeat(60));

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Completed in ${totalTime}s`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
main();
