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

    // Get recent transactions with counterparty addresses
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
        COALESCE(tov.output_value, 0) as output_value,
        -- Get sender addresses (from inputs, excluding current address)
        (SELECT ARRAY_AGG(DISTINCT address)
         FROM transaction_inputs
         WHERE txid = t.txid AND address IS NOT NULL AND address != $1
        ) as sender_addresses,
        -- Get recipient addresses (from outputs, excluding current address)
        (SELECT ARRAY_AGG(DISTINCT address)
         FROM transaction_outputs
         WHERE txid = t.txid AND address IS NOT NULL AND address != $1
        ) as recipient_addresses
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

    const transactions = txResult.rows.map(tx => {
      const netChange = parseFloat(tx.output_value) - parseFloat(tx.input_value);
      const isReceiving = netChange > 0;

      // Determine counterparty address
      let counterparty = null;
      if (isReceiving && tx.sender_addresses && tx.sender_addresses.length > 0) {
        // We received - counterparty is the sender
        counterparty = tx.sender_addresses[0];
      } else if (!isReceiving && tx.recipient_addresses && tx.recipient_addresses.length > 0) {
        // We sent - counterparty is the recipient
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
