#!/usr/bin/env node

/**
 * Zcash Mainnet Blockchain Indexer
 * Indexes blocks and transactions from Zebra RPC into PostgreSQL
 */

const { Pool } = require('pg');
const axios = require('axios');

// Configuration
const ZEBRA_RPC_URL = process.env.ZEBRA_RPC_URL || 'http://localhost:8232';
const ZEBRA_RPC_USER = process.env.ZEBRA_RPC_USER || '';
const ZEBRA_RPC_PASS = process.env.ZEBRA_RPC_PASS || '';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'zcash_explorer_mainnet',
  user: process.env.DB_USER || 'zcash_user',
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// RPC call helper
async function callZebraRPC(method, params = []) {
  try {
    const response = await axios.post(
      ZEBRA_RPC_URL,
      {
        jsonrpc: '1.0',
        id: 'indexer',
        method,
        params,
      },
      {
        auth: ZEBRA_RPC_USER && ZEBRA_RPC_PASS ? {
          username: ZEBRA_RPC_USER,
          password: ZEBRA_RPC_PASS,
        } : undefined,
        timeout: 30000,
      }
    );
    return response.data.result;
  } catch (error) {
    if (error.response?.data?.error) {
      throw new Error(`RPC Error: ${error.response.data.error.message}`);
    }
    throw error;
  }
}

// Get current blockchain height
async function getCurrentHeight() {
  const info = await callZebraRPC('getblockchaininfo');
  return info.blocks;
}

// Get last indexed height from DB
async function getLastIndexedHeight() {
  const result = await pool.query('SELECT MAX(height) as max_height FROM blocks');
  return result.rows[0].max_height || 0;
}

// Index a single block
async function indexBlock(height) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get block hash
    const blockHash = await callZebraRPC('getblockhash', [height]);

    // Get full block data
    const block = await callZebraRPC('getblock', [blockHash, 2]); // verbosity 2 = full tx data

    // Check if block already exists
    const existingBlock = await client.query(
      'SELECT height FROM blocks WHERE height = $1',
      [height]
    );

    if (existingBlock.rows.length > 0) {
      console.log(`Block ${height} already indexed, skipping`);
      await client.query('COMMIT');
      return;
    }

    // Insert block
    await client.query(`
      INSERT INTO blocks (
        height, hash, timestamp, transaction_count, size, difficulty,
        confirmations, previous_block_hash, next_block_hash, version,
        merkle_root, final_sapling_root, bits, nonce, solution
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (height) DO NOTHING
    `, [
      block.height,
      block.hash,
      block.time,
      block.tx.length,
      block.size || 0,
      block.difficulty || '0',
      block.confirmations,
      block.previousblockhash || null,
      block.nextblockhash || null,
      block.version,
      block.merkleroot,
      block.finalsaplingroot || null,
      block.bits || null,
      block.nonce || null,
      block.solution || null,
    ]);

    // Index transactions
    for (const tx of block.tx) {
      await indexTransaction(client, tx, height, block.time);
    }

    await client.query('COMMIT');
    console.log(`✓ Indexed block ${height} (${block.tx.length} txs)`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`✗ Error indexing block ${height}:`, error.message);
    throw error;
  } finally {
    client.release();
  }
}

// Index a transaction
async function indexTransaction(client, tx, blockHeight, blockTime) {
  const hasShielded = (tx.vShieldedSpend?.length > 0) || (tx.vShieldedOutput?.length > 0);
  const hasOrchard = (tx.orchard?.actions?.length > 0);

  await client.query(`
    INSERT INTO transactions (
      txid, block_height, timestamp, version, locktime, expiry_height,
      vin_count, vout_count, shielded_spends, shielded_outputs,
      orchard_actions, has_shielded, has_orchard, size
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    ON CONFLICT (txid) DO NOTHING
  `, [
    tx.txid,
    blockHeight,
    blockTime,
    tx.version || 0,
    tx.locktime || 0,
    tx.expiryheight || 0,
    tx.vin?.length || 0,
    tx.vout?.length || 0,
    tx.vShieldedSpend?.length || 0,
    tx.vShieldedOutput?.length || 0,
    tx.orchard?.actions?.length || 0,
    hasShielded,
    hasOrchard,
    tx.size || 0,
  ]);
}

// Main indexing loop
async function indexLoop() {
  console.log('🚀 Starting Zcash Mainnet Indexer...');

  while (true) {
    try {
      const currentHeight = await getCurrentHeight();
      const lastIndexed = await getLastIndexedHeight();

      if (lastIndexed >= currentHeight) {
        console.log(`✓ Synced to block ${currentHeight}, waiting for new blocks...`);
        await new Promise(resolve => setTimeout(resolve, 75000)); // 75s (Zcash block time)
        continue;
      }

      const nextHeight = lastIndexed + 1;
      console.log(`Indexing block ${nextHeight} / ${currentHeight} (${((nextHeight / currentHeight) * 100).toFixed(2)}%)`);

      await indexBlock(nextHeight);

    } catch (error) {
      console.error('Indexer error:', error.message);
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10s on error
    }
  }
}

// Start indexer
indexLoop().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
