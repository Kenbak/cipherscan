/**
 * Scan Routes
 * 
 * Handles Lightwalletd scanning endpoints:
 * - POST /api/lightwalletd/scan - Scan blocks for Orchard transactions
 */

const express = require('express');
const router = express.Router();

// Dependencies injected via app.locals
let CompactTxStreamer;
let grpc;

// Middleware to inject dependencies
router.use((req, res, next) => {
  CompactTxStreamer = req.app.locals.CompactTxStreamer;
  grpc = req.app.locals.grpc;
  next();
});

/**
 * POST /api/lightwalletd/scan
 *
 * Scan blocks for Orchard transactions using Lightwalletd
 * Returns compact blocks for client-side decryption
 */
router.post('/api/lightwalletd/scan', async (req, res) => {
  try {
    const { startHeight, endHeight } = req.body;

    // Validate inputs
    if (!startHeight) {
      return res.status(400).json({ error: 'startHeight is required' });
    }

    if (isNaN(startHeight) || (endHeight && isNaN(endHeight))) {
      return res.status(400).json({ error: 'Invalid block heights' });
    }

    if (!CompactTxStreamer) {
      return res.status(503).json({ error: 'Lightwalletd client not initialized' });
    }

    console.log(`🔍 [LIGHTWALLETD] Scanning blocks ${startHeight} to ${endHeight || 'latest'}`);

    // Create gRPC client (local connection, no SSL)
    const client = new CompactTxStreamer(
      '127.0.0.1:9067',
      grpc.credentials.createInsecure()
    );

    // Get current block height if endHeight not provided
    let finalEndHeight = endHeight;
    if (!finalEndHeight) {
      finalEndHeight = await new Promise((resolve, reject) => {
        client.GetLatestBlock({}, (error, response) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(parseInt(response.height));
        });
      });
    }

    console.log(`📦 [LIGHTWALLETD] Fetching blocks ${startHeight} to ${finalEndHeight}`);

    // Stream blocks from Lightwalletd
    const blocks = [];

    await new Promise((resolve, reject) => {
      const call = client.GetBlockRange({
        start: { height: startHeight },
        end: { height: finalEndHeight },
      });

      call.on('data', (block) => {
        blocks.push(block);
      });

      call.on('end', () => {
        resolve();
      });

      call.on('error', (error) => {
        reject(error);
      });
    });

    // Close client
    client.close();

    console.log(`✅ [LIGHTWALLETD] Fetched ${blocks.length} blocks`);

    // Return compact blocks (simplified structure for frontend)
    res.json({
      success: true,
      blocksScanned: blocks.length,
      startHeight,
      endHeight: finalEndHeight,
      blocks: blocks.map((block) => ({
        height: block.height,
        hash: block.hash ? Buffer.from(block.hash).toString('hex') : null,
        time: block.time,
        vtx: block.vtx ? block.vtx.map((tx) => ({
          index: tx.index,
          hash: tx.hash ? Buffer.from(tx.hash).toString('hex') : null,
          // Sapling outputs
          outputs: tx.outputs ? tx.outputs.map((output) => ({
            cmu: output.cmu ? Buffer.from(output.cmu).toString('hex') : null,
            ephemeralKey: output.epk ? Buffer.from(output.epk).toString('hex') : null,
            ciphertext: output.ciphertext ? Buffer.from(output.ciphertext).toString('hex') : null,
          })) : [],
          // Orchard actions (THIS IS WHERE THE DATA IS!)
          actions: tx.actions ? tx.actions.map((action) => ({
            nullifier: action.nullifier ? Buffer.from(action.nullifier).toString('hex') : null,
            cmx: action.cmx ? Buffer.from(action.cmx).toString('hex') : null,
            ephemeralKey: action.ephemeralKey ? Buffer.from(action.ephemeralKey).toString('hex') : null,
            ciphertext: action.ciphertext ? Buffer.from(action.ciphertext).toString('hex') : null,
          })) : [],
        })) : [],
      })),
    });

  } catch (error) {
    console.error('❌ [LIGHTWALLETD] Error:', error);
    res.status(500).json({
      error: error.message || 'Failed to scan blocks',
      details: error.details || null,
    });
  }
});

module.exports = router;

