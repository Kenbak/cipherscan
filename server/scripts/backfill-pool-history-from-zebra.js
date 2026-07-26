#!/usr/bin/env node
/**
 * Backfill privacy_trends_daily pool columns from Zebra valuePools at daily block heights.
 * Intended to extend pool-history scrubber data back to Zcash launch (2016-10-28).
 *
 * Requires a synced Zebra node and (ideally) a blocks table for accurate height↔date mapping.
 *
 * Usage:
 *   node server/scripts/backfill-pool-history-from-zebra.js
 *   node server/scripts/backfill-pool-history-from-zebra.js --from=2016-10-28 --skip-existing
 *   node server/scripts/backfill-pool-history-from-zebra.js --days=4000 --dry-run
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../api/.env') });

const { Pool } = require('pg');

const LAUNCH_DATE = '2016-10-28';
const GENESIS_TS = Math.floor(new Date(`${LAUNCH_DATE}T00:00:00Z`).getTime() / 1000);
const AVG_BLOCK_TIME = 75;

const args = process.argv.slice(2);
const FROM_DATE =
  args.find((a) => a.startsWith('--from='))?.split('=')[1] ||
  (args.find((a) => a.startsWith('--days='))
    ? addDays(new Date().toISOString().slice(0, 10), -(parseInt(args.find((a) => a.startsWith('--days=')).split('=')[1], 10) - 1))
    : LAUNCH_DATE);
const TO_DATE = args.find((a) => a.startsWith('--to='))?.split('=')[1] || new Date().toISOString().slice(0, 10);
const SKIP_EXISTING = args.includes('--skip-existing');
const DRY_RUN = args.includes('--dry-run');

const ZEBRA_RPC_URL = process.env.ZEBRA_RPC_URL || 'http://127.0.0.1:8232';
const ZEBRA_COOKIE_FILE = process.env.ZEBRA_RPC_COOKIE_FILE || '/root/.cache/zebra/.cookie';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 3,
});

function log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function callZebraRPC(method, params = []) {
  let auth = '';
  try {
    const cookie = fs.readFileSync(ZEBRA_COOKIE_FILE, 'utf8').trim();
    auth = `Basic ${Buffer.from(cookie).toString('base64')}`;
  } catch {
    // no auth
  }
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = auth;

  const response = await fetch(ZEBRA_RPC_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: 'pool-history-backfill', method, params }),
  });
  const data = await response.json();
  if (data.error) throw new Error(`${method}: ${data.error.message || JSON.stringify(data.error)}`);
  return data.result;
}

function poolZat(entry) {
  if (!entry) return 0;
  if (entry.chainValueZat != null) return parseInt(entry.chainValueZat, 10) || 0;
  if (entry.chainValue != null) return Math.round(parseFloat(entry.chainValue) * 1e8);
  return 0;
}

function parsePoolsFromBlock(block) {
  let sprout = 0;
  let sapling = 0;
  let orchard = 0;
  let ironwood = 0;
  let transparent = 0;
  let chainSupply = 0;

  for (const p of block?.valuePools || []) {
    const val = poolZat(p);
    if (p.id === 'sprout') sprout = val;
    else if (p.id === 'sapling') sapling = val;
    else if (p.id === 'orchard') orchard = val;
    else if (p.id === 'ironwood') ironwood = val;
    else if (p.id === 'transparent') transparent = val;
  }

  if (block?.chainSupply?.chainValueZat != null) {
    chainSupply = parseInt(block.chainSupply.chainValueZat, 10) || 0;
  } else {
    chainSupply = sprout + sapling + orchard + ironwood + transparent;
  }

  const shielded = sprout + sapling + orchard + ironwood;
  return { sprout, sapling, orchard, ironwood, transparent, shielded, chainSupply };
}

async function columnExists(client, table, column) {
  const result = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column],
  );
  return result.rows.length > 0;
}

async function heightForDate(client, dateStr, tipHeight) {
  const endTs = Math.floor(new Date(`${dateStr}T23:59:59Z`).getTime() / 1000);

  try {
    const result = await client.query(
      `SELECT height FROM blocks WHERE timestamp <= $1 ORDER BY height DESC LIMIT 1`,
      [endTs],
    );
    if (result.rows.length > 0) {
      return parseInt(result.rows[0].height, 10);
    }
  } catch {
    // blocks table may be absent
  }

  const estimated = Math.floor((endTs - GENESIS_TS) / AVG_BLOCK_TIME);
  return Math.max(0, Math.min(tipHeight, estimated));
}

async function hasPoolData(client, dateStr) {
  const result = await client.query(
    `SELECT pool_size, chain_supply FROM privacy_trends_daily WHERE date = $1::date`,
    [dateStr],
  );
  if (result.rows.length === 0) return false;
  const row = result.rows[0];
  return (parseInt(row.pool_size, 10) || 0) > 0 && (parseInt(row.chain_supply, 10) || 0) > 0;
}

async function upsertPoolRow(client, dateStr, pools, hasPoolCols, hasIronwoodCol) {
  const existing = await client.query(`SELECT id FROM privacy_trends_daily WHERE date = $1::date`, [dateStr]);

  if (existing.rows.length > 0) {
    if (hasPoolCols) {
      await client.query(
        `UPDATE privacy_trends_daily SET
          pool_size = $2,
          sprout_pool_size = $3,
          sapling_pool_size = $4,
          orchard_pool_size = $5,
          ${hasIronwoodCol ? 'ironwood_pool_size = $6,' : ''}
          transparent_pool_size = $${hasIronwoodCol ? 7 : 6},
          chain_supply = $${hasIronwoodCol ? 8 : 7}
        WHERE date = $1`,
        hasIronwoodCol
          ? [
              dateStr,
              pools.shielded,
              pools.sprout,
              pools.sapling,
              pools.orchard,
              pools.ironwood,
              pools.transparent,
              pools.chainSupply,
            ]
          : [
              dateStr,
              pools.shielded,
              pools.sprout,
              pools.sapling,
              pools.orchard,
              pools.transparent,
              pools.chainSupply,
            ],
      );
    } else {
      await client.query(`UPDATE privacy_trends_daily SET pool_size = $2 WHERE date = $1`, [
        dateStr,
        pools.shielded,
      ]);
    }
    return 'updated';
  }

  if (hasPoolCols) {
    await client.query(
      `INSERT INTO privacy_trends_daily (
        date, shielded_count, transparent_count, shielded_percentage, pool_size, privacy_score,
        sprout_pool_size, sapling_pool_size, orchard_pool_size,
        ${hasIronwoodCol ? 'ironwood_pool_size,' : ''}
        transparent_pool_size, chain_supply, created_at
      ) VALUES (
        $1, 0, 0, 0, $2, 0, $3, $4, $5, ${hasIronwoodCol ? '$6, $7, $8' : '$6, $7'}, NOW()
      )`,
      hasIronwoodCol
        ? [
            dateStr,
            pools.shielded,
            pools.sprout,
            pools.sapling,
            pools.orchard,
            pools.ironwood,
            pools.transparent,
            pools.chainSupply,
          ]
        : [dateStr, pools.shielded, pools.sprout, pools.sapling, pools.orchard, pools.transparent, pools.chainSupply],
    );
  } else {
    await client.query(
      `INSERT INTO privacy_trends_daily (
        date, shielded_count, transparent_count, shielded_percentage, pool_size, privacy_score, created_at
      ) VALUES ($1, 0, 0, 0, $2, 0, NOW())`,
      [dateStr, pools.shielded],
    );
  }
  return 'inserted';
}

async function main() {
  log(`=== Pool history backfill (${FROM_DATE} → ${TO_DATE}) ===`);
  if (SKIP_EXISTING) log('  --skip-existing: only filling gaps');
  if (DRY_RUN) log('  --dry-run: no DB writes');

  await pool.query('SELECT 1');
  const hasPoolCols = await columnExists(pool, 'privacy_trends_daily', 'orchard_pool_size');
  const hasIronwoodCol = hasPoolCols && (await columnExists(pool, 'privacy_trends_daily', 'ironwood_pool_size'));
  if (!hasPoolCols) {
    log('WARN: per-pool columns missing — only pool_size will be written');
  }

  const info = await callZebraRPC('getblockchaininfo');
  const tipHeight = parseInt(info.blocks, 10) || 0;
  log(`Zebra tip: height ${tipHeight.toLocaleString()}`);

  const dates = dateRange(FROM_DATE, TO_DATE);
  log(`Processing ${dates.length} days…`);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < dates.length; i++) {
    const dateStr = dates[i];

    if (SKIP_EXISTING && (await hasPoolData(pool, dateStr))) {
      skipped += 1;
      continue;
    }

    const height = await heightForDate(pool, dateStr, tipHeight);

    try {
      const block = await callZebraRPC('getblock', [String(height), 1]);
      const pools = parsePoolsFromBlock(block);

      if (pools.chainSupply <= 0) {
        log(`  ${dateStr}: no chain supply at h=${height}, skipping`);
        skipped += 1;
        continue;
      }

      if (DRY_RUN) {
        if (i % 100 === 0 || i === dates.length - 1) {
          log(
            `  [dry-run] ${dateStr} h=${height} shielded=${(pools.shielded / 1e8).toFixed(2)}M chain=${(pools.chainSupply / 1e8).toFixed(2)}M`,
          );
        }
        continue;
      }

      const action = await upsertPoolRow(pool, dateStr, pools, hasPoolCols, hasIronwoodCol);
      if (action === 'inserted') inserted += 1;
      else updated += 1;

      if ((inserted + updated) % 50 === 0 || i === dates.length - 1) {
        log(
          `  ${dateStr} h=${height} · shielded ${(pools.shielded / 1e8).toFixed(2)}M / chain ${(pools.chainSupply / 1e8).toFixed(2)}M (${inserted + updated}/${dates.length - skipped})`,
        );
      }
    } catch (err) {
      failed += 1;
      if (failed <= 8) log(`  WARN ${dateStr} h=${height}: ${err.message}`);
    }

    if (i % 10 === 0) await sleep(30);
  }

  log(`\n=== Done: ${inserted} inserted, ${updated} updated, ${skipped} skipped, ${failed} failed ===`);

  const coverage = await pool.query(
    `SELECT MIN(date)::text AS start, MAX(date)::text AS end, COUNT(*)::int AS days
     FROM privacy_trends_daily
     WHERE pool_size > 0 AND chain_supply > 0`,
  );
  if (coverage.rows[0]) {
    log(`Coverage: ${coverage.rows[0].start} → ${coverage.rows[0].end} (${coverage.rows[0].days} days)`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
