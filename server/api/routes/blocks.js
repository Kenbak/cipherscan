/**
 * Block Routes
 * /health, /api/info, /api/blocks, /api/block/:height
 */

const express = require('express');
const router = express.Router();

let pool;
let redisClient;
let callZebraRPC;

router.use((req, res, next) => {
  pool = req.app.locals.pool;
  redisClient = req.app.locals.redisClient;
  callZebraRPC = req.app.locals.callZebraRPC;
  next();
});

const CROSSLINK_CACHE_KEY = 'crosslink:stats';

async function getFinalizedHeight() {
  if (redisClient && redisClient.isOpen) {
    try {
      const cached = await redisClient.get(CROSSLINK_CACHE_KEY);
      if (cached) {
        const data = JSON.parse(cached);
        if (typeof data.finalizedHeight === 'number') return data.finalizedHeight;
      }
    } catch (e) { /* ignore */ }
  }

  if (typeof callZebraRPC === 'function') {
    try {
      const result = await callZebraRPC('get_tfl_final_block_height_and_hash');
      if (result) return result.height ?? result[0] ?? null;
    } catch (e) { /* ignore */ }
  }

  return null;
}

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
// BLOCK LIST (cursor-based pagination for /blocks page)
// ============================================================================

router.get('/api/blocks/list', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100);
    const cursor = req.query.cursor ? parseInt(req.query.cursor) : null;
    const direction = req.query.direction || 'next'; // 'next' = older, 'prev' = newer

    // Get max height for page calculation
    const maxResult = await pool.query('SELECT MAX(height) as max_height FROM blocks');
    const maxHeight = parseInt(maxResult.rows[0]?.max_height) || 0;

    let result;
    if (cursor === null) {
      // First page — newest blocks
      result = await pool.query(
        `SELECT height, hash, timestamp, transaction_count, size, difficulty
         FROM blocks ORDER BY height DESC LIMIT $1`,
        [limit]
      );
    } else if (direction === 'prev') {
      // Going to newer blocks
      result = await pool.query(
        `SELECT height, hash, timestamp, transaction_count, size, difficulty
         FROM blocks WHERE height > $1 ORDER BY height ASC LIMIT $2`,
        [cursor, limit]
      );
      // Reverse so display order is still DESC
      result.rows.reverse();
    } else {
      // Going to older blocks
      result = await pool.query(
        `SELECT height, hash, timestamp, transaction_count, size, difficulty
         FROM blocks WHERE height < $1 ORDER BY height DESC LIMIT $2`,
        [cursor, limit]
      );
    }

    const finalizedHeight = await getFinalizedHeight();
    const rows = result.rows.map(b => {
      if (finalizedHeight !== null) {
        b.finality_status = parseInt(b.height) <= finalizedHeight ? 'Finalized' : 'NotYetFinalized';
      }
      return b;
    });
    const firstHeight = rows.length > 0 ? parseInt(rows[0].height) : null;
    const lastHeight = rows.length > 0 ? parseInt(rows[rows.length - 1].height) : null;

    const page = firstHeight !== null ? Math.floor((maxHeight - firstHeight) / limit) + 1 : 1;
    const totalPages = Math.ceil(maxHeight / limit);

    res.json({
      success: true,
      blocks: rows,
      pagination: {
        page,
        totalPages,
        total: maxHeight,
        limit,
        hasNext: lastHeight !== null && lastHeight > 1,
        hasPrev: firstHeight !== null && firstHeight < maxHeight,
        nextCursor: lastHeight,
        prevCursor: firstHeight,
      },
    });
  } catch (error) {
    console.error('Error fetching blocks list:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch blocks' });
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

    const [countResult, finalizedHeight] = await Promise.all([
      pool.query('SELECT MAX(height) as max_height FROM blocks'),
      getFinalizedHeight(),
    ]);
    const totalBlocks = countResult.rows[0]?.max_height || 0;

    const blocks = result.rows.map(b => {
      if (finalizedHeight !== null) {
        b.finality_status = parseInt(b.height) <= finalizedHeight ? 'Finalized' : 'NotYetFinalized';
      }
      return b;
    });

    res.json({
      blocks,
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

// Get block by height or hash
router.get('/api/block/:heightOrHash', async (req, res) => {
  try {
    const param = req.params.heightOrHash;
    const isHash = /^[a-fA-F0-9]{64}$/.test(param);
    const height = isHash ? null : parseInt(param);

    if (!isHash && isNaN(height)) {
      return res.status(400).json({ error: 'Invalid block height or hash' });
    }

    // Get block details by height or hash
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
      WHERE ${isHash ? 'hash = $1' : 'height = $1'}`,
      [isHash ? param : height]
    );

    if (blockResult.rows.length === 0) {
      return res.status(404).json({ error: 'Block not found' });
    }

    const block = blockResult.rows[0];
    const blockHeight = parseInt(block.height);

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
        tx_index,
        staking_action_type,
        staking_bond_key,
        staking_delegatee,
        staking_amount_zats
      FROM transactions
      WHERE block_height = $1
      ORDER BY tx_index`,
      [blockHeight]
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

    const [currentHeightResult, finalizedHeight] = await Promise.all([
      pool.query('SELECT MAX(height) as max_height FROM blocks'),
      getFinalizedHeight(),
    ]);
    const currentHeight = currentHeightResult.rows[0]?.max_height || blockHeight;
    const confirmations = currentHeight - blockHeight + 1;

    const response = {
      ...block,
      confirmations,
      transactions,
      transactionCount: transactions.length,
    };

    if (finalizedHeight !== null) {
      response.finality_status = blockHeight <= finalizedHeight ? 'Finalized' : 'NotYetFinalized';
    }

    res.json(response);
  } catch (error) {
    console.error('Error fetching block:', error);
    res.status(500).json({ error: 'Failed to fetch block' });
  }
});

module.exports = router;
