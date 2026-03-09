#!/usr/bin/env node
/**
 * Repair missing address_transactions entries
 *
 * Finds transactions that exist in transaction_outputs/transaction_inputs
 * but are missing from the address_transactions denormalized table.
 * Also updates addresses.tx_count to reflect the true count.
 *
 * Usage:
 *   node repair-address-transactions.js              # scan & repair all
 *   node repair-address-transactions.js --dry-run    # scan only, don't fix
 *   node repair-address-transactions.js --address t1... # repair single address
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../jobs/.env') });
require('dotenv').config({ path: path.join(__dirname, '../api/.env') });

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 3,
});

const isDryRun = process.argv.includes('--dry-run');
const addrIdx = process.argv.indexOf('--address');
const singleAddress = addrIdx !== -1 ? process.argv[addrIdx + 1] : null;

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function checkTableExists(tableName) {
  const { rows } = await pool.query(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1)`,
    [tableName]
  );
  return rows[0].exists;
}

async function repairAddress(address) {
  // Find all txids involving this address from outputs + inputs
  const { rows: truthTxids } = await pool.query(`
    SELECT DISTINCT txid FROM (
      SELECT txid FROM transaction_outputs WHERE address = $1
      UNION
      SELECT txid FROM transaction_inputs WHERE address = $1
    ) sub
  `, [address]);

  if (truthTxids.length === 0) return { address, truth: 0, indexed: 0, missing: 0, fixed: 0 };

  // Check which are in address_transactions
  const { rows: indexedTxids } = await pool.query(
    `SELECT DISTINCT txid FROM address_transactions WHERE address = $1`,
    [address]
  );

  const indexedSet = new Set(indexedTxids.map(r => r.txid));
  const missingTxids = truthTxids.filter(r => !indexedSet.has(r.txid));

  if (missingTxids.length === 0) {
    return { address, truth: truthTxids.length, indexed: indexedTxids.length, missing: 0, fixed: 0 };
  }

  let fixed = 0;
  if (!isDryRun) {
    for (const { txid } of missingTxids) {
      try {
        // Get transaction metadata
        const { rows: txRows } = await pool.query(
          `SELECT block_height, block_time, tx_index FROM transactions WHERE txid = $1`,
          [txid]
        );
        if (txRows.length === 0) continue;
        const tx = txRows[0];

        // Get value_in (sum of inputs from this address)
        const { rows: inRows } = await pool.query(
          `SELECT COALESCE(SUM(value), 0) as val FROM transaction_inputs WHERE txid = $1 AND address = $2`,
          [txid, address]
        );

        // Get value_out (sum of outputs to this address)
        const { rows: outRows } = await pool.query(
          `SELECT COALESCE(SUM(value), 0) as val FROM transaction_outputs WHERE txid = $1 AND address = $2`,
          [txid, address]
        );

        await pool.query(`
          INSERT INTO address_transactions (address, txid, block_height, tx_index, block_time, value_in, value_out)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (address, txid) DO NOTHING
        `, [address, txid, tx.block_height, tx.tx_index, tx.block_time,
            parseInt(inRows[0].val), parseInt(outRows[0].val)]);

        fixed++;
      } catch (err) {
        log(`  Error inserting ${txid} for ${address}: ${err.message}`);
      }
    }

    // Update tx_count in addresses table
    await pool.query(`
      UPDATE addresses SET tx_count = (
        SELECT COUNT(DISTINCT txid) FROM address_transactions WHERE address = $1
      ) WHERE address = $1
    `, [address]);
  }

  return {
    address,
    truth: truthTxids.length,
    indexed: indexedTxids.length,
    missing: missingTxids.length,
    fixed,
    missingTxids: missingTxids.map(r => r.txid),
  };
}

async function main() {
  log(`Repair address_transactions ${isDryRun ? '(DRY RUN)' : ''}`);

  const hasTable = await checkTableExists('address_transactions');
  if (!hasTable) {
    log('address_transactions table does not exist — nothing to repair');
    await pool.end();
    return;
  }

  let addresses;
  if (singleAddress) {
    addresses = [{ address: singleAddress }];
  } else {
    // Find addresses with potential gaps:
    // Compare addresses.tx_count against actual address_transactions count
    log('Scanning for addresses with mismatched tx_count...');
    const { rows } = await pool.query(`
      SELECT a.address, a.tx_count AS expected, COUNT(DISTINCT at.txid) AS actual
      FROM addresses a
      LEFT JOIN address_transactions at ON at.address = a.address
      WHERE a.tx_count > 0
      GROUP BY a.address, a.tx_count
      HAVING a.tx_count != COUNT(DISTINCT at.txid)
      ORDER BY (a.tx_count - COUNT(DISTINCT at.txid)) DESC
      LIMIT 1000
    `);

    log(`Found ${rows.length} addresses with potential gaps`);
    addresses = rows;
  }

  let totalMissing = 0;
  let totalFixed = 0;

  for (const row of addresses) {
    const result = await repairAddress(row.address);
    if (result.missing > 0) {
      log(`  ${result.address}: ${result.truth} truth, ${result.indexed} indexed, ${result.missing} missing${result.fixed > 0 ? `, ${result.fixed} fixed` : ''}`);
      if (result.missingTxids) {
        for (const txid of result.missingTxids) {
          log(`    missing: ${txid}`);
        }
      }
      totalMissing += result.missing;
      totalFixed += result.fixed;
    }
  }

  log(`\nSummary: ${totalMissing} missing entries found, ${totalFixed} fixed`);
  await pool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  pool.end();
  process.exit(1);
});
