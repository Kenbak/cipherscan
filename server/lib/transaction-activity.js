'use strict';

// Count transactions once, even when they touch multiple pools. Never count
// actions, notes, users or payments. Coinbase is excluded from both categories.
const SHIELDED = '(COALESCE(has_sprout,false) OR COALESCE(has_sapling,false) OR COALESCE(has_orchard,false) OR COALESCE(has_ironwood,false))';
const DAY_MS = 86400000;
const HISTORY_START = '2016-10-31'; // First complete Monday–Sunday mainnet week.

function day(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid UTC date: ${value}`);
  }
  return value;
}
function addDays(value, n) {
  return new Date(Date.parse(`${day(value)}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

const DAILY_SQL = `
WITH tx AS (
  SELECT (to_timestamp(block_time) AT TIME ZONE 'UTC')::date AS date,
    count(*) AS indexed,
    count(*) FILTER (WHERE NOT is_coinbase AND ${SHIELDED}) AS shielded,
    count(*) FILTER (WHERE NOT is_coinbase AND NOT ${SHIELDED}) AS transparent,
    count(*) FILTER (WHERE NOT is_coinbase AND ${SHIELDED} AND vin_count=0 AND vout_count=0) AS fully_shielded
  FROM transactions WHERE block_time >= $1 AND block_time < $2 GROUP BY 1
), chain AS (
  SELECT (to_timestamp(timestamp) AT TIME ZONE 'UTC')::date AS date,
    sum(transaction_count) AS expected
  FROM blocks WHERE timestamp >= $1 AND timestamp < $2 GROUP BY 1
)
SELECT d::date::text AS date, COALESCE(tx.shielded,0) AS shielded,
  COALESCE(tx.transparent,0) AS transparent, COALESCE(tx.fully_shielded,0) AS fully_shielded,
  COALESCE(tx.indexed,0) AS indexed, COALESCE(chain.expected,0) AS expected
FROM generate_series(($3::date)::timestamp, (($4::date)-1)::timestamp, interval '1 day') d
LEFT JOIN tx ON tx.date=d::date LEFT JOIN chain ON chain.date=d::date ORDER BY d`;

async function readActivity(pool, start, end, { now = new Date(), requireGenesis = false } = {}) {
  day(start); day(end);
  if (start >= end || end > addDays(now.toISOString().slice(0, 10), 1)) throw new Error('Invalid activity interval');
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const { rows: [tip] } = await client.query('SELECT height, hash, timestamp FROM blocks ORDER BY height DESC LIMIT 1');
    if (!tip || Number(tip.timestamp) < now.getTime() / 1000 - 1800 || Number(tip.timestamp) > now.getTime() / 1000 + 7200) {
      throw new Error('Indexed chain tip is unavailable or stale; activity is not authoritative');
    }
    if (requireGenesis) {
      const { rows: [coverage] } = await client.query('SELECT min(height) AS first, max(height) AS last, count(*) AS count FROM blocks');
      if (Number(coverage.first) !== 0 || Number(coverage.count) !== Number(coverage.last) + 1) {
        throw new Error('Incomplete block history; historical ranking unavailable');
      }
    }
    const { rows } = await client.query(DAILY_SQL, [
      Date.parse(`${start}T00:00:00Z`) / 1000, Date.parse(`${end}T00:00:00Z`) / 1000, start, end,
    ]);
    const days = rows.map(row => {
      const result = { date: row.date };
      for (const key of ['shielded', 'transparent', 'fully_shielded', 'indexed', 'expected']) {
        result[key] = Number(row[key]);
        if (!Number.isSafeInteger(result[key]) || result[key] < 0) throw new Error(`Invalid ${key} for ${row.date}`);
      }
      if (result.indexed !== result.expected) throw new Error(`Incomplete transaction indexing for ${row.date}`);
      if (result.fully_shielded > result.shielded || result.shielded + result.transparent > result.indexed) throw new Error('Invalid transaction classification');
      return result;
    });
    await client.query('COMMIT');
    return { days, tip: { height: Number(tip.height), hash: tip.hash, timestamp: Number(tip.timestamp) }, capturedAt: now.toISOString() };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Repair counts only: historical balance/score observations must not be replaced
// with today's RPC values. Missing snapshot rows need the separate snapshot repair.
async function repairTrendCounts(client, days) {
  const { rows } = await client.query(`
    UPDATE privacy_trends_daily p SET shielded_count=d.shielded,
      transparent_count=d.transparent,
      shielded_percentage=CASE WHEN d.shielded+d.transparent=0 THEN 0
        ELSE 100.0*d.shielded/(d.shielded+d.transparent) END
    FROM jsonb_to_recordset($1::jsonb) AS d(date date, shielded bigint, transparent bigint)
    WHERE p.date=d.date RETURNING p.date::text`, [JSON.stringify(days)]);
  return rows.length;
}

module.exports = { SHIELDED, HISTORY_START, DAILY_SQL, day, addDays, readActivity, repairTrendCounts };
