#!/usr/bin/env node
/**
 * Backfill privacy_trends_daily for the past N days.
 *
 * Usage:
 *   node backfill-privacy-trends.js [--days=30]
 *
 * Calculates daily shielded/transparent tx counts and privacy scores
 * by looking at block ranges for each day. Fetches historical pool sizes
 * from Zebra's getblock RPC to get exact per-pool values at each day's
 * end-of-day block height.
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../jobs/.env') });
require('dotenv').config({ path: path.join(__dirname, '../api/.env') });

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 3,
});

const DAYS = parseInt(process.argv.find(a => a.startsWith('--days='))?.split('=')[1] || '30');
const ZEBRA_RPC_URL = process.env.ZEBRA_RPC_URL || 'http://127.0.0.1:8232';
const ZEBRA_COOKIE_FILE = process.env.ZEBRA_RPC_COOKIE_FILE || '/root/.cache/zebra/.cookie';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function calculatePrivacyScore({ allTimeShieldedPercent = 0, totalShieldedZat = 0, chainSupplyZat = 0, fullyShieldedTx = 0, shieldedTx = 0 }) {
  const supplyShieldedPercent = chainSupplyZat > 0 ? (totalShieldedZat / chainSupplyZat) * 100 : 0;
  const supplyScore = Math.min(supplyShieldedPercent * 0.4, 40);
  const fullyShieldedPercent = shieldedTx > 0 ? (fullyShieldedTx / shieldedTx) * 100 : 0;
  const fullyShieldedScore = Math.min(fullyShieldedPercent * 0.3, 30);
  const adoptionScore = Math.min(allTimeShieldedPercent * 0.3, 30);
  return Math.min(Math.round(supplyScore + fullyShieldedScore + adoptionScore), 100);
}

function getRpcHeaders() {
  let auth = '';
  try {
    const cookie = fs.readFileSync(ZEBRA_COOKIE_FILE, 'utf8').trim();
    auth = 'Basic ' + Buffer.from(cookie).toString('base64');
  } catch (e) {}
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers['Authorization'] = auth;
  return headers;
}

async function rpcCall(method, params) {
  const response = await fetch(ZEBRA_RPC_URL, {
    method: 'POST',
    headers: getRpcHeaders(),
    body: JSON.stringify({ jsonrpc: '2.0', id: '1', method, params }),
  });
  const data = await response.json();
  if (data.error) throw new Error(`RPC ${method}: ${data.error.message}`);
  return data.result;
}

function parsePoolsFromResult(info) {
  let shieldedPoolSize = 0, chainSupply = 0;
  let sproutPool = 0, saplingPool = 0, orchardPool = 0, transparentPool = 0;

  for (const p of (info.valuePools || [])) {
    const val = parseInt(p.chainValueZat) || 0;
    if (p.id === 'sprout') sproutPool = val;
    else if (p.id === 'sapling') saplingPool = val;
    else if (p.id === 'orchard') orchardPool = val;
    else if (p.id === 'transparent') transparentPool = val;
    if (p.id !== 'transparent' && p.id !== 'lockbox') shieldedPoolSize += val;
  }
  if (info.chainSupply) chainSupply = parseInt(info.chainSupply.chainValueZat) || 0;
  return { shieldedPoolSize, chainSupply, sproutPool, saplingPool, orchardPool, transparentPool };
}

async function getPoolSize() {
  const info = await rpcCall('getblockchaininfo', []);
  return parsePoolsFromResult(info);
}

async function getPoolSizeAtHeight(height) {
  const block = await rpcCall('getblock', [String(height), 1]);
  return parsePoolsFromResult(block);
}

async function main() {
  log(`=== Backfilling privacy_trends_daily (${DAYS} days) ===`);

  await pool.query('SELECT 1');
  log('Database connected');

  const currentPools = await getPoolSize();
  log(`Current pool: ${(currentPools.shieldedPoolSize / 1e8).toFixed(2)} ZEC shielded / ${(currentPools.chainSupply / 1e8).toFixed(2)} ZEC total`);

  const allTimeStats = (await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE has_sapling OR has_orchard) as shielded,
      COUNT(*) FILTER (WHERE (has_sapling OR has_orchard) AND vin_count = 0 AND vout_count = 0 AND NOT is_coinbase) as fully_shielded
    FROM transactions WHERE block_height > 0
  `)).rows[0];

  const allTimeShieldedPercent = parseInt(allTimeStats.total) > 0
    ? (parseInt(allTimeStats.shielded) / parseInt(allTimeStats.total)) * 100
    : 0;

  let inserted = 0;
  let updated = 0;

  for (let i = DAYS - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    const dayStart = new Date(dateStr + 'T00:00:00Z').getTime() / 1000;
    const dayEnd = new Date(dateStr + 'T23:59:59Z').getTime() / 1000;

    const dayStats = (await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE has_sapling OR has_orchard) as shielded_count,
        COUNT(*) FILTER (WHERE NOT is_coinbase AND NOT has_sapling AND NOT has_orchard) as transparent_count,
        MAX(block_height) as max_height
      FROM transactions
      WHERE block_time >= $1 AND block_time < $2 AND block_height > 0
    `, [dayStart, dayEnd])).rows[0];

    const shieldedCount = parseInt(dayStats.shielded_count) || 0;
    const transparentCount = parseInt(dayStats.transparent_count) || 0;
    const totalCount = shieldedCount + transparentCount;
    const shieldedPercentage = totalCount > 0 ? (shieldedCount / totalCount) * 100 : 0;
    const maxHeight = parseInt(dayStats.max_height) || 0;

    if (totalCount === 0) {
      log(`  ${dateStr}: no transactions, skipping`);
      continue;
    }

    // Fetch exact pool sizes at end-of-day block height
    let pools = currentPools;
    if (maxHeight > 0 && i > 0) {
      try {
        pools = await getPoolSizeAtHeight(maxHeight);
      } catch (err) {
        log(`  ${dateStr}: RPC failed for height ${maxHeight}, using current: ${err.message}`);
      }
    }

    const privacyScore = calculatePrivacyScore({
      allTimeShieldedPercent,
      totalShieldedZat: pools.shieldedPoolSize,
      chainSupplyZat: pools.chainSupply,
      fullyShieldedTx: parseInt(allTimeStats.fully_shielded) || 0,
      shieldedTx: parseInt(allTimeStats.shielded) || 0,
    });

    const existing = await pool.query('SELECT id FROM privacy_trends_daily WHERE date = $1', [dateStr]);

    if (existing.rows.length > 0) {
      await pool.query(`
        UPDATE privacy_trends_daily SET
          shielded_count = $2, transparent_count = $3, shielded_percentage = $4,
          pool_size = $5, privacy_score = $6,
          sprout_pool_size = $7, sapling_pool_size = $8, orchard_pool_size = $9,
          transparent_pool_size = $10, chain_supply = $11
        WHERE date = $1
      `, [dateStr, shieldedCount, transparentCount, shieldedPercentage, pools.shieldedPoolSize, privacyScore,
        pools.sproutPool, pools.saplingPool, pools.orchardPool, pools.transparentPool, pools.chainSupply]);
      updated++;
    } else {
      await pool.query(`
        INSERT INTO privacy_trends_daily (
          date, shielded_count, transparent_count, shielded_percentage, pool_size, privacy_score,
          sprout_pool_size, sapling_pool_size, orchard_pool_size, transparent_pool_size, chain_supply, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      `, [dateStr, shieldedCount, transparentCount, shieldedPercentage, pools.shieldedPoolSize, privacyScore,
        pools.sproutPool, pools.saplingPool, pools.orchardPool, pools.transparentPool, pools.chainSupply]);
      inserted++;
    }

    log(`  ${dateStr}: ${shieldedCount} shielded / ${transparentCount} transparent (${shieldedPercentage.toFixed(1)}%) h=${maxHeight} pool=${(pools.shieldedPoolSize/1e8).toFixed(0)} ZEC`);
  }

  log(`\n=== Done: ${inserted} inserted, ${updated} updated ===`);
  await pool.end();
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
