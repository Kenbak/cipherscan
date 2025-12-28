#!/usr/bin/env node

/**
 * Backfill Shielded Flows
 *
 * This script populates the shielded_flows table with historical data
 * from existing transactions. It identifies shielding and deshielding
 * transactions based on value_balance fields.
 *
 * Logic (from Zcash protocol):
 *   - value_balance > 0: ZEC LEAVING shielded pool → transparent (DESHIELD)
 *   - value_balance < 0: ZEC ENTERING shielded pool ← transparent (SHIELD)
 *   - Same logic applies to both Sapling and Orchard pools
 *
 * Note: A single transaction can have BOTH shielding AND deshielding
 * (e.g., pass-through transactions or pool migrations)
 *
 * Usage:
 *   node scripts/backfill-shielded-flows.js
 *   node scripts/backfill-shielded-flows.js --from-height 1000000
 *   node scripts/backfill-shielded-flows.js --batch-size 5000
 *
 * Environment:
 *   Uses standard DB_* or PG* environment variables
 */

require('dotenv').config();
const { Pool } = require('pg');

// Parse command line arguments
const args = process.argv.slice(2);
let fromHeight = 0;
let batchSize = 10000;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--from-height' && args[i + 1]) {
    fromHeight = parseInt(args[i + 1]);
  }
  if (args[i] === '--batch-size' && args[i + 1]) {
    batchSize = parseInt(args[i + 1]);
  }
}

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || process.env.PGHOST || 'localhost',
  port: parseInt(process.env.DB_PORT || process.env.PGPORT || '5432'),
  database: process.env.DB_NAME || process.env.PGDATABASE || 'zcash_explorer_testnet',
  user: process.env.DB_USER || process.env.PGUSER || 'zcash_user',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
  max: 5, // Keep pool small for backfill
});

/**
 * Determine pool type based on value balances
 */
function determinePool(valueBalanceSapling, valueBalanceOrchard) {
  const hasSapling = valueBalanceSapling !== 0;
  const hasOrchard = valueBalanceOrchard !== 0;

  if (hasSapling && hasOrchard) return 'mixed';
  if (hasOrchard) return 'orchard';
  if (hasSapling) return 'sapling';
  return 'sapling'; // Default fallback
}

/**
 * Process a batch of transactions
 */
async function processBatch(transactions) {
  const flows = [];

  for (const tx of transactions) {
    const valueBalanceSapling = parseInt(tx.value_balance_sapling) || 0;
    const valueBalanceOrchard = parseInt(tx.value_balance_orchard) || 0;

    // Skip transactions with no shielded activity
    if (valueBalanceSapling === 0 && valueBalanceOrchard === 0) {
      continue;
    }

    // Determine the net flow
    //
    // valueBalance semantics (from Zcash protocol):
    // - Positive valueBalance = ZEC LEAVING shielded pool → transparent (DESHIELD)
    // - Negative valueBalance = ZEC ENTERING shielded pool ← transparent (SHIELD)
    //
    // Think of it as: valueBalance = shielded_outputs - shielded_inputs
    // - If you're shielding: inputs > outputs → negative balance
    // - If you're deshielding: outputs > inputs → positive balance
    const totalValueBalance = valueBalanceSapling + valueBalanceOrchard;

    // Calculate absolute amounts per pool
    const saplingAmount = Math.abs(valueBalanceSapling);
    const orchardAmount = Math.abs(valueBalanceOrchard);

    // Determine pool type
    const poolType = determinePool(valueBalanceSapling, valueBalanceOrchard);

    // Create flow record(s)
    // Note: A transaction can have mixed flows (some shielding, some deshielding)
    // For simplicity, we classify based on the NET flow direction
    // But we track both pool amounts for accuracy

    if (totalValueBalance > 0) {
      // Net DESHIELDING (shielded → transparent)
      // Positive value = ZEC leaving the shielded pool
      flows.push({
        txid: tx.txid,
        block_height: tx.block_height,
        block_time: tx.block_time,
        flow_type: 'deshield',
        amount_zat: totalValueBalance, // Positive value
        pool: poolType,
        amount_sapling_zat: valueBalanceSapling > 0 ? valueBalanceSapling : 0,
        amount_orchard_zat: valueBalanceOrchard > 0 ? valueBalanceOrchard : 0,
        transparent_value_zat: 0, // Would need to sum transparent outputs
      });
    } else if (totalValueBalance < 0) {
      // Net SHIELDING (transparent → shielded)
      // Negative value = ZEC entering the shielded pool
      flows.push({
        txid: tx.txid,
        block_height: tx.block_height,
        block_time: tx.block_time,
        flow_type: 'shield',
        amount_zat: Math.abs(totalValueBalance), // Store as positive
        pool: poolType,
        amount_sapling_zat: valueBalanceSapling < 0 ? Math.abs(valueBalanceSapling) : 0,
        amount_orchard_zat: valueBalanceOrchard < 0 ? Math.abs(valueBalanceOrchard) : 0,
        transparent_value_zat: 0, // Would need to sum transparent inputs
      });
    }
    // If totalValueBalance === 0 but pools are active, it's a z-to-z transfer (skip for now)
  }

  return flows;
}

/**
 * Insert flows into database
 */
