/**
 * Mempool transaction routes.
 */

const express = require('express');
const router = express.Router();
const { deps } = require('./_helpers');

// Mempool endpoint - calls Zebra RPC directly
router.get('/api/mempool', async (req, res) => {
  try {
    // Get all transaction IDs in mempool
    const txids = await deps.callZebraRPC('getrawmempool', []);

    if (txids.length === 0) {
      return res.json({
        success: true,
        count: 0,
        showing: 0,
        transactions: [],
        stats: {
          total: 0,
          shielded: 0,
          transparent: 0,
          shieldedPercentage: 0,
        },
      });
    }

    // Fetch details for each transaction (limit to 50 for performance)
    const txidsToFetch = txids.slice(0, 50);
    const transactions = await Promise.all(
      txidsToFetch.map(async (txid) => {
        try {
          const tx = await deps.callZebraRPC('getrawtransaction', [txid, 1]);

          const hasShieldedInputs = (tx.vShieldedSpend && tx.vShieldedSpend.length > 0) ||
                                   (tx.vJoinSplit && tx.vJoinSplit.length > 0) ||
                                   (tx.orchard && tx.orchard.actions && tx.orchard.actions.length > 0) ||
                                   (tx.ironwood && tx.ironwood.actions && tx.ironwood.actions.length > 0);
          const hasShieldedOutputs = (tx.vShieldedOutput && tx.vShieldedOutput.length > 0) ||
                                     (tx.vJoinSplit && tx.vJoinSplit.length > 0) ||
                                     (tx.orchard && tx.orchard.actions && tx.orchard.actions.length > 0) ||
                                     (tx.ironwood && tx.ironwood.actions && tx.ironwood.actions.length > 0);
          const hasTransparentInputs = tx.vin && tx.vin.length > 0 && !tx.vin[0].coinbase;
          const hasTransparentOutputs = tx.vout && tx.vout.length > 0;

          // Determine transaction type
          let txType = 'transparent';
          if (hasShieldedInputs || hasShieldedOutputs) {
            if (hasTransparentInputs || hasTransparentOutputs) {
              txType = 'mixed'; // Shielding or deshielding
            } else {
              txType = 'shielded'; // Fully shielded
            }
          }

          // Calculate size
          const size = tx.hex ? tx.hex.length / 2 : 0;

          // Sum transparent output value (shielded values are encrypted)
          const totalOutput = (tx.vout || []).reduce((sum, o) => sum + (o.value || 0), 0);

          const valueBalanceSapling = tx.valueBalance ?? 0;
          const valueBalanceOrchard = tx.orchard?.valueBalance ?? 0;
          const valueBalanceIronwood = tx.ironwood?.valueBalance ?? 0;

          return {
            txid: tx.txid,
            size,
            type: txType,
            time: tx.time || Math.floor(Date.now() / 1000),
            vin: tx.vin?.length || 0,
            vout: tx.vout?.length || 0,
            vShieldedSpend: tx.vShieldedSpend?.length || 0,
            vShieldedOutput: tx.vShieldedOutput?.length || 0,
            orchardActions: tx.orchard?.actions?.length || 0,
            ironwoodActions: tx.ironwood?.actions?.length || 0,
            hasIronwood: (tx.ironwood?.actions?.length || 0) > 0,
            totalOutput,
            valueBalanceSapling,
            valueBalanceOrchard,
            valueBalanceIronwood,
            version: tx.version,
          };
        } catch (error) {
          console.error(`Error fetching tx ${txid}:`, error.message);
          return null;
        }
      })
    );

    // Filter out failed fetches
    const validTransactions = transactions.filter((tx) => tx !== null);

    // Calculate stats
    const shieldedCount = validTransactions.filter(
      (tx) => tx.type === 'shielded' || tx.type === 'mixed'
    ).length;
    const transparentCount = validTransactions.filter((tx) => tx.type === 'transparent').length;

    const stats = {
      total: txids.length,
      shielded: shieldedCount,
      transparent: transparentCount,
      shieldedPercentage: validTransactions.length > 0
        ? Math.round((shieldedCount / validTransactions.length) * 100)
        : 0,
    };

    res.json({
      success: true,
      count: txids.length,
      showing: validTransactions.length,
      transactions: validTransactions,
      stats,
    });
  } catch (error) {
    console.error('Mempool API error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch mempool',
    });
  }
});

/**
 * GET /api/mempool/tx/:txid
 * Check if a specific transaction is in the mempool and return its details.
 * Used by the tx detail page to show a "pending" state instead of "not found".
 */
router.get('/api/mempool/tx/:txid', async (req, res) => {
  try {
    const { txid } = req.params;
    if (!txid || !/^[a-fA-F0-9]{64}$/.test(txid)) {
      return res.status(400).json({ success: false, error: 'Invalid txid' });
    }

    const mempoolTxids = await deps.callZebraRPC('getrawmempool', []);
    if (!mempoolTxids.includes(txid)) {
      return res.json({ success: true, inMempool: false });
    }

    const tx = await deps.callZebraRPC('getrawtransaction', [txid, 1]);

    const hasShieldedInputs = (tx.vShieldedSpend?.length > 0) ||
                               (tx.vJoinSplit?.length > 0) ||
                               (tx.orchard?.actions?.length > 0) ||
                               (tx.ironwood?.actions?.length > 0);
    const hasShieldedOutputs = (tx.vShieldedOutput?.length > 0) ||
                                (tx.vJoinSplit?.length > 0) ||
                                (tx.orchard?.actions?.length > 0) ||
                                (tx.ironwood?.actions?.length > 0);
    const hasTransparentInputs = tx.vin?.length > 0 && !tx.vin[0]?.coinbase;
    const hasTransparentOutputs = tx.vout?.length > 0;

    let txType = 'transparent';
    if (hasShieldedInputs || hasShieldedOutputs) {
      txType = (hasTransparentInputs || hasTransparentOutputs) ? 'mixed' : 'shielded';
    }

    const size = tx.hex ? tx.hex.length / 2 : 0;

    const totalOutput = (tx.vout || []).reduce((sum, o) => sum + (o.value || 0), 0);

    res.json({
      success: true,
      inMempool: true,
      transaction: {
        txid: tx.txid,
        size,
        type: txType,
        version: tx.version,
        locktime: tx.locktime,
        firstSeen: Math.floor(Date.now() / 1000),
        vinCount: tx.vin?.length || 0,
        voutCount: tx.vout?.length || 0,
        saplingSpendCount: tx.vShieldedSpend?.length || 0,
        saplingOutputCount: tx.vShieldedOutput?.length || 0,
        orchardActions: tx.orchard?.actions?.length || 0,
        ironwoodActions: tx.ironwood?.actions?.length || 0,
        hasIronwood: (tx.ironwood?.actions?.length || 0) > 0,
        valueBalanceIronwood: tx.ironwood?.valueBalance ?? 0,
        totalOutput,
        outputs: (tx.vout || []).map(o => ({
          value: o.value || 0,
          n: o.n,
          address: o.scriptPubKey?.addresses?.[0] || null,
        })),
      },
    });
  } catch (error) {
    console.error('Mempool tx lookup error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to check mempool' });
  }
});

module.exports = router;
