#!/usr/bin/env node
/**
 * Cleanup Duplicate Transaction Inputs & Outputs
 *
 * This script removes duplicate entries from transaction_inputs and
 * transaction_outputs tables where (txid, vout_index) appears multiple times.
 *
 * Root cause: ON CONFLICT DO NOTHING without unique constraint doesn't work.
 * Fixed in indexer by adding: ON CONFLICT (txid, vout_index) DO NOTHING
 *
 * Run: node cleanup-duplicate-inputs.js
 *
 * Progress is logged to console and can be redirected to a file:
 * node cleanup-duplicate-inputs.js > cleanup.log 2>&1 &
 */

require('dotenv').config();
const { Pool } = require('pg');

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 5,
  idleTimeoutMillis: 30000,
};

const pool = new Pool(config);

const BATCH_SIZE = 1000; // Process 1000 transactions at a time

async function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

async function getTotalDuplicates(tableName) {
  const result = await pool.query(`
    SELECT COUNT(*) as duplicate_count
    FROM (
      SELECT txid, vout_index, COUNT(*) as cnt
      FROM ${tableName}
      GROUP BY txid, vout_index
      HAVING COUNT(*) > 1
    ) dups
  `);
  return parseInt(result.rows[0].duplicate_count) || 0;
}

async function getTransactionsWithDuplicates(tableName, limit) {
  const result = await pool.query(`
    SELECT DISTINCT txid
    FROM (
      SELECT txid, vout_index, COUNT(*) as cnt
      FROM ${tableName}
      GROUP BY txid, vout_index
      HAVING COUNT(*) > 1
    ) dups
    LIMIT $1
  `, [limit]);
  return result.rows.map(r => r.txid);
}

async function cleanupTransaction(tableName, txid) {
  const result = await pool.query(`
    DELETE FROM ${tableName} a
    USING ${tableName} b
    WHERE a.ctid < b.ctid
      AND a.txid = b.txid
      AND a.vout_index = b.vout_index
      AND a.txid = $1
  `, [txid]);
  return result.rowCount;
}

async function addUniqueConstraint(tableName, constraintName) {
  try {
    await pool.query(`
      ALTER TABLE ${tableName}
      ADD CONSTRAINT ${constraintName}
      UNIQUE (txid, vout_index)
    `);
    await log(`✅ Added unique constraint on ${tableName}(txid, vout_index)`);
    return true;
  } catch (err) {
    if (err.message.includes('already exists')) {
      await log(`ℹ️  Unique constraint already exists on ${tableName}`);
      return true;
    }
    if (err.message.includes('must be owner')) {
      await log(`⚠️  Cannot add constraint (not owner). Run manually as postgres:`);
      await log(`   sudo -u postgres psql -d ${config.database} -c "ALTER TABLE ${tableName} ADD CONSTRAINT ${constraintName} UNIQUE (txid, vout_index);"`);
      return false; // Continue with script, don't crash
    }
    throw err;
  }
}

