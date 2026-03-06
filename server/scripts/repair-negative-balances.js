#!/usr/bin/env node
/**
 * Repair negative address balances by cross-referencing with Zebra node.
 *
 * For each address with balance < 0:
 *   1. Get authoritative txid list from Zebra (getaddresstxids)
 *   2. Compare with our DB to find missing transactions
 *   3. For missing txs: fetch raw tx from Zebra, parse, and insert outputs/inputs
 *   4. Get correct balance from Zebra (getaddressbalance) and update addresses table
 *
 * Usage:
 *   npx dotenvx run -f ../api/.env -- node repair-negative-balances.js
 *   npx dotenvx run -f ../api/.env -- node repair-negative-balances.js --dry-run
 */

const { Pool } = require('pg');
const http = require('http');

const DATABASE_URL = process.env.DATABASE_URL;
const ZEBRA_RPC_URL = process.env.ZCASH_RPC_URL || process.env.ZEBRA_RPC_URL || 'http://127.0.0.1:8232';
const RPC_USER = process.env.ZCASH_RPC_USER || '__cookie__';
const RPC_PASSWORD = process.env.ZCASH_RPC_PASSWORD || '';
const DRY_RUN = process.argv.includes('--dry-run');

const pool = new Pool({ connectionString: DATABASE_URL });

function log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

