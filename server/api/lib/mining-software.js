const { SOFTWARE_LABELS } = require("../../../lib/mining-software");
const { POOL_BY_ADDRESS, POOL_BY_TAG, getPoolTagSql } = require("../mining-pools");
const pools = [
  ...new Set(
    [...Object.values(POOL_BY_ADDRESS), ...Object.values(POOL_BY_TAG)]
      .filter((p) => p.name && !p.isFundingStream)
      .map((p) => p.name),
  ),
].sort();
class SoftwareQueryError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
function dateDay(value, name) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new SoftwareQueryError(`${name} must be a UTC date (YYYY-MM-DD)`);
  const time = Date.parse(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(time) ||
    new Date(time).toISOString().slice(0, 10) !== value
  )
    throw new SoftwareQueryError(`${name} is not a valid date`);
  return time / 86400000;
}
function integer(value, name) {
  if (
    typeof value !== "string" ||
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) > 2147483647
  )
    throw new SoftwareQueryError(`${name} must be a non-negative block height`);
  return Number(value);
}
const metricColumns = {
  interval: '(b.timestamp-parent.timestamp)',
  size: 'b.size',
  fees: 'b.total_fees',
  txs: 'b.transaction_count',
};
function metricValue(value, name, fees) {
  if (typeof value !== 'string' || !(fees ? /^\d{1,8}(?:\.\d{1,8})?$/ : /^\d{1,10}$/).test(value))
    throw new SoftwareQueryError(`${name} must be a non-negative ${fees ? 'ZEC amount with at most 8 decimals' : 'integer'}`);
  if (fees) {
    const [whole, fraction = ''] = value.split('.');
    const zats = BigInt(whole) * 100000000n + BigInt(fraction.padEnd(8, '0'));
    if (zats > 2100000000000000n) throw new SoftwareQueryError(`${name} exceeds 21 million ZEC`);
    return zats.toString();
  }
  const n = Number(value);
  if (n > 2147483647) throw new SoftwareQueryError(`${name} is too large`);
  return n;
}
function parseBlockFilters(query) {
  const {
    software = "all",
    pool: poolName = "all",
    order = "newest",
    from,
    to,
    min_height,
    max_height,
  } = query;
  if (software !== "all" && !Object.hasOwn(SOFTWARE_LABELS, software))
    throw new SoftwareQueryError("Invalid software filter");
  if (
    poolName !== "all" &&
    poolName !== "unattributed" &&
    !pools.includes(poolName)
  )
    throw new SoftwareQueryError("Invalid pool filter");
  if (!["newest", "oldest", ...Object.keys(metricColumns).flatMap(key => [`${key}_asc`, `${key}_desc`])].includes(order))
    throw new SoftwareQueryError("Invalid block sort order");
  const start = from ? dateDay(from, "from") * 86400 : null;
  const end = to ? (dateDay(to, "to") + 1) * 86400 : null;
  const min =
    min_height !== undefined && min_height !== ""
      ? integer(min_height, "min_height")
      : null;
  const max =
    max_height !== undefined && max_height !== ""
      ? integer(max_height, "max_height")
      : null;
  if (start !== null && end !== null && start >= end)
    throw new SoftwareQueryError("from must not be after to");
  if (min !== null && max !== null && min > max)
    throw new SoftwareQueryError("min_height must not exceed max_height");
  const metrics = {};
  for (const metric of Object.keys(metricColumns)) {
    for (const bound of ['min', 'max']) {
      const key = `${bound}_${metric}`;
      if (query[key] !== undefined && query[key] !== '') metrics[key] = metricValue(query[key], key, metric === 'fees');
    }
    if (metrics[`min_${metric}`] !== undefined && metrics[`max_${metric}`] !== undefined && BigInt(metrics[`min_${metric}`]) > BigInt(metrics[`max_${metric}`]))
      throw new SoftwareQueryError(`min_${metric} must not exceed max_${metric}`);
  }
  return { software, poolName, order, start, end, min, max, metrics };
}
async function requireReady(pool) {
  let result;
  try {
    result = await pool.query(
      "SELECT ready FROM block_software_state WHERE version=1",
    );
  } catch (error) {
    if (error.code === "42P01")
      throw new SoftwareQueryError(
        "Mining software history is not available yet",
        503,
      );
    throw error;
  }
  if (!result.rows[0]?.ready)
    throw new SoftwareQueryError(
      "Mining software history is being indexed",
      503,
    );
}
function whereFilters(filters) {
  const values = [];
  const clauses = [];
  const bind = (value) => {
    values.push(value);
    return `$${values.length}`;
  };
  if (filters.software !== "all")
    clauses.push(`s.software=${bind(filters.software)}`);
  if (filters.start !== null)
    clauses.push(`s.timestamp>=${bind(filters.start)}`);
  if (filters.end !== null) clauses.push(`s.timestamp<${bind(filters.end)}`);
  if (filters.min !== null) clauses.push(`s.height>=${bind(filters.min)}`);
  if (filters.max !== null) clauses.push(`s.height<=${bind(filters.max)}`);
  if (filters.poolName !== "all") {
    const addresses = Object.entries(POOL_BY_ADDRESS)
      .filter(
        ([, p]) =>
          p.name &&
          !p.isFundingStream &&
          (filters.poolName === "unattributed" || p.name === filters.poolName),
      )
      .map(([a]) => a);
    const knownAddresses = Object.entries(POOL_BY_ADDRESS)
      .filter(([, p]) => p.name && !p.isFundingStream).map(([a]) => a);
    const tag = Object.entries(POOL_BY_TAG).find(([, p]) => p.name === filters.poolName)?.[0];
    if (filters.poolName === "unattributed" || tag) {
      clauses.push(`(b.miner_address IS NULL OR NOT (b.miner_address=ANY(${bind(knownAddresses)}::text[])))`);
      clauses.push(tag ? `(${getPoolTagSql('b.coinbase_hex')})=${bind(tag)}` : `(${getPoolTagSql('b.coinbase_hex')}) IS NULL`);
    } else {
      clauses.push(`b.miner_address=ANY(${bind(addresses)}::text[])`);
    }
  }
  for (const [metric, column] of Object.entries(metricColumns)) {
    for (const [bound, operator] of [['min', '>='], ['max', '<=']]) {
      const value = filters.metrics?.[`${bound}_${metric}`];
      if (value !== undefined) clauses.push(`${column}${operator}${bind(value)}`);
    }
  }
  return { values, clauses };
}
async function filteredBlocks(pool, filters, { limit, cursor, direction }) {
  await requireReady(pool);
  const { values, clauses } = whereFilters(filters);
  const baseWhere = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const hasMetrics = Object.keys(filters.metrics || {}).length > 0;
  const hasInterval = filters.metrics?.min_interval !== undefined || filters.metrics?.max_interval !== undefined;
  const countJoin = filters.poolName !== 'all' || hasMetrics ? 'JOIN blocks b USING(height)' : '';
  const parentJoin = hasInterval ? 'LEFT JOIN blocks parent ON parent.height=b.height-1' : '';
  let countSql = `SELECT count(*)::int AS count FROM block_software s ${countJoin} ${parentJoin} ${baseWhere}`;
  if (
    filters.poolName === "all" &&
    !hasMetrics &&
    filters.min === null &&
    filters.max === null
  ) {
    // Whole UTC-day ranges can count the small reorg-aware aggregate, not blocks.
    const dailyWhere = clauses.map((clause) =>
      clause
        .replace("s.software", "software")
        .replace(/s.timestamp([<>]=?)(\$\d+)/, "day$1($2::bigint/86400)"),
    );
    countSql = `SELECT COALESCE(sum(blocks),0)::int AS count FROM block_software_daily ${dailyWhere.length ? `WHERE ${dailyWhere.join(" AND ")}` : ""}`;
  }
  const sortMetric = Object.keys(metricColumns).find(key => filters.order.startsWith(`${key}_`));
  const ascending = filters.order === "oldest" || filters.order.endsWith('_asc');
  // Keep unavailable values last in either direction; height breaks metric ties.
  const sortExpression = sortMetric ? `COALESCE(${metricColumns[sortMetric]},'${ascending ? '9223372036854775807' : '-9223372036854775808'}'::bigint)` : 's.height';
  const displayOrder = `${sortMetric ? '_sort ' + (ascending ? 'ASC' : 'DESC') + ',' : ''}height ${ascending ? 'ASC' : 'DESC'}`;
  let anchorCte = '';
  let anchorCheck = 'true';
  const backwards = direction === "prev";
  const scanAscending = ascending !== backwards;
  if (cursor !== null) {
    values.push(cursor);
    if (sortMetric) {
      anchorCte = `anchor AS (SELECT ${sortExpression} AS value FROM blocks b LEFT JOIN blocks parent ON parent.height=b.height-1 WHERE b.height=$${values.length}),`;
      anchorCheck = 'EXISTS(SELECT 1 FROM anchor)';
      clauses.push(`(${sortExpression},s.height) ${scanAscending ? '>' : '<'} ((SELECT value FROM anchor),$${values.length})`);
    } else clauses.push(`s.height ${scanAscending ? ">" : "<"} $${values.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  // The count and page use one snapshot. Parent lookup uses the unfiltered chain.
  const result = await pool.query(
    `WITH ${anchorCte}total AS (
    ${countSql}
  ), page AS (
    SELECT b.height,b.hash,b.timestamp,b.transaction_count,b.size,b.difficulty,b.miner_address,b.coinbase_hex,b.total_fees,
      s.software,(b.timestamp-parent.timestamp)::int AS "intervalSeconds",${sortExpression} AS _sort
    FROM block_software s JOIN blocks b USING(height) LEFT JOIN blocks parent ON parent.height=b.height-1
    ${where} ORDER BY ${sortExpression} ${scanAscending ? "ASC" : "DESC"},s.height ${scanAscending ? "ASC" : "DESC"} LIMIT $${values.length + 1}
  ) SELECT ${anchorCheck} AS anchor_available,total.count, COALESCE((SELECT json_agg(page ORDER BY ${displayOrder}) FROM page),'[]'::json) AS blocks FROM total`,
    [...values, limit],
  );
  if (!result.rows[0].anchor_available) throw new SoftwareQueryError('The cursor block is no longer available; restart pagination.');
  const rows = result.rows[0].blocks.map(({_sort, ...block}) => block);
  return {
    success: true,
    blocks: rows,
    pagination: {
      total: result.rows[0].count,
      limit,
      hasNext: rows.length === limit,
      hasPrev: cursor !== null,
      nextCursor: rows.at(-1)?.height ?? null,
      prevCursor: rows[0]?.height ?? null,
    },
  };
}
const isoDay = (day) => new Date(day * 86400000).toISOString().slice(0, 10);
async function softwareHistory(pool, query, now = Date.now()) {
  const { period = "30d", from, to, bucket = "auto" } = query;
  if (
    ![
      "7d",
      "30d",
      "90d",
      "1y",
      "all",
      "custom",
      "since-zebra",
      "since-zakura",
    ].includes(period)
  )
    throw new SoftwareQueryError("Invalid period");
  if (!["auto", "day", "week"].includes(bucket))
    throw new SoftwareQueryError("bucket must be auto, day or week");
  if (period !== "custom" && (from !== undefined || to !== undefined))
    throw new SoftwareQueryError("from and to require period=custom");
  const customStart = period === "custom" ? dateDay(from, "from") : null;
  const customEnd = period === "custom" ? dateDay(to, "to") : null;
  if (customStart !== null && customStart > customEnd)
    throw new SoftwareQueryError("from must not be after to");
  await requireReady(pool);
  const firsts = await pool.query(
    `SELECT software, (SELECT min(timestamp) FROM block_software s WHERE s.software=categories.software) AS timestamp
    FROM unnest($1::text[]) AS categories(software)`,
    [Object.keys(SOFTWARE_LABELS)],
  );
  const observed = Object.fromEntries(
    firsts.rows.map((r) => [
      r.software,
      r.timestamp === null ? null : Number(r.timestamp),
    ]),
  );
  const bounds =
    await pool.query(`SELECT (SELECT min(height) FROM block_software) AS first_height,(SELECT max(height) FROM block_software) AS last_height,
    (SELECT min(timestamp) FROM block_software) AS first_time,(SELECT max(timestamp) FROM block_software) AS last_time`);
  const b = bounds.rows[0];
  const today = Math.floor(now / 86400000);
  const end = customEnd ?? today;
  let start =
    customStart ??
    (period === "all"
      ? Math.floor(Number(b.first_time ?? now / 1000) / 86400)
      : end - ({ "7d": 7, "30d": 30, "90d": 90, "1y": 365 }[period] ?? 30) + 1);
  if (period.startsWith("since-"))
    start =
      observed[period.slice(6)] === null
        ? end + 1
        : Math.floor(observed[period.slice(6)] / 86400);
  const resolution =
    bucket === "auto" ? (end - start > 120 ? "week" : "day") : bucket;
  if ((end - start) / (resolution === "week" ? 7 : 1) > 6000)
    throw new SoftwareQueryError(
      "Requested range exceeds 6000 chart buckets; use weekly buckets",
    );
  const grouped = await pool.query(
    `SELECT day,software,blocks FROM block_software_daily WHERE day >= $1 AND day <= $2 AND blocks>0 ORDER BY day,software`,
    [start, end],
  );
  const totals = Object.fromEntries(
    Object.keys(SOFTWARE_LABELS).map((k) => [k, 0]),
  );
  const history = new Map();
  for (const row of grouped.rows) {
    const day =
      resolution === "week" ? Math.floor((row.day + 3) / 7) * 7 - 3 : row.day;
    const point = history.get(day) || {
      date: isoDay(day),
      total: 0,
      counts: Object.fromEntries(Object.keys(totals).map((k) => [k, 0])),
    };
    const count = Number(row.blocks);
    totals[row.software] += count;
    point.counts[row.software] += count;
    point.total += count;
    history.set(day, point);
  }
  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  const step = resolution === "week" ? 7 : 1;
  const firstBucket =
    resolution === "week" ? Math.floor((start + 3) / 7) * 7 - 3 : start;
  const points = [];
  for (let day = firstBucket; day <= end; day += step)
    points.push(
      history.get(day) || { date: isoDay(day), total: 0, counts: null },
    );
  return {
    success: true,
    classifierVersion: 1,
    period,
    bucket: resolution,
    from: start <= end ? isoDay(start) : null,
    to: isoDay(end),
    totalBlocks: total,
    categories: Object.entries(totals).map(([software, blocks]) => ({
      software,
      label: SOFTWARE_LABELS[software],
      blocks,
      share: total ? blocks / total : null,
      firstObserved: observed[software],
    })),
    history: points,
    coverage: {
      firstHeight: b.first_height,
      lastHeight: b.last_height,
      firstTimestamp: b.first_time === null ? null : Number(b.first_time),
      lastTimestamp: b.last_time === null ? null : Number(b.last_time),
      coinbaseAvailableBlocks: total - totals.missing,
    },
    pools,
    notes:
      "Self-reported coinbase markers, not authenticated client identity. Unmarked, conflicting and unavailable observations remain in the denominator. Earlier unmarked blocks do not establish zero software usage.",
  };
}
module.exports = {
  parseBlockFilters,
  filteredBlocks,
  softwareHistory,
  SoftwareQueryError,
  pools,
};
