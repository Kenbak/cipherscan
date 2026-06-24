#!/usr/bin/env node
/**
 * Mining Behavior Snapshot Job
 *
 * Pre-computes daily miner sell/hold metrics by checking whether coinbase
 * outputs have been spent (via transaction_inputs.prev_txid lookup).
 *
 * Creates and maintains the `mining_behavior_daily` table:
 *   (date, pool_name, earned_zat, spent_zat, held_zat, blocks_mined, outputs_spent, outputs_total)
 *
 * Modes:
 *   node snapshot-mining-behavior.js              — incremental (last 7 days)
 *   node snapshot-mining-behavior.js --backfill   — full history (slow, hours)
 *
 * Cron:
 *   0 5 * * * cd /root/cipherscan/server/jobs && node snapshot-mining-behavior.js >> /var/log/mining-behavior.log 2>&1
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

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

const LOCK_ID = 839275;
const BACKFILL_MODE = process.argv.includes('--backfill');
const DAYS_FLAG = process.argv.find(a => a.startsWith('--days='));
const INCREMENTAL_DAYS = DAYS_FLAG ? parseInt(DAYS_FLAG.split('=')[1]) : 7;

function log(msg) {
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
  console.log(`[${ts}] ${msg}`);
}

async function ensureTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS mining_behavior_daily (
      date DATE NOT NULL,
      pool_name TEXT NOT NULL,
      miner_address TEXT NOT NULL,
      earned_zat BIGINT NOT NULL DEFAULT 0,
      spent_zat BIGINT NOT NULL DEFAULT 0,
      held_zat BIGINT NOT NULL DEFAULT 0,
      blocks_mined INTEGER NOT NULL DEFAULT 0,
      outputs_spent INTEGER NOT NULL DEFAULT 0,
      outputs_total INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (date, pool_name)
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_mining_behavior_date
    ON mining_behavior_daily (date)
  `);
}

async function acquireLock(client) {
  const result = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [LOCK_ID]);
  return result.rows[0].acquired;
}

async function releaseLock(client) {
  await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]);
}

/**
 * Known pool map — mirrors server/api/mining-pools.js
 * Duplicated here so the job is self-contained (no import path issues from cron).
 * Last synced: 2026-06-24
 */
const POOL_MAP = {
  't1SqwRAAdSig6dE4EBPLonAait219VmkUjP': 'Foundry USA',
  't1PEp2GJLSdhDfCKqc2J211WKDUS1NfoQNy': 'F2Pool',
  't1at7nVNsv6taLRrNRvnQdtfLNRDfsGc3Ak': 'ViaBTC',
  't1ZVi2YGk98tEGYcNpXYnJFWCoLG2oYwv3J': 'AntPool',
  't1L2b66MXbgpVMXDfUa94GCBFAN4dCxGohM': 'AntPool',
  't1K79TgQbqu74d6rBmsMu2oFEXEwAmdYiT7': 'Unidentified #5',
  't1MKn34KBa8Xh4g8qU8psibBXvURafphVn7': 'Unidentified (Dominant)',
  't1bnxtY7aLCjWx9Ru1YcGwRWch3eEWUFK7u': '2Miners',
  't1fu6KgYtHEXk2ZhTpM1XD7jbnSmW6wokDM': '2Miners',
  't1XQZdZMnzXBcL8yx2PR27dSNrqctgwLgux': 'Luxor',
  't1egMFNkP7EfkK25y8s4GeiMkEGnqcMnTb1': 'Mining Dutch',
  't1Mofe2EigYNfgqSTPbK4k1iJTxyCEEQCEC': 'Kryptex',
  't1SEgZvXCu3ceE42qrq5pCeSq7HbLjX8NJv': 'NiceHash',
  't1fpcZ2Dbwn4oj35oWBTUhtmUciSq7HG7LU': 'Solopool',
  't1Na7ykQ6vE4CbxBPuUDUQx5n6aEWXu1VQq': 'Binance Pool',
  't1e6hceYHkzCbwcwGZzKeMfXXW7x7gr19Cw': 'Poolin',
  't3cFfPt1Bcvgez9ZbMBFWeZsskxTkPzGCow': 'Dev Fund',
};

function getPoolNameForAddress(address) {
  return POOL_MAP[address] || 'Other';
}

/**
 * Compute miner behavior for a single date.
 * Uses a join between coinbase outputs and transaction_inputs to detect spends.
 */
