#!/usr/bin/env node
/**
 * Mining Behavior Snapshot Job
 *
 * Pre-computes daily miner sell/hold metrics by checking whether coinbase
 * outputs have been spent (via transaction_inputs.prev_txid lookup).
 *
 * Maintains the mining_behavior_daily table.
 *
 * Modes:
 *   node snapshot-mining-behavior.js              — incremental (last 7 days)
 *   node snapshot-mining-behavior.js --backfill   — full history (slow, hours)
 *
 * Cron:
 *   0 5 * * * cd /root/cipherscan/server/jobs && node snapshot-mining-behavior.js >> /var/log/mining-behavior.log 2>&1
 */

const { log, loadEnv, withAdvisoryLock } = require('../lib/job-utils');
loadEnv(__dirname);

const { getPool } = require('../lib/db-pool');

const pool = getPool({ max: 3 });

const LOCK_ID = 839275;
const BACKFILL_MODE = process.argv.includes('--backfill');
const DAYS_FLAG = process.argv.find(a => a.startsWith('--days='));
const INCREMENTAL_DAYS = DAYS_FLAG ? parseInt(DAYS_FLAG.split('=')[1]) : 7;

/**
 * Known pool map — mirrors server/api/mining-pools.js
 * Duplicated here so the job is self-contained (no import path issues from cron).
 * Last synced: 2026-08-16
 */
const POOL_MAP = {
  't1MKn34KBa8Xh4g8qU8psibBXvURafphVn7': 'ViaBTC',
  't1at7nVNsv6taLRrNRvnQdtfLNRDfsGc3Ak': 'ViaBTC',
  't1SEgZvXCu3ceE42qrq5pCeSq7HbLjX8NJv': 'ViaBTC-Solo',
  't1PEp2GJLSdhDfCKqc2J211WKDUS1NfoQNy': 'F2Pool',
  't1SqwRAAdSig6dE4EBPLonAait219VmkUjP': 'Foundry USA',
  't1XQZdZMnzXBcL8yx2PR27dSNrqctgwLgux': 'Luxor',
  't1VTjv7XF3hYqxQkxKmHHErvus3bDrbbkGg': '2Miners',
  't1QxTHUputbmZRxd3EqP671sLqd6KNBQbXJ': '2Miners',
  't1fu6KgYtHEXk2ZhTpM1XD7jbnSmW6wokDM': '2Miners',
  't1bnxtY7aLCjWx9Ru1YcGwRWch3eEWUFK7u': '2Miners',
  't1eBv4a3wBhVaFgWYjXrFYTU7pruCWaBpLW': 'NiceHash',
  't1L2b66MXbgpVMXDfUa94GCBFAN4dCxGohM': 'AntPool',
  't1ZVi2YGk98tEGYcNpXYnJFWCoLG2oYwv3J': 'AntPool',
  't1e6hceYHkzCbwcwGZzKeMfXXW7x7gr19Cw': 'Kryptex',
  't1Mofe2EigYNfgqSTPbK4k1iJTxyCEEQCEC': 'Kryptex',
  't1Uo7EN1A3GN29UjQJbUFYvrhxQd6Gt7qdA': 'ZEC Mining Pool',
  't1egMFNkP7EfkK25y8s4GeiMkEGnqcMnTb1': 'Mining Dutch',
  't1Na7ykQ6vE4CbxBPuUDUQx5n6aEWXu1VQq': 'Binance Pool',
  't1K79TgQbqu74d6rBmsMu2oFEXEwAmdYiT7': 'Unidentified #5',
  't1fpcZ2Dbwn4oj35oWBTUhtmUciSq7HG7LU': 'Private Miner B',
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
    WITH coinbase_txs AS MATERIALIZED (
      SELECT b.miner_address, t.txid
      FROM blocks b
      JOIN transactions t ON t.block_height = b.height AND t.is_coinbase = true
      WHERE b.timestamp >= $1 AND b.timestamp < $2
        AND b.miner_address IS NOT NULL
    ),
    all_cb_outputs AS MATERIALIZED (
      SELECT txo.txid, txo.vout_index, txo.value, txo.address
      FROM transaction_outputs txo
      WHERE txo.txid IN (SELECT txid FROM coinbase_txs)
    ),
    day_coinbase AS (
      SELECT ct.miner_address, o.txid as coinbase_txid, o.vout_index, o.value
      FROM coinbase_txs ct
      JOIN all_cb_outputs o ON o.txid = ct.txid AND o.address = ct.miner_address
    )
    SELECT dc.miner_address, COUNT(*) as output_count,
      SUM(dc.value) as total_earned,
      SUM(CASE WHEN ti.txid IS NOT NULL THEN dc.value ELSE 0 END) as total_spent,
      SUM(CASE WHEN ti.txid IS NOT NULL THEN 1 ELSE 0 END) as spent_count
    FROM day_coinbase dc
    LEFT JOIN transaction_inputs ti
      ON ti.prev_txid = dc.coinbase_txid AND ti.prev_vout = dc.vout_index
    GROUP BY dc.miner_address
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
    await withAdvisoryLock(client, LOCK_ID, async (client) => {
      log(`Starting mining behavior snapshot (${BACKFILL_MODE ? 'BACKFILL' : 'incremental'})...`);

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
      endDate.setDate(endDate.getDate() - 1);

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
    });
  } catch (error) {
    log(`ERROR: ${error.message}`);
    console.error(error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
