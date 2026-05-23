#!/usr/bin/env node
/**
 * Backfill per-pool columns on privacy_trends_daily from pool_size + chain_supply.
 * Uses current Orchard/Sapling/Sprout ratios within shielded pool (approximation).
 * Usage: node server/scripts/backfill-pool-columns.js
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../api/.env') });

const { Pool } = require('pg');

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
    body: JSON.stringify({ jsonrpc: '2.0', id: 'backfill-pools', method, params }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.result;
}

async function main() {
  log('=== Backfill per-pool columns ===');

  const info = await callZebraRPC('getblockchaininfo');
  const pools = {};
  for (const p of info.valuePools || []) {
    pools[p.id] = parseInt(p.chainValueZat, 10) || 0;
  }

  const shielded = (pools.sprout || 0) + (pools.sapling || 0) + (pools.orchard || 0);
  if (shielded <= 0) throw new Error('Could not read shielded pools from Zebra');

  const ratios = {
    sprout: (pools.sprout || 0) / shielded,
    sapling: (pools.sapling || 0) / shielded,
    orchard: (pools.orchard || 0) / shielded,
  };

  log(`Ratios: Orchard ${(ratios.orchard * 100).toFixed(1)}%, Sapling ${(ratios.sapling * 100).toFixed(1)}%, Sprout ${(ratios.sprout * 100).toFixed(1)}%`);

  const result = await pool.query(`
    UPDATE privacy_trends_daily SET
      sprout_pool_size = ROUND(pool_size * $1),
      sapling_pool_size = ROUND(pool_size * $2),
      orchard_pool_size = ROUND(pool_size * $3),
      transparent_pool_size = GREATEST(chain_supply - pool_size, 0)
    WHERE pool_size > 0
      AND chain_supply > 0
      AND COALESCE(orchard_pool_size, 0) = 0
  `, [ratios.sprout, ratios.sapling, ratios.orchard]);

  log(`Updated ${result.rowCount} rows`);
  await pool.end();
  log('=== Done ===');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
