#!/usr/bin/env node
/**
 * UTXO Age / HODL Waves + Dormancy Job
 *
 * Computes daily HODL-wave buckets from unspent transparent UTXOs and
 * coin-days-destroyed (CDD) from spent UTXOs.
 *
 * HODL wave buckets: <1m, 1-3m, 3-6m, 6-12m, 1-2y, 2y+
 * CDD = sum over all spent outputs that day of (value_zec * age_days)
 *
 * Writes to utxo_age_daily table (must exist before first run).
 *
 * Modes:
 *   node compute-utxo-age.js              — today only
 *   node compute-utxo-age.js --days=30    — backfill last 30 days
 */

const { log, loadEnv, withAdvisoryLock } = require('../lib/job-utils');
loadEnv(__dirname);

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

async function computeForDate(client, dateStr) {
  const dateEpoch = Math.floor(new Date(dateStr + 'T23:59:59Z').getTime() / 1000);
  const dateTs = new Date(dateStr + 'T23:59:59Z');

  // HODL waves: bucket unspent outputs by age at this date
  // block_time is BIGINT (unix epoch), spent_at is TIMESTAMP
  const hodl = await client.query(`
    WITH unspent_at AS (
      SELECT o.value,
             ($1::bigint - t.block_time) / 86400 AS age_days
      FROM transaction_outputs o
      JOIN transactions t ON o.txid = t.txid
      WHERE t.block_time <= $1::bigint
        AND o.value > 0
        AND (o.spent = FALSE OR o.spent_at > $2::timestamp)
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
  `, [dateEpoch, dateTs]);

  // CDD: coin-days destroyed by spends on this date
  // spent_at is TIMESTAMP — use EXTRACT(EPOCH FROM ...) for arithmetic with BIGINT block_time
  const dayStartTs = new Date(dateStr + 'T00:00:00Z');
  const dayEndTs = new Date(dateStr + 'T23:59:59Z');

  const cddResult = await client.query(`
    SELECT
      COALESCE(SUM((o.value::numeric / 1e8) *
        ((EXTRACT(EPOCH FROM o.spent_at) - t.block_time) / 86400)), 0) AS cdd,
      COALESCE(AVG(
        (EXTRACT(EPOCH FROM o.spent_at) - t.block_time) / 86400), 0) AS avg_dormancy,
      COUNT(*) AS spent_count
    FROM transaction_outputs o
    JOIN transactions t ON o.txid = t.txid
    WHERE o.spent = TRUE
      AND o.spent_at >= $1::timestamp
      AND o.spent_at < $2::timestamp
      AND o.value > 0
  `, [dayStartTs, dayEndTs]);

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
    await withAdvisoryLock(client, LOCK_ID, async (client) => {
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
    });
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
