#!/usr/bin/env node
/**
 * Hourly chain snapshot — blockchain size + pool sizes for network charts.
 *
 * Cron:
 *   0 * * * * cd /root/cipherscan/server/jobs && node update-chain-snapshots.js >> /var/log/chain-snapshots.log 2>&1
 */

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

require('dotenv').config({ path: path.join(__dirname, '.env') });
const apiEnvPath = path.join(__dirname, '../api/.env');
if (fs.existsSync(apiEnvPath)) {
  const apiEnv = dotenv.parse(fs.readFileSync(apiEnvPath));
  if (apiEnv.ZEBRA_RPC_URL) process.env.ZEBRA_RPC_URL = apiEnv.ZEBRA_RPC_URL;
}

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 3,
});

const ZEBRA_RPC_URL = process.env.ZEBRA_RPC_URL || 'http://127.0.0.1:8232';
const ZEBRA_COOKIE_FILE = process.env.ZEBRA_RPC_COOKIE_FILE || '/root/.cache/zebra/.cookie';
const isLocalZebraRpc = () => /localhost|127\.0\.0\.1/.test(ZEBRA_RPC_URL);
const RETENTION_DAYS = 400;

function log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

async function callZebraRPC(method, params = []) {
  let auth = '';
  if (isLocalZebraRpc()) {
    try {
      const cookie = fs.readFileSync(ZEBRA_COOKIE_FILE, 'utf8').trim();
      auth = `Basic ${Buffer.from(cookie).toString('base64')}`;
    } catch {
      // no auth
    }
  }

  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = auth;

  const response = await fetch(ZEBRA_RPC_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: 'chain-snapshot', method, params }),
  });

  const data = await response.json();
  if (data.error) throw new Error(`Zebra RPC error: ${data.error.message}`);
  return data.result;
}

async function main() {
  log('=== Chain Snapshot ===');
  await pool.query('SELECT 1');

  log(`Zebra RPC: ${ZEBRA_RPC_URL}`);
  const info = await callZebraRPC('getblockchaininfo');
  if (!info?.valuePools) throw new Error('Missing valuePools from getblockchaininfo');

  const progress = Number(info.verificationprogress ?? 0);
  const blocks = Number(info.blocks ?? 0);
  const headers = Number(info.headers ?? 0);
  if (progress < 0.99 || (headers > 0 && blocks < headers - 2)) {
    throw new Error(
      `Zebra not fully synced (progress=${progress}, blocks=${blocks}, headers=${headers})`,
    );
  }

  const pools = {};
  for (const p of info.valuePools) {
    pools[p.id] = parseInt(p.chainValueZat, 10) || 0;
  }

  const chainSupply = parseInt(info.chainSupply?.chainValueZat, 10) || 0;
  const blockHeight = parseInt(info.blocks, 10) || 0;
  const chainSize = parseInt(info.size_on_disk, 10) || 0;

  // Skip recording if chain size dropped (node is resyncing from scratch)
  const prev = await pool.query(
    'SELECT chain_size_bytes FROM chain_snapshots ORDER BY snapshot_time DESC LIMIT 1'
  );
  if (prev.rows.length > 0 && chainSize < parseInt(prev.rows[0].chain_size_bytes, 10) * 0.9) {
    console.log(`⚠️ [CHAIN-SNAPSHOT] Skipping — size ${chainSize} is less than 90% of previous (${prev.rows[0].chain_size_bytes}). Node likely resyncing.`);
    await pool.end();
    return;
  }

  await pool.query(
    `INSERT INTO chain_snapshots (
      block_height, chain_size_bytes, chain_supply_zat,
      sprout_zat, sapling_zat, orchard_zat, ironwood_zat, transparent_zat
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      blockHeight,
      chainSize,
      chainSupply,
      pools.sprout || 0,
      pools.sapling || 0,
      pools.orchard || 0,
      pools.ironwood || 0,
      pools.transparent || 0,
    ]
  );

  const deleted = await pool.query(
    `DELETE FROM chain_snapshots WHERE snapshot_time < NOW() - INTERVAL '${RETENTION_DAYS} days'`
  );

  log(`  Block ${blockHeight} | Size ${(chainSize / 1e9).toFixed(2)} GB | Supply ${(chainSupply / 1e8).toFixed(2)} ZEC`);
  log(`  Pruned ${deleted.rowCount || 0} old snapshots`);
  log('=== Done ===');
}

main()
  .catch((err) => {
    log(`ERROR: ${err.message}`);
    console.error(err);
    process.exit(1);
  })
  .finally(() => pool.end());
