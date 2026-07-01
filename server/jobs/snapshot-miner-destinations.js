#!/usr/bin/env node
/**
 * Miner Destination Snapshot Job
 *
 * Complements snapshot-mining-behavior.js. For each day, classifies how a
 * pool's SPENT coinbase rewards left its payout address:
 *   - shielded  → swept into the shielded pool (privacy move, likely still held)
 *   - exchange  → sent to a labeled exchange address (real off-ramp)
 *   - bridge    → sent to a labeled bridge address (cross-chain off-ramp)
 *   - other     → moved to another transparent address (rotation/cold storage)
 *
 * Writes into `miner_destination_daily` (date, pool_name, shielded/exchange/
 * bridge/other _zat). That table is created by an out-of-band migration; this
 * job intentionally contains no DDL.
 *
 * Modes:
 *   node snapshot-miner-destinations.js              — incremental (last 7 days)
 *   node snapshot-miner-destinations.js --days=400   — backfill last 400 days
 *
 * Cron (after the behavior job):
 *   15 5 * * * cd /root/cipherscan/server/jobs && node snapshot-miner-destinations.js >> /var/log/miner-destinations.log 2>&1
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

const LOCK_ID = 839276;
const DAYS_FLAG = process.argv.find((a) => a.startsWith('--days='));
const INCREMENTAL_DAYS = DAYS_FLAG ? parseInt(DAYS_FLAG.split('=')[1]) : 7;

function log(msg) {
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
  console.log(`[${ts}] ${msg}`);
}

// Mirrors server/api/mining-pools.js / snapshot-mining-behavior.js (synced 2026-06-24)
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

async function acquireLock(client) {
  const result = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [LOCK_ID]);
  return result.rows[0].acquired;
}

async function releaseLock(client) {
  await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]);
}

/**
 * Classify a single day's spent coinbase rewards by destination.
 * Priority: shielded > exchange > bridge > other (matches the turnstile job).
 */
async function computeDay(client, dateStr) {
  const dayStart = Math.floor(new Date(dateStr + 'T00:00:00Z').getTime() / 1000);
  const dayEnd = dayStart + 86400;

  const result = await client.query(
    `
    WITH cb AS MATERIALIZED (
      SELECT b.miner_address, t.txid
      FROM blocks b
      JOIN transactions t ON t.block_height = b.height AND t.is_coinbase = true
      WHERE b.timestamp >= $1 AND b.timestamp < $2
        AND b.miner_address IS NOT NULL
    ),
    cbo AS MATERIALIZED (
      SELECT ct.miner_address, o.txid AS cbtxid, o.vout_index, o.value
      FROM cb ct
      JOIN transaction_outputs o ON o.txid = ct.txid AND o.address = ct.miner_address
    ),
    sp AS MATERIALIZED (
      SELECT c.miner_address, c.value, ti.txid AS stx
      FROM cbo c
      LEFT JOIN transaction_inputs ti ON ti.prev_txid = c.cbtxid AND ti.prev_vout = c.vout_index
    ),
    cls AS (
      SELECT miner_address, value,
        CASE
          WHEN stx IS NULL THEN 'held'
          WHEN EXISTS (
            SELECT 1 FROM shielded_flows sf
            WHERE sf.txid = stx AND sf.flow_type = 'shield'
          ) THEN 'shielded'
          WHEN EXISTS (
            SELECT 1 FROM transaction_outputs o
            JOIN address_labels al ON al.address = o.address AND al.category = 'exchange'
            WHERE o.txid = stx
          ) THEN 'exchange'
          WHEN EXISTS (
            SELECT 1 FROM transaction_outputs o
            JOIN address_labels al ON al.address = o.address AND al.category = 'bridge'
            WHERE o.txid = stx
          ) THEN 'bridge'
          ELSE 'other'
        END AS cat
      FROM sp
    )
    SELECT miner_address,
      COALESCE(SUM(value) FILTER (WHERE cat = 'shielded'), 0) AS shielded,
      COALESCE(SUM(value) FILTER (WHERE cat = 'exchange'), 0) AS exchange,
      COALESCE(SUM(value) FILTER (WHERE cat = 'bridge'),   0) AS bridge,
      COALESCE(SUM(value) FILTER (WHERE cat = 'other'),    0) AS other
    FROM cls
    GROUP BY miner_address
  `,
    [dayStart, dayEnd]
  );

  const poolAgg = {};
  for (const row of result.rows) {
    const poolName = getPoolNameForAddress(row.miner_address);
    if (!poolAgg[poolName]) {
      poolAgg[poolName] = { shielded: 0n, exchange: 0n, bridge: 0n, other: 0n };
    }
    const e = poolAgg[poolName];
    e.shielded += BigInt(row.shielded || 0);
    e.exchange += BigInt(row.exchange || 0);
    e.bridge += BigInt(row.bridge || 0);
    e.other += BigInt(row.other || 0);
  }

  await client.query('DELETE FROM miner_destination_daily WHERE date = $1', [dateStr]);

  for (const [poolName, d] of Object.entries(poolAgg)) {
    await client.query(
      `
      INSERT INTO miner_destination_daily
        (date, pool_name, shielded_zat, exchange_zat, bridge_zat, other_zat, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (date, pool_name) DO UPDATE SET
        shielded_zat = EXCLUDED.shielded_zat,
        exchange_zat = EXCLUDED.exchange_zat,
        bridge_zat = EXCLUDED.bridge_zat,
        other_zat = EXCLUDED.other_zat,
        updated_at = NOW()
    `,
      [dateStr, poolName, d.shielded.toString(), d.exchange.toString(), d.bridge.toString(), d.other.toString()]
    );
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

    log(`Starting miner destination snapshot (last ${INCREMENTAL_DAYS} days)...`);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - INCREMENTAL_DAYS);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 1); // skip today (incomplete)

    // Process most-recent first so the common short windows (30D/90D) become
    // accurate quickly during a long backfill.
    let current = new Date(endDate);
    let daysProcessed = 0;
    while (current >= startDate) {
      const dateStr = current.toISOString().slice(0, 10);
      const poolCount = await computeDay(client, dateStr);
      daysProcessed++;
      if (daysProcessed % 30 === 0) log(`  ${dateStr}: ${poolCount} pools`);
      current.setDate(current.getDate() - 1);
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
