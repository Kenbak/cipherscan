/**
 * Raw transaction data routes — hex, verbose decode, batch fetch.
 */

const express = require('express');
const router = express.Router();
const { validate } = require('../../validation');
const { deps } = require('./_helpers');
const { logSafeError } = require('../../lib/safe-log');

// Runs `fn` over `items` with at most `limit` in flight at once, instead of
// an unbounded Promise.all — caps concurrent gRPC/RPC fan-out per request.
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// Get raw transaction hex (via RPC)
router.get('/api/tx/:txid/raw', async (req, res) => {
  try {
    const { txid } = req.params;

    if (!txid || !/^[a-fA-F0-9]{64}$/.test(txid)) {
      return res.status(400).json({ error: 'Invalid transaction ID' });
    }

    // Call Zebra RPC to get raw transaction
    const rawHex = await deps.callZebraRPC('getrawtransaction', [txid, 0]);

    res.json({
      txid,
      hex: rawHex,
    });
  } catch (error) {
    if (error.message && (error.message.includes('No such mempool') || error.message.includes('not found'))) {
      return res.status(404).json({ error: 'Transaction not found. It may be a testnet transaction or the ID may be incorrect.' });
    }
    logSafeError('Error fetching raw transaction:', error);
    res.status(500).json({ error: 'Failed to fetch raw transaction' });
  }
});

router.get('/api/tx/:txid/verbose', async (req, res) => {
  try {
    const { txid } = req.params;

    if (!txid || !/^[a-fA-F0-9]{64}$/.test(txid)) {
      return res.status(400).json({ error: 'Invalid transaction ID' });
    }

    const [rawHex, decoded] = await Promise.all([
      deps.callZebraRPC('getrawtransaction', [txid, 0]),
      deps.callZebraRPC('getrawtransaction', [txid, 1]),
    ]);

    res.json({
      txid,
      hex: rawHex,
      decoded,
    });
  } catch (error) {
    if (error.message && (error.message.includes('No such mempool') || error.message.includes('not found'))) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    logSafeError('Error fetching verbose transaction:', error);
    res.status(500).json({ error: 'Failed to fetch transaction' });
  }
});

// Batch get raw transactions (for wallet scanning)
router.post('/api/tx/raw/batch', validate('txRawBatch'), async (req, res) => {
  try {
    const { txids } = req.body;

    if (!txids || !Array.isArray(txids)) {
      return res.status(400).json({ error: 'txids array is required' });
    }

    if (txids.length === 0) {
      return res.json({ transactions: [] });
    }

    if (txids.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 transactions per batch' });
    }

    // One shared gRPC client per request (not one per txid), and bounded
    // concurrency instead of an unbounded Promise.all fan-out.
    const client = deps.CompactTxStreamer
      ? new deps.CompactTxStreamer('127.0.0.1:9067', deps.grpc.credentials.createInsecure())
      : null;

    let results;
    try {
      results = await mapWithConcurrency(txids, 8, async (txid) => {
        try {
          if (client) {
            try {
              const rawTx = await new Promise((resolve, reject) => {
                client.GetTransaction({ hash: Buffer.from(txid, 'hex') }, (error, response) => {
                  if (error) {
                    reject(error);
                  } else {
                    resolve(response);
                  }
                });
              });

              if (rawTx && rawTx.data) {
                return {
                  txid,
                  hex: Buffer.from(rawTx.data).toString('hex'),
                  success: true,
                  source: 'lightwalletd',
                };
              }
            } catch (lwdError) {
              // Lightwalletd failed for this txid — fall through to Zebra RPC.
            }
          }

          const rawHex = await deps.callZebraRPC('getrawtransaction', [txid, 0]);
          return { txid, hex: rawHex, success: true, source: 'rpc' };
        } catch (error) {
          return { txid, error: 'Failed to fetch transaction', success: false };
        }
      });
    } finally {
      if (client) client.close();
    }

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`✅ [BATCH RAW] ${successful.length}/${results.length} transactions resolved`);

    res.json({
      transactions: successful.map(r => ({ txid: r.txid, hex: r.hex })),
      failed: failed.length > 0 ? failed : undefined,
      total: txids.length,
      successful: successful.length,
    });
  } catch (error) {
    logSafeError('Error in batch raw transaction fetch:', error);
    res.status(500).json({ error: 'Failed to fetch raw transactions' });
  }
});

module.exports = router;
