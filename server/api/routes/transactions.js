/**
 * Transaction Routes
 * /api/tx/*, /api/mempool
 */

const express = require('express');
const router = express.Router();

// Dependencies will be injected via middleware
let pool;
let callZebraRPC;
let CompactTxStreamer;
let grpc;
let findLinkedTransactions;

// Middleware to inject dependencies
router.use((req, res, next) => {
  pool = req.app.locals.pool;
  callZebraRPC = req.app.locals.callZebraRPC;
  CompactTxStreamer = req.app.locals.CompactTxStreamer;
  grpc = req.app.locals.grpc;
  findLinkedTransactions = req.app.locals.findLinkedTransactions;
  next();
});

// ============================================================================
// SHIELDED TRANSACTIONS
// ============================================================================

// Get shielded transactions with filters (MUST be before /api/tx/:txid)
router.get('/api/tx/shielded', async (req, res) => {
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
      conditions.push(`(has_sapling = true)`);
    } else if (poolType === 'orchard') {
      conditions.push(`(has_orchard = true)`);
    } else {
      // Both pools
      conditions.push(`(has_sapling = true OR has_orchard = true)`);
    }

    // Filter by transaction type
    if (txType === 'fully-shielded') {
      // Fully shielded: no transparent inputs/outputs
      conditions.push(`(vin_count = 0 AND vout_count = 0)`);
    } else if (txType === 'partial') {
      // Partial: has both transparent and shielded
      conditions.push(`(vin_count > 0 OR vout_count > 0)`);
    }

    // Filter by minimum actions
    if (minActions > 0) {
      conditions.push(`(orchard_actions >= $${paramIndex} OR shielded_spends >= $${paramIndex} OR shielded_outputs >= $${paramIndex})`);
      queryParams.push(minActions);
      paramIndex++;
    }

    // Add limit and offset
    queryParams.push(limit, offset);

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Query (including Rust indexer fields)
    const result = await pool.query(
      `SELECT
        t.txid,
        t.block_height,
        b.hash as block_hash,
        b.timestamp as block_time,
        t.has_sapling,
        t.has_orchard,
        t.shielded_spends,
        t.shielded_outputs,
        t.orchard_actions,
        t.vin_count,
        t.vout_count,
        t.size,
        t.fee,
        t.value_balance_sapling,
        t.value_balance_orchard
      FROM transactions t
      JOIN blocks b ON t.block_height = b.height
      ${whereClause}
      ORDER BY t.block_height DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      queryParams
    );

    // Only run the expensive COUNT(*) when pagination is actually needed
    const skipCount = req.query.skip_count === 'true' || (offset === 0 && limit <= 10);
    let total = 0;

    if (!skipCount) {
      const countResult = await pool.query(
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
        shieldedSpends: parseInt(tx.shielded_spends || 0),
        shieldedOutputs: parseInt(tx.shielded_outputs || 0),
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

// ============================================================================
// TRANSACTION BY ID
// ============================================================================

// Get transaction by txid
router.get('/api/tx/:txid', async (req, res) => {
  try {
    const { txid } = req.params;

    if (!txid || !/^[a-fA-F0-9]{64}$/.test(txid)) {
      return res.status(400).json({ error: 'Invalid transaction ID' });
    }

    // Get transaction details (including Rust indexer fields)
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
        orchard_actions,
        shielded_spends,
        shielded_outputs,
        tx_index,
        fee,
        total_input,
        total_output,
        is_coinbase
      FROM transactions
      WHERE txid = $1`,
      [txid]
    );

    if (txResult.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const tx = txResult.rows[0];

    // Get inputs
    const inputsResult = await pool.query(
      `SELECT
        prev_txid,
        prev_vout,
        address,
        value,
        vout_index
      FROM transaction_inputs
      WHERE txid = $1
      ORDER BY vout_index`,
      [txid]
    );

    // Get outputs
    const outputsResult = await pool.query(
      `SELECT
        address,
        value,
        vout_index,
        spent
      FROM transaction_outputs
      WHERE txid = $1
      ORDER BY vout_index`,
      [txid]
    );

    // Get block hash
    const blockResult = await pool.query(
      `SELECT hash FROM blocks WHERE height = $1`,
      [tx.block_height]
    );

    // Calculate confirmations
    const currentHeightResult = await pool.query('SELECT MAX(height) as max_height FROM blocks');
    const currentHeight = currentHeightResult.rows[0]?.max_height || tx.block_height;
    const confirmations = currentHeight - tx.block_height + 1;

    // Get value balances (in ZEC)
    const valueBalanceSapling = (tx.value_balance_sapling || 0) / 100000000;
    const valueBalanceOrchard = (tx.value_balance_orchard || 0) / 100000000;
    const totalValueBalance = (tx.value_balance || 0) / 100000000;

    // Fee from DB (in zatoshis, convert to ZEC)
    const fee = (tx.fee && tx.fee > 0) ? tx.fee / 100000000 : null;

    // Total input/output from DB (Rust indexer, in zatoshis)
    const totalInput = tx.total_input ? tx.total_input / 100000000 : null;
    const totalOutput = tx.total_output ? tx.total_output / 100000000 : null;

    res.json({
      txid: tx.txid,
      blockHeight: tx.block_height,
      blockHash: blockResult.rows[0]?.hash,
      blockTime: tx.block_time,
      confirmations,
      size: tx.size,
      version: tx.version,
      locktime: tx.locktime,
      valueBalance: totalValueBalance,
      valueBalanceSapling,
      valueBalanceOrchard,
      fee,
      totalInput,
      totalOutput,
      isCoinbase: tx.is_coinbase || false,
      hasSapling: tx.has_sapling,
      hasOrchard: tx.has_orchard,
      hasSprout: tx.has_sprout,
      orchardActions: tx.orchard_actions || 0,
      shieldedSpends: tx.shielded_spends || 0,
      shieldedOutputs: tx.shielded_outputs || 0,
      inputs: inputsResult.rows,
      outputs: outputsResult.rows,
      inputCount: inputsResult.rows.length,
      outputCount: outputsResult.rows.length,
    });
  } catch (error) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({ error: 'Failed to fetch transaction' });
  }
});