async function callZebraRPC(method, params = []) {
  const auth = Buffer.from(`${RPC_USER}:${RPC_PASSWORD}`).toString('base64');
  const body = JSON.stringify({ jsonrpc: '2.0', id: 'repair', method, params });
  const url = new URL(ZEBRA_RPC_URL);

  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': `Basic ${auth}`,
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) reject(new Error(`RPC error: ${json.error.message}`));
          else resolve(json.result);
        } catch (e) {
          reject(new Error(`Failed to parse RPC response: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function findMissingTxids(address) {
  const chainTip = await pool.query('SELECT MAX(block_height) as tip FROM transactions WHERE block_height > 0');
  const tip = parseInt(chainTip.rows[0].tip) || 3300000;

  const zebraTxids = await callZebraRPC('getaddresstxids', [{ addresses: [address], start: 1, end: tip }]);
  const zebraSet = new Set(zebraTxids);

  const dbResult = await pool.query(`
    SELECT DISTINCT txid FROM (
      SELECT txid FROM transaction_outputs WHERE address = $1
      UNION
      SELECT txid FROM transaction_inputs WHERE address = $1
    ) all_txs
  `, [address]);
  const dbSet = new Set(dbResult.rows.map(r => r.txid));

  const missing = [...zebraSet].filter(txid => !dbSet.has(txid));
  const extra = [...dbSet].filter(txid => !zebraSet.has(txid));

  return { zebraCount: zebraSet.size, dbCount: dbSet.size, missing, extra };
}

async function fetchAndInsertTransaction(txid) {
  const existing = await pool.query('SELECT txid FROM transactions WHERE txid = $1', [txid]);
  const txExists = existing.rows.length > 0;

  const rawTx = await callZebraRPC('getrawtransaction', [txid, 1]);

  if (!rawTx || !rawTx.vout) {
    log(`    WARNING: Could not fetch tx ${txid}`);
    return { inserted: false, reason: 'fetch_failed' };
  }

  const blockHash = rawTx.blockhash;
  let blockHeight = 0;
  let blockTime = 0;

  if (blockHash) {
    const block = await callZebraRPC('getblock', [blockHash, 1]);
    blockHeight = block.height;
    blockTime = block.time;
  }

  if (!txExists) {
    const isCoinbase = rawTx.vin && rawTx.vin.length > 0 && rawTx.vin[0].coinbase;
    const hasSapling = (rawTx.vShieldedSpend?.length > 0) || (rawTx.vShieldedOutput?.length > 0);
    const hasOrchard = rawTx.orchard?.actions?.length > 0;
    const vinCount = rawTx.vin?.length || 0;
    const voutCount = rawTx.vout?.length || 0;

    let transparentOut = 0;
    for (const out of rawTx.vout || []) {
      transparentOut += Math.round((out.value || 0) * 1e8);
    }

    await pool.query(`
      INSERT INTO transactions (txid, block_height, block_time, size, tx_index, version,
        is_coinbase, has_sapling, has_orchard, vin_count, vout_count, transparent_value_out)
      VALUES ($1, $2, $3, $4, 0, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (txid) DO NOTHING
    `, [txid, blockHeight, blockTime, rawTx.size || 0, rawTx.version || 0,
        isCoinbase, hasSapling, hasOrchard, vinCount, voutCount, transparentOut]);

    log(`    Inserted transaction ${txid} (block ${blockHeight})`);
  }

  let outputsInserted = 0;
  for (const vout of rawTx.vout || []) {
    const value = Math.round((vout.value || 0) * 1e8);
    const addresses = vout.scriptPubKey?.addresses || [];
    const address = addresses[0] || null;
    const scriptType = vout.scriptPubKey?.type || null;

    await pool.query(`
      INSERT INTO transaction_outputs (txid, vout_index, value, address, script_type)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (txid, vout_index) DO UPDATE SET
        value = EXCLUDED.value, address = EXCLUDED.address, script_type = EXCLUDED.script_type
    `, [txid, vout.n, value, address, scriptType]);
    outputsInserted++;
  }

  let inputsInserted = 0;
  for (let i = 0; i < (rawTx.vin || []).length; i++) {
    const vin = rawTx.vin[i];
    if (vin.coinbase) continue;

    let prevAddress = null;
    let prevValue = null;

    if (vin.txid && vin.vout !== undefined) {
      try {
        const prevTx = await callZebraRPC('getrawtransaction', [vin.txid, 1]);
        if (prevTx && prevTx.vout && prevTx.vout[vin.vout]) {
          const prevOut = prevTx.vout[vin.vout];
          prevValue = Math.round((prevOut.value || 0) * 1e8);
          prevAddress = prevOut.scriptPubKey?.addresses?.[0] || null;
        }
      } catch (e) {
        log(`    WARNING: Could not resolve input ${vin.txid}:${vin.vout}`);
      }
    }

    await pool.query(`
      INSERT INTO transaction_inputs (txid, vout_index, prev_txid, prev_vout, address, value)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (txid, vout_index) DO UPDATE SET
        address = EXCLUDED.address, value = EXCLUDED.value
    `, [txid, i, vin.txid || null, vin.vout || 0, prevAddress, prevValue]);
    inputsInserted++;
  }

  return { inserted: true, txExists, blockHeight, outputsInserted, inputsInserted };
}

async function repairAddress(address) {
  log(`\n  Processing: ${address}`);

  const { zebraCount, dbCount, missing, extra } = await findMissingTxids(address);
  log(`    Zebra: ${zebraCount} txids | DB: ${dbCount} txids | Missing: ${missing.length} | Extra: ${extra.length}`);

  if (missing.length > 0) {
    log(`    Missing txids: ${missing.join(', ')}`);

    if (!DRY_RUN) {
      for (const txid of missing) {
        try {
          const result = await fetchAndInsertTransaction(txid);
          log(`    Repaired ${txid}: ${JSON.stringify(result)}`);
        } catch (e) {
          log(`    ERROR repairing ${txid}: ${e.message}`);
        }
      }
    }
  }

  if (extra.length > 0) {
    log(`    Extra txids in DB (not in Zebra): ${extra.join(', ')}`);
  }

  const balance = await callZebraRPC('getaddressbalance', [{ addresses: [address] }]);
  const correctBalance = balance.balance;
  const correctReceived = balance.received;
  const correctSent = correctReceived - correctBalance;

  const current = await pool.query('SELECT balance, total_received, total_sent FROM addresses WHERE address = $1', [address]);
  const cur = current.rows[0];

  log(`    Current  → balance: ${cur.balance} | received: ${cur.total_received} | sent: ${cur.total_sent}`);
  log(`    Correct  → balance: ${correctBalance} | received: ${correctReceived} | sent: ${correctSent}`);

  if (!DRY_RUN) {
    await pool.query(`
      UPDATE addresses
      SET balance = $2, total_received = $3, total_sent = $4, updated_at = NOW()
      WHERE address = $1
    `, [address, correctBalance, correctReceived, correctSent]);
    log(`    UPDATED address balance from Zebra`);
  } else {
    log(`    [DRY RUN] Would update balance`);
  }
}

async function main() {
  log('=== Negative Balance Repair ===');
  if (DRY_RUN) log('Running in DRY RUN mode — no changes will be made');

  try {
    await pool.query('SELECT 1');
    log('DB connected');

    await callZebraRPC('getblockchaininfo');
    log('Zebra RPC connected');

    const result = await pool.query(
      'SELECT address, balance FROM addresses WHERE balance < 0 ORDER BY balance ASC'
    );
    log(`Found ${result.rows.length} addresses with negative balance`);

    for (const row of result.rows) {
      await repairAddress(row.address);
    }

    const remaining = await pool.query('SELECT COUNT(*) as count FROM addresses WHERE balance < 0');
    log(`\n=== Done. Remaining negative balances: ${remaining.rows[0].count} ===`);

  } catch (e) {
    log(`FATAL: ${e.message}`);
    console.error(e);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
