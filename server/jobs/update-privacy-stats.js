#!/usr/bin/env node
/**
 * Update Privacy Stats & Trends
 *
 * This job replaces the privacy stats updates that were previously
 * handled inline by the Node.js indexer (updatePoolSizesFromZebra,
 * updateTransactionCounts, updatePrivacyTrendsDaily).
 *
 * Since cipherscan-rust handles block indexing, this job runs on cron
 * to keep privacy_stats and privacy_trends_daily up to date.
 *
 * Cron (every hour):
 *   0 * * * * cd /root/cipherscan/server/jobs && node update-privacy-stats.js >> /var/log/privacy-stats.log 2>&1
 */

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// DB creds from jobs/.env; Zebra RPC from api/.env (fully-synced remote node).
// jobs/.env must not override ZEBRA_RPC_URL — localhost is often mid-resync.
require('dotenv').config({ path: path.join(__dirname, '.env') });
const apiEnvPath = path.join(__dirname, '../api/.env');
if (fs.existsSync(apiEnvPath)) {
  const apiEnv = dotenv.parse(fs.readFileSync(apiEnvPath));
  if (apiEnv.ZEBRA_RPC_URL) process.env.ZEBRA_RPC_URL = apiEnv.ZEBRA_RPC_URL;
}

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 3,
  idleTimeoutMillis: 30000,
});

const ZEBRA_RPC_URL = process.env.ZEBRA_RPC_URL || 'http://127.0.0.1:8232';
const ZEBRA_COOKIE_FILE = process.env.ZEBRA_RPC_COOKIE_FILE || '/root/.cache/zebra/.cookie';
const POOL_DROP_THRESHOLD = 0.8; // skip if shielded pool falls more than 20% vs prior day
const isLocalZebraRpc = () => /localhost|127\.0\.0\.1/.test(ZEBRA_RPC_URL);

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

async function callZebraRPC(method, params = []) {
  let auth = '';
  if (isLocalZebraRpc()) {
    try {
      const cookie = fs.readFileSync(ZEBRA_COOKIE_FILE, 'utf8').trim();
      auth = 'Basic ' + Buffer.from(cookie).toString('base64');
    } catch {
      // try without auth
    }
  }

  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers['Authorization'] = auth;

  const response = await fetch(ZEBRA_RPC_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: 'privacy-stats', method, params }),
  });

  const data = await response.json();
  if (data.error) throw new Error(`Zebra RPC error: ${data.error.message}`);
  return data.result;
}

/**
 * Calculate privacy score (same formula as the Node.js indexer)
 */
function calculatePrivacyScore({ allTimeShieldedPercent = 0, totalShieldedZat = 0, chainSupplyZat = 0, fullyShieldedTx = 0, shieldedTx = 0 }) {
  const supplyShieldedPercent = chainSupplyZat > 0 ? (totalShieldedZat / chainSupplyZat) * 100 : 0;
  const supplyScore = Math.min(supplyShieldedPercent * 0.4, 40);
  const fullyShieldedPercent = shieldedTx > 0 ? (fullyShieldedTx / shieldedTx) * 100 : 0;
  const fullyShieldedScore = Math.min(fullyShieldedPercent * 0.3, 30);
  const adoptionScore = Math.min(allTimeShieldedPercent * 0.3, 30);
  return Math.min(Math.round(supplyScore + fullyShieldedScore + adoptionScore), 100);
}

function assertZebraSynced(blockchainInfo) {
  const progress = Number(blockchainInfo.verificationprogress ?? 0);
  const blocks = Number(blockchainInfo.blocks ?? 0);
  const headers = Number(blockchainInfo.headers ?? 0);
  if (progress < 0.99) {
    throw new Error(
      `Zebra not fully synced (verificationprogress=${progress.toFixed(4)} at ${ZEBRA_RPC_URL})`,
    );
  }
  if (headers > 0 && blocks < headers - 2) {
    throw new Error(
      `Zebra behind chain tip (blocks=${blocks}, headers=${headers} at ${ZEBRA_RPC_URL})`,
    );
  }
}