async function insertFlows(flows) {
  if (flows.length === 0) return 0;

  let inserted = 0;

  // Insert in smaller chunks to avoid parameter limit issues
  const CHUNK_SIZE = 500;

  for (let i = 0; i < flows.length; i += CHUNK_SIZE) {
    const chunk = flows.slice(i, i + CHUNK_SIZE);

    // Build bulk insert query for this chunk
    const values = [];
    const placeholders = [];
    let paramIndex = 1;

    for (const flow of chunk) {
      placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8})`);
      values.push(
        flow.txid,
        flow.block_height,
        flow.block_time,
        flow.flow_type,
        flow.amount_zat,
        flow.pool,
        flow.amount_sapling_zat,
        flow.amount_orchard_zat,
        flow.transparent_value_zat
      );
      paramIndex += 9;
    }

    const query = `
      INSERT INTO shielded_flows (
        txid, block_height, block_time, flow_type, amount_zat,
        pool, amount_sapling_zat, amount_orchard_zat, transparent_value_zat
      )
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (txid, flow_type) DO NOTHING
    `;

    const result = await pool.query(query, values);
    inserted += result.rowCount;
  }

  return inserted;
}

/**
 * Main backfill function
 */
async function backfill() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║        Shielded Flows Backfill Script                     ║');
  console.log('║        Round-Trip Transaction Linking (Phase 1)           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');

  const startTime = Date.now();

  try {
    // Test database connection
    const testResult = await pool.query('SELECT NOW() as time, current_database() as db');
    console.log(`✅ Connected to: ${testResult.rows[0].db}`);
    console.log(`   Server time: ${testResult.rows[0].time}`);
    console.log('');

    // Check if table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'shielded_flows'
      ) as exists
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('❌ Table shielded_flows does not exist!');
      console.log('   Run this SQL first:');
      console.log('   psql -d your_db -f scripts/create-shielded-flows-table.sql');
      process.exit(1);
    }

    console.log('✅ Table shielded_flows exists');

    // Get current progress (last block processed)
    const progressResult = await pool.query(`
      SELECT COALESCE(MAX(block_height), 0) as max_height
      FROM shielded_flows
    `);
    const lastProcessed = progressResult.rows[0].max_height;

    // Use provided fromHeight or resume from last processed
    const startHeight = fromHeight > 0 ? fromHeight : lastProcessed;

    console.log(`   Last processed block: ${lastProcessed}`);
    console.log(`   Starting from: ${startHeight}`);
    console.log('');

    // Get total transactions to process
    const countResult = await pool.query(`
      SELECT
        MAX(block_height) as max_height,
        COUNT(*) as total_shielded
      FROM transactions
      WHERE block_height > $1
        AND (value_balance_sapling != 0 OR value_balance_orchard != 0)
    `, [startHeight]);

    const maxHeight = countResult.rows[0].max_height;
    const totalToProcess = parseInt(countResult.rows[0].total_shielded);

    if (!maxHeight || totalToProcess === 0) {
      console.log('✅ No new transactions to process');
      console.log('');
      await pool.end();
      return;
    }

    console.log(`📊 Processing ${totalToProcess.toLocaleString()} shielded transactions`);
    console.log(`   Block range: ${startHeight} → ${maxHeight}`);
    console.log(`   Batch size: ${batchSize}`);
    console.log('');

    // Process in batches
    let offset = 0;
    let totalInserted = 0;
    let batchNum = 0;

    while (true) {
      batchNum++;

      // Fetch batch of transactions with shielded activity
      const batchResult = await pool.query(`
        SELECT
          txid,
          block_height,
          block_time,
          value_balance_sapling,
          value_balance_orchard,
          vin_count,
          vout_count
        FROM transactions
        WHERE block_height > $1
          AND (value_balance_sapling != 0 OR value_balance_orchard != 0)
        ORDER BY block_height ASC
        LIMIT $2 OFFSET $3
      `, [startHeight, batchSize, offset]);

      if (batchResult.rows.length === 0) {
        break;
      }

      // Process batch
      const flows = await processBatch(batchResult.rows);

      // Insert into database
      const inserted = await insertFlows(flows);
      totalInserted += inserted;

      // Get height range for this batch
      const batchMinHeight = batchResult.rows[0].block_height;
      const batchMaxHeight = batchResult.rows[batchResult.rows.length - 1].block_height;

      // Progress update
      const progress = Math.round(((offset + batchResult.rows.length) / totalToProcess) * 100);
      console.log(`   Batch ${batchNum}: blocks ${batchMinHeight}→${batchMaxHeight}, ${flows.length} flows, ${inserted} inserted (${progress}%)`);

      offset += batchSize;

      // Safety check
      if (batchResult.rows.length < batchSize) {
        break;
      }
    }

    // Final stats
    const duration = (Date.now() - startTime) / 1000;

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ Backfill complete!');
    console.log('');
    console.log(`   Total flows inserted: ${totalInserted.toLocaleString()}`);
    console.log(`   Duration: ${duration.toFixed(1)}s`);
    console.log('');

    // Show summary stats
    const statsResult = await pool.query(`
      SELECT
        flow_type,
        pool,
        COUNT(*) as count,
        SUM(amount_zat) / 100000000.0 as total_zec,
        AVG(amount_zat) / 100000000.0 as avg_zec
      FROM shielded_flows
      GROUP BY flow_type, pool
      ORDER BY flow_type, pool
    `);

    console.log('📊 Summary by flow type and pool:');
    console.log('');
    for (const row of statsResult.rows) {
      console.log(`   ${row.flow_type.padEnd(10)} ${row.pool.padEnd(8)} ${parseInt(row.count).toLocaleString().padStart(10)} txs, ${parseFloat(row.total_zec).toFixed(2).padStart(12)} ZEC total, ${parseFloat(row.avg_zec).toFixed(4)} ZEC avg`);
    }
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Error during backfill:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run
backfill();
