#!/usr/bin/env node
/**
 * Anomaly Detection Job
 *
 * Computes rolling 90-day z-scores for ~12 on-chain metrics.
 * Events with |z| >= 2.5 are stored in `metric_anomalies`.
 * Deduplicates per metric/day.
 *
 * Modes:
 *   node detect-anomalies.js              — today only
 *   node detect-anomalies.js --days=90    — backfill last 90 days
 *
 * Cron (after daily-v3.sh and update-privacy-stats.js):
 *   30 21 * * * cd /root/cipherscan/server/jobs && node detect-anomalies.js >> /var/log/anomaly-detection.log 2>&1
 */

const { log, loadEnv, withAdvisoryLock } = require('../lib/job-utils');
loadEnv(__dirname);

const { getPool, getReadPool } = require('../lib/db-pool');

const pool = getPool({ max: 3 });
// processMetric() below only ever SELECTs; the INSERT ... ON CONFLICT into
// metric_anomalies happens separately in run()'s loop on the primary
// `client`. withAdvisoryLock() here is a session-level pg_advisory_lock
// (mutual exclusion between job runs), not a SQL transaction, so there's no
// BEGIN/COMMIT spanning the read and the write — safe to split across pools.
const readPool = getReadPool({ max: 3 });

const LOCK_ID = 839301;
const DAYS_FLAG = process.argv.find(a => a.startsWith('--days='));
const BACKFILL_DAYS = DAYS_FLAG ? parseInt(DAYS_FLAG.split('=')[1]) : 1;
const LOOKBACK = 90;
const Z_THRESHOLD = 2.5;


// ─── Metric definitions ──────────────────────────────────────────────────────

const METRIC_QUERIES = {
  tx_count_total: `
    SELECT date, (shielded_count + transparent_count) AS value
    FROM privacy_trends_daily
    WHERE date >= $1 AND date <= $2
    ORDER BY date`,

  tx_count_shielded: `
    SELECT date, shielded_count AS value
    FROM privacy_trends_daily
    WHERE date >= $1 AND date <= $2
    ORDER BY date`,

  shielded_pct: `
    SELECT date, shielded_percentage AS value
    FROM privacy_trends_daily
    WHERE date >= $1 AND date <= $2
    ORDER BY date`,

  shield_volume_zat: `
    SELECT DATE(TO_TIMESTAMP(block_time)) AS date,
           COALESCE(SUM(amount_zat), 0) AS value
    FROM shielded_flows
    WHERE flow_type = 'shield'
      AND DATE(TO_TIMESTAMP(block_time)) >= $1
      AND DATE(TO_TIMESTAMP(block_time)) <= $2
    GROUP BY 1 ORDER BY 1`,

  deshield_volume_zat: `
    SELECT DATE(TO_TIMESTAMP(block_time)) AS date,
           COALESCE(SUM(amount_zat), 0) AS value
    FROM shielded_flows
    WHERE flow_type = 'deshield'
      AND DATE(TO_TIMESTAMP(block_time)) >= $1
      AND DATE(TO_TIMESTAMP(block_time)) <= $2
    GROUP BY 1 ORDER BY 1`,

  crosschain_inflow_usd: `
    SELECT day AS date, COALESCE(SUM(volume_usd) FILTER (WHERE direction = 'inflow'), 0) AS value
    FROM mv_crosschain_trends
    WHERE day >= $1 AND day <= $2
    GROUP BY day ORDER BY day`,

  crosschain_outflow_usd: `
    SELECT day AS date, COALESCE(SUM(volume_usd) FILTER (WHERE direction = 'outflow'), 0) AS value
    FROM mv_crosschain_trends
    WHERE day >= $1 AND day <= $2
    GROUP BY day ORDER BY day`,

  daily_fees_zat: `
    SELECT DATE(TO_TIMESTAMP(timestamp)) AS date, SUM(total_fees) AS value
    FROM blocks
    WHERE DATE(TO_TIMESTAMP(timestamp)) >= $1 AND DATE(TO_TIMESTAMP(timestamp)) <= $2
    GROUP BY 1 ORDER BY 1`,

  exchange_deposit_zat: `
    SELECT date, COALESCE(SUM(exchange_zat), 0) AS value
    FROM turnstile_daily
    WHERE date >= $1 AND date <= $2
    GROUP BY date ORDER BY date`,

  mvrv: `
    SELECT date, mvrv AS value
    FROM mvrv_daily
    WHERE date >= $1 AND date <= $2
    ORDER BY date`,

  migration_volume_zat: `
    SELECT DATE(TO_TIMESTAMP(block_time)) AS date,
           SUM(ABS(value_balance_ironwood)) AS value
    FROM transactions
    WHERE version = 6
      AND has_ironwood = true
      AND value_balance_orchard > 0
      AND value_balance_ironwood < 0
      AND vin_count = 0 AND vout_count = 0
      AND DATE(TO_TIMESTAMP(block_time)) >= $1
      AND DATE(TO_TIMESTAMP(block_time)) <= $2
    GROUP BY 1 ORDER BY 1`,

  miner_exchange_ratio: `
    SELECT date,
           CASE WHEN (shielded_zat + exchange_zat + bridge_zat + other_zat) > 0
                THEN exchange_zat::float / (shielded_zat + exchange_zat + bridge_zat + other_zat)
                ELSE 0 END AS value
    FROM (
      SELECT date,
             SUM(shielded_zat) AS shielded_zat,
             SUM(exchange_zat) AS exchange_zat,
             SUM(bridge_zat)   AS bridge_zat,
             SUM(other_zat)    AS other_zat
      FROM miner_destination_daily
      WHERE date >= $1 AND date <= $2
      GROUP BY date
    ) sub
    ORDER BY date`,
};

