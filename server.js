/**
 * Zcash Explorer API Server
 * Express.js + PostgreSQL + WebSocket
 * Runs on DigitalOcean, serves data to Netlify frontend
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const WebSocket = require('ws');
const http = require('http');

// Initialize Express
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'zcash_explorer_testnet',
  user: process.env.DB_USER || 'zcash_user',
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection failed:', err);
    process.exit(1);
  }
  console.log('✅ Database connected:', res.rows[0].now);
});

// ============================================================================
// ZEBRA RPC HELPER
// ============================================================================

const https = require('https');

/**
 * Call Zebra RPC
 */
async function callZebraRPC(method, params = []) {
  const rpcUrl = process.env.ZCASH_RPC_URL || 'http://127.0.0.1:18232';
  const rpcUser = process.env.ZCASH_RPC_USER || '__cookie__';
  const rpcPassword = process.env.ZCASH_RPC_PASSWORD || '';

  const requestBody = JSON.stringify({
    jsonrpc: '1.0',
    id: 'zcash-explorer',
    method,
    params,
  });

  const auth = Buffer.from(`${rpcUser}:${rpcPassword}`).toString('base64');
  const url = new URL(rpcUrl);

  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': requestBody.length,
        'Authorization': `Basic ${auth}`,
      },
    };

    const protocol = url.protocol === 'https:' ? https : require('http');
    const req = protocol.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.error) {
            reject(new Error(response.error.message || 'RPC error'));
          } else {
            resolve(response.result);
          }
        } catch (error) {
          reject(new Error(`Failed to parse RPC response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`RPC request failed: ${error.message}`));
    });

    req.write(requestBody);
    req.end();
  });
}

// Trust proxy (for Nginx reverse proxy)
app.set('trust proxy', true);

// Security middleware
app.use(helmet());

// CORS configuration (only allow your domains)
const allowedOrigins = [
  'https://testnet.cipherscan.app',
  'https://cipherscan.app',
  'http://localhost:3000', // For local development
  'http://localhost:3001', // For local Next.js dev server
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g., curl, server-to-server, mobile apps)
    if (!origin) {
      return callback(null, true);
    }

    // Check if origin is in whitelist
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`⚠️  Blocked request from unauthorized origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// Rate limiting (100 requests per minute per IP)
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  // Trust the X-Forwarded-For header from Nginx
  validate: { trustProxy: false },
});

app.use(limiter);

// Body parser
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ============================================================================
// API ROUTES
// ============================================================================

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Get recent blocks
app.get('/api/blocks', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    const result = await pool.query(
      `SELECT
        height,
        hash,
        timestamp,
        transaction_count,
        size,
        difficulty,
        miner_address,
        total_fees
      FROM blocks
      ORDER BY height DESC
      LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const countResult = await pool.query('SELECT MAX(height) as max_height FROM blocks');
    const totalBlocks = countResult.rows[0]?.max_height || 0;

    res.json({
      blocks: result.rows,
      pagination: {
        limit,
        offset,
        total: totalBlocks,
        hasMore: offset + limit < totalBlocks,
      },
    });
  } catch (error) {
    console.error('Error fetching blocks:', error);
    res.status(500).json({ error: 'Failed to fetch blocks' });
  }
});

// Get block by height
app.get('/api/block/:height', async (req, res) => {
  try {
    const height = parseInt(req.params.height);

    if (isNaN(height)) {
      return res.status(400).json({ error: 'Invalid block height' });
    }

    // Get block details
    const blockResult = await pool.query(
      `SELECT
        height,
        hash,
        timestamp,
        transaction_count,
        size,
        difficulty,
        confirmations,
        previous_block_hash,
        next_block_hash,
        version,
        merkle_root,
        final_sapling_root,
        bits,
        nonce,
        solution,
        total_fees,
        miner_address
      FROM blocks
      WHERE height = $1`,
      [height]
    );

    if (blockResult.rows.length === 0) {
      return res.status(404).json({ error: 'Block not found' });
    }

    const block = blockResult.rows[0];

    // Get transactions for this block
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
        has_sapling,
        has_orchard,
        has_sprout,
        tx_index
      FROM transactions
      WHERE block_height = $1
      ORDER BY tx_index`,
      [height]
    );

    // Get all inputs and outputs for all transactions in this block (optimized: 2 queries instead of N)
    const txids = txResult.rows.map(tx => tx.txid);

    const [inputsResult, outputsResult] = await Promise.all([
      pool.query(
        `SELECT txid, prev_txid, prev_vout, address, value, vout_index
         FROM transaction_inputs
         WHERE txid = ANY($1::text[])
         ORDER BY txid, vout_index`,
        [txids]
      ),
      pool.query(
        `SELECT txid, address, value, vout_index, spent
         FROM transaction_outputs
         WHERE txid = ANY($1::text[])
         ORDER BY txid, vout_index`,
        [txids]
      )
    ]);

    // Group inputs and outputs by txid
    const inputsByTxid = {};
    const outputsByTxid = {};

    inputsResult.rows.forEach(input => {
      if (!inputsByTxid[input.txid]) {
        inputsByTxid[input.txid] = [];
      }
      inputsByTxid[input.txid].push(input);
    });

    outputsResult.rows.forEach(output => {
      if (!outputsByTxid[output.txid]) {
        outputsByTxid[output.txid] = [];
      }
      outputsByTxid[output.txid].push(output);
    });

    // Attach inputs and outputs to transactions
    const transactions = txResult.rows.map(tx => ({
      ...tx,
      inputs: inputsByTxid[tx.txid] || [],
      outputs: outputsByTxid[tx.txid] || [],
    }));

    // Calculate confirmations
    const currentHeightResult = await pool.query('SELECT MAX(height) as max_height FROM blocks');
    const currentHeight = currentHeightResult.rows[0]?.max_height || height;
    const confirmations = currentHeight - height + 1;

    res.json({
      ...block,
      confirmations,
      transactions,
      transactionCount: transactions.length,
    });
  } catch (error) {
    console.error('Error fetching block:', error);
    res.status(500).json({ error: 'Failed to fetch block' });
  }
});

