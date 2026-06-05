#!/usr/bin/env node
/**
 * Incremental Turnstile Refresh
 *
 * Maintains the turnstile_daily summary table with near-real-time data.
 * Uses idempotent DELETE + recompute pattern for affected dates.
 *
 * Modes:
 *   node refresh-turnstile.js          — incremental (new deshields + recent held re-check)
 *   node refresh-turnstile.js --sweep  — full sweep of all held outputs (run daily at 4am)
 *
 * Cron:
 *   *\/5 * * * * cd /root/cipherscan/server/jobs && node refresh-turnstile.js >> /var/log/refresh-turnstile.log 2>&1
 *   0 4 * * *   cd /root/cipherscan/server/jobs && node refresh-turnstile.js --sweep >> /var/log/refresh-turnstile.log 2>&1
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

const LOCK_ID = 839271; // arbitrary advisory lock ID for this job
const STATE_KEY = 'turnstile_last_processed_time';
const SWEEP_MODE = process.argv.includes('--sweep');
const RECENT_HELD_DAYS = 7;

function log(msg) {
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
  console.log(`[${ts}] ${msg}`);
}

async function acquireLock(client) {
  const result = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [LOCK_ID]);
  return result.rows[0].acquired;
}

async function releaseLock(client) {
  await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]);
}

async function getLastProcessedTime(client) {
  const result = await client.query(
    'SELECT value FROM indexer_state WHERE key = $1',
    [STATE_KEY]
  );
  if (result.rows.length === 0) return 0;
  return parseInt(result.rows[0].value) || 0;
}

async function setLastProcessedTime(client, blockTime) {
  await client.query(`
    INSERT INTO indexer_state (key, value, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
  `, [STATE_KEY, String(blockTime)]);
}

/**
 * Recompute turnstile_daily rows for a set of dates.
 * Idempotent: deletes existing rows then inserts fresh aggregates from raw data.
 * Uses the proven matview SQL (separate CTEs with explicit priority ordering).
 * Wrapped in a transaction so partial failures don't corrupt data.
 */