async function computeDay(client, dateStr) {
  const dayStart = Math.floor(new Date(dateStr + 'T00:00:00Z').getTime() / 1000);
  const dayEnd = dayStart + 86400;

  const result = await client.query(`
    WITH day_coinbase AS (
      SELECT b.miner_address, t.txid as coinbase_txid, txo.vout_index, txo.value
      FROM blocks b
      JOIN transactions t ON t.block_height = b.height AND t.is_coinbase = true
      JOIN transaction_outputs txo ON txo.txid = t.txid
      WHERE b.timestamp >= $1 AND b.timestamp < $2
        AND b.miner_address IS NOT NULL
        AND txo.address = b.miner_address
    ),
    spend_status AS (
      SELECT dc.miner_address, dc.value,
        CASE WHEN ti.txid IS NOT NULL THEN true ELSE false END as is_spent
      FROM day_coinbase dc
      LEFT JOIN transaction_inputs ti
        ON ti.prev_txid = dc.coinbase_txid AND ti.prev_vout = dc.vout_index
    )
    SELECT miner_address, COUNT(*) as output_count,
      SUM(value) as total_earned,
      SUM(CASE WHEN is_spent THEN value ELSE 0 END) as total_spent,
      SUM(CASE WHEN is_spent THEN 1 ELSE 0 END) as spent_count
    FROM spend_status
    GROUP BY miner_address
  `, [dayStart, dayEnd]);

  const blockCounts = await client.query(`
    SELECT miner_address, COUNT(*) as blocks
    FROM blocks
    WHERE timestamp >= $1 AND timestamp < $2
      AND miner_address IS NOT NULL
    GROUP BY miner_address
  `, [dayStart, dayEnd]);

  const blockMap = {};
  for (const row of blockCounts.rows) {
    blockMap[row.miner_address] = parseInt(row.blocks);
  }

  // Aggregate by pool name (multiple addresses can map to same pool)
  const poolAgg = {};
  for (const row of result.rows) {
    const poolName = getPoolNameForAddress(row.miner_address);
    if (!poolAgg[poolName]) {
      poolAgg[poolName] = {
        address: row.miner_address,
        earned: 0n,
        spent: 0n,
        blocks: 0,
        outputsSpent: 0,
        outputsTotal: 0,
      };
    }
    const entry = poolAgg[poolName];
    entry.earned += BigInt(row.total_earned || 0);
    entry.spent += BigInt(row.total_spent || 0);
    entry.blocks += blockMap[row.miner_address] || 0;
    entry.outputsSpent += parseInt(row.spent_count || 0);
    entry.outputsTotal += parseInt(row.output_count || 0);
  }

  // Upsert into mining_behavior_daily
  await client.query('DELETE FROM mining_behavior_daily WHERE date = $1', [dateStr]);

  for (const [poolName, data] of Object.entries(poolAgg)) {
    const held = data.earned - data.spent;
    await client.query(`
      INSERT INTO mining_behavior_daily
        (date, pool_name, miner_address, earned_zat, spent_zat, held_zat, blocks_mined, outputs_spent, outputs_total)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      dateStr,
      poolName,
      data.address,
      data.earned.toString(),
      data.spent.toString(),
      held.toString(),
      data.blocks,
      data.outputsSpent,
      data.outputsTotal,
    ]);
  }

  return Object.keys(poolAgg).length;
}

async function run() {
  const client = await pool.connect();
  try {
    const locked = await acquireLock(client);
    if (!locked) {
      log('Another instance is running (advisory lock held). Exiting.');
      return;
    }

    log(`Starting mining behavior snapshot (${BACKFILL_MODE ? 'BACKFILL' : 'incremental'})...`);
    await ensureTable(client);

    // Determine date range
    let startDate;
    if (BACKFILL_MODE) {
      const earliest = await client.query(
        `SELECT MIN(date_trunc('day', to_timestamp(timestamp)))::date as min_date FROM blocks WHERE miner_address IS NOT NULL`
      );
      startDate = earliest.rows[0]?.min_date || new Date('2016-10-28');
    } else {
      startDate = new Date();
      startDate.setDate(startDate.getDate() - INCREMENTAL_DAYS);
    }

    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 1); // Don't compute today (incomplete)

    let current = new Date(startDate);
    let daysProcessed = 0;

    while (current <= endDate) {
      const dateStr = current.toISOString().slice(0, 10);
      const poolCount = await computeDay(client, dateStr);
      daysProcessed++;

      if (daysProcessed % 30 === 0 || !BACKFILL_MODE) {
        log(`  ${dateStr}: ${poolCount} pools`);
      }

      current.setDate(current.getDate() + 1);
    }

    log(`Done. Processed ${daysProcessed} days.`);
    await releaseLock(client);
  } catch (error) {
    log(`ERROR: ${error.message}`);
    console.error(error);
    await releaseLock(client).catch(() => {});
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
