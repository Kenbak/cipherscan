/**
 * Scan Routes
 *
 * Handles blockchain scanning endpoints:
 * - POST /api/scan/orchard - Scan for Orchard transactions (from PostgreSQL)
 * - POST /api/lightwalletd/scan - Scan blocks for Orchard transactions (via Lightwalletd gRPC)
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Dependencies injected via app.locals
let pool;
let CompactTxStreamer;
let grpc;

// Compact block cache configuration
const CACHE_DIR = path.join(__dirname, '..', '..', 'cache', 'compact-blocks');
const CACHE_CHUNK_SIZE = 10000; // Cache blocks in chunks of 10k
const CACHE_ENABLED = true;

// Ensure cache directory exists
if (CACHE_ENABLED && !fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  console.log(`📁 [CACHE] Created compact block cache directory: ${CACHE_DIR}`);
}

/**
 * Get cache file path for a block range chunk
 */
function getCacheFilePath(chunkStart) {
  // Round down to nearest CACHE_CHUNK_SIZE
  const chunkId = Math.floor(chunkStart / CACHE_CHUNK_SIZE) * CACHE_CHUNK_SIZE;
  return path.join(CACHE_DIR, `blocks_${chunkId}_${chunkId + CACHE_CHUNK_SIZE - 1}.json`);
}

/**
 * Load cached blocks for a range
 * Returns { cachedBlocks, missingRanges }
 */
function loadCachedBlocks(startHeight, endHeight) {
  if (!CACHE_ENABLED) {
    return { cachedBlocks: [], missingRanges: [{ start: startHeight, end: endHeight }] };
  }

  const cachedBlocks = [];
  const missingRanges = [];
  let currentMissingStart = null;

  for (let height = startHeight; height <= endHeight; height += CACHE_CHUNK_SIZE) {
    const chunkStart = Math.floor(height / CACHE_CHUNK_SIZE) * CACHE_CHUNK_SIZE;
    const cacheFile = getCacheFilePath(chunkStart);

    if (fs.existsSync(cacheFile)) {
      // Found cached chunk
      if (currentMissingStart !== null) {
        // End the current missing range
        missingRanges.push({ start: currentMissingStart, end: chunkStart - 1 });
        currentMissingStart = null;
      }

      try {
        const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        // Filter blocks within our requested range
        const relevantBlocks = data.blocks.filter(b => {
          const h = parseInt(b.height);
          return h >= startHeight && h <= endHeight;
        });
        cachedBlocks.push(...relevantBlocks);
      } catch (err) {
        console.error(`⚠️ [CACHE] Failed to read cache file ${cacheFile}:`, err.message);
        // Treat as missing
        if (currentMissingStart === null) {
          currentMissingStart = chunkStart;
        }
      }
    } else {
      // Chunk not cached
      if (currentMissingStart === null) {
        currentMissingStart = Math.max(chunkStart, startHeight);
      }
    }
  }

  // Close any remaining missing range
  if (currentMissingStart !== null) {
    missingRanges.push({ start: currentMissingStart, end: endHeight });
  }

  return { cachedBlocks, missingRanges };
}

/**
 * Save blocks to cache (organized by chunks)
 */
function saveToCathe(blocks) {
  if (!CACHE_ENABLED || blocks.length === 0) return;

  // Group blocks by cache chunk
  const chunks = new Map();

  for (const block of blocks) {
    const height = parseInt(block.height);
    const chunkId = Math.floor(height / CACHE_CHUNK_SIZE) * CACHE_CHUNK_SIZE;

    if (!chunks.has(chunkId)) {
      chunks.set(chunkId, []);
    }
    chunks.get(chunkId).push(block);
  }

  // Save each complete chunk
  for (const [chunkId, chunkBlocks] of chunks) {
    // Only save if we have the full chunk (or it's the latest incomplete chunk)
    if (chunkBlocks.length >= CACHE_CHUNK_SIZE * 0.9) { // 90% threshold
      const cacheFile = getCacheFilePath(chunkId);
      try {
        // Sort by height before saving
        chunkBlocks.sort((a, b) => parseInt(a.height) - parseInt(b.height));
        fs.writeFileSync(cacheFile, JSON.stringify({ blocks: chunkBlocks }));
        console.log(`💾 [CACHE] Saved ${chunkBlocks.length} blocks to ${path.basename(cacheFile)}`);
      } catch (err) {
        console.error(`⚠️ [CACHE] Failed to save cache file ${cacheFile}:`, err.message);
      }
    }
  }
}

