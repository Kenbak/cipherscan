#!/usr/bin/env node

/**
 * Migrate Value Balances
 * 
 * Updates old transactions to populate value_balance_sapling and value_balance_orchard
 * from Zebra RPC data. Run once to backfill historical data.
 * 
 * Usage:
 *   node scripts/migrate-value-balances.js
 * 
 * Environment:
 *   ZEBRA_RPC_URL, DB_HOST, DB_NAME, DB_USER, DB_PASSWORD
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');

// Configuration
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
  },
  batchSize: 100, // Process 100 txs at a time
};

const pool = new Pool(config.db);

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
      id: 'migrate',
      method,
      params,
    }),
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
}

async function migrateTransaction(txid) {
  try {
    const tx = await zebradRPC('getrawtransaction', [txid, 1]);
    
    // Calculate value balances in zatoshis
    const valueBalanceSapling = Math.round((tx.valueBalance || 0) * 100000000);
    const valueBalanceOrchard = tx.orchard?.valueBalanceZat || Math.round((tx.orchard?.valueBalance || 0) * 100000000);
    const totalValueBalance = valueBalanceSapling + valueBalanceOrchard;

    // Update the transaction
    await pool.query(`
      UPDATE transactions SET
        value_balance = $2,
        value_balance_sapling = $3,
        value_balance_orchard = $4
      WHERE txid = $1
    `, [txid, totalValueBalance, valueBalanceSapling, valueBalanceOrchard]);

    return { success: true, valueBalanceSapling, valueBalanceOrchard };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function migrate() {
  console.log('🔄 Value Balance Migration Script');
  console.log(`Database: ${config.db.database}`);
  console.log(`Zebra RPC: ${config.zebra.url}`);
  console.log('');

  // Test connections
  await pool.query('SELECT 1');
  console.log('✅ Database connected');
  
  await zebradRPC('getblockcount');
  console.log('✅ Zebra connected');
  console.log('');

  // Count transactions to migrate (shielded txs with value_balance_orchard = 0)
  const countResult = await pool.query(`
    SELECT COUNT(*) as count FROM transactions
    WHERE (has_sapling = true OR has_orchard = true)
    AND value_balance_orchard = 0
    AND value_balance_sapling = 0
  `);
  
  const totalToMigrate = parseInt(countResult.rows[0].count);
  console.log(`📊 Transactions to migrate: ${totalToMigrate.toLocaleString()}`);
  
  if (totalToMigrate === 0) {
    console.log('✅ Nothing to migrate!');
    process.exit(0);
  }

  console.log('');
  console.log('Starting migration...');
  console.log('');

  let migrated = 0;
  let errors = 0;
  let offset = 0;
  const startTime = Date.now();

  while (true) {
    // Get batch of transactions to migrate
    const batchResult = await pool.query(`
      SELECT txid FROM transactions
      WHERE (has_sapling = true OR has_orchard = true)
      AND value_balance_orchard = 0
      AND value_balance_sapling = 0
      ORDER BY block_height DESC
      LIMIT $1 OFFSET $2
    `, [config.batchSize, offset]);

    if (batchResult.rows.length === 0) break;

    // Process batch
    const promises = batchResult.rows.map(row => migrateTransaction(row.txid));
    const results = await Promise.all(promises);

    results.forEach(r => {
      if (r.success) migrated++;
      else errors++;
    });

    offset += config.batchSize;

    // Progress
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = migrated / elapsed;
    const remaining = totalToMigrate - migrated - errors;
    const eta = remaining / rate;

    console.log(`📊 Progress: ${migrated.toLocaleString()} / ${totalToMigrate.toLocaleString()} (${((migrated / totalToMigrate) * 100).toFixed(1)}%) | ${rate.toFixed(1)} tx/s | ETA: ${Math.round(eta)}s | Errors: ${errors}`);
  }

  console.log('');
  console.log('✅ Migration complete!');
  console.log(`   Migrated: ${migrated.toLocaleString()}`);
  console.log(`   Errors: ${errors}`);
  console.log(`   Duration: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  await pool.end();
  process.exit(0);
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});

