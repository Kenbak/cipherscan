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
// Explicit full-history rebuild. Without this flag, the job refuses to
// recompute more than MAX_AUTO_DATES at once — this prevents a missing/zeroed
// bookmark from silently triggering a multi-thousand-date recompute that
// saturates disk IO and takes the site down.
const REBUILD_MODE = process.argv.includes('--rebuild');
const RECENT_HELD_DAYS = 7;
const SWEEP_WINDOW_DAYS = 120; // daily sweep only re-checks held outputs this recent
const MAX_AUTO_DATES = 31; // safety cap for non-rebuild runs

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
 * Idempotent: deletes existing rows then inserts fresh aggregates.
 *
 * Uses a step-by-step temp table approach instead of a single massive CTE.
 * This forces PostgreSQL to materialize small intermediate results and use
 * index lookups (nested loops) against the 188M-row transaction_outputs and
 * 161M-row transaction_inputs tables, rather than choosing expensive hash joins.
 *
 * Each step typically processes < 200 rows for a daily update, completing in
 * seconds even under disk IO pressure.
 */
async function recomputeDates(client, dates) {
  if (dates.length === 0) return 0;

  const sorted = [...dates].sort();
  const minDate = sorted[0];
  const maxDate = sorted[sorted.length - 1];

  await client.query('BEGIN');
  try {
    // Step 1: Collect deshield txids within the date range (uses idx_shielded_flows_time)
    await client.query(`
      CREATE TEMP TABLE _deshield_txs ON COMMIT DROP AS
      SELECT sf.txid, sf.pool, sf.block_time,
             DATE(TO_TIMESTAMP(sf.block_time)) AS date
      FROM shielded_flows sf
      WHERE sf.flow_type = 'deshield'
        AND sf.block_time >= EXTRACT(EPOCH FROM $1::date)::bigint
        AND sf.block_time < EXTRACT(EPOCH FROM ($2::date + 1))::bigint
        AND DATE(TO_TIMESTAMP(sf.block_time)) = ANY($3::date[])
    `, [minDate, maxDate, dates]);

    // Step 2: Filter to "pure" deshields (no transparent inputs in the tx)
    // Uses idx_tx_inputs_txid for the NOT EXISTS check
    await client.query(`
      CREATE TEMP TABLE _pure_deshields ON COMMIT DROP AS
      SELECT dt.txid, dt.pool, dt.date
      FROM _deshield_txs dt
      WHERE NOT EXISTS (
        SELECT 1 FROM transaction_inputs ti WHERE ti.txid = dt.txid
      )
    `);

    // Step 3: Get transparent outputs for those txids (uses idx_tx_outputs_txid)
    await client.query(`
      CREATE TEMP TABLE _outputs ON COMMIT DROP AS
      SELECT pd.date, pd.pool, pd.txid, txo.vout_index, txo.value
      FROM _pure_deshields pd
      JOIN transaction_outputs txo ON txo.txid = pd.txid
      WHERE txo.address LIKE 't%'
    `);

    // Step 4: Find spends (uses idx_tx_inputs_prev_tx on prev_txid, prev_vout)
    await client.query(`
      CREATE TEMP TABLE _with_spend ON COMMIT DROP AS
      SELECT o.date, o.pool, o.txid, o.vout_index, o.value,
             ti.txid AS spending_txid
      FROM _outputs o
      LEFT JOIN transaction_inputs ti
        ON ti.prev_txid = o.txid AND ti.prev_vout = o.vout_index
    `);

    // Step 5: Classify spending txids — priority: reshield > exchange > bridge > transferred
    // 5a: Reshields (uses idx_shielded_flows_txid)
    await client.query(`
      CREATE TEMP TABLE _reshield ON COMMIT DROP AS
      SELECT DISTINCT ws.spending_txid
      FROM _with_spend ws
      JOIN shielded_flows sf ON sf.txid = ws.spending_txid AND sf.flow_type = 'shield'
      WHERE ws.spending_txid IS NOT NULL
    `);

    // 5b: Exchange destinations (uses idx_tx_outputs_txid + address_labels PK)
    await client.query(`
      CREATE TEMP TABLE _exchange ON COMMIT DROP AS
      SELECT DISTINCT ws.spending_txid
      FROM _with_spend ws
      JOIN transaction_outputs txo ON txo.txid = ws.spending_txid
      JOIN address_labels al ON al.address = txo.address AND al.category = 'exchange'
      WHERE ws.spending_txid IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM _reshield r WHERE r.spending_txid = ws.spending_txid)
    `);

    // 5c: Bridge destinations
    await client.query(`
      CREATE TEMP TABLE _bridge ON COMMIT DROP AS
      SELECT DISTINCT ws.spending_txid
      FROM _with_spend ws
      JOIN transaction_outputs txo ON txo.txid = ws.spending_txid
      JOIN address_labels al ON al.address = txo.address AND al.category = 'bridge'
      WHERE ws.spending_txid IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM _reshield r WHERE r.spending_txid = ws.spending_txid)
        AND NOT EXISTS (SELECT 1 FROM _exchange e WHERE e.spending_txid = ws.spending_txid)
    `);

    // Step 6: Aggregate and insert
    await client.query('DELETE FROM turnstile_daily WHERE date = ANY($1::date[])', [dates]);

    const result = await client.query(`
      INSERT INTO turnstile_daily (date, pool, deshielded_zat, held_zat, reshielded_zat, exchange_zat, bridge_zat, transferred_zat, tx_count)
      SELECT
        ws.date, ws.pool,
        SUM(ws.value),
        SUM(CASE WHEN ws.spending_txid IS NULL THEN ws.value ELSE 0 END),
        SUM(CASE WHEN r.spending_txid IS NOT NULL THEN ws.value ELSE 0 END),
        SUM(CASE WHEN e.spending_txid IS NOT NULL THEN ws.value ELSE 0 END),
        SUM(CASE WHEN b.spending_txid IS NOT NULL THEN ws.value ELSE 0 END),
        SUM(CASE WHEN ws.spending_txid IS NOT NULL
                  AND r.spending_txid IS NULL
                  AND e.spending_txid IS NULL
                  AND b.spending_txid IS NULL THEN ws.value ELSE 0 END),
        COUNT(DISTINCT ws.txid)
      FROM _with_spend ws
      LEFT JOIN _reshield r ON r.spending_txid = ws.spending_txid
      LEFT JOIN _exchange e ON e.spending_txid = ws.spending_txid
      LEFT JOIN _bridge b ON b.spending_txid = ws.spending_txid
      GROUP BY ws.date, ws.pool
    `);

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

  // Sweep mode: find dates where held outputs have actually been spent.
  // Bounded to a recent window ($1 days) and a sargable block_time lower bound
  // so the daily 4am run stays fast instead of re-scanning all history back to
  // 2018. Outputs deshielded long ago rarely move; a periodic --rebuild covers
  // those. The block_time bound lets the scan use idx_shielded_flows_time.
  const result = await client.query(`
    WITH dates_with_held AS (
      SELECT DISTINCT date FROM turnstile_daily
      WHERE held_zat > 0
        AND date >= CURRENT_DATE - $1::int
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
        AND sf.block_time >= EXTRACT(EPOCH FROM CURRENT_DATE - $1::int)::bigint
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
  `, [SWEEP_WINDOW_DAYS]);
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
      let newDates = await findNewDeshieldDates(client, lastProcessed);
      log(`New deshield dates: ${newDates.length}`);

      // Safety guard: an abnormally large set of "new" dates means the bookmark
      // is stale or zeroed (e.g. a manual INSERT bypassed setLastProcessedTime).
      // Recomputing thousands of dates at once is what previously saturated disk
      // IO and took the site down. Unless --rebuild is explicitly passed, cap to
      // the most recent dates and warn; the bookmark update at the end then makes
      // subsequent runs normal again.
      if (!REBUILD_MODE && newDates.length > MAX_AUTO_DATES) {
        const capped = newDates.slice(-RECENT_HELD_DAYS);
        log(`WARNING: ${newDates.length} new dates exceeds cap of ${MAX_AUTO_DATES} ` +
          `(likely a stale/zeroed bookmark). Processing only the most recent ` +
          `${capped.length} date(s). Run with --rebuild for a full recompute.`);
        newDates = capped;
      }

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
