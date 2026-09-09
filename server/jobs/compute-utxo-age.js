#!/usr/bin/env node
'use strict';

// Completed UTC-day transparent HODL waves/CDD. Default: repair the last seven
// completed days; --days=N or --from=YYYY-MM-DD --to=YYYY-MM-DD (max 366 days).
const { log, loadEnv, withAdvisoryLock } = require('../lib/job-utils');
const { selectDays, parseDay, computeDays, CURRENT_UNSPENT_SQL, RECENT_SPENDS_SQL } = require('../lib/utxo-age');

async function run(args = process.argv.slice(2)) {
  const dates = selectDays(args);
  loadEnv(__dirname);
  const { getPool, getReadPool } = require('../lib/db-pool');
  const pool = getPool({ max: 2, statement_timeout: 180000, query_timeout: 185000 });
  // This bounded daily analytics scan legitimately exceeds the shared 30s API
  // budget. No global timeouts are changed. Reads use one consistent snapshot.
  const readPool = getReadPool({ max: 1, statement_timeout: 180000, query_timeout: 185000 });
  const client = await pool.connect();
  try {
    await withAdvisoryLock(client, 839302, async () => {
      const reader = await readPool.connect();
      let results, anchor;
      const started = Date.now();
      try {
        await reader.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        await reader.query("SET LOCAL statement_timeout = '180s'");
        await reader.query("SET LOCAL work_mem = '64MB'");
        await reader.query('SET LOCAL max_parallel_workers_per_gather = 2');
        anchor = (await reader.query('SELECT height, hash, timestamp FROM blocks ORDER BY height DESC LIMIT 1')).rows[0];
        const boundary = (parseDay(dates.at(-1)) + 1) * 86400;
        if (!anchor || Number(anchor.timestamp) < boundary) throw new Error('Chain source has not reached the end of the requested UTC day');
        log(`Computing ${dates[0]} through ${dates.at(-1)} at block ${anchor.height}...`);
        const unspent = await reader.query(CURRENT_UNSPENT_SQL);
        const spent = await reader.query(RECENT_SPENDS_SQL, [parseDay(dates[0]) * 86400]);
        results = computeDays(dates, unspent.rows, spent.rows);
        await reader.query('COMMIT');
      } catch (error) {
        await reader.query('ROLLBACK').catch(() => {});
        throw error;
      } finally { reader.release(); }
      await client.query('BEGIN');
      try {
        await client.query("SET LOCAL statement_timeout = '30s'");
        const canonical = await client.query('SELECT 1 FROM blocks WHERE height=$1 AND hash=$2', [anchor.height, anchor.hash]);
        if (!canonical.rowCount) throw new Error('Source chain changed or primary is behind; no snapshots written');
        for (const result of results) {
          const dateStr = result.date;
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

        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      }
      log(`Done. Wrote ${results.length} completed days in ${((Date.now() - started) / 1000).toFixed(3)}s; latest ${dates.at(-1)}.`);
    });
  } finally {
    client.release();
    await pool.end();
    if (readPool !== pool) await readPool.end();
  }
}
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { run };
