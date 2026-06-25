#!/usr/bin/env node
/**
 * Backfill coinbase_hex for existing blocks.
 *
 * Reads blocks that have NULL coinbase_hex in batches,
 * fetches the coinbase transaction via Zebra RPC,
 * extracts the scriptSig hex, and writes it back.
 *
 * Usage:
 *   node backfill-coinbase-hex.js                    — backfill all NULL blocks (newest first)
 *   node backfill-coinbase-hex.js --from 3000000     — start from a specific height
 *   node backfill-coinbase-hex.js --batch 500        — set batch size
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { Pool } = require('pg');
const http = require('http');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 3,
  idleTimeoutMillis: 30000,
});

const ZEBRA_RPC_URL = process.env.ZEBRA_RPC_URL || 'http://127.0.0.1:8232';

function parseArgs() {
  const args = process.argv.slice(2);
  let from = null;
  let batchSize = 200;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from' && args[i + 1]) from = parseInt(args[i + 1]);
    if (args[i] === '--batch' && args[i + 1]) batchSize = parseInt(args[i + 1]);
  }

  return { from, batchSize };
}

function callRPC(method, params) {
  return new Promise((resolve, reject) => {
    const url = new URL(ZEBRA_RPC_URL);
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) reject(new Error(json.error.message));
          else resolve(json.result);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('RPC timeout')); });
    req.write(body);
    req.end();
  });
}

async function getBlockCoinbaseHex(height) {
  try {
    const blockHash = await callRPC('getblockhash', [height]);
    const block = await callRPC('getblock', [blockHash, 2]);
    const coinbaseTx = block.tx?.[0];
    if (!coinbaseTx) return null;

    const coinbaseInput = coinbaseTx.vin?.[0];
    if (!coinbaseInput || !coinbaseInput.coinbase) return null;

    return coinbaseInput.coinbase;
  } catch (e) {
    return null;
  }
}

async function run() {
  const { from, batchSize } = parseArgs();

  // Acquire advisory lock to prevent concurrent runs
  const lockResult = await pool.query('SELECT pg_try_advisory_lock(8675309)');
  if (!lockResult.rows[0].pg_try_advisory_lock) {
    console.log('Another backfill instance is running, exiting.');
    await pool.end();
    return;
  }

  try {
    const countResult = await pool.query(
      'SELECT COUNT(*) as cnt FROM blocks WHERE coinbase_hex IS NULL'
    );
    const totalNull = parseInt(countResult.rows[0].cnt);
    console.log(`[backfill-coinbase-hex] ${totalNull} blocks need coinbase_hex`);

    if (totalNull === 0) {
      console.log('Nothing to backfill.');
      return;
    }

    let processed = 0;
    let cursor = from;

    while (true) {
      let query, params;
      if (cursor !== null) {
        query = `SELECT height FROM blocks WHERE coinbase_hex IS NULL AND height <= $1
                 ORDER BY height DESC LIMIT $2`;
        params = [cursor, batchSize];
      } else {
        query = `SELECT height FROM blocks WHERE coinbase_hex IS NULL
                 ORDER BY height DESC LIMIT $1`;
        params = [batchSize];
      }

      const batch = await pool.query(query, params);
      if (batch.rows.length === 0) break;

      const updates = [];
      for (const row of batch.rows) {
        const h = parseInt(row.height);
        const hex = await getBlockCoinbaseHex(h);
        if (hex) {
          updates.push({ height: h, hex });
        }
      }

      if (updates.length > 0) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          for (const u of updates) {
            await client.query(
              'UPDATE blocks SET coinbase_hex = $1 WHERE height = $2',
              [u.hex, u.height]
            );
          }
          await client.query('COMMIT');
        } catch (e) {
          await client.query('ROLLBACK');
          throw e;
        } finally {
          client.release();
        }
      }

      processed += batch.rows.length;
      const lowestHeight = parseInt(batch.rows[batch.rows.length - 1].height);
      cursor = lowestHeight - 1;

      const pct = ((processed / totalNull) * 100).toFixed(1);
      console.log(`  Processed ${processed}/${totalNull} (${pct}%) — last height: ${lowestHeight}`);

      if (cursor < 0) break;
    }

    console.log(`[backfill-coinbase-hex] Done. Processed ${processed} blocks.`);
  } finally {
    await pool.query('SELECT pg_advisory_unlock(8675309)');
    await pool.end();
  }
}

run().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