// Get transaction by txid
app.get('/api/tx/:txid', async (req, res) => {
  try {
    const { txid } = req.params;

    if (!txid || txid.length !== 64) {
      return res.status(400).json({ error: 'Invalid transaction ID' });
    }

    // Get transaction details
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
        has_sapling,
        has_orchard,
        has_sprout,
        orchard_actions,
        shielded_spends,
        shielded_outputs,
        tx_index
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

    res.json({
      txid: tx.txid,
      blockHeight: tx.block_height,
      blockHash: blockResult.rows[0]?.hash,
      blockTime: tx.block_time,
      confirmations,
      size: tx.size,
      version: tx.version,
      locktime: tx.locktime,
      valueBalance: tx.value_balance,
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

// Get raw transaction hex (via RPC)
app.get('/api/tx/:txid/raw', async (req, res) => {
  try {
    const { txid } = req.params;

    if (!txid || txid.length !== 64) {
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

// Get privacy statistics (fetch from pre-calculated table)
app.get('/api/privacy-stats', async (req, res) => {
  try {
    // Fetch latest stats from privacy_stats table (ultra fast!)
    const statsResult = await pool.query(`
      SELECT
        total_blocks,
        total_transactions,
        shielded_tx,
        transparent_tx,
        coinbase_tx,
        mixed_tx,
        fully_shielded_tx,
        shielded_pool_size,
        shielded_percentage,
        privacy_score,
        avg_shielded_per_day,
        adoption_trend,
        last_block_scanned,
        updated_at
      FROM privacy_stats
      ORDER BY updated_at DESC
      LIMIT 1
    `);

    if (statsResult.rows.length === 0) {
      return res.status(503).json({
        error: 'Privacy stats not yet calculated',
        message: 'Please run the calculate-privacy-stats script first',
      });
    }

    const stats = statsResult.rows[0];

    // Get daily trends (last 7 days)
    const trendsResult = await pool.query(`
      SELECT
        date,
        shielded_count,
        transparent_count,
        shielded_percentage,
        pool_size
      FROM privacy_trends_daily
      ORDER BY date DESC
      LIMIT 7
    `);

    res.json({
      totals: {
        blocks: parseInt(stats.total_blocks),
        shieldedTx: parseInt(stats.shielded_tx),
        transparentTx: parseInt(stats.transparent_tx),
        coinbaseTx: parseInt(stats.coinbase_tx),
        totalTx: parseInt(stats.total_transactions),
        mixedTx: parseInt(stats.mixed_tx),
        fullyShieldedTx: parseInt(stats.fully_shielded_tx),
      },
      shieldedPool: {
        currentSize: parseInt(stats.shielded_pool_size) / 100000000, // Convert to ZEC
      },
      metrics: {
        shieldedPercentage: parseFloat(stats.shielded_percentage),
        privacyScore: parseInt(stats.privacy_score),
        avgShieldedPerDay: parseFloat(stats.avg_shielded_per_day),
        adoptionTrend: stats.adoption_trend,
      },
      trends: {
        daily: trendsResult.rows.map(row => ({
          date: row.date,
          shielded: parseInt(row.shielded_count),
          transparent: parseInt(row.transparent_count),
          shieldedPercentage: parseFloat(row.shielded_percentage),
          poolSize: parseInt(row.pool_size) / 100000000, // Convert to ZEC
        })),
      },
      lastUpdated: stats.updated_at.toISOString(),
      lastBlockScanned: parseInt(stats.last_block_scanned),
    });
  } catch (error) {
    console.error('Error fetching privacy stats:', error);
    res.status(500).json({ error: 'Failed to fetch privacy stats' });
  }
});

// Get address details
app.get('/api/address/:address', async (req, res) => {
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

    // Get recent transactions
    const txResult = await pool.query(
      `SELECT DISTINCT
        t.txid,
        t.block_height,
        t.block_time,
        t.size,
        t.tx_index,
        COALESCE(
          (SELECT SUM(value) FROM transaction_inputs WHERE txid = t.txid AND address = $1),
          0
        ) as input_value,
        COALESCE(
          (SELECT SUM(value) FROM transaction_outputs WHERE txid = t.txid AND address = $1),
          0
        ) as output_value
      FROM transactions t
      WHERE t.txid IN (
        SELECT txid FROM transaction_inputs WHERE address = $1
        UNION
        SELECT txid FROM transaction_outputs WHERE address = $1
      )
      ORDER BY t.block_height DESC, t.tx_index DESC
      LIMIT $2 OFFSET $3`,
      [address, limit, offset]
    );

    const transactions = txResult.rows.map(tx => ({
      txid: tx.txid,
      blockHeight: tx.block_height,
      blockTime: tx.block_time,
      size: tx.size,
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

// Memo decryption endpoint removed - now handled client-side with WASM
// See app/decrypt/page.tsx for the client-side implementation

// Mempool endpoint - calls Zebra RPC directly
app.get('/api/mempool', async (req, res) => {
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
// WEBSOCKET SERVER (Real-time updates)
// ============================================================================

let clients = new Set();

wss.on('connection', (ws) => {
  console.log('🔌 WebSocket client connected');
  clients.add(ws);

  ws.on('close', () => {
    console.log('🔌 WebSocket client disconnected');
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
  });

  // Send initial connection message
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'Connected to Zcash Explorer API',
  }));
});

// Broadcast new block to all connected clients
function broadcastNewBlock(block) {
  const message = JSON.stringify({
    type: 'new_block',
    data: block,
  });

  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Poll for new blocks every 10 seconds
let lastKnownHeight = 0;

setInterval(async () => {
  try {
    const result = await pool.query('SELECT MAX(height) as max_height FROM blocks');
    const currentHeight = result.rows[0]?.max_height || 0;

    if (currentHeight > lastKnownHeight) {
      console.log(`📦 New block detected: ${currentHeight}`);

      // Fetch the new block details
      const blockResult = await pool.query(
        `SELECT * FROM blocks WHERE height = $1`,
        [currentHeight]
      );

      if (blockResult.rows.length > 0) {
        broadcastNewBlock(blockResult.rows[0]);
      }

      lastKnownHeight = currentHeight;
    }
  } catch (error) {
    console.error('Error polling for new blocks:', error);
  }
}, 10000);

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ============================================================================
// START SERVER
// ============================================================================

const PORT = process.env.PORT || 3001;

server.listen(PORT, '127.0.0.1', () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚀 Zcash Explorer API Server                           ║
║                                                           ║
║   HTTP:      http://localhost:${PORT}                        ║
║   WebSocket: ws://localhost:${PORT}                          ║
║                                                           ║
║   Environment: ${process.env.NODE_ENV || 'development'}                              ║
║   Database:    ${process.env.DB_NAME || 'zcash_explorer_testnet'}              ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    pool.end(() => {
      console.log('Database pool closed');
      process.exit(0);
    });
  });
});
