/**
 * Address Routes
 *
 * Handles address-related endpoints:
 * - GET /api/address/:address - Get address details and transactions
 */

const express = require('express');
const router = express.Router();

// Dependencies injected via app.locals
let pool;

// Middleware to inject dependencies
router.use((req, res, next) => {
  pool = req.app.locals.pool;
  next();
});

/**
 * GET /api/address/:address
 * Get address details including balance and recent transactions
 */
router.get('/api/address/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;

    if (!address) {
      return res.status(400).json({ error: 'Invalid address' });
    }

    // Check if it's a shielded address
    const isShielded = address.startsWith('zs') ||
                       address.startsWith('u') ||
                       address.startsWith('zc') ||
                       address.startsWith('ztestsapling');

    if (isShielded) {
      // Determine address type and note message (match RPC API exactly)
      let addressType = 'shielded';
      let noteMessage = 'Shielded address - balance and transactions are private';

      if (address.startsWith('u')) {
        // For unified addresses, we should ideally check if they have a transparent receiver
        // But for now, treat all u* addresses as fully shielded
        noteMessage = 'Fully shielded unified address - balance and transactions are private';
      }

      return res.status(200).json({
        address,
        type: addressType,
        balance: null,
        transactions: [],
        note: noteMessage
      });
    }

    // Get address summary
    const summaryResult = await pool.query(
      `SELECT
        address,
        total_received,
        total_sent,
        balance,
        tx_count,
        first_seen,
        last_seen
      FROM addresses
      WHERE address = $1`,
      [address]
    );

    if (summaryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Address not found or has no transaction history' });
    }

    const summary = summaryResult.rows[0];

    // Get recent transactions (optimized query for addresses with many txs)
    // Step 1: Find the most recent txids efficiently
    const txResult = await pool.query(
      `WITH recent_txids AS (
        SELECT DISTINCT txid
        FROM (
          SELECT txid FROM transaction_outputs
          WHERE address = $1
          UNION ALL
          SELECT txid FROM transaction_inputs
          WHERE address = $1
        ) all_txids
      )
      SELECT
        t.txid,
        t.block_height,
        t.block_time,
        t.size,
        t.tx_index,
        t.has_sapling,
        t.has_orchard,
        COALESCE(ti.input_value, 0) as input_value,
        COALESCE(tov.output_value, 0) as output_value
      FROM transactions t
      JOIN recent_txids rt ON t.txid = rt.txid
      LEFT JOIN (
        SELECT txid, SUM(value) as input_value
        FROM transaction_inputs
        WHERE address = $1
        GROUP BY txid
      ) ti ON t.txid = ti.txid
      LEFT JOIN (
        SELECT txid, SUM(value) as output_value
        FROM transaction_outputs
        WHERE address = $1
        GROUP BY txid
      ) tov ON t.txid = tov.txid
      ORDER BY t.block_height DESC, t.tx_index DESC
      LIMIT $2 OFFSET $3`,
      [address, limit, offset]
    );

    const transactions = txResult.rows.map(tx => ({
      txid: tx.txid,
      blockHeight: tx.block_height,
      blockTime: tx.block_time,
      size: tx.size,
      txIndex: tx.tx_index,
      hasSapling: tx.has_sapling,
      hasOrchard: tx.has_orchard,
      inputValue: parseFloat(tx.input_value),
      outputValue: parseFloat(tx.output_value),
      netChange: parseFloat(tx.output_value) - parseFloat(tx.input_value),
    }));

    res.json({
      address: summary.address,
      balance: parseFloat(summary.balance),
      totalReceived: parseFloat(summary.total_received),
      totalSent: parseFloat(summary.total_sent),
      txCount: summary.tx_count,
      firstSeen: summary.first_seen,
      lastSeen: summary.last_seen,
      transactions,
      pagination: {
        limit,
        offset,
        total: summary.tx_count,
        hasMore: offset + limit < summary.tx_count,
      },
    });
  } catch (error) {
    console.error('Error fetching address:', error);
    res.status(500).json({ error: 'Failed to fetch address' });
  }
});

module.exports = router;