// ============================================================================
// RAW TRANSACTION
// ============================================================================

// Get raw transaction hex (via RPC)
router.get('/api/tx/:txid/raw', async (req, res) => {
  try {
    const { txid } = req.params;

    if (!txid || !/^[a-fA-F0-9]{64}$/.test(txid)) {
      return res.status(400).json({ error: 'Invalid transaction ID' });
    }

    // Call Zebra RPC to get raw transaction
    const rawHex = await callZebraRPC('getrawtransaction', [txid, 0]);

    res.json({
      txid,
      hex: rawHex,
    });
  } catch (error) {
    console.error('Error fetching raw transaction:', error);
    res.status(500).json({ error: 'Failed to fetch raw transaction: ' + error.message });
  }
});

// ============================================================================
// BATCH RAW TRANSACTIONS
// ============================================================================

// Batch get raw transactions (for wallet scanning)
router.post('/api/tx/raw/batch', async (req, res) => {
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
          if (CompactTxStreamer) {
            try {
              const client = new CompactTxStreamer(
                '127.0.0.1:9067',
                grpc.credentials.createInsecure()
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
          const rawHex = await callZebraRPC('getrawtransaction', [txid, 0]);
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

// ============================================================================
// TRANSACTION LINKABILITY
// ============================================================================

/**
 * GET /api/tx/:txid/linkability
 * Analyze a specific shielding transaction for potential round-trip deshielding
 */
router.get('/api/tx/:txid/linkability', async (req, res) => {
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

    console.log(`🔗 [LINKABILITY] Analyzing ${txid.slice(0, 8)}... (limit=${limit}, tolerance=${toleranceZec} ZEC)`);

    const result = await findLinkedTransactions(pool, txid, { limit, toleranceZat });

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

// ============================================================================
// MEMPOOL
// ============================================================================

// Mempool endpoint - calls Zebra RPC directly
router.get('/api/mempool', async (req, res) => {
  try {
    // Get all transaction IDs in mempool
    const txids = await callZebraRPC('getrawmempool', []);

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
          const tx = await callZebraRPC('getrawtransaction', [txid, 1]);

          // Analyze transaction type (including Orchard support)
          const hasShieldedInputs = (tx.vShieldedSpend && tx.vShieldedSpend.length > 0) ||
                                   (tx.vJoinSplit && tx.vJoinSplit.length > 0) ||
                                   (tx.orchard && tx.orchard.actions && tx.orchard.actions.length > 0);
          const hasShieldedOutputs = (tx.vShieldedOutput && tx.vShieldedOutput.length > 0) ||
                                     (tx.vJoinSplit && tx.vJoinSplit.length > 0) ||
                                     (tx.orchard && tx.orchard.actions && tx.orchard.actions.length > 0);
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

// ============================================================================
// BROADCAST RAW TRANSACTION
// ============================================================================

/**
 * POST /api/tx/broadcast
 * Broadcast a raw signed transaction to the Zcash network
 * Body: { "rawTx": "hex-encoded-raw-transaction" }
 * 
 * Note: This only accepts a raw transaction hex (already signed).
 * No private keys or viewing keys are involved - the TX is fully
 * constructed and signed client-side before being sent here.
 */
router.post('/api/tx/broadcast', async (req, res) => {
  try {
    const { rawTx } = req.body;

    if (!rawTx || typeof rawTx !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid rawTx parameter. Provide a hex-encoded signed transaction.',
      });
    }

    // Basic hex validation
    if (!/^[0-9a-fA-F]+$/.test(rawTx)) {
      return res.status(400).json({
        success: false,
        error: 'rawTx must be a valid hex string.',
      });
    }

    console.log(`📡 [BROADCAST] Broadcasting transaction (${rawTx.length / 2} bytes)...`);

    const txid = await callZebraRPC('sendrawtransaction', [rawTx]);

    console.log(`✅ [BROADCAST] Transaction broadcast successfully: ${txid}`);

    res.json({
      success: true,
      txid,
    });
  } catch (error) {
    console.error('❌ [BROADCAST] Error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to broadcast transaction',
    });
  }
});

module.exports = router;