async function validatePoolSizesAgainstPriorDay(pools) {
  const today = new Date().toISOString().split('T')[0];
  const prev = await pool.query(
    `SELECT pool_size, chain_supply FROM privacy_trends_daily
     WHERE date < $1::date AND pool_size > 0 ORDER BY date DESC LIMIT 1`,
    [today],
  );
  if (prev.rows.length === 0) return;

  const prevPool = Number(prev.rows[0].pool_size) || 0;
  const prevSupply = Number(prev.rows[0].chain_supply) || 0;
  if (prevPool > 0 && pools.shieldedPoolSize < prevPool * POOL_DROP_THRESHOLD) {
    throw new Error(
      `Shielded pool dropped >20% (${pools.shieldedPoolSize} vs ${prevPool}); refusing to overwrite stats`,
    );
  }
  if (prevSupply > 0 && pools.chainSupply < prevSupply * POOL_DROP_THRESHOLD) {
    throw new Error(
      `Chain supply dropped >20% (${pools.chainSupply} vs ${prevSupply}); refusing to overwrite stats`,
    );
  }
}

async function updatePoolSizes() {
  log(`Fetching pool sizes from Zebra RPC (${ZEBRA_RPC_URL})...`);
  const blockchainInfo = await callZebraRPC('getblockchaininfo');

  if (!blockchainInfo || !blockchainInfo.valuePools) {
    throw new Error('Could not get valuePools from Zebra');
  }

  assertZebraSynced(blockchainInfo);

  let transparentPool = 0, sproutPool = 0, saplingPool = 0, orchardPool = 0, ironwoodPool = 0, chainSupply = 0;

  for (const p of blockchainInfo.valuePools) {
    const val = parseInt(p.chainValueZat) || 0;
    if (p.id === 'transparent') transparentPool = val;
    else if (p.id === 'sprout') sproutPool = val;
    else if (p.id === 'sapling') saplingPool = val;
    else if (p.id === 'orchard') orchardPool = val;
    else if (p.id === 'ironwood') ironwoodPool = val;
  }

  const shieldedPoolSize = sproutPool + saplingPool + orchardPool + ironwoodPool;
  if (blockchainInfo.chainSupply) chainSupply = parseInt(blockchainInfo.chainSupply.chainValueZat) || 0;

  log(`  Shielded: ${(shieldedPoolSize / 1e8).toFixed(2)} ZEC | Chain: ${(chainSupply / 1e8).toFixed(2)} ZEC`);

  return { shieldedPoolSize, sproutPool, saplingPool, orchardPool, ironwoodPool, transparentPool, chainSupply, latestBlock: blockchainInfo.blocks || 0 };
}

async function updateTransactionCounts() {
  log('Updating transaction counts...');

  const txCounts = (await pool.query(`
    SELECT
      COUNT(*) as total_transactions,
      COUNT(*) FILTER (WHERE is_coinbase) as coinbase_count,
      COUNT(*) FILTER (WHERE has_sapling OR has_orchard OR has_ironwood) as shielded_count,
      COUNT(*) FILTER (WHERE NOT is_coinbase AND NOT has_sapling AND NOT has_orchard AND NOT has_ironwood) as transparent_count,
      MAX(block_height) as latest_block
    FROM transactions WHERE block_height > 0
  `)).rows[0];

  const shieldedTypes = (await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE (has_sapling OR has_orchard OR has_ironwood) AND vin_count > 0 AND vout_count > 0) as mixed_count,
      COUNT(*) FILTER (WHERE (has_sapling OR has_orchard OR has_ironwood) AND vin_count = 0 AND vout_count = 0) as fully_shielded_count
    FROM transactions WHERE block_height > 0 AND (has_sapling OR has_orchard OR has_ironwood) AND NOT is_coinbase
  `)).rows[0];

  const blockCount = (await pool.query('SELECT COUNT(*) as total_blocks FROM blocks')).rows[0];

  const totalTx = parseInt(txCounts.total_transactions) || 0;
  const shieldedTx = parseInt(txCounts.shielded_count) || 0;
  const transparentTx = parseInt(txCounts.transparent_count) || 0;
  const coinbaseTx = parseInt(txCounts.coinbase_count) || 0;
  const mixedTx = parseInt(shieldedTypes.mixed_count) || 0;
  const fullyShieldedTx = parseInt(shieldedTypes.fully_shielded_count) || 0;
  const totalBlocks = parseInt(blockCount.total_blocks) || 0;
  const shieldedPercentage = totalTx > 0 ? (shieldedTx / totalTx) * 100 : 0;

  const avgPerDay = (await pool.query(`
    SELECT COUNT(*) FILTER (WHERE has_sapling OR has_orchard OR has_ironwood) / 30.0 as avg
    FROM transactions WHERE block_height > 0 AND block_time >= EXTRACT(EPOCH FROM NOW() - INTERVAL '30 days')
  `)).rows[0];

  const trend = (await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE (has_sapling OR has_orchard OR has_ironwood) AND block_time >= EXTRACT(EPOCH FROM NOW() - INTERVAL '7 days')) as recent,
      COUNT(*) FILTER (WHERE (has_sapling OR has_orchard OR has_ironwood) AND block_time >= EXTRACT(EPOCH FROM NOW() - INTERVAL '14 days') AND block_time < EXTRACT(EPOCH FROM NOW() - INTERVAL '7 days')) as previous
    FROM transactions WHERE block_height > 0
  `)).rows[0];

  let adoptionTrend = 'stable';
  const recent = parseInt(trend.recent) || 0;
  const previous = parseInt(trend.previous) || 0;
  if (previous > 0) {
    const change = ((recent - previous) / previous) * 100;
    if (change > 10) adoptionTrend = 'growing';
    else if (change < -10) adoptionTrend = 'declining';
  }

  log(`  ${shieldedTx.toLocaleString()} shielded / ${totalTx.toLocaleString()} total (${shieldedPercentage.toFixed(1)}%) | Trend: ${adoptionTrend}`);

  return {
    totalBlocks, totalTx, shieldedTx, transparentTx, coinbaseTx,
    mixedTx, fullyShieldedTx, shieldedPercentage,
    avgShieldedPerDay: parseFloat(avgPerDay.avg) || 0,
    adoptionTrend, latestBlock: parseInt(txCounts.latest_block) || 0,
  };
}

