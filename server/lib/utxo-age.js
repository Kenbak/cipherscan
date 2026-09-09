'use strict';

const DAY_SECONDS = 86400;
const DAY_MS = DAY_SECONDS * 1000;
const BUCKETS = ['lt_1m', 'b_1_3m', 'b_3_6m', 'b_6_12m', 'b_1_2y', 'gt_2y'];

function parseDay(value) {
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value) throw new Error('Expected a valid UTC date (YYYY-MM-DD)');
  return ms / DAY_MS;
}

function selectDays(args = [], now = new Date()) {
  const options = {};
  for (const arg of args) {
    const match = /^--(days|from|to)=(.+)$/.exec(arg);
    if (!match || options[match[1]] !== undefined) throw new Error('Use --days=N or --from=YYYY-MM-DD --to=YYYY-MM-DD');
    options[match[1]] = match[2];
  }
  const yesterday = Math.floor(now.getTime() / DAY_MS) - 1;
  let first, last;
  if (options.from !== undefined || options.to !== undefined) {
    if (!options.from || !options.to || options.days !== undefined) throw new Error('--from and --to must be supplied together, without --days');
    first = parseDay(options.from); last = parseDay(options.to);
  } else {
    const days = options.days === undefined ? 7 : Number(options.days);
    if (!Number.isInteger(days) || days < 1 || days > 366) throw new Error('--days must be between 1 and 366');
    last = yesterday; first = last - days + 1;
  }
  if (first > last || last > yesterday || last - first >= 366) throw new Error('Range must contain 1–366 completed UTC days');
  return Array.from({ length: last - first + 1 }, (_, i) => new Date((first + i) * DAY_MS).toISOString().slice(0, 10));
}

// One scan of the existing partial unspent index, reused for every requested day.
const CURRENT_UNSPENT_SQL = `
  SELECT (t.block_time / 86400)::bigint AS created_day,
         SUM(o.value)::text AS value_zat, COUNT(*)::text AS output_count
  FROM transaction_outputs o JOIN transactions t ON t.txid = o.txid
  WHERE o.spent = FALSE AND o.value > 0
  GROUP BY 1`;

// Materialize only inputs spent since the earliest requested day. This prevents
// a planner reorder into full joins over the entire input/output history.
// The current spent_txid guard excludes obsolete spend links after reorgs.
const RECENT_SPENDS_SQL = `
  WITH recent_inputs AS MATERIALIZED (
    SELECT i.prev_txid, i.prev_vout, i.txid, s.block_time
    FROM transactions s CROSS JOIN LATERAL (
      SELECT prev_txid, prev_vout, txid FROM transaction_inputs
      WHERE txid = s.txid AND prev_txid IS NOT NULL OFFSET 0
    ) i
    WHERE s.block_time >= $1::bigint
  )
  SELECT (origin.block_time / 86400)::bigint AS created_day,
         (r.block_time / 86400)::bigint AS spent_day,
         SUM(o.value)::text AS value_zat, COUNT(*)::text AS output_count,
         SUM((o.value::numeric / 1e8) * (r.block_time - origin.block_time) / 86400.0)::text AS cdd,
         SUM((r.block_time - origin.block_time)::numeric / 86400.0)::text AS dormancy_sum
  FROM recent_inputs r
  CROSS JOIN LATERAL (
    SELECT txid, value FROM transaction_outputs
    WHERE txid = r.prev_txid AND vout_index = r.prev_vout
      AND spent_txid = r.txid AND spent = TRUE AND value > 0 OFFSET 0
  ) o
  CROSS JOIN LATERAL (
    SELECT block_time FROM transactions WHERE txid = o.txid OFFSET 0
  ) origin
  GROUP BY 1, 2`;

function computeDays(dates, unspent, spent) {
  const current = unspent.map(row => ({ ...row, created_day: Number(row.created_day), value: BigInt(row.value_zat), count: BigInt(row.output_count) }));
  const historical = spent.map(row => ({ ...row, created_day: Number(row.created_day), spent_day: Number(row.spent_day), value: BigInt(row.value_zat), count: BigInt(row.output_count) }));
  return dates.map(date => {
    const day = parseDay(date);
    const result = { date, ...Object.fromEntries(BUCKETS.map(key => [key, 0n])), total: 0n, utxo_count: 0n, cdd: 0, avg_dormancy: 0, spent_count: 0n };
    let dormancySum = 0;
    function include(row) {
      // Age at the last included second (23:59:59 UTC). Date grouping is exact
      // because chain block_time is integer seconds. Creation at next midnight
      // is excluded; a spend at next midnight still belongs to this snapshot.
      const age = day - row.created_day;
      if (age < 0) return;
      const bucket = age < 30 ? 0 : age < 90 ? 1 : age < 180 ? 2 : age < 365 ? 3 : age < 730 ? 4 : 5;
      result[BUCKETS[bucket]] += row.value;
      result.total += row.value; result.utxo_count += row.count;
    }
    current.forEach(include);
    for (const row of historical) {
      if (row.spent_day > day) include(row);
      if (row.spent_day === day) {
        result.cdd += Number(row.cdd);
        dormancySum += Number(row.dormancy_sum);
        result.spent_count += row.count;
      }
    }
    if (result.spent_count) result.avg_dormancy = dormancySum / Number(result.spent_count);
    if (!Number.isFinite(result.cdd) || !Number.isFinite(result.avg_dormancy)) throw new Error('Non-finite dormancy result');
    return result;
  });
}

module.exports = { DAY_SECONDS, selectDays, parseDay, computeDays, CURRENT_UNSPENT_SQL, RECENT_SPENDS_SQL };
