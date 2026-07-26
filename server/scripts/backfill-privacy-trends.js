#!/usr/bin/env node
/**
 * Backfill privacy_trends_daily for the past N days with Privacy Score v2.
 *
 * Usage:
 *   node backfill-privacy-trends.js [--days=365] [--skip-rpc] [--exact]
 *
 * v2 score components per day (end of UTC day):
 *   Usage/Quality — rolling 30-day tx counts (non-coinbase denom)
 *   Hygiene       — rolling 90-day turnstile reshield / deshielded ZEC
 *   Depth         — shielded pool / chain supply at end-of-day block (Zebra RPC)
 *
 * Default rolling windows use calendar-day aggregates (fast, one DB pass).
 * --exact uses timestamp-based 30d windows via fetchPrivacyScoreInputsAsOf (slower).
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../jobs/.env') });
require('dotenv').config({ path: path.join(__dirname, '../api/.env') });

const { Pool } = require('pg');
const {
  calculatePrivacyScore,
  computeScoreInputsFromCounts,
  fetchPrivacyScoreInputsAsOf,
} = require('../lib/privacy-score');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 3,
});

const DAYS = parseInt(process.argv.find((a) => a.startsWith('--days='))?.split('=')[1] || '30', 10);
const SKIP_RPC = process.argv.includes('--skip-rpc');
const EXACT_WINDOWS = process.argv.includes('--exact');
const ZEBRA_RPC_URL = process.env.ZEBRA_RPC_URL || 'http://127.0.0.1:8232';
const ZEBRA_COOKIE_FILE = process.env.ZEBRA_RPC_COOKIE_FILE || '/root/.cache/zebra/.cookie';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function addDays(dateStr, delta) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function dateRange(startDate, endDate) {
  const out = [];
  let cur = startDate;
  while (cur <= endDate) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

function getRpcHeaders() {
  let auth = '';
  try {
    const cookie = fs.readFileSync(ZEBRA_COOKIE_FILE, 'utf8').trim();
    auth = `Basic ${Buffer.from(cookie).toString('base64')}`;
  } catch {
    // cookie optional when RPC auth is disabled
  }
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = auth;
  return headers;
}

async function rpcCall(method, params) {
  const response = await fetch(ZEBRA_RPC_URL, {
    method: 'POST',
    headers: getRpcHeaders(),
    body: JSON.stringify({ jsonrpc: '2.0', id: '1', method, params }),
  });
  const data = await response.json();
  if (data.error) throw new Error(`RPC ${method}: ${data.error.message}`);
  return data.result;
}

function parsePoolsFromResult(info) {
  let shieldedPoolSize = 0;
  let chainSupply = 0;
  let sproutPool = 0;
  let saplingPool = 0;
  let orchardPool = 0;
  let ironwoodPool = 0;
  let transparentPool = 0;

  for (const p of info.valuePools || []) {
    const val = parseInt(p.chainValueZat, 10) || 0;
    if (p.id === 'sprout') sproutPool = val;
    else if (p.id === 'sapling') saplingPool = val;
    else if (p.id === 'orchard') orchardPool = val;
    else if (p.id === 'ironwood') ironwoodPool = val;
    else if (p.id === 'transparent') transparentPool = val;
    if (p.id !== 'transparent' && p.id !== 'lockbox') shieldedPoolSize += val;
  }
  if (info.chainSupply) chainSupply = parseInt(info.chainSupply.chainValueZat, 10) || 0;
  return {
    shieldedPoolSize,
    chainSupply,
    sproutPool,
    saplingPool,
    orchardPool,
    ironwoodPool,
    transparentPool,
  };
}

async function getPoolSize() {
  const info = await rpcCall('getblockchaininfo', []);
  return parsePoolsFromResult(info);
}

async function getPoolSizeAtHeight(height) {
  const block = await rpcCall('getblock', [String(height), 1]);
  return parsePoolsFromResult(block);
}

async function fetchDailyTxRollups(poolClient, startDate, endDate) {
  const startTs = Math.floor(new Date(`${startDate}T00:00:00Z`).getTime() / 1000);
  const endTs = Math.floor(new Date(`${endDate}T23:59:59Z`).getTime() / 1000);

  const result = await poolClient.query(
    `
    SELECT
      (to_timestamp(block_time) AT TIME ZONE 'UTC')::date::text AS day,
      COUNT(*) FILTER (WHERE has_sapling OR has_orchard OR has_ironwood) AS shielded,
      COUNT(*) FILTER (
        WHERE NOT is_coinbase
          AND NOT has_sapling AND NOT has_orchard AND NOT has_ironwood
      ) AS transparent,
      COUNT(*) FILTER (
        WHERE (has_sapling OR has_orchard OR has_ironwood)
          AND vin_count = 0 AND vout_count = 0
          AND NOT is_coinbase
      ) AS fully_shielded,
      MAX(block_height) AS max_height
    FROM transactions
    WHERE block_height > 0
      AND block_time >= $1
      AND block_time <= $2
    GROUP BY 1
    ORDER BY 1
  `,
    [startTs, endTs],
  );

  const byDay = new Map();
  for (const row of result.rows) {
    byDay.set(row.day, {
      shielded: parseInt(row.shielded, 10) || 0,
      transparent: parseInt(row.transparent, 10) || 0,
      fullyShielded: parseInt(row.fully_shielded, 10) || 0,
      maxHeight: parseInt(row.max_height, 10) || 0,
    });
  }
  return byDay;
}

async function fetchTurnstileByDay(poolClient, startDate, endDate) {
  const byDay = new Map();
  try {
    const result = await poolClient.query(
      `
      SELECT
        date::text AS day,
        COALESCE(SUM(deshielded_zat), 0)::bigint AS deshielded,
        COALESCE(SUM(reshielded_zat), 0)::bigint AS reshielded
      FROM turnstile_daily
      WHERE date >= $1::date AND date <= $2::date
      GROUP BY date
      ORDER BY date
    `,
      [startDate, endDate],
    );
    for (const row of result.rows) {
      byDay.set(row.day, {
        deshielded: Number(row.deshielded) || 0,
        reshielded: Number(row.reshielded) || 0,
      });
    }
  } catch {
    // turnstile_daily may be absent on older deployments
  }
  return byDay;
}

function sumRollupsForWindow(rollupByDay, endDate, windowDays) {
  let shielded = 0;
  let transparent = 0;
  let fullyShielded = 0;
  for (let i = 0; i < windowDays; i += 1) {
    const row = rollupByDay.get(addDays(endDate, -i));
    if (!row) continue;
    shielded += row.shielded;
    transparent += row.transparent;
    fullyShielded += row.fullyShielded;
  }
  return { shielded, transparent, fullyShielded };
}

function sumTurnstileForWindow(turnstileByDay, endDate, windowDays) {
  let deshielded = 0;
  let reshielded = 0;
  for (let i = 0; i < windowDays; i += 1) {
    const row = turnstileByDay.get(addDays(endDate, -i));
    if (!row) continue;
    deshielded += row.deshielded;
    reshielded += row.reshielded;
  }
  return { deshielded, reshielded };
}

function computeScoreForDay({
  dateStr,
  rollupByDay,
  turnstileByDay,
  pools,
  exactInputs,
}) {
  const dayRow = rollupByDay.get(dateStr) || {
    shielded: 0,
    transparent: 0,
    fullyShielded: 0,
    maxHeight: 0,
  };
  const shieldedCount = dayRow.shielded;
  const transparentCount = dayRow.transparent;
  const totalCount = shieldedCount + transparentCount;
  const shieldedPercentage = totalCount > 0 ? (shieldedCount / totalCount) * 100 : 0;

  const supplyShieldedPercent =
    pools.chainSupply > 0 ? (pools.shieldedPoolSize / pools.chainSupply) * 100 : 0;

  let scoreInputs;
  if (exactInputs) {
    scoreInputs = {
      ...exactInputs,
      supplyShieldedPercent,
    };
  } else {
    const tx30d = sumRollupsForWindow(rollupByDay, dateStr, 30);
    const turnstile90d = sumTurnstileForWindow(turnstileByDay, dateStr, 90);
    scoreInputs = computeScoreInputsFromCounts({
      shielded30d: tx30d.shielded,
      transparent30d: tx30d.transparent,
      fullyShielded30d: tx30d.fullyShielded,
      deshielded90dZat: turnstile90d.deshielded,
      reshielded90dZat: turnstile90d.reshielded,
      supplyShieldedPercent,
    });
  }

  const privacyScore = calculatePrivacyScore(scoreInputs).total;

  return {
    shieldedCount,
    transparentCount,
    shieldedPercentage,
    maxHeight: dayRow.maxHeight,
    privacyScore,
    scoreInputs,
    pools,
  };
}

async function loadExistingPools(poolClient, dateStr) {
  const existing = await poolClient.query(
    `
    SELECT
      pool_size, chain_supply,
      sprout_pool_size, sapling_pool_size, orchard_pool_size,
      ironwood_pool_size, transparent_pool_size
    FROM privacy_trends_daily
    WHERE date = $1::date
  `,
    [dateStr],
  );
  if (existing.rows.length === 0) return null;
  const row = existing.rows[0];
  const chainSupply = Number(row.chain_supply) || 0;
  const shieldedPoolSize = Number(row.pool_size) || 0;
  return {
    shieldedPoolSize,
    chainSupply,
    sproutPool: Number(row.sprout_pool_size) || 0,
    saplingPool: Number(row.sapling_pool_size) || 0,
    orchardPool: Number(row.orchard_pool_size) || 0,
    ironwoodPool: Number(row.ironwood_pool_size) || 0,
    transparentPool: Number(row.transparent_pool_size) || 0,
  };
}

async function upsertTrendRow(poolClient, dateStr, computed) {
  const {
    shieldedCount,
    transparentCount,
    shieldedPercentage,
    privacyScore,
    pools,
  } = computed;

  const existing = await poolClient.query('SELECT id FROM privacy_trends_daily WHERE date = $1', [dateStr]);

  if (existing.rows.length > 0) {
    await poolClient.query(
      `
      UPDATE privacy_trends_daily SET
        shielded_count = $2, transparent_count = $3, shielded_percentage = $4,
        pool_size = $5, privacy_score = $6,
        sprout_pool_size = $7, sapling_pool_size = $8, orchard_pool_size = $9,
        ironwood_pool_size = $10, transparent_pool_size = $11, chain_supply = $12
      WHERE date = $1
    `,
      [
        dateStr,
        shieldedCount,
        transparentCount,
        shieldedPercentage,
        pools.shieldedPoolSize,
        privacyScore,
        pools.sproutPool,
        pools.saplingPool,
        pools.orchardPool,
        pools.ironwoodPool,
        pools.transparentPool,
        pools.chainSupply,
      ],
    );
    return 'updated';
  }

  await poolClient.query(
    `
    INSERT INTO privacy_trends_daily (
      date, shielded_count, transparent_count, shielded_percentage, pool_size, privacy_score,
      sprout_pool_size, sapling_pool_size, orchard_pool_size, ironwood_pool_size,
      transparent_pool_size, chain_supply, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
  `,
    [
      dateStr,
      shieldedCount,
      transparentCount,
      shieldedPercentage,
      pools.shieldedPoolSize,
      privacyScore,
      pools.sproutPool,
      pools.saplingPool,
      pools.orchardPool,
      pools.ironwoodPool,
      pools.transparentPool,
      pools.chainSupply,
    ],
  );
  return 'inserted';
}

async function main() {
  log(`=== Backfilling privacy_trends_daily (${DAYS} days, v2 rolling score) ===`);
  if (SKIP_RPC) log('  --skip-rpc: reusing stored pool columns when available');
  if (EXACT_WINDOWS) log('  --exact: timestamp-based 30d tx windows (slower)');

  await pool.query('SELECT 1');
  log('Database connected');

  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = addDays(endDate, -(DAYS - 1));
  const rollupStart = addDays(startDate, -89);
  const turnstileStart = addDays(startDate, -89);

  log(`Range: ${startDate} → ${endDate}`);
  log('Fetching daily tx rollups...');
  const rollupByDay = await fetchDailyTxRollups(pool, rollupStart, endDate);
  log(`  ${rollupByDay.size} days with tx activity in rollup window`);

  log('Fetching turnstile daily...');
  const turnstileByDay = await fetchTurnstileByDay(pool, turnstileStart, endDate);
  log(`  ${turnstileByDay.size} days with turnstile data`);

  let currentPools = null;
  if (!SKIP_RPC) {
    currentPools = await getPoolSize();
    log(
      `Current pool: ${(currentPools.shieldedPoolSize / 1e8).toFixed(2)} ZEC shielded / ${(currentPools.chainSupply / 1e8).toFixed(2)} ZEC total`,
    );
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const dateStr of dateRange(startDate, endDate)) {
    const dayRow = rollupByDay.get(dateStr);
    if (!dayRow || (dayRow.shielded + dayRow.transparent === 0)) {
      log(`  ${dateStr}: no transactions, skipping`);
      skipped += 1;
      continue;
    }

    let pools = currentPools;
    if (SKIP_RPC) {
      pools = await loadExistingPools(pool, dateStr);
      if (!pools || pools.chainSupply <= 0) {
        log(`  ${dateStr}: no stored pool data (--skip-rpc), skipping`);
        skipped += 1;
        continue;
      }
    } else if (dayRow.maxHeight > 0) {
      try {
        pools = await getPoolSizeAtHeight(dayRow.maxHeight);
      } catch (err) {
        log(`  ${dateStr}: RPC failed for height ${dayRow.maxHeight}, using current: ${err.message}`);
        pools = currentPools;
      }
    }

    let exactInputs = null;
    if (EXACT_WINDOWS) {
      exactInputs = await fetchPrivacyScoreInputsAsOf(pool, dateStr);
    }

    const computed = computeScoreForDay({
      dateStr,
      rollupByDay,
      turnstileByDay,
      pools,
      exactInputs,
    });

    const action = await upsertTrendRow(pool, dateStr, computed);
    if (action === 'inserted') inserted += 1;
    else updated += 1;

    const { scoreInputs } = computed;
    log(
      `  ${dateStr}: score=${computed.privacyScore} ` +
        `(usage ${scoreInputs.recentShieldedPercent.toFixed(1)}%, ` +
        `quality ${scoreInputs.recentFullyShieldedPercent.toFixed(1)}%, ` +
        `depth ${scoreInputs.supplyShieldedPercent.toFixed(1)}%, ` +
        `hygiene ${scoreInputs.reshieldPercent.toFixed(1)}%) ` +
        `h=${computed.maxHeight}`,
    );
  }

  log(`\n=== Done: ${inserted} inserted, ${updated} updated, ${skipped} skipped ===`);
  await pool.end();
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
