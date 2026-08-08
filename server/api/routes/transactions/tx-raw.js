/**
 * Raw transaction data routes — hex, verbose decode, batch fetch.
 */

const express = require('express');
const router = express.Router();
const { validate } = require('../../validation');
const { deps } = require('./_helpers');

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
    console.error('Error fetching raw transaction:', error);
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
    console.error('Error fetching verbose transaction:', error);
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

    if (txids.length > 1000) {
      return res.status(400).json({ error: 'Maximum 1000 transactions per batch' });
    }

    console.log(`🔍 [BATCH RAW] Fetching ${txids.length} raw transactions`);
    console.log(`🔍 [BATCH RAW] First 3 TXIDs:`, txids.slice(0, 3));

    // Try Lightwalletd first (has full TX index), fallback to Zebra RPC
    const results = await Promise.all(
      txids.map(async (txid) => {
        try {
          // Try Lightwalletd GetTransaction first
          if (deps.CompactTxStreamer) {
            try {
              const client = new deps.CompactTxStreamer(
                '127.0.0.1:9067',
                deps.grpc.credentials.createInsecure()
              );

              const rawTx = await new Promise((resolve, reject) => {
                client.GetTransaction(
                  { hash: Buffer.from(txid, 'hex') },
                  (error, response) => {
                    client.close();
                    if (error) {
                      reject(error);
                    } else {
                      resolve(response);
                    }
                  }
                );
              });

              if (rawTx && rawTx.data) {
                const hexData = Buffer.from(rawTx.data).toString('hex');
                console.log(`✅ [BATCH RAW] Found in Lightwalletd: ${txid.slice(0, 8)}`);
                return { txid, hex: hexData, success: true, source: 'lightwalletd' };
              }
            } catch (lwdError) {
              // Lightwalletd failed, try Zebra RPC
              console.log(`⚠️  [BATCH RAW] Lightwalletd failed for ${txid.slice(0, 8)}, trying Zebra...`);
            }
          }

          // Fallback to Zebra RPC
          const rawHex = await deps.callZebraRPC('getrawtransaction', [txid, 0]);
          console.log(`✅ [BATCH RAW] Found in Zebra RPC: ${txid.slice(0, 8)}`);
          return { txid, hex: rawHex, success: true, source: 'rpc' };
        } catch (error) {
          console.error(`❌ [BATCH RAW] Error fetching ${txid.slice(0, 8)}:`, error.message);
          return { txid, error: error.message, success: false };
        }
      })
    );

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`✅ [BATCH RAW] Success: ${successful.length}, Failed: ${failed.length}`);

    res.json({
      transactions: successful.map(r => ({ txid: r.txid, hex: r.hex })),
      failed: failed.length > 0 ? failed : undefined,
      total: txids.length,
      successful: successful.length,
    });
  } catch (error) {
    console.error('Error in batch raw transaction fetch:', error);
    res.status(500).json({ error: 'Failed to fetch raw transactions' });
  }
});

module.exports = router;
