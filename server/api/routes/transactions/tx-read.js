/**
 * Standard transaction read routes — shielded filters and linkability analysis.
 */

const express = require('express');
const router = express.Router();
const { validate } = require('../../validation');
const { deps } = require('./_helpers');

// Get shielded transactions with filters (MUST be before /api/tx/:txid)
router.get('/api/tx/shielded', validate('shieldedTxs'), async (req, res) => {
  try {
    // Query parameters
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const poolType = req.query.pool; // 'sapling', 'orchard', or undefined for both
    const txType = req.query.type; // 'fully-shielded', 'partial', or undefined for all
    const minActions = parseInt(req.query.min_actions) || 0;

    // Build WHERE clause
    const conditions = [];
    const queryParams = [];
    let paramIndex = 1;

    // Filter by pool type
    if (poolType === 'sapling') {
      conditions.push(`(t.has_sapling = true)`);
    } else if (poolType === 'orchard') {
      conditions.push(`(t.has_orchard = true)`);
    } else if (poolType === 'ironwood') {
      conditions.push(`(t.has_ironwood = true)`);
    } else {
      conditions.push(`(t.has_sapling = true OR t.has_orchard = true OR t.has_ironwood = true)`);
    }

    // Filter by transaction type
    if (txType === 'fully-shielded') {
      // Fully shielded: no transparent inputs/outputs
      conditions.push(`(t.vin_count = 0 AND t.vout_count = 0)`);
    } else if (txType === 'partial') {
      // Partial: has both transparent and shielded
      conditions.push(`(t.vin_count > 0 OR t.vout_count > 0)`);
    }

    // Filter by minimum actions
    if (minActions > 0) {
      conditions.push(`(t.orchard_actions >= $${paramIndex} OR t.sapling_spend_count >= $${paramIndex} OR t.sapling_output_count >= $${paramIndex})`);
      queryParams.push(minActions);
      paramIndex++;
    }

    // Add limit and offset
    queryParams.push(limit, offset);

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Query (including Rust indexer fields)
    // No JOIN to blocks needed: all columns come from transactions table,
    // and data integrity is maintained by the Rust indexer (deletes on reorg).
    const result = await deps.pool.query(
      `SELECT
        t.txid,
        t.block_height,
        t.block_hash,
        t.block_time,
        t.has_sapling,
        t.has_orchard,
        t.sapling_spend_count,
        t.sapling_output_count,
        t.orchard_actions,
        t.vin_count,
        t.vout_count,
        t.size,
        t.fee,
        t.value_balance_sapling,
        t.value_balance_orchard
      FROM transactions t
      ${whereClause}
      ORDER BY t.block_height DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      queryParams
    );

    // Only run the expensive COUNT(*) when pagination is actually needed
    const skipCount = req.query.skip_count === 'true' || (offset === 0 && limit <= 10);
    let total = 0;

    if (!skipCount) {
      const countResult = await deps.pool.query(
        `SELECT COUNT(*) as total
        FROM transactions t
        ${whereClause}`,
        queryParams.slice(0, -2)
      );
      total = parseInt(countResult.rows[0]?.total || 0);
    }

    res.json({
      transactions: result.rows.map(tx => ({
        txid: tx.txid,
        blockHeight: parseInt(tx.block_height),
        blockHash: tx.block_hash,
        blockTime: parseInt(tx.block_time),
        hasSapling: tx.has_sapling,
        hasOrchard: tx.has_orchard,
        saplingSpendCount: parseInt(tx.sapling_spend_count || 0),
        saplingOutputCount: parseInt(tx.sapling_output_count || 0),
        orchardActions: parseInt(tx.orchard_actions || 0),
        vinCount: parseInt(tx.vin_count || 0),
        voutCount: parseInt(tx.vout_count || 0),
        size: parseInt(tx.size || 0),
        fee: tx.fee ? tx.fee / 100000000 : null,
        valueBalanceSapling: tx.value_balance_sapling ? tx.value_balance_sapling / 100000000 : 0,
        valueBalanceOrchard: tx.value_balance_orchard ? tx.value_balance_orchard / 100000000 : 0,
        type: (tx.vin_count === 0 && tx.vout_count === 0) ? 'fully-shielded' : 'partial',
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: skipCount ? result.rows.length === limit : offset + limit < total,
      },
      filters: {
        pool: poolType || 'all',
        type: txType || 'all',
        minActions: minActions || 0,
      },
    });
  } catch (error) {
    console.error('Error fetching shielded transactions:', error);
    res.status(500).json({ error: 'Failed to fetch shielded transactions' });
  }
});

/**
 * GET /api/tx/:txid/linkability
 * Analyze a specific shielding transaction for potential round-trip deshielding
 */
router.get('/api/tx/:txid/linkability', validate('txLinkability'), async (req, res) => {
  try {
    const { txid } = req.params;

    if (!txid || !/^[a-fA-F0-9]{64}$/.test(txid)) {
      return res.status(400).json({ error: 'Invalid transaction ID' });
    }

    // Parse options
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 5, 1), 20);
    // Tolerance in ZEC (default 0.001 ZEC = 100,000 zatoshis)
    const toleranceZec = Math.min(Math.max(parseFloat(req.query.tolerance) || 0.001, 0.0001), 0.1);
    const toleranceZat = Math.round(toleranceZec * 100000000);

    console.log(`🔗 [LINKABILITY] Analyzing transaction (limit=${limit}, tolerance=${toleranceZec} ZEC)`);

    const result = await deps.findLinkedTransactions(deps.pool, txid, { limit, toleranceZat });

    if (result.error) {
      if (result.code === 'TX_NOT_FOUND') {
        return res.status(404).json(result);
      }
      return res.status(400).json(result);
    }

    console.log(`✅ [LINKABILITY] Found ${result.totalMatches} potential links, top score: ${result.highestScore}`);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('❌ [LINKABILITY] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to analyze transaction linkability',
    });
  }
});

module.exports = router;