async function updatePrivacyStats(pools, txStats) {
  log('Updating privacy_stats table...');

  const privacyScore = calculatePrivacyScore({
    allTimeShieldedPercent: txStats.shieldedPercentage,
    totalShieldedZat: pools.shieldedPoolSize,
    chainSupplyZat: pools.chainSupply,
    fullyShieldedTx: txStats.fullyShieldedTx,
    shieldedTx: txStats.shieldedTx,
  });

  const existing = await pool.query('SELECT id FROM privacy_stats ORDER BY updated_at DESC LIMIT 1');

  if (existing.rows.length > 0) {
    await pool.query(`
      UPDATE privacy_stats SET
        shielded_pool_size = $1, sprout_pool_size = $2, sapling_pool_size = $3,
        orchard_pool_size = $4, transparent_pool_size = $5, chain_supply = $6,
        total_blocks = $7, total_transactions = $8, shielded_tx = $9,
        transparent_tx = $10, coinbase_tx = $11, mixed_tx = $12,
        fully_shielded_tx = $13, shielded_percentage = $14,
        avg_shielded_per_day = $15, adoption_trend = $16,
        last_block_scanned = $17, privacy_score = $19,
        ironwood_pool_size = $20, updated_at = NOW()
      WHERE id = $18
    `, [
      pools.shieldedPoolSize, pools.sproutPool, pools.saplingPool,
      pools.orchardPool, pools.transparentPool, pools.chainSupply,
      txStats.totalBlocks, txStats.totalTx, txStats.shieldedTx,
      txStats.transparentTx, txStats.coinbaseTx, txStats.mixedTx,
      txStats.fullyShieldedTx, txStats.shieldedPercentage,
      txStats.avgShieldedPerDay, txStats.adoptionTrend,
      txStats.latestBlock, existing.rows[0].id, privacyScore,
      pools.ironwoodPool,
    ]);
  } else {
    await pool.query(`
      INSERT INTO privacy_stats (
        shielded_pool_size, sprout_pool_size, sapling_pool_size,
        orchard_pool_size, transparent_pool_size, chain_supply,
        total_blocks, total_transactions, shielded_tx, transparent_tx,
        coinbase_tx, mixed_tx, fully_shielded_tx, shielded_percentage,
        privacy_score, avg_shielded_per_day, adoption_trend,
        last_block_scanned, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$18,$15,$16,$17,NOW())
    `, [
      pools.shieldedPoolSize, pools.sproutPool, pools.saplingPool,
      pools.orchardPool, pools.transparentPool, pools.chainSupply,
      txStats.totalBlocks, txStats.totalTx, txStats.shieldedTx,
      txStats.transparentTx, txStats.coinbaseTx, txStats.mixedTx,
      txStats.fullyShieldedTx, txStats.shieldedPercentage,
      txStats.avgShieldedPerDay, txStats.adoptionTrend, txStats.latestBlock,
      privacyScore,
    ]);
  }

  log('  privacy_stats updated');
}