async function recomputeDates(client, dates) {
  if (dates.length === 0) return 0;

  await client.query('BEGIN');
  try {
    await client.query('SET LOCAL enable_hashjoin = off');
    await client.query('SET LOCAL enable_mergejoin = off');

    await client.query('DELETE FROM turnstile_daily WHERE date = ANY($1::date[])', [dates]);

    const result = await client.query(`
      WITH pure_deshields AS (
        SELECT
          DATE(TO_TIMESTAMP(sf.block_time)) AS date,
          sf.pool,
          sf.txid,
          txo.vout_index,
          txo.value
        FROM shielded_flows sf
        JOIN transaction_outputs txo ON txo.txid = sf.txid
        WHERE sf.flow_type = 'deshield'
          AND txo.address LIKE 't%'
          AND DATE(TO_TIMESTAMP(sf.block_time)) = ANY($1::date[])
          AND NOT EXISTS (
            SELECT 1 FROM transaction_inputs ti_check
            WHERE ti_check.txid = sf.txid
          )
      ),
      with_spend AS (
        SELECT
          pd.date,
          pd.pool,
          pd.txid,
          pd.vout_index,
          pd.value,
          ti.txid AS spending_txid
        FROM pure_deshields pd
        LEFT JOIN transaction_inputs ti
          ON ti.prev_txid = pd.txid AND ti.prev_vout = pd.vout_index
      ),
      reshield_txids AS (
        SELECT DISTINCT ws.spending_txid
        FROM with_spend ws
        JOIN shielded_flows sf ON sf.txid = ws.spending_txid
        WHERE ws.spending_txid IS NOT NULL
          AND sf.flow_type = 'shield'
      ),
      exchange_txids AS (
        SELECT DISTINCT ws.spending_txid
        FROM with_spend ws
        JOIN transaction_outputs txo ON txo.txid = ws.spending_txid
        JOIN address_labels al ON al.address = txo.address
        WHERE ws.spending_txid IS NOT NULL
          AND al.category = 'exchange'
          AND ws.spending_txid NOT IN (SELECT spending_txid FROM reshield_txids)
      ),
      bridge_txids AS (
        SELECT DISTINCT ws.spending_txid
        FROM with_spend ws
        JOIN transaction_outputs txo ON txo.txid = ws.spending_txid
        JOIN address_labels al ON al.address = txo.address
        WHERE ws.spending_txid IS NOT NULL
          AND al.category = 'bridge'
          AND ws.spending_txid NOT IN (SELECT spending_txid FROM reshield_txids)
          AND ws.spending_txid NOT IN (SELECT spending_txid FROM exchange_txids)
      )
      INSERT INTO turnstile_daily (date, pool, deshielded_zat, held_zat, reshielded_zat, exchange_zat, bridge_zat, transferred_zat, tx_count)
      SELECT
        ws.date,
        ws.pool,
        SUM(ws.value) AS deshielded_zat,
        SUM(CASE WHEN ws.spending_txid IS NULL THEN ws.value ELSE 0 END) AS held_zat,
        SUM(CASE WHEN rt.spending_txid IS NOT NULL THEN ws.value ELSE 0 END) AS reshielded_zat,
        SUM(CASE WHEN et.spending_txid IS NOT NULL THEN ws.value ELSE 0 END) AS exchange_zat,
        SUM(CASE WHEN bt.spending_txid IS NOT NULL THEN ws.value ELSE 0 END) AS bridge_zat,
        SUM(CASE
          WHEN ws.spending_txid IS NOT NULL
           AND rt.spending_txid IS NULL
           AND et.spending_txid IS NULL
           AND bt.spending_txid IS NULL
          THEN ws.value ELSE 0
        END) AS transferred_zat,
        COUNT(DISTINCT ws.txid) AS tx_count
      FROM with_spend ws
      LEFT JOIN reshield_txids rt ON rt.spending_txid = ws.spending_txid
      LEFT JOIN exchange_txids et ON et.spending_txid = ws.spending_txid
      LEFT JOIN bridge_txids bt ON bt.spending_txid = ws.spending_txid
      GROUP BY ws.date, ws.pool
    `, [dates]);

    await client.query('COMMIT');
    return result.rowCount;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

/**
 * Find dates with new deshields since last processed time.
 */
async function findNewDeshieldDates(client, sinceBlockTime) {
  const result = await client.query(`
    SELECT DISTINCT DATE(TO_TIMESTAMP(block_time)) AS date
    FROM shielded_flows
    WHERE flow_type = 'deshield' AND block_time > $1
    ORDER BY date
  `, [sinceBlockTime]);
  return result.rows.map(r => r.date);
}

/**
 * Find dates that need reclassification (held outputs that got spent).
 *
 * In non-sweep mode: just returns today and yesterday (fast, catches most
 * reclassifications since outputs are usually spent within a day or two).
 *
 * In sweep mode: scans all dates with held_zat > 0 and checks if any of
 * those outputs have been spent. This is the expensive query that only
 * runs daily at 4am.
 */
async function findReclassifiedDates(client, sweep) {
  if (!sweep) {
    // Fast path: just recompute today and yesterday to catch recent spends
    const result = await client.query(`
      SELECT DISTINCT date FROM turnstile_daily
      WHERE date >= CURRENT_DATE - 1 AND held_zat > 0
    `);
    return result.rows.map(r => r.date);
  }

  // Sweep mode: find all dates where held outputs have actually been spent
  const result = await client.query(`
    WITH dates_with_held AS (
      SELECT DISTINCT date FROM turnstile_daily WHERE held_zat > 0
    ),
    sample_held AS (
      SELECT
        sf.txid,
        txo.vout_index,
        DATE(TO_TIMESTAMP(sf.block_time)) AS date
      FROM shielded_flows sf
      JOIN transaction_outputs txo ON txo.txid = sf.txid
      JOIN dates_with_held dwh ON dwh.date = DATE(TO_TIMESTAMP(sf.block_time))
      WHERE sf.flow_type = 'deshield'
        AND txo.address LIKE 't%'
        AND NOT EXISTS (
          SELECT 1 FROM transaction_inputs ti_check
          WHERE ti_check.txid = sf.txid
        )
      LIMIT 10000
    )
    SELECT DISTINCT sh.date
    FROM sample_held sh
    JOIN transaction_inputs ti
      ON ti.prev_txid = sh.txid AND ti.prev_vout = sh.vout_index
  `);
  return result.rows.map(r => r.date);
}

/**
 * Get the max block_time from shielded_flows to update our bookmark.
 */
async function getMaxBlockTime(client) {
  const result = await client.query('SELECT MAX(block_time) AS max_time FROM shielded_flows');
  return parseInt(result.rows[0].max_time) || 0;
}

async function main() {
  const start = Date.now();
  log(`=== Turnstile Refresh${SWEEP_MODE ? ' (SWEEP)' : ''} ===`);

  const client = await pool.connect();
  try {
    const locked = await acquireLock(client);
    if (!locked) {
      log('Another instance is running, skipping.');
      return;
    }

    try {
      const lastProcessed = await getLastProcessedTime(client);
      log(`Last processed block_time: ${lastProcessed} (${lastProcessed > 0 ? new Date(lastProcessed * 1000).toISOString().split('T')[0] : 'never'})`);

      // Step 1: Find dates with new deshields
      const newDates = await findNewDeshieldDates(client, lastProcessed);
      log(`New deshield dates: ${newDates.length}`);

      // Step 2: Find dates where held outputs got spent
      const reclassDates = await findReclassifiedDates(client, SWEEP_MODE);
      log(`Reclassification dates: ${reclassDates.length}`);

      // Combine and deduplicate affected dates
      const allDatesSet = new Set([
        ...newDates.map(d => new Date(d).toISOString().split('T')[0]),
        ...reclassDates.map(d => new Date(d).toISOString().split('T')[0]),
      ]);
      const affectedDates = [...allDatesSet].sort();

      if (affectedDates.length === 0) {
        log('No changes detected, nothing to do.');
      } else {
        log(`Recomputing ${affectedDates.length} date(s): ${affectedDates.slice(0, 5).join(', ')}${affectedDates.length > 5 ? '...' : ''}`);
        const rowsInserted = await recomputeDates(client, affectedDates);
        log(`Inserted ${rowsInserted} rows`);
      }

      // Step 3: Update bookmark
      const maxTime = await getMaxBlockTime(client);
      if (maxTime > lastProcessed) {
        await setLastProcessedTime(client, maxTime);
        log(`Updated last_processed_time to ${maxTime}`);
      }

      const elapsed = ((Date.now() - start) / 1000).toFixed(2);
      log(`=== Done in ${elapsed}s ===`);
    } finally {
      await releaseLock(client);
    }
  } catch (err) {
    log(`ERROR: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
