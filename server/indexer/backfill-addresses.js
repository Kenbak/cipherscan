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

const path = require('path');
// Load .env from the script's directory (not cwd)
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { Pool } = require('pg');
const fs = require('fs');

// Checkpoint file to resume after crash
const CHECKPOINT_FILE = path.join(__dirname, '.backfill-checkpoint');

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

// Transaction cache - SMALLER to avoid OOM
const txCache = new Map();
const CACHE_SIZE = 2000; // Reduced from 10000

function cacheTx(txid, tx) {
  if (txCache.size >= CACHE_SIZE) {
    // Clear half the cache when full (more aggressive cleanup)
    const keysToDelete = Array.from(txCache.keys()).slice(0, CACHE_SIZE / 2);
    keysToDelete.forEach(k => txCache.delete(k));
  }
  // Only cache essential fields to save memory
  txCache.set(txid, {
    vout: tx.vout?.map(v => ({
      value: v.value,
      scriptPubKey: v.scriptPubKey ? { addresses: v.scriptPubKey.addresses } : null
    })),
    vin: tx.vin?.map(v => ({
      txid: v.txid,
      vout: v.vout,
      coinbase: v.coinbase
    }))
  });
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

  // Get total count - only NULL, not empty arrays (empty = already processed)
  const countResult = await pool.query(`
    SELECT COUNT(*) as total
    FROM shielded_flows
    WHERE id >= $1
      AND transparent_addresses IS NULL
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

  // Track error types for debugging
  const errorTypes = new Map();
  const MAX_ERROR_SAMPLES = 5; // Show first N errors of each type

  // Track empty flows (no addresses found) for debugging
  let emptyFlows = 0;
  const emptySamples = []; // First few examples of empty flows
  const MAX_EMPTY_SAMPLES = 10;

  while (true) {
    const batchResult = await pool.query(`
      SELECT id, txid, flow_type
      FROM shielded_flows
      WHERE id >= $1
        AND transparent_addresses IS NULL
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

        // Always update - use empty array if no addresses found
        // This marks the flow as "processed" so it won't be re-checked
        if (!dryRun) {
          await pool.query(`
            UPDATE shielded_flows
            SET transparent_addresses = $1, transparent_value_zat = $2
            WHERE id = $3
          `, [transparentAddresses, transparentValueZat, flow.id]);
        }

        if (transparentAddresses.length > 0) {
          updated++;
          if (verbose) {
            console.log(`   ✅ ${flow.txid.slice(0, 12)}... → ${transparentAddresses.join(', ').slice(0, 40)}...`);
          }
        } else {
          emptyFlows++;
          // Log first few empty flows for debugging
          if (emptySamples.length < MAX_EMPTY_SAMPLES) {
            const hasVout = tx.vout && tx.vout.length > 0;
            const hasVin = tx.vin && tx.vin.length > 0;
            const voutAddrs = tx.vout?.filter(v => v.scriptPubKey?.addresses).length || 0;
            emptySamples.push({
              id: flow.id,
              txid: flow.txid, // Full txid for debugging
              type: flow.flow_type,
              hasVout,
              hasVin,
              voutWithAddrs: voutAddrs,
              vinCount: tx.vin?.length || 0,
              // Extra debug info
              voutTypes: tx.vout?.map(v => v.scriptPubKey?.type).join(',') || 'none'
            });
          }
        }

        processed++;
        currentId = flow.id + 1;

      } catch (err) {
        errors++;

        // Track error types
        const errType = err.message.split(':')[0].slice(0, 50);
        if (!errorTypes.has(errType)) {
          errorTypes.set(errType, { count: 0, sample: flow.txid.slice(0, 16) });
          // Log first occurrence of each error type
          console.log(`   ⚠️ New error type: ${err.message.slice(0, 80)} (txid: ${flow.txid.slice(0, 16)}...)`);
        }
        errorTypes.get(errType).count++;

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

    console.log(`📦 ID ${currentId} | ${processed.toLocaleString()}/${totalToProcess.toLocaleString()} (${((processed/totalToProcess)*100).toFixed(1)}%) | ${rate.toFixed(1)} tx/s | ETA: ${formatDuration(eta)} | ✅${updated} ⬚${emptyFlows} ❌${errors} | cache:${txCache.size}`);

    // Show sample empty flows early for debugging (after ~5k processed)
    if (processed >= 5000 && processed < 5500 && emptySamples.length > 0) {
      console.log('\n   📋 Sample empty flows (first 10):');
      for (const s of emptySamples.slice(0, 5)) {
        console.log(`      ID ${s.id} | ${s.type} | vout_addrs:${s.voutWithAddrs} vin:${s.vinCount} | types:${s.voutTypes}`);
        console.log(`         txid: ${s.txid}`);
      }
      console.log('');
    }

    // Save checkpoint after each batch
    saveCheckpoint(currentId);

    // Force garbage collection every 10 batches if available
    if (global.gc && processed % (batchSize * 10) === 0) {
      global.gc();
    }
  }

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('📊 BACKFILL COMPLETE');
  console.log(`   Processed: ${processed.toLocaleString()}`);
  console.log(`   Updated (with addresses): ${updated.toLocaleString()}`);
  console.log(`   Empty (no transparent): ${emptyFlows.toLocaleString()}`);
  console.log(`   Errors: ${errors}`);
  console.log(`   Cache hits: ${txCache.size}`);
  console.log(`   Time: ${formatDuration((Date.now() - startTime) / 1000)}`);

  // Show empty flow samples for debugging
  if (emptySamples.length > 0) {
    console.log('\n📋 Sample empty flows (no transparent addresses found):');
    for (const s of emptySamples) {
      console.log(`   ID ${s.id} | ${s.type} | vout_addrs:${s.voutWithAddrs} vin:${s.vinCount} | types:${s.voutTypes}`);
      console.log(`      txid: ${s.txid}`);
    }
  }

  // Show error type summary
  if (errorTypes.size > 0) {
    console.log('\n⚠️ Error types encountered:');
    for (const [type, data] of errorTypes) {
      console.log(`   ${type}: ${data.count}x (e.g. ${data.sample})`);
    }
  }

  console.log('════════════════════════════════════════════════════════════');
}

function formatDuration(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

// ============================================================================
// CHECKPOINT (resume after crash)
// ============================================================================

function saveCheckpoint(id) {
  try {
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify({ lastId: id, timestamp: Date.now() }));
  } catch (err) {
    // Ignore checkpoint save errors
  }
}

function loadCheckpoint() {
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) {
      const data = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
      console.log(`📍 Found checkpoint: resuming from ID ${data.lastId}`);
      return data.lastId;
    }
  } catch (err) {
    // Ignore checkpoint load errors
  }
  return null;
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
    } else if (arg === '--reset') {
      // Delete checkpoint to start fresh
      if (fs.existsSync(CHECKPOINT_FILE)) {
        fs.unlinkSync(CHECKPOINT_FILE);
        console.log('🗑️  Checkpoint deleted, starting fresh');
      }
    }
  }

  // Load checkpoint if startId not explicitly provided
  if (options.startId === 0) {
    const checkpointId = loadCheckpoint();
    if (checkpointId) {
      options.startId = checkpointId;
    }
  }

  try {
    await backfillAddresses(options);
    // Delete checkpoint on successful completion
    if (fs.existsSync(CHECKPOINT_FILE)) {
      fs.unlinkSync(CHECKPOINT_FILE);
    }
  } catch (err) {
    console.error('❌ Fatal error:', err);
    console.log('💾 Checkpoint saved - run again to resume');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