async function updatePrivacyTrendsDaily(pools, txStats) {
  log('Updating privacy_trends_daily...');

  const today = new Date().toISOString().split('T')[0];
  const existing = await pool.query('SELECT id FROM privacy_trends_daily WHERE date = $1', [today]);

  // Get today's shielded counts
  const latestBlock = txStats.latestBlock;
  const blocksPerDay = 1152;
  const startBlock = latestBlock - blocksPerDay;

  const dayStats = (await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE has_sapling OR has_orchard OR has_ironwood) as shielded_count,
      COUNT(*) FILTER (WHERE NOT is_coinbase AND NOT has_sapling AND NOT has_orchard AND NOT has_ironwood) as transparent_count
    FROM transactions WHERE block_height >= $1 AND block_height <= $2
  `, [startBlock, latestBlock])).rows[0];

  const shieldedCount = parseInt(dayStats.shielded_count) || 0;
  const transparentCount = parseInt(dayStats.transparent_count) || 0;
  const totalCount = shieldedCount + transparentCount;
  const shieldedPercentage = totalCount > 0 ? (shieldedCount / totalCount) * 100 : 0;

  const privacyScore = calculatePrivacyScore({
    allTimeShieldedPercent: txStats.shieldedPercentage,
    totalShieldedZat: pools.shieldedPoolSize,
    chainSupplyZat: pools.chainSupply,
    fullyShieldedTx: txStats.fullyShieldedTx,
    shieldedTx: txStats.shieldedTx,
  });

  if (existing.rows.length > 0) {
    try {
      await pool.query(`
        UPDATE privacy_trends_daily SET
          shielded_count = $2, transparent_count = $3, shielded_percentage = $4,
          pool_size = $5, privacy_score = $6,
          sprout_pool_size = $7, sapling_pool_size = $8, orchard_pool_size = $9,
          transparent_pool_size = $10, chain_supply = $11,
          created_at = NOW()
        WHERE date = $1
      `, [today, shieldedCount, transparentCount, shieldedPercentage, pools.shieldedPoolSize, privacyScore,
        pools.sproutPool, pools.saplingPool, pools.orchardPool, pools.transparentPool, pools.chainSupply]);
    } catch {
      await pool.query(`
        UPDATE privacy_trends_daily SET
          shielded_count = $2, transparent_count = $3, shielded_percentage = $4,
          pool_size = $5, privacy_score = $6, created_at = NOW()
        WHERE date = $1
      `, [today, shieldedCount, transparentCount, shieldedPercentage, pools.shieldedPoolSize, privacyScore]);
    }
  } else {
    try {
      await pool.query(`
        INSERT INTO privacy_trends_daily (
          date, shielded_count, transparent_count, shielded_percentage, pool_size, privacy_score,
          sprout_pool_size, sapling_pool_size, orchard_pool_size, transparent_pool_size, chain_supply, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      `, [today, shieldedCount, transparentCount, shieldedPercentage, pools.shieldedPoolSize, privacyScore,
        pools.sproutPool, pools.saplingPool, pools.orchardPool, pools.transparentPool, pools.chainSupply]);
    } catch {
      await pool.query(`
        INSERT INTO privacy_trends_daily (date, shielded_count, transparent_count, shielded_percentage, pool_size, privacy_score, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [today, shieldedCount, transparentCount, shieldedPercentage, pools.shieldedPoolSize, privacyScore]);
    }
  }

  log(`  ${today}: ${shieldedPercentage.toFixed(1)}% shielded | Score: ${privacyScore}`);
}

async function main() {
  const start = Date.now();
  log('=== Privacy Stats Update ===');

  try {
    await pool.query('SELECT 1');
    const pools = await updatePoolSizes();
    await validatePoolSizesAgainstPriorDay(pools);
    const txStats = await updateTransactionCounts();
    await updatePrivacyStats(pools, txStats);
    await updatePrivacyTrendsDaily(pools, txStats);

    // Refresh pool analytics materialized views (if they exist)
    try {
      await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY flow_daily');
      log('  Refreshed flow_daily');
    } catch (e) {
      if (!e.message.includes('does not exist')) log(`  flow_daily refresh skipped: ${e.message}`);
    }
    // turnstile_daily is now maintained by refresh-turnstile.js (incremental job)

    log(`=== Done in ${((Date.now() - start) / 1000).toFixed(1)}s ===`);
  } catch (err) {
    log(`ERROR: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