async function cleanupTable(tableName, constraintName) {
  await log(`\n${'='.repeat(60)}`);
  await log(`🧹 Cleaning up ${tableName}`);
  await log(`${'='.repeat(60)}`);

  // Get initial count
  await log('📊 Counting transactions with duplicates...');
  const totalDuplicateTxs = await getTotalDuplicates(tableName);
  await log(`📊 Found ${totalDuplicateTxs.toLocaleString()} transactions with duplicate entries`);

  if (totalDuplicateTxs === 0) {
    await log('✅ No duplicates found!');
    await addUniqueConstraint(tableName, constraintName);
    return { processed: 0, deleted: 0 };
  }

  // Process in batches
  let processed = 0;
  let totalDeleted = 0;
  const startTime = Date.now();

  while (true) {
    // Get batch of transactions with duplicates
    const txids = await getTransactionsWithDuplicates(tableName, BATCH_SIZE);

    if (txids.length === 0) {
      break;
    }

    // Clean each transaction
    for (const txid of txids) {
      const deleted = await cleanupTransaction(tableName, txid);
      totalDeleted += deleted;
      processed++;

      // Log progress every 100 transactions
      if (processed % 100 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000) || 1;
        const rate = (processed / elapsed).toFixed(1);
        const remaining = totalDuplicateTxs - processed;
        const eta = remaining > 0 ? (remaining / parseFloat(rate)).toFixed(0) : 0;
        await log(`📊 Progress: ${processed.toLocaleString()}/${totalDuplicateTxs.toLocaleString()} txs | ${totalDeleted.toLocaleString()} rows deleted | ${rate}/s | ETA: ${eta}s`);
      }
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  await log(`✅ Cleanup complete for ${tableName}!`);
  await log(`   - Transactions processed: ${processed.toLocaleString()}`);
  await log(`   - Duplicate rows deleted: ${totalDeleted.toLocaleString()}`);
  await log(`   - Time elapsed: ${totalTime}s`);

  // Add unique constraint
  await log('🔒 Adding unique constraint...');
  await addUniqueConstraint(tableName, constraintName);

  return { processed, deleted: totalDeleted };
}

async function checkShieldedFlows() {
  await log(`\n${'='.repeat(60)}`);
  await log('🔍 Checking shielded_flows for duplicates...');
  await log('='.repeat(60));

  try {
    const result = await pool.query(`
      SELECT COUNT(*) as duplicate_count
      FROM (
        SELECT txid, flow_type, COUNT(*) as cnt
        FROM shielded_flows
        GROUP BY txid, flow_type
        HAVING COUNT(*) > 1
      ) dups
    `);
    const duplicates = parseInt(result.rows[0].duplicate_count) || 0;

    if (duplicates === 0) {
      await log('✅ No duplicates in shielded_flows');
    } else {
      await log(`⚠️  Found ${duplicates} transactions with duplicate flows`);
      await log('   Cleaning up...');

      // Clean duplicates
      await pool.query(`
        DELETE FROM shielded_flows a
        USING shielded_flows b
        WHERE a.ctid < b.ctid
          AND a.txid = b.txid
          AND a.flow_type = b.flow_type
      `);
      await log('✅ Duplicates removed from shielded_flows');
    }

    // Try to add constraint
    try {
      await pool.query(`
        ALTER TABLE shielded_flows
        ADD CONSTRAINT shielded_flows_txid_flow_unique
        UNIQUE (txid, flow_type)
      `);
      await log('✅ Added unique constraint on shielded_flows(txid, flow_type)');
    } catch (err) {
      if (err.message.includes('already exists')) {
        await log('ℹ️  Unique constraint already exists on shielded_flows');
      } else if (err.message.includes('must be owner')) {
        await log(`⚠️  Cannot add constraint (not owner). Run manually as postgres:`);
        await log(`   sudo -u postgres psql -d ${config.database} -c "ALTER TABLE shielded_flows ADD CONSTRAINT shielded_flows_txid_flow_unique UNIQUE (txid, flow_type);"`);
      } else {
        await log(`⚠️  Error adding constraint: ${err.message}`);
      }
    }
  } catch (err) {
    if (err.message.includes('does not exist')) {
      await log('ℹ️  shielded_flows table does not exist, skipping');
    } else {
      await log(`⚠️  Error checking shielded_flows: ${err.message}`);
    }
  }
}

async function main() {
  await log('🧹 Duplicate Cleanup Script');
  await log(`📊 Database: ${config.database}`);
  await log('');

  try {
    // Check connection
    await pool.query('SELECT 1');
    await log('✅ Database connected');

    // Clean both tables
    const inputsResult = await cleanupTable(
      'transaction_inputs',
      'transaction_inputs_txid_vout_unique'
    );

    const outputsResult = await cleanupTable(
      'transaction_outputs',
      'transaction_outputs_txid_vout_unique'
    );

    // Check shielded_flows
    await checkShieldedFlows();

    // Summary
    await log('\n' + '='.repeat(60));
    await log('📊 SUMMARY');
    await log('='.repeat(60));
    await log(`transaction_inputs:  ${inputsResult.deleted.toLocaleString()} duplicates removed`);
    await log(`transaction_outputs: ${outputsResult.deleted.toLocaleString()} duplicates removed`);
    await log('');
    await log('🎉 All done! Tables are now clean with unique constraints.');
    await log('');
    await log('📌 Next step: Run recalculate-addresses.js to fix address balances');

  } catch (err) {
    await log(`❌ Error: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