// Middleware to inject dependencies
router.use((req, res, next) => {
  pool = req.app.locals.pool;
  CompactTxStreamer = req.app.locals.CompactTxStreamer;
  grpc = req.app.locals.grpc;
  next();
});

/**
 * POST /api/scan/orchard
 *
 * Batch scan for Orchard transactions (for wallet scanning)
 * Uses PostgreSQL index for fast lookups
 */
router.post('/api/scan/orchard', async (req, res) => {
  try {
    const { startHeight, endHeight } = req.body;

    if (!startHeight || !endHeight) {
      return res.status(400).json({ error: 'startHeight and endHeight are required' });
    }

    if (isNaN(startHeight) || isNaN(endHeight)) {
      return res.status(400).json({ error: 'Invalid block heights' });
    }

    if (startHeight > endHeight) {
      return res.status(400).json({ error: 'startHeight cannot be greater than endHeight' });
    }

    // Limit to 1 million blocks max (safety)
    if (endHeight - startHeight > 1000000) {
      return res.status(400).json({ error: 'Range too large (max 1 million blocks)' });
    }

    console.log(`🔍 [SCAN] Scanning Orchard TXs from ${startHeight} to ${endHeight}`);

    // Get all Orchard transactions in this range (SUPER FAST with PostgreSQL index!)
    const result = await pool.query(
      `SELECT
        t.txid,
        t.block_height,
        b.timestamp
      FROM transactions t
      JOIN blocks b ON t.block_height = b.height
      WHERE t.block_height BETWEEN $1 AND $2
        AND t.has_orchard = true
      ORDER BY t.block_height DESC`,
      [startHeight, endHeight]
    );

    console.log(`✅ [SCAN] Found ${result.rows.length} Orchard transactions`);

    res.json({
      startHeight,
      endHeight,
      totalBlocks: endHeight - startHeight + 1,
      orchardTransactions: result.rows.length,
      transactions: result.rows,
    });
  } catch (error) {
    console.error('Error scanning Orchard transactions:', error);
    res.status(500).json({ error: 'Failed to scan transactions' });
  }
});

/**
 * Fetch a range of blocks from Lightwalletd
 * Helper function for parallel fetching
 */
async function fetchBlockRange(CompactTxStreamer, grpc, start, end) {
  return new Promise((resolve, reject) => {
    const client = new CompactTxStreamer(
      '127.0.0.1:9067',
      grpc.credentials.createInsecure()
    );

    const blocks = [];

    const call = client.GetBlockRange({
      start: { height: start },
      end: { height: end },
    });

    call.on('data', (block) => {
      blocks.push(block);
    });

    call.on('end', () => {
      client.close();
      resolve(blocks);
    });

    call.on('error', (error) => {
      client.close();
      reject(error);
    });
  });
}

