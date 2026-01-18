#!/usr/bin/env node
/**
 * Backfill transparent_addresses for existing shielded_flows
 *
 * Uses the same RPC connection as the indexer (Zebra with cookie auth)
 *
 * Usage:
 *   node backfill-addresses.js [options]
 *
 * Options:
 *   --batch-size=500    Number of rows to process per batch (default: 500)
 *   --start-id=0        Start from this ID (for resuming)
 *   --dry-run           Don't update database
 *   --verbose           Print detailed output
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');

// ============================================================================
// CONFIGURATION (same as indexer)
// ============================================================================

const config = {
  zebra: {
    url: process.env.ZEBRA_RPC_URL || 'http://127.0.0.1:18232',
    cookieFile: process.env.ZEBRA_RPC_COOKIE_FILE || '/root/.cache/zebra/.cookie',
  },
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'zcash_explorer_testnet',
    user: process.env.DB_USER || 'zcash_user',
    password: process.env.DB_PASSWORD,
    max: 10,
    idleTimeoutMillis: 30000,
  },
};

const pool = new Pool(config.db);

// Transaction cache
const txCache = new Map();
const CACHE_SIZE = 10000;

function cacheTx(txid, tx) {
  if (txCache.size >= CACHE_SIZE) {
    const firstKey = txCache.keys().next().value;
    txCache.delete(firstKey);
  }
  txCache.set(txid, tx);
}

// ============================================================================
// RPC (same as indexer)
// ============================================================================

async function zebradRPC(method, params = []) {
  let auth = '';

  try {
    const cookie = fs.readFileSync(config.zebra.cookieFile, 'utf8').trim();
    auth = 'Basic ' + Buffer.from(cookie).toString('base64');
  } catch (err) {
    // Try without auth
  }

  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers['Authorization'] = auth;

  const response = await fetch(config.zebra.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '1.0',
      id: 'backfill',
      method,
      params,
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(`RPC Error: ${data.error.message}`);
  }
  return data.result;
}

// ============================================================================
// BACKFILL LOGIC
// ============================================================================

async function backfillAddresses(options = {}) {
  const {
    batchSize = 500,
    startId = 0,
    dryRun = false,
    verbose = false,
  } = options;

  console.log('════════════════════════════════════════════════════════════');
  console.log('🔄 BACKFILL TRANSPARENT ADDRESSES');
  console.log(`   Zebra RPC: ${config.zebra.url}`);
  console.log(`   Database: ${config.db.database}`);
  console.log(`   Batch size: ${batchSize}`);
  console.log(`   Start ID: ${startId}`);
  console.log(`   Dry run: ${dryRun}`);
  console.log('════════════════════════════════════════════════════════════');

  // Test RPC connection
  try {
    const info = await zebradRPC('getblockchaininfo');
    console.log(`\n✅ Connected to Zebra (block ${info.blocks})`);
  } catch (err) {
    console.error('❌ Cannot connect to Zebra:', err.message);
    process.exit(1);
  }

  // Get total count
  const countResult = await pool.query(`
    SELECT COUNT(*) as total
    FROM shielded_flows
    WHERE id >= $1
      AND (transparent_addresses IS NULL OR array_length(transparent_addresses, 1) IS NULL)
  `, [startId]);

  const totalToProcess = parseInt(countResult.rows[0].total);
  console.log(`📊 Total flows to process: ${totalToProcess.toLocaleString()}\n`);

  if (totalToProcess === 0) {
    console.log('✅ Nothing to backfill!');
    return;
  }

  let processed = 0;
  let updated = 0;
  let errors = 0;
  let currentId = startId;
  const startTime = Date.now();

  while (true) {
    const batchResult = await pool.query(`
      SELECT id, txid, flow_type
      FROM shielded_flows
      WHERE id >= $1
        AND (transparent_addresses IS NULL OR array_length(transparent_addresses, 1) IS NULL)
      ORDER BY id
      LIMIT $2
    `, [currentId, batchSize]);

    if (batchResult.rows.length === 0) break;

    for (const flow of batchResult.rows) {
      try {
        // Check cache first
        let tx = txCache.get(flow.txid);
        if (!tx) {
          tx = await zebradRPC('getrawtransaction', [flow.txid, 1]);
          cacheTx(flow.txid, tx);
        }

        let transparentAddresses = [];
        let transparentValueZat = 0;

        if (flow.flow_type === 'deshield' && tx.vout) {
          // Deshield: addresses from vout
          for (const vout of tx.vout) {
            if (vout.scriptPubKey && vout.scriptPubKey.addresses) {
              transparentAddresses.push(...vout.scriptPubKey.addresses);
              transparentValueZat += Math.round((vout.value || 0) * 100000000);
            }
          }
        } else if (flow.flow_type === 'shield' && tx.vin) {
          // Shield: need to look up prevout
          for (const vin of tx.vin) {
            if (vin.coinbase) continue;

            try {
              if (vin.txid && vin.vout !== undefined) {
                let prevTx = txCache.get(vin.txid);
                if (!prevTx) {
                  prevTx = await zebradRPC('getrawtransaction', [vin.txid, 1]);
                  cacheTx(vin.txid, prevTx);
                }
                const prevOut = prevTx.vout[vin.vout];
                if (prevOut && prevOut.scriptPubKey && prevOut.scriptPubKey.addresses) {
                  transparentAddresses.push(...prevOut.scriptPubKey.addresses);
                  transparentValueZat += Math.round((prevOut.value || 0) * 100000000);
                }
              }
            } catch (vinErr) {
              // Skip this vin
            }
          }
        }

        // Deduplicate
        transparentAddresses = [...new Set(transparentAddresses)];

        if (transparentAddresses.length > 0) {
          if (!dryRun) {
            await pool.query(`
              UPDATE shielded_flows
              SET transparent_addresses = $1, transparent_value_zat = $2
              WHERE id = $3
            `, [transparentAddresses, transparentValueZat, flow.id]);
          }
          updated++;

          if (verbose) {
            console.log(`   ✅ ${flow.txid.slice(0, 12)}... → ${transparentAddresses.join(', ').slice(0, 40)}...`);
          }
        }

        processed++;
        currentId = flow.id + 1;

      } catch (err) {
        errors++;
        if (verbose) {
          console.log(`   ❌ ${flow.txid.slice(0, 12)}... ${err.message}`);
        }
        currentId = flow.id + 1;
      }
    }

    // Progress
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = processed / elapsed;
    const eta = (totalToProcess - processed) / rate;

    console.log(`📦 ID ${currentId} | ${processed.toLocaleString()}/${totalToProcess.toLocaleString()} (${((processed/totalToProcess)*100).toFixed(1)}%) | ${rate.toFixed(1)} tx/s | ETA: ${formatDuration(eta)} | ✅${updated} ❌${errors}`);
  }

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('📊 BACKFILL COMPLETE');
  console.log(`   Processed: ${processed.toLocaleString()}`);
  console.log(`   Updated: ${updated.toLocaleString()}`);
  console.log(`   Errors: ${errors}`);
  console.log(`   Cache hits: ${txCache.size}`);
  console.log(`   Time: ${formatDuration((Date.now() - startTime) / 1000)}`);
  console.log('════════════════════════════════════════════════════════════');
}

function formatDuration(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const options = {
    batchSize: 500,
    startId: 0,
    dryRun: false,
    verbose: false,
  };

  for (const arg of args) {
    if (arg.startsWith('--batch-size=')) {
      options.batchSize = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--start-id=')) {
      options.startId = parseInt(arg.split('=')[1]);
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    }
  }

  try {
    await backfillAddresses(options);
  } catch (err) {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
