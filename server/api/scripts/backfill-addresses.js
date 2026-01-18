#!/usr/bin/env node
/**
 * Backfill transparent_addresses for existing shielded_flows
 * 
 * This script fetches transaction details from zcashd and updates
 * the transparent_addresses column for all existing flows.
 * 
 * Usage:
 *   node backfill-addresses.js [options]
 * 
 * Options:
 *   --batch-size=1000   Number of rows to process per batch (default: 1000)
 *   --start-id=0        Start from this ID (for resuming)
 *   --dry-run           Don't update database, just show what would happen
 *   --verbose           Print detailed output
 */

const { Pool } = require('pg');

// Load environment variables
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

// ============================================================================
// CONFIGURATION
// ============================================================================

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'zcash_explorer',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

const ZCASHD_URL = process.env.ZCASHD_URL || 'http://127.0.0.1:8232';
const ZCASHD_USER = process.env.ZCASHD_USER || process.env.RPC_USER || '';
const ZCASHD_PASS = process.env.ZCASHD_PASS || process.env.RPC_PASSWORD || '';

// ============================================================================
// RPC HELPER
// ============================================================================

async function zcashRPC(method, params = []) {
  const response = await fetch(ZCASHD_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + Buffer.from(`${ZCASHD_USER}:${ZCASHD_PASS}`).toString('base64'),
    },
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
// MAIN BACKFILL LOGIC
// ============================================================================

async function backfillAddresses(options = {}) {
  const {
    batchSize = 1000,
    startId = 0,
    dryRun = false,
    verbose = false,
  } = options;

  console.log('════════════════════════════════════════════════════════════');
  console.log('🔄 BACKFILL TRANSPARENT ADDRESSES');
  console.log(`   Batch size: ${batchSize}`);
  console.log(`   Start ID: ${startId}`);
  console.log(`   Dry run: ${dryRun}`);
  console.log('════════════════════════════════════════════════════════════');

  // Get total count of flows needing update
  const countResult = await pool.query(`
    SELECT COUNT(*) as total 
    FROM shielded_flows 
    WHERE id >= $1 
      AND (transparent_addresses IS NULL OR array_length(transparent_addresses, 1) IS NULL)
  `, [startId]);
  
  const totalToProcess = parseInt(countResult.rows[0].total);
  console.log(`\n📊 Total flows to process: ${totalToProcess.toLocaleString()}`);

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
    // Fetch batch of flows
    const batchResult = await pool.query(`
      SELECT id, txid, flow_type
      FROM shielded_flows
      WHERE id >= $1
        AND (transparent_addresses IS NULL OR array_length(transparent_addresses, 1) IS NULL)
      ORDER BY id
      LIMIT $2
    `, [currentId, batchSize]);

    if (batchResult.rows.length === 0) {
      break; // No more rows
    }

    console.log(`\n📦 Processing batch starting at ID ${currentId}...`);

    for (const flow of batchResult.rows) {
      try {
        // Fetch transaction from zcashd
        const tx = await zcashRPC('getrawtransaction', [flow.txid, 1]);

        // Extract addresses based on flow type
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
          // Shield: need to look up prevout for each vin
          for (const vin of tx.vin) {
            if (vin.coinbase) continue;
            
            try {
              if (vin.txid && vin.vout !== undefined) {
                const prevTx = await zcashRPC('getrawtransaction', [vin.txid, 1]);
                const prevOut = prevTx.vout[vin.vout];
                if (prevOut && prevOut.scriptPubKey && prevOut.scriptPubKey.addresses) {
                  transparentAddresses.push(...prevOut.scriptPubKey.addresses);
                  transparentValueZat += Math.round((prevOut.value || 0) * 100000000);
                }
              }
            } catch (vinErr) {
              // Skip this vin if we can't fetch it
              if (verbose) {
                console.log(`   ⚠️  Could not fetch prevout for vin in ${flow.txid}`);
              }
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
            console.log(`   ✅ ${flow.txid.slice(0, 12)}... → ${transparentAddresses.length} addr(s)`);
          }
        }

        processed++;
        currentId = flow.id + 1;

      } catch (err) {
        errors++;
        if (verbose) {
          console.log(`   ❌ ${flow.txid.slice(0, 12)}... Error: ${err.message}`);
        }
        currentId = flow.id + 1;
      }
    }

    // Progress update
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = processed / elapsed;
    const remaining = totalToProcess - processed;
    const eta = remaining / rate;

    console.log(`   📈 Progress: ${processed.toLocaleString()}/${totalToProcess.toLocaleString()} (${((processed/totalToProcess)*100).toFixed(1)}%)`);
    console.log(`   ⏱️  Rate: ${rate.toFixed(1)} tx/s | ETA: ${formatDuration(eta)}`);
    console.log(`   ✅ Updated: ${updated.toLocaleString()} | ❌ Errors: ${errors}`);
  }

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('📊 BACKFILL COMPLETE');
  console.log(`   Processed: ${processed.toLocaleString()}`);
  console.log(`   Updated: ${updated.toLocaleString()}`);
  console.log(`   Errors: ${errors}`);
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
    batchSize: 1000,
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