/**
 * POST /api/lightwalletd/scan
 *
 * Scan blocks for Orchard transactions using Lightwalletd
 * Returns compact blocks for client-side decryption
 * Uses parallel fetching for improved performance
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

    // Create temporary client to get latest block if needed
    let finalEndHeight = endHeight;
    if (!finalEndHeight) {
      const tempClient = new CompactTxStreamer(
        '127.0.0.1:9067',
        grpc.credentials.createInsecure()
      );
      finalEndHeight = await new Promise((resolve, reject) => {
        tempClient.GetLatestBlock({}, (error, response) => {
          tempClient.close();
          if (error) {
            reject(error);
            return;
          }
          resolve(parseInt(response.height));
        });
      });
    }

    const totalBlocks = finalEndHeight - startHeight + 1;

    // Check cache first
    const startTime = Date.now();
    const { cachedBlocks, missingRanges } = loadCachedBlocks(startHeight, finalEndHeight);

    let fetchedBlocks = [];

    if (missingRanges.length === 0) {
      // All blocks cached!
      console.log(`✅ [CACHE] All ${cachedBlocks.length} blocks served from cache`);
    } else {
      // Need to fetch missing ranges from lightwalletd
      const totalMissing = missingRanges.reduce((sum, r) => sum + (r.end - r.start + 1), 0);
      console.log(`📦 [LIGHTWALLETD] ${cachedBlocks.length} cached, fetching ${totalMissing} missing blocks`);

      // Fetch each missing range in parallel
      const fetchPromises = [];

      for (const range of missingRanges) {
        const rangeSize = range.end - range.start + 1;
        // Determine number of parallel streams for this range
        const NUM_STREAMS = Math.min(8, Math.max(1, Math.ceil(rangeSize / 50000)));
        const blocksPerStream = Math.ceil(rangeSize / NUM_STREAMS);

        for (let i = 0; i < NUM_STREAMS; i++) {
          const chunkStart = range.start + (i * blocksPerStream);
          const chunkEnd = Math.min(chunkStart + blocksPerStream - 1, range.end);

          if (chunkStart <= range.end) {
            fetchPromises.push(fetchBlockRange(CompactTxStreamer, grpc, chunkStart, chunkEnd));
          }
        }
      }

      // Fetch all missing chunks in parallel
      const blockChunks = await Promise.all(fetchPromises);
      fetchedBlocks = blockChunks.flat();

      // Save newly fetched blocks to cache
      if (fetchedBlocks.length > 0) {
        // Convert to cacheable format before saving
        const cacheableBlocks = fetchedBlocks.map((block) => ({
          height: block.height,
          hash: block.hash ? Buffer.from(block.hash).toString('hex') : null,
          time: block.time,
          vtx: block.vtx ? block.vtx.map((tx) => ({
            index: tx.index,
            hash: tx.hash ? Buffer.from(tx.hash).toString('hex') : null,
            outputs: tx.outputs ? tx.outputs.map((output) => ({
              cmu: output.cmu ? Buffer.from(output.cmu).toString('hex') : null,
              ephemeralKey: output.epk ? Buffer.from(output.epk).toString('hex') : null,
              ciphertext: output.ciphertext ? Buffer.from(output.ciphertext).toString('hex') : null,
            })) : [],
            actions: tx.actions ? tx.actions.map((action) => ({
              nullifier: action.nullifier ? Buffer.from(action.nullifier).toString('hex') : null,
              cmx: action.cmx ? Buffer.from(action.cmx).toString('hex') : null,
              ephemeralKey: action.ephemeralKey ? Buffer.from(action.ephemeralKey).toString('hex') : null,
              ciphertext: action.ciphertext ? Buffer.from(action.ciphertext).toString('hex') : null,
            })) : [],
          })) : [],
        }));
        saveToCathe(cacheableBlocks);
      }
    }

    // Merge cached and fetched blocks
    const allBlocks = [...cachedBlocks];

    // Convert fetched blocks to response format (if not already converted for cache)
    for (const block of fetchedBlocks) {
      allBlocks.push({
        height: block.height,
        hash: block.hash ? (typeof block.hash === 'string' ? block.hash : Buffer.from(block.hash).toString('hex')) : null,
        time: block.time,
        vtx: block.vtx ? block.vtx.map((tx) => ({
          index: tx.index,
          hash: tx.hash ? (typeof tx.hash === 'string' ? tx.hash : Buffer.from(tx.hash).toString('hex')) : null,
          outputs: tx.outputs ? tx.outputs.map((output) => ({
            cmu: output.cmu ? (typeof output.cmu === 'string' ? output.cmu : Buffer.from(output.cmu).toString('hex')) : null,
            ephemeralKey: output.epk ? (typeof output.epk === 'string' ? output.epk : Buffer.from(output.epk).toString('hex')) : null,
            ciphertext: output.ciphertext ? (typeof output.ciphertext === 'string' ? output.ciphertext : Buffer.from(output.ciphertext).toString('hex')) : null,
          })) : [],
          actions: tx.actions ? tx.actions.map((action) => ({
            nullifier: action.nullifier ? (typeof action.nullifier === 'string' ? action.nullifier : Buffer.from(action.nullifier).toString('hex')) : null,
            cmx: action.cmx ? (typeof action.cmx === 'string' ? action.cmx : Buffer.from(action.cmx).toString('hex')) : null,
            ephemeralKey: action.ephemeralKey ? (typeof action.ephemeralKey === 'string' ? action.ephemeralKey : Buffer.from(action.ephemeralKey).toString('hex')) : null,
            ciphertext: action.ciphertext ? (typeof action.ciphertext === 'string' ? action.ciphertext : Buffer.from(action.ciphertext).toString('hex')) : null,
          })) : [],
        })) : [],
      });
    }

    // Sort by height
    const blocks = allBlocks.sort((a, b) => parseInt(a.height) - parseInt(b.height));

    const fetchTime = Date.now() - startTime;
    console.log(`✅ [SCAN] Total ${blocks.length} blocks in ${fetchTime}ms (${cachedBlocks.length} cached, ${fetchedBlocks.length} fetched)`);

    // Return compact blocks (already transformed to hex strings)
    res.json({
      success: true,
      blocksScanned: blocks.length,
      startHeight,
      endHeight: finalEndHeight,
      cachedBlocks: cachedBlocks.length,
      fetchedBlocks: fetchedBlocks.length,
      fetchTimeMs: fetchTime,
      blocks,
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
