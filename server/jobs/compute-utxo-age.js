#!/usr/bin/env node
/**
 * UTXO Age / HODL Waves + Dormancy Job
 *
 * Computes daily HODL-wave buckets from unspent transparent UTXOs and
 * coin-days-destroyed (CDD) from spent UTXOs.
 *
 * HODL wave buckets: <1m, 1-3m, 3-6m, 6-12m, 1-2y, 2y+
 * Each bucket stores the total unspent ZEC whose creation falls in that age range.
 *
 * CDD = sum over all spent outputs that day of (value_zec * age_days)
 *
 * Writes to `utxo_age_daily` table (must be created out-of-band before first run).
 *
 * Required DDL (run once manually on the database):
 *
 *   CREATE TABLE IF NOT EXISTS utxo_age_daily (
 *     date DATE PRIMARY KEY,
 *     lt_1m_zat BIGINT DEFAULT 0,
 *     b_1_3m_zat BIGINT DEFAULT 0,
 *     b_3_6m_zat BIGINT DEFAULT 0,
 *     b_6_12m_zat BIGINT DEFAULT 0,
 *     b_1_2y_zat BIGINT DEFAULT 0,
 *     gt_2y_zat BIGINT DEFAULT 0,
 *     total_unspent_zat BIGINT DEFAULT 0,
 *     utxo_count INT DEFAULT 0,
 *     cdd DOUBLE PRECISION DEFAULT 0,
 *     avg_dormancy_days DOUBLE PRECISION DEFAULT 0,
 *     spent_count INT DEFAULT 0,
 *     created_at TIMESTAMPTZ DEFAULT NOW()
 *   );
 *
 * Modes:
 *   node compute-utxo-age.js              — today only
 *   node compute-utxo-age.js --days=30    — backfill last 30 days
 *
 * Cron (after daily-v3.sh):
 *   45 21 * * * cd /root/cipherscan/server/jobs && node compute-utxo-age.js >> /var/log/utxo-age.log 2>&1
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

const LOCK_ID = 839302;
const DAYS_FLAG = process.argv.find(a => a.startsWith('--days='));
const BACKFILL_DAYS = DAYS_FLAG ? parseInt(DAYS_FLAG.split('=')[1]) : 1;

function log(msg) {
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
  console.log(`[${ts}] ${msg}`);
}

async function computeForDate(client, dateStr) {
  const dateEpoch = Math.floor(new Date(dateStr + 'T23:59:59Z').getTime() / 1000);

  // HODL waves: bucket unspent outputs by age at this date
  const hodl = await client.query(`
    WITH unspent_at AS (
      SELECT o.value,
             ($1::int - t.block_time) / 86400 AS age_days
      FROM transaction_outputs o
      JOIN transactions t ON o.txid = t.txid
      WHERE t.block_time <= $1
        AND o.value > 0
        AND (o.spent = FALSE OR o.spent_at > $1)
    )
    SELECT
      COALESCE(SUM(CASE WHEN age_days < 30  THEN value ELSE 0 END), 0) AS lt_1m,
      COALESCE(SUM(CASE WHEN age_days >= 30  AND age_days < 90  THEN value ELSE 0 END), 0) AS b_1_3m,
      COALESCE(SUM(CASE WHEN age_days >= 90  AND age_days < 180 THEN value ELSE 0 END), 0) AS b_3_6m,
      COALESCE(SUM(CASE WHEN age_days >= 180 AND age_days < 365 THEN value ELSE 0 END), 0) AS b_6_12m,
      COALESCE(SUM(CASE WHEN age_days >= 365 AND age_days < 730 THEN value ELSE 0 END), 0) AS b_1_2y,
      COALESCE(SUM(CASE WHEN age_days >= 730 THEN value ELSE 0 END), 0) AS gt_2y,
      COALESCE(SUM(value), 0) AS total,
      COUNT(*) AS utxo_count
    FROM unspent_at
  `, [dateEpoch]);

  // CDD: coin-days destroyed by spends on this date
  const dayStart = Math.floor(new Date(dateStr + 'T00:00:00Z').getTime() / 1000);
  const dayEnd = dayStart + 86400;

  const cddResult = await client.query(`
    SELECT
      COALESCE(SUM((o.value::numeric / 1e8) * ((o.spent_at - t.block_time)::numeric / 86400)), 0) AS cdd,
      COALESCE(AVG((o.spent_at - t.block_time)::numeric / 86400), 0) AS avg_dormancy,
      COUNT(*) AS spent_count
    FROM transaction_outputs o
    JOIN transactions t ON o.txid = t.txid
    WHERE o.spent = TRUE
      AND o.spent_at >= $1
      AND o.spent_at < $2
      AND o.value > 0
  `, [dayStart, dayEnd]);

  const h = hodl.rows[0];
  const c = cddResult.rows[0];

  return {
    lt_1m: BigInt(h.lt_1m || 0),
    b_1_3m: BigInt(h.b_1_3m || 0),
    b_3_6m: BigInt(h.b_3_6m || 0),
    b_6_12m: BigInt(h.b_6_12m || 0),
    b_1_2y: BigInt(h.b_1_2y || 0),
    gt_2y: BigInt(h.gt_2y || 0),
    total: BigInt(h.total || 0),
    utxo_count: parseInt(h.utxo_count) || 0,
    cdd: parseFloat(c.cdd) || 0,
    avg_dormancy: parseFloat(c.avg_dormancy) || 0,
    spent_count: parseInt(c.spent_count) || 0,
  };
}

async function run() {
  const client = await pool.connect();
  try {
    const lockResult = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [LOCK_ID]);
    if (!lockResult.rows[0].acquired) {
      log('Another instance running — exiting.');
      return;
    }

    const today = new Date();

    for (let d = 0; d < BACKFILL_DAYS; d++) {
      const target = new Date(today);
      target.setDate(target.getDate() - d);
      const dateStr = target.toISOString().slice(0, 10);

      log(`Processing ${dateStr}...`);
      const start = Date.now();
      const result = await computeForDate(client, dateStr);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);

      await client.query(`
        INSERT INTO utxo_age_daily (
          date, lt_1m_zat, b_1_3m_zat, b_3_6m_zat, b_6_12m_zat, b_1_2y_zat, gt_2y_zat,
          total_unspent_zat, utxo_count, cdd, avg_dormancy_days, spent_count
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (date) DO UPDATE SET
          lt_1m_zat = EXCLUDED.lt_1m_zat,
          b_1_3m_zat = EXCLUDED.b_1_3m_zat,
          b_3_6m_zat = EXCLUDED.b_3_6m_zat,
          b_6_12m_zat = EXCLUDED.b_6_12m_zat,
          b_1_2y_zat = EXCLUDED.b_1_2y_zat,
          gt_2y_zat = EXCLUDED.gt_2y_zat,
          total_unspent_zat = EXCLUDED.total_unspent_zat,
          utxo_count = EXCLUDED.utxo_count,
          cdd = EXCLUDED.cdd,
          avg_dormancy_days = EXCLUDED.avg_dormancy_days,
          spent_count = EXCLUDED.spent_count,
          created_at = NOW()
      `, [
        dateStr,
        result.lt_1m.toString(), result.b_1_3m.toString(), result.b_3_6m.toString(),
        result.b_6_12m.toString(), result.b_1_2y.toString(), result.gt_2y.toString(),
        result.total.toString(), result.utxo_count,
        result.cdd, result.avg_dormancy, result.spent_count,
      ]);

      const totalZec = Number(result.total) / 1e8;
      log(`  ${dateStr}: ${totalZec.toFixed(0)} ZEC across ${result.utxo_count.toLocaleString()} UTXOs, CDD=${result.cdd.toFixed(0)}, ${elapsed}s`);
    }

    log(`Done. Processed ${BACKFILL_DAYS} day(s).`);
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]);
  } catch (err) {
    log(`ERROR: ${err.message}`);
    try { await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]); } catch {}
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
