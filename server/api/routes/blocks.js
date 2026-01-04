/**
 * Block Routes
 * /health, /api/info, /api/blocks, /api/block/:height
 */

const express = require('express');
const router = express.Router();

// Pool will be injected via middleware
let pool;

// Middleware to inject dependencies
router.use((req, res, next) => {
  pool = req.app.locals.pool;
  next();
});

// ============================================================================
// HEALTH & INFO
// ============================================================================

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Get blockchain info (current height, etc.)
router.get('/api/info', async (req, res) => {
  try {
    const result = await pool.query('SELECT MAX(height) as max_height FROM blocks');
    const currentHeight = result.rows[0]?.max_height || 0;

    res.json({
      blocks: currentHeight,
      height: currentHeight,
    });
  } catch (error) {
    console.error('Error fetching blockchain info:', error);
    res.status(500).json({ error: 'Failed to fetch blockchain info' });
  }
});

// ============================================================================
// BLOCK ROUTES
// ============================================================================

// Get recent blocks
router.get('/api/blocks', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    const result = await pool.query(
      `SELECT
        height,
        hash,
        timestamp,
        transaction_count,
        size,
        difficulty,
        miner_address,
        total_fees
      FROM blocks
      ORDER BY height DESC
      LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const countResult = await pool.query('SELECT MAX(height) as max_height FROM blocks');
    const totalBlocks = countResult.rows[0]?.max_height || 0;

    res.json({
      blocks: result.rows,
      pagination: {
        limit,
        offset,
        total: totalBlocks,
        hasMore: offset + limit < totalBlocks,
      },
    });
  } catch (error) {
    console.error('Error fetching blocks:', error);
    res.status(500).json({ error: 'Failed to fetch blocks' });
  }
});

// Get block by height
router.get('/api/block/:height', async (req, res) => {
  try {
    const height = parseInt(req.params.height);

    if (isNaN(height)) {
      return res.status(400).json({ error: 'Invalid block height' });
    }

    // Get block details
    const blockResult = await pool.query(
      `SELECT
        height,
        hash,
        timestamp,
        transaction_count,
        size,
        difficulty,
        confirmations,
        previous_block_hash,
        next_block_hash,
        version,
        merkle_root,
        final_sapling_root,
        bits,
        nonce,
        solution,
        total_fees,
        miner_address
      FROM blocks
      WHERE height = $1`,
      [height]
    );

    if (blockResult.rows.length === 0) {
      return res.status(404).json({ error: 'Block not found' });
    }

    const block = blockResult.rows[0];

    // Get transactions for this block
    const txResult = await pool.query(
      `SELECT
        txid,
        block_height,
        block_time,
        size,
        version,
        locktime,
        vin_count,
        vout_count,
        value_balance,
        value_balance_sapling,
        value_balance_orchard,
        has_sapling,
        has_orchard,
        has_sprout,
        tx_index
      FROM transactions
      WHERE block_height = $1
      ORDER BY tx_index`,
      [height]
    );

    // Get all inputs and outputs for all transactions in this block (optimized: 2 queries instead of N)
    const txids = txResult.rows.map(tx => tx.txid);

    const [inputsResult, outputsResult] = await Promise.all([
      pool.query(
        `SELECT txid, prev_txid, prev_vout, address, value, vout_index
         FROM transaction_inputs
         WHERE txid = ANY($1::text[])
         ORDER BY txid, vout_index`,
        [txids]
      ),
      pool.query(
        `SELECT txid, address, value, vout_index, spent
         FROM transaction_outputs
         WHERE txid = ANY($1::text[])
         ORDER BY txid, vout_index`,
        [txids]
      )
    ]);

    // Group inputs and outputs by txid
    const inputsByTxid = {};
    const outputsByTxid = {};

    inputsResult.rows.forEach(input => {
      if (!inputsByTxid[input.txid]) {
        inputsByTxid[input.txid] = [];
      }
      inputsByTxid[input.txid].push(input);
    });

    outputsResult.rows.forEach(output => {
      if (!outputsByTxid[output.txid]) {
        outputsByTxid[output.txid] = [];
      }
      outputsByTxid[output.txid].push(output);
    });

    // Attach inputs and outputs to transactions
    const transactions = txResult.rows.map(tx => ({
      ...tx,
      inputs: inputsByTxid[tx.txid] || [],
      outputs: outputsByTxid[tx.txid] || [],
    }));

    // Calculate confirmations
    const currentHeightResult = await pool.query('SELECT MAX(height) as max_height FROM blocks');
    const currentHeight = currentHeightResult.rows[0]?.max_height || height;
    const confirmations = currentHeight - height + 1;

    res.json({
      ...block,
      confirmations,
      transactions,
      transactionCount: transactions.length,
    });
  } catch (error) {
    console.error('Error fetching block:', error);
    res.status(500).json({ error: 'Failed to fetch block' });
  }
});

module.exports = router;