const METRIC_DESCRIPTIONS = {
  tx_count_total: { up: 'Unusually high transaction volume', down: 'Unusually low transaction volume' },
  tx_count_shielded: { up: 'Spike in shielded transactions', down: 'Drop in shielded transactions' },
  shielded_pct: { up: 'Shielded adoption surge', down: 'Shielded adoption decline' },
  shield_volume_zat: { up: 'Unusually large shielding volume', down: 'Unusually low shielding volume' },
  deshield_volume_zat: { up: 'Unusually large deshielding volume', down: 'Unusually low deshielding volume' },
  crosschain_inflow_usd: { up: 'Cross-chain inflow spike', down: 'Cross-chain inflow decline' },
  crosschain_outflow_usd: { up: 'Cross-chain outflow spike', down: 'Cross-chain outflow decline' },
  daily_fees_zat: { up: 'Fee market surge', down: 'Fee market contraction' },
  exchange_deposit_zat: { up: 'Exchange deposit spike', down: 'Exchange deposit decline' },
  mvrv: { up: 'MVRV ratio spike — potential overvaluation', down: 'MVRV ratio drop — potential undervaluation' },
  migration_volume_zat: { up: 'Ironwood migration surge', down: 'Ironwood migration decline' },
  miner_exchange_ratio: { up: 'Miner-to-exchange sell pressure spike', down: 'Miner-to-exchange sell pressure decline' },
};

const METRIC_UNITS = {
  tx_count_total: 'txs',
  tx_count_shielded: 'txs',
  shielded_pct: '%',
  shield_volume_zat: 'ZEC',
  deshield_volume_zat: 'ZEC',
  crosschain_inflow_usd: 'USD',
  crosschain_outflow_usd: 'USD',
  daily_fees_zat: 'ZEC',
  exchange_deposit_zat: 'ZEC',
  mvrv: 'ratio',
  migration_volume_zat: 'ZEC',
  miner_exchange_ratio: 'ratio',
};

// ─── Core logic ───────────────────────────────────────────────────────────────

function computeZscore(values) {
  if (values.length < 14) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);
  if (std === 0) return null;
  const latest = values[values.length - 1];
  return { zscore: (latest - mean) / std, mean, std, value: latest };
}

function formatValue(metric, value) {
  const unit = METRIC_UNITS[metric];
  if (unit === 'ZEC') return `${(value / 1e8).toFixed(2)} ZEC`;
  if (unit === 'USD') return `$${value.toFixed(0)}`;
  if (unit === '%') return `${value.toFixed(1)}%`;
  if (unit === 'ratio') return value.toFixed(3);
  return value.toFixed(0);
}

async function processMetric(metric, targetDate) {
  const lookbackStart = new Date(targetDate);
  lookbackStart.setDate(lookbackStart.getDate() - LOOKBACK);
  const startStr = lookbackStart.toISOString().slice(0, 10);
  const endStr = targetDate;

  const query = METRIC_QUERIES[metric];
  if (!query) return null;

  let rows;
  try {
    const result = await readPool.query(query, [startStr, endStr]);
    rows = result.rows;
  } catch (err) {
    log(`  [WARN] ${metric}: query failed — ${err.message}`);
    return null;
  }

  if (rows.length < 14) return null;

  const values = rows.map(r => Number(r.value));
  const result = computeZscore(values);
  if (!result) return null;

  if (Math.abs(result.zscore) < Z_THRESHOLD) return null;

  const direction = result.zscore > 0 ? 'up' : 'down';
  const desc = METRIC_DESCRIPTIONS[metric]?.[direction] || `${metric} anomaly (${direction})`;
  const detail = `${formatValue(metric, result.value)} (z=${result.zscore.toFixed(2)}, μ=${formatValue(metric, result.mean)}, σ=${formatValue(metric, result.std)})`;

  return {
    date: targetDate,
    metric,
    value: result.value,
    zscore: result.zscore,
    mean: result.mean,
    std: result.std,
    direction,
    description: desc,
    detail,
  };
}

async function run() {
  const client = await pool.connect();
  try {
    await withAdvisoryLock(client, LOCK_ID, async (client) => {
      const metrics = Object.keys(METRIC_QUERIES);
      const today = new Date();
      let totalInserted = 0;

      for (let d = 0; d < BACKFILL_DAYS; d++) {
        const target = new Date(today);
        target.setDate(target.getDate() - d);
        const dateStr = target.toISOString().slice(0, 10);

        let dayInserted = 0;
        for (const metric of metrics) {
          const anomaly = await processMetric(metric, dateStr);
          if (!anomaly) continue;

          await client.query(`
            INSERT INTO metric_anomalies (date, metric, value, zscore, mean, std, direction, description, detail)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (date, metric) DO UPDATE SET
              value = EXCLUDED.value,
              zscore = EXCLUDED.zscore,
              mean = EXCLUDED.mean,
              std = EXCLUDED.std,
              direction = EXCLUDED.direction,
              description = EXCLUDED.description,
              detail = EXCLUDED.detail,
              created_at = NOW()
          `, [
            anomaly.date, anomaly.metric, anomaly.value, anomaly.zscore,
            anomaly.mean, anomaly.std, anomaly.direction, anomaly.description, anomaly.detail,
          ]);
          dayInserted++;
        }

        if (dayInserted > 0) {
          log(`${dateStr}: ${dayInserted} anomalies detected`);
        }
        totalInserted += dayInserted;
      }

      log(`Done. ${totalInserted} anomalies inserted/updated across ${BACKFILL_DAYS} day(s).`);
    });
  } finally {
    client.release();
    await pool.end();
    if (readPool !== pool) await readPool.end();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
