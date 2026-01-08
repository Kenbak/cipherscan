#!/usr/bin/env node
/**
 * Recalculate Address Balances
 *
 * This script recalculates all address statistics from scratch
 * based on transaction_inputs and transaction_outputs tables.
 *
 * Run AFTER cleanup-duplicate-inputs.js has completed!
 *
 * Run: node recalculate-addresses.js
 *
 * Progress is logged to console and can be redirected to a file:
 * node recalculate-addresses.js > recalculate.log 2>&1 &
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

async function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

async function main() {
  await log('📊 Address Balance Recalculation Script');
  await log(`📊 Database: ${config.database}`);
  await log('');
  await log('⚠️  This will recalculate ALL address balances from scratch.');
  await log('⚠️  Run this AFTER cleanup-duplicate-inputs.js has completed!');
  await log('');

  try {
    await pool.query('SELECT 1');
    await log('✅ Database connected');

    // Step 1: Get count of addresses
    await log('');
    await log('📊 Step 1: Counting addresses...');
    const countResult = await pool.query('SELECT COUNT(*) as count FROM addresses');
    const totalAddresses = parseInt(countResult.rows[0].count);
    await log(`   Found ${totalAddresses.toLocaleString()} addresses`);

    // Step 2: Calculate received amounts (from transaction_outputs)
    await log('');
    await log('📊 Step 2: Calculating received amounts from outputs...');
    await log('   This may take a while...');

    const startTime = Date.now();

    await pool.query(`
      UPDATE addresses a SET
        total_received = COALESCE(o.total_received, 0),
        updated_at = NOW()
      FROM (
        SELECT
          address,
          SUM(value) as total_received
        FROM transaction_outputs
        WHERE address IS NOT NULL
        GROUP BY address
      ) o
      WHERE a.address = o.address
    `);

    await log(`   ✅ Received amounts updated (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);

    // Step 3: Calculate sent amounts (from transaction_inputs)
    await log('');
    await log('📊 Step 3: Calculating sent amounts from inputs...');
    await log('   This may take a while...');

    const step3Start = Date.now();

    await pool.query(`
      UPDATE addresses a SET
        total_sent = COALESCE(i.total_sent, 0),
        updated_at = NOW()
      FROM (
        SELECT
          address,
          SUM(value) as total_sent
        FROM transaction_inputs
        WHERE address IS NOT NULL
        GROUP BY address
      ) i
      WHERE a.address = i.address
    `);

    await log(`   ✅ Sent amounts updated (${((Date.now() - step3Start) / 1000).toFixed(1)}s)`);

    // Step 4: Recalculate balances
    await log('');
    await log('📊 Step 4: Recalculating balances...');

    const step4Start = Date.now();

    await pool.query(`
      UPDATE addresses SET
        balance = total_received - total_sent,
        updated_at = NOW()
    `);

    await log(`   ✅ Balances updated (${((Date.now() - step4Start) / 1000).toFixed(1)}s)`);

    // Step 5: Recalculate tx_count
    await log('');
    await log('📊 Step 5: Recalculating transaction counts...');
    await log('   This may take a while...');

    const step5Start = Date.now();

    await pool.query(`
      UPDATE addresses a SET
        tx_count = COALESCE(tc.count, 0),
        updated_at = NOW()
      FROM (
        SELECT address, COUNT(DISTINCT txid) as count
        FROM (
          SELECT address, txid FROM transaction_outputs WHERE address IS NOT NULL
          UNION
          SELECT address, txid FROM transaction_inputs WHERE address IS NOT NULL
        ) all_txs
        GROUP BY address
      ) tc
      WHERE a.address = tc.address
    `);

    await log(`   ✅ Transaction counts updated (${((Date.now() - step5Start) / 1000).toFixed(1)}s)`);

    // Step 6: Update first_seen and last_seen
    await log('');
    await log('📊 Step 6: Updating first_seen and last_seen timestamps...');

    const step6Start = Date.now();

    await pool.query(`
      UPDATE addresses a SET
        first_seen = COALESCE(ts.first_seen, a.first_seen),
        last_seen = COALESCE(ts.last_seen, a.last_seen),
        updated_at = NOW()
      FROM (
        SELECT
          address,
          MIN(block_time) as first_seen,
          MAX(block_time) as last_seen
        FROM (
          SELECT o.address, t.block_time
          FROM transaction_outputs o
          JOIN transactions t ON o.txid = t.txid
          WHERE o.address IS NOT NULL
          UNION ALL
          SELECT i.address, t.block_time
          FROM transaction_inputs i
          JOIN transactions t ON i.txid = t.txid
          WHERE i.address IS NOT NULL
        ) all_times
        GROUP BY address
      ) ts
      WHERE a.address = ts.address
    `);

    await log(`   ✅ Timestamps updated (${((Date.now() - step6Start) / 1000).toFixed(1)}s)`);

    // Summary
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

    await log('');
    await log('='.repeat(60));
    await log('📊 SUMMARY');
    await log('='.repeat(60));
    await log(`   Addresses recalculated: ${totalAddresses.toLocaleString()}`);
    await log(`   Total time: ${totalTime}s`);
    await log('');

    // Show some stats
    const statsResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE balance > 0) as with_balance,
        SUM(balance) / 100000000.0 as total_balance_zec
      FROM addresses
    `);
    const stats = statsResult.rows[0];
    await log(`   Total addresses: ${parseInt(stats.total).toLocaleString()}`);
    await log(`   With balance > 0: ${parseInt(stats.with_balance).toLocaleString()}`);
    await log(`   Total balance: ${parseFloat(stats.total_balance_zec).toLocaleString()} ZEC`);
    await log('');
    await log('🎉 Address recalculation complete!');

  } catch (err) {
    await log(`❌ Error: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
