#!/usr/bin/env node
/**
 * Backfill Addresses Table (Deadlock-Safe)
 *
 * The Rust indexer (cipherscan-rust) writes to transaction_outputs and
 * transaction_inputs but may not fully update the addresses summary table.
 * This script backfills all missing addresses and recalculates their stats.
 *
 * Uses batched updates to avoid deadlocks with the concurrent Rust indexer.
 * Each batch locks only a small number of rows for a short time.
 *
 * Safe to run multiple times (idempotent).
 * Safe to run while the indexer is running.
 *
 * Run:
 *   node backfill-addresses.js
 *
 * In tmux for long runs:
 *   node backfill-addresses.js 2>&1 | tee backfill-addresses.log
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '../api/.env') });
const { Pool } = require('pg');

const BATCH_SIZE = 5000;       // Addresses per batch
const MAX_RETRIES = 3;         // Retries per batch on deadlock
const RETRY_DELAY_MS = 2000;   // Wait between retries

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 3,
  idleTimeoutMillis: 60000,
  statement_timeout: 0,
};

const pool = new Pool(config);

function log(message) {
  const timestamp = new Date().toISOString().slice(11, 19);
  console.log(`[${timestamp}] ${message}`);
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Run a query in batches of addresses with deadlock retry.
 * queryFn receives (client, addressBatch) and should run the UPDATE.
 */
async function batchUpdate(stepName, addresses, queryFn) {
  const total = addresses.length;
  const totalBatches = Math.ceil(total / BATCH_SIZE);
  let processed = 0;
  let deadlocks = 0;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = addresses.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    let success = false;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await queryFn(batch);
        processed += batch.length;
        success = true;
        break;
      } catch (err) {
        if (err.code === '40P01') { // Deadlock
          deadlocks++;
          log(`  ⚠ Deadlock on batch ${batchNum}/${totalBatches}, retry ${attempt}/${MAX_RETRIES}...`);
          await sleep(RETRY_DELAY_MS * attempt); // Exponential-ish backoff
        } else {
          throw err; // Non-deadlock error, bail
        }
      }
    }

    if (!success) {
      log(`  ✗ Batch ${batchNum} failed after ${MAX_RETRIES} retries, skipping (${batch.length} addresses)`);
      processed += batch.length; // Count as processed even if skipped
    }

    // Progress every 20 batches
    if (batchNum % 20 === 0 || batchNum === totalBatches) {
      const pct = ((processed / total) * 100).toFixed(1);
      log(`  ${stepName}: ${processed.toLocaleString()}/${total.toLocaleString()} (${pct}%)${deadlocks > 0 ? ` [${deadlocks} deadlocks recovered]` : ''}`);
    }
  }

  return { processed, deadlocks };
}

