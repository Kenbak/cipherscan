/**
 * Address Routes
 *
 * Handles address-related endpoints:
 * - GET /api/labels - Get all official address labels
 * - GET /api/label/:address - Get label for a specific address
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
 * GET /api/labels
 * Get all official address labels from the database
 */
router.get('/api/labels', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT address, label, category, description, verified, logo_url
       FROM address_labels
       ORDER BY category, label`
    );

    res.json({
      labels: result.rows.map(row => ({
        address: row.address,
        label: row.label,
        category: row.category,
        description: row.description,
        verified: row.verified,
        logoUrl: row.logo_url,
      })),
      count: result.rows.length,
    });
  } catch (error) {
    console.error('Error fetching labels:', error);
    res.status(500).json({ error: 'Failed to fetch labels', labels: [] });
  }
});

/**
 * GET /api/label/:address
 * Get label for a specific address
 */
router.get('/api/label/:address', async (req, res) => {
  try {
    const { address } = req.params;

    const result = await pool.query(
      `SELECT address, label, category, description, verified, logo_url
       FROM address_labels
       WHERE address = $1`,
      [address]
    );

    if (result.rows.length === 0) {
      return res.json({ label: null });
    }

    const row = result.rows[0];
    res.json({
      address: row.address,
      label: row.label,
      category: row.category,
      description: row.description,
      verified: row.verified,
      logoUrl: row.logo_url,
    });
  } catch (error) {
    console.error('Error fetching label:', error);
    res.status(500).json({ error: 'Failed to fetch label', label: null });
  }
});

/**
 * GET /api/address/:address
 * Get address details including balance and transactions
 *
 * Query params:
 * - page: Page number (1-based, default 1)
 * - limit: Transactions per page (default 25, max 100)
 *
 * Returns Etherscan-style pagination with page numbers.
 */
router.get('/api/address/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 25, 100);
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const offset = (page - 1) * limit;

    if (!address) {
      return res.status(400).json({ error: 'Invalid address' });
    }

    // Check if it's a shielded address
    const isShielded = address.startsWith('zs') ||
                       address.startsWith('u') ||
                       address.startsWith('zc') ||
                       address.startsWith('ztestsapling');

    if (isShielded) {
      let addressType = 'shielded';
      let noteMessage = 'Shielded address - balance and transactions are private';

      if (address.startsWith('u')) {
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
    const totalTxCount = parseInt(summary.tx_count) || 0;
    const totalPages = Math.ceil(totalTxCount / limit);

    // Optimized query with OFFSET (fast with proper indexes)
    // The new composite indexes make this efficient even for large offsets
    const txResult = await pool.query(
      `WITH address_txids AS (
        SELECT txid FROM transaction_outputs WHERE address = $1
        UNION
        SELECT txid FROM transaction_inputs WHERE address = $1
      ),
      tx_ordered AS (
        SELECT
          t.txid,
          t.block_height,
          t.block_time,
          t.size,
          t.tx_index,
          t.has_sapling,
          t.has_orchard
        FROM transactions t
        WHERE t.txid IN (SELECT txid FROM address_txids)
        ORDER BY t.block_height DESC, t.tx_index DESC
        LIMIT $2 OFFSET $3
      )
      SELECT
        tv.txid,
        tv.block_height,
        tv.block_time,
        tv.size,
        tv.tx_index,
        tv.has_sapling,
        tv.has_orchard,
        COALESCE(my_in.value, 0) as input_value,
        COALESCE(my_out.value, 0) as output_value,
        other_in.addresses as sender_addresses,
        other_out.addresses as recipient_addresses
      FROM tx_ordered tv
      LEFT JOIN LATERAL (
        SELECT SUM(value) as value FROM transaction_inputs
        WHERE txid = tv.txid AND address = $1
      ) my_in ON true
      LEFT JOIN LATERAL (
        SELECT SUM(value) as value FROM transaction_outputs
        WHERE txid = tv.txid AND address = $1
      ) my_out ON true
      LEFT JOIN LATERAL (
        SELECT ARRAY_AGG(DISTINCT address) as addresses
        FROM transaction_inputs
        WHERE txid = tv.txid AND address IS NOT NULL AND address != $1
      ) other_in ON true
      LEFT JOIN LATERAL (
        SELECT ARRAY_AGG(DISTINCT address) as addresses
        FROM transaction_outputs
        WHERE txid = tv.txid AND address IS NOT NULL AND address != $1
      ) other_out ON true
      ORDER BY tv.block_height DESC, tv.tx_index DESC`,
      [address, limit, offset]
    );

    const transactions = txResult.rows.map(tx => {
      const netChange = parseFloat(tx.output_value) - parseFloat(tx.input_value);
      const isReceiving = netChange > 0;

      let counterparty = null;
      if (isReceiving && tx.sender_addresses && tx.sender_addresses.length > 0) {
        counterparty = tx.sender_addresses[0];
      } else if (!isReceiving && tx.recipient_addresses && tx.recipient_addresses.length > 0) {
        counterparty = tx.recipient_addresses[0];
      }

      return {
        txid: tx.txid,
        blockHeight: tx.block_height,
        blockTime: tx.block_time,
        size: tx.size,
        txIndex: tx.tx_index,
        hasSapling: tx.has_sapling,
        hasOrchard: tx.has_orchard,
        inputValue: parseFloat(tx.input_value),
        outputValue: parseFloat(tx.output_value),
        netChange,
        counterparty,
        senderCount: tx.sender_addresses?.length || 0,
        recipientCount: tx.recipient_addresses?.length || 0,
      };
    });

    res.json({
      address: summary.address,
      balance: parseFloat(summary.balance),
      totalReceived: parseFloat(summary.total_received),
      totalSent: parseFloat(summary.total_sent),
      txCount: totalTxCount,
      firstSeen: summary.first_seen,
      lastSeen: summary.last_seen,
      transactions,
      pagination: {
        page,
        limit,
        total: totalTxCount,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error('Error fetching address:', error);
    res.status(500).json({ error: 'Failed to fetch address' });
  }
});

module.exports = router;