async function main() {
  log('========================================');
  log('  ADDRESS BACKFILL SCRIPT (Batch Mode)');
  log('========================================');
  log(`Database: ${config.database}`);
  log(`Batch size: ${BATCH_SIZE.toLocaleString()}`);
  log('');

  const totalStart = Date.now();

  try {
    await pool.query('SELECT 1');
    log('✓ Database connected');
    log('');

    // ─── Step 1: Count current state ───
    log('--- Step 1: Counting current state ---');

    const [existingCount, outputAddrCount, inputAddrCount] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM addresses'),
      pool.query('SELECT COUNT(DISTINCT address) as count FROM transaction_outputs WHERE address IS NOT NULL'),
      pool.query('SELECT COUNT(DISTINCT address) as count FROM transaction_inputs WHERE address IS NOT NULL'),
    ]);

    const existing = parseInt(existingCount.rows[0].count);
    const fromOutputs = parseInt(outputAddrCount.rows[0].count);
    const fromInputs = parseInt(inputAddrCount.rows[0].count);

    log(`  Addresses in table:         ${existing.toLocaleString()}`);
    log(`  Unique addresses (outputs):  ${fromOutputs.toLocaleString()}`);
    log(`  Unique addresses (inputs):   ${fromInputs.toLocaleString()}`);
    log('');

    // ─── Step 2: Insert missing addresses ───
    log('--- Step 2: Inserting missing addresses ---');
    log('  Finding addresses not yet in the addresses table...');

    const step2Start = Date.now();

    const insertResult = await pool.query(`
      INSERT INTO addresses (address, balance, total_received, total_sent, tx_count, address_type)
      SELECT sub.address, 0, 0, 0, 0, 'transparent'
      FROM (
        SELECT DISTINCT address FROM transaction_outputs WHERE address IS NOT NULL
        UNION
        SELECT DISTINCT address FROM transaction_inputs WHERE address IS NOT NULL
      ) sub
      WHERE NOT EXISTS (
        SELECT 1 FROM addresses a WHERE a.address = sub.address
      )
      ON CONFLICT DO NOTHING
    `);

    const inserted = insertResult.rowCount;
    log(`  ✓ Inserted ${inserted.toLocaleString()} new addresses (${formatDuration(Date.now() - step2Start)})`);
    log('');

    // ─── Get all addresses to process ───
    log('--- Fetching address list for batched updates ---');
    const addrResult = await pool.query(
      `SELECT address FROM addresses ORDER BY address`
    );
    const allAddresses = addrResult.rows.map(r => r.address);
    log(`  ${allAddresses.length.toLocaleString()} addresses to update`);
    log('');

    // ─── Step 3: Recalculate total_received (batched) ───
    log('--- Step 3: Recalculating total_received (batched) ---');
    const step3Start = Date.now();

    await batchUpdate('total_received', allAddresses, async (batch) => {
      await pool.query(`
        UPDATE addresses a SET
          total_received = COALESCE(o.total_received, 0),
          updated_at = NOW()
        FROM (
          SELECT address, SUM(value) as total_received
          FROM transaction_outputs
          WHERE address = ANY($1)
          GROUP BY address
        ) o
        WHERE a.address = o.address
      `, [batch]);
    });

    log(`  ✓ Done (${formatDuration(Date.now() - step3Start)})`);
    log('');

    // ─── Step 4: Recalculate total_sent (batched) ───
    log('--- Step 4: Recalculating total_sent (batched) ---');
    const step4Start = Date.now();

    await batchUpdate('total_sent', allAddresses, async (batch) => {
      await pool.query(`
        UPDATE addresses a SET
          total_sent = COALESCE(i.total_sent, 0),
          updated_at = NOW()
        FROM (
          SELECT address, SUM(value) as total_sent
          FROM transaction_inputs
          WHERE address = ANY($1)
          GROUP BY address
        ) i
        WHERE a.address = i.address
      `, [batch]);
    });

    log(`  ✓ Done (${formatDuration(Date.now() - step4Start)})`);
    log('');

    // ─── Step 5: Recalculate balance (batched) ───
    log('--- Step 5: Recalculating balances (batched) ---');
    const step5Start = Date.now();

    await batchUpdate('balance', allAddresses, async (batch) => {
      await pool.query(`
        UPDATE addresses SET
          balance = total_received - total_sent,
          updated_at = NOW()
        WHERE address = ANY($1)
      `, [batch]);
    });

    log(`  ✓ Done (${formatDuration(Date.now() - step5Start)})`);
    log('');

    // ─── Step 6: Recalculate tx_count (batched) ───
    log('--- Step 6: Recalculating transaction counts (batched) ---');
    log('  This is the slow step...');
    const step6Start = Date.now();

    await batchUpdate('tx_count', allAddresses, async (batch) => {
      await pool.query(`
        UPDATE addresses a SET
          tx_count = COALESCE(tc.count, 0),
          updated_at = NOW()
        FROM (
          SELECT address, COUNT(DISTINCT txid) as count
          FROM (
            SELECT address, txid FROM transaction_outputs WHERE address = ANY($1)
            UNION
            SELECT address, txid FROM transaction_inputs WHERE address = ANY($1)
          ) all_txs
          GROUP BY address
        ) tc
        WHERE a.address = tc.address
      `, [batch, batch]);
    });

    log(`  ✓ Done (${formatDuration(Date.now() - step6Start)})`);
    log('');

    // ─── Step 7: Update first_seen / last_seen (batched) ───
    log('--- Step 7: Updating first_seen / last_seen (batched) ---');
    const step7Start = Date.now();

    await batchUpdate('timestamps', allAddresses, async (batch) => {
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
            WHERE o.address = ANY($1)
            UNION ALL
            SELECT i.address, t.block_time
            FROM transaction_inputs i
            JOIN transactions t ON i.txid = t.txid
            WHERE i.address = ANY($1)
          ) all_times
          GROUP BY address
        ) ts
        WHERE a.address = ts.address
      `, [batch, batch]);
    });

    log(`  ✓ Done (${formatDuration(Date.now() - step7Start)})`);
    log('');

    // ─── Step 8: Summary ───
    log('========================================');
    log('  SUMMARY');
    log('========================================');

    const statsResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE balance > 0) as with_balance,
        COUNT(*) FILTER (WHERE balance < 0) as negative_balance,
        SUM(balance) / 100000000.0 as total_balance_zec,
        MAX(tx_count) as max_tx_count
      FROM addresses
    `);

    const stats = statsResult.rows[0];
    const totalTime = Date.now() - totalStart;

    log(`  Total addresses:      ${parseInt(stats.total).toLocaleString()}`);
    log(`  With balance > 0:     ${parseInt(stats.with_balance).toLocaleString()}`);
    log(`  With balance < 0:     ${parseInt(stats.negative_balance).toLocaleString()} (should be 0)`);
    log(`  Total balance (ZEC):  ${parseFloat(stats.total_balance_zec).toLocaleString()}`);
    log(`  Max tx_count:         ${parseInt(stats.max_tx_count).toLocaleString()}`);
    log(`  New addresses added:  ${inserted.toLocaleString()}`);
    log(`  Total time:           ${formatDuration(totalTime)}`);
    log('');
    log('✓ Backfill complete!');

  } catch (err) {
    log(`✗ ERROR: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
