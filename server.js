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
const redis = require('redis');

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
// REDIS CLIENT
// ============================================================================

// Create Redis client
const redisClient = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
  // No password for local Redis
});

// Create Redis Pub/Sub clients (separate connections required)
const redisPub = redisClient.duplicate();
const redisSub = redisClient.duplicate();

// Connect to Redis
(async () => {
  try {
    await redisClient.connect();
    await redisPub.connect();
    await redisSub.connect();
    console.log('✅ Redis connected');
  } catch (err) {
    console.error('❌ Redis connection failed:', err);
    console.warn('⚠️  Continuing without Redis (fallback to in-memory cache)');
  }
})();

// Handle Redis errors
redisClient.on('error', (err) => console.error('Redis Client Error:', err));
redisPub.on('error', (err) => console.error('Redis Pub Error:', err));
redisSub.on('error', (err) => console.error('Redis Sub Error:', err));

// Subscribe to Redis broadcast channel (for multi-server support)
(async () => {
  try {
    if (redisSub.isOpen) {
      await redisSub.subscribe('zcash:broadcast', (message) => {
        console.log('📡 [Redis] Received broadcast from another server');
        // Forward to local WebSocket clients
        clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(message);
          }
        });
      });
      console.log('✅ Subscribed to Redis broadcast channel');
    }
  } catch (err) {
    console.error('❌ Redis subscribe error:', err);
  }
})();

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

// ============================================================================
// LIGHTWALLETD GRPC CLIENT
// ============================================================================

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

// Load proto files
const PROTO_PATH = path.join(__dirname, 'proto/service.proto');
const COMPACT_FORMATS_PATH = path.join(__dirname, 'proto/compact_formats.proto');

let CompactTxStreamer = null;

// Initialize gRPC client
try {
  const packageDefinition = protoLoader.loadSync(
    [PROTO_PATH, COMPACT_FORMATS_PATH],
    {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    }
  );

  const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
  CompactTxStreamer = protoDescriptor.cash.z.wallet.sdk.rpc.CompactTxStreamer;
  console.log('✅ Lightwalletd gRPC client initialized');
} catch (error) {
  console.error('❌ Failed to initialize Lightwalletd gRPC client:', error);
  console.error('   Make sure proto files exist in proto/ directory');
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

    // Allow Chrome extensions (chrome-extension://...)
    if (origin.startsWith('chrome-extension://')) {
      return callback(null, true);
    }

    // Allow browser extensions (moz-extension:// for Firefox, safari-web-extension:// for Safari)
    if (origin.startsWith('moz-extension://') || origin.startsWith('safari-web-extension://')) {
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

// Get blockchain info (current height, etc.)
app.get('/api/info', async (req, res) => {
  try {
    const result = await pool.query('SELECT MAX(height) as max_height FROM blocks');
    const currentHeight = result.rows[0]?.max_height || 0;

    res.json({
      blocks: currentHeight,
      height: currentHeight,
    });
  } catch (error) {
    console.error('Error fetching blockchain info:', error);
    res.status(500).json({ error: 'Failed to fetch blockchain info' });
  }
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
        value_balance_sapling,
        value_balance_orchard,
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

// Get shielded transactions with filters (MUST be before /api/tx/:txid)
app.get('/api/tx/shielded', async (req, res) => {
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

    // Query
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
        t.size
      FROM transactions t
      JOIN blocks b ON t.block_height = b.height
      ${whereClause}
      ORDER BY t.block_height DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      queryParams
    );

    // Get total count for pagination
    const countResult = await pool.query(
      `SELECT COUNT(*) as total
      FROM transactions t
      ${whereClause}`,
      queryParams.slice(0, -2) // Remove limit/offset for count
    );

    const total = parseInt(countResult.rows[0]?.total || 0);

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
        type: (tx.vin_count === 0 && tx.vout_count === 0) ? 'fully-shielded' : 'partial',
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
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
        value_balance_sapling,
        value_balance_orchard,
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

    // Calculate fee from value balances (positive valueBalance = fee leaving shielded pool)
    const valueBalanceSapling = (tx.value_balance_sapling || 0) / 100000000;
    const valueBalanceOrchard = (tx.value_balance_orchard || 0) / 100000000;
    const totalValueBalance = (tx.value_balance || 0) / 100000000;

    // For shielded txs, fee = sum of positive value balances
    // For transparent txs, fee = sum(inputs) - sum(outputs) (calculated client-side)
    const shieldedFee = valueBalanceSapling + valueBalanceOrchard;

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
      fee: shieldedFee > 0 ? shieldedFee : null, // Only show if we can calculate it
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

// Batch get raw transactions (for wallet scanning)
// Batch get raw transactions (for wallet scanning)
app.post('/api/tx/raw/batch', async (req, res) => {
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

// Batch scan for Orchard transactions (for wallet scanning)
app.post('/api/scan/orchard', async (req, res) => {
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
        sprout_pool_size,
        sapling_pool_size,
        orchard_pool_size,
        transparent_pool_size,
        chain_supply,
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

    // Get daily trends (last 30 days for better charts)
    const trendsResult = await pool.query(`
      SELECT
        date,
        shielded_count,
        transparent_count,
        shielded_percentage,
        pool_size,
        privacy_score
      FROM privacy_trends_daily
      ORDER BY date DESC
      LIMIT 30
    `);

    // Use the most recent daily privacy score instead of the old global one
    const latestDailyScore = trendsResult.rows.length > 0 ? parseInt(trendsResult.rows[0].privacy_score) || 0 : parseInt(stats.privacy_score);

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
        sprout: parseInt(stats.sprout_pool_size || 0) / 100000000,
        sapling: parseInt(stats.sapling_pool_size || 0) / 100000000,
        orchard: parseInt(stats.orchard_pool_size || 0) / 100000000,
        transparent: parseInt(stats.transparent_pool_size || 0) / 100000000,
        chainSupply: parseInt(stats.chain_supply || 0) / 100000000,
      },
      metrics: {
        shieldedPercentage: parseFloat(stats.shielded_percentage),
        privacyScore: latestDailyScore, // Use latest daily score
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
          privacyScore: parseInt(row.privacy_score) || 0,
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
// NETWORK STATS - PRODUCTION READY with Caching & WebSocket
// ============================================================================

// Cache configuration
const NETWORK_STATS_CACHE_KEY = 'zcash:network_stats';
const NETWORK_STATS_CACHE_DURATION = 30; // 30 seconds (Redis uses seconds)

// Fallback in-memory cache (if Redis fails)
let networkStatsCache = null;
let networkStatsCacheTime = 0;

/**
 * Get data from Redis cache
 */
async function getFromRedisCache(key) {
  try {
    if (!redisClient.isOpen) {
      return null;
    }
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.error('Redis GET error:', err);
    return null;
  }
}

/**
 * Set data in Redis cache with TTL
 */
async function setInRedisCache(key, data, ttlSeconds) {
  try {
    if (!redisClient.isOpen) {
      return false;
    }
    await redisClient.setEx(key, ttlSeconds, JSON.stringify(data));
    return true;
  } catch (err) {
    console.error('Redis SET error:', err);
    return false;
  }
}

/**
 * Fetch network stats (optimized - 1 PostgreSQL query + 1 RPC call)
 */
async function fetchNetworkStatsOptimized() {
  try {
    // Single optimized PostgreSQL query (FAST!)
    const dbStats = await pool.query(`
      WITH latest AS (
        SELECT height, timestamp, difficulty
        FROM blocks
        ORDER BY height DESC
        LIMIT 1
      ),
      last_24h AS (
        SELECT
          COUNT(*) as blocks_24h,
          AVG(difficulty) as avg_difficulty,
          SUM(transaction_count) as tx_24h
        FROM blocks
        WHERE timestamp >= EXTRACT(EPOCH FROM NOW() - INTERVAL '24 hours')
      )
      SELECT
        latest.height,
        latest.difficulty,
        latest.timestamp,
        last_24h.blocks_24h,
        last_24h.avg_difficulty,
        last_24h.tx_24h
      FROM latest, last_24h
    `);

    if (!dbStats.rows[0]) {
      throw new Error('No blockchain data available');
    }

    const { height, difficulty, timestamp, blocks_24h, avg_difficulty, tx_24h } = dbStats.rows[0];

    // Get blockchain size from DB
    const sizeResult = await pool.query(`
      SELECT SUM(size) as total_size
      FROM blocks
    `);
    const blockchainSizeBytes = parseInt(sizeResult.rows[0]?.total_size || 0);
    const blockchainSizeGB = (blockchainSizeBytes / (1024 * 1024 * 1024)).toFixed(2);

    // Get network info (Zebra 3.0+ has more detailed info)
    const networkInfo = await callZebraRPC('getnetworkinfo').catch(() => null);
    const peerInfo = await callZebraRPC('getpeerinfo').catch(() => []);
    const blockchainInfo = await callZebraRPC('getblockchaininfo').catch(() => null);

    // Extract peer count and network details
    const peerCount = networkInfo?.connections || (Array.isArray(peerInfo) ? peerInfo.length : 0);
    const protocolVersion = networkInfo?.protocolversion || null;
    const subversion = networkInfo?.subversion || null;

    // Extract supply and pool data from getblockchaininfo
    let supplyData = null;
    if (blockchainInfo) {
      const chainSupplyZat = blockchainInfo.chainSupply?.chainValueZat || 0;
      const valuePools = blockchainInfo.valuePools || [];

      const transparent = valuePools.find(p => p.id === 'transparent')?.chainValueZat || 0;
      const sprout = valuePools.find(p => p.id === 'sprout')?.chainValueZat || 0;
      const sapling = valuePools.find(p => p.id === 'sapling')?.chainValueZat || 0;
      const orchard = valuePools.find(p => p.id === 'orchard')?.chainValueZat || 0;
      const lockbox = valuePools.find(p => p.id === 'lockbox')?.chainValueZat || 0;

      const totalShielded = sprout + sapling + orchard;
      const shieldedPercentage = chainSupplyZat > 0 ? (totalShielded / chainSupplyZat) * 100 : 0;

      // Get active upgrade
      const upgrades = blockchainInfo.upgrades || {};
      const activeUpgrades = Object.values(upgrades).filter((u) => u.status === 'active');
      const latestUpgrade = activeUpgrades.length > 0
        ? activeUpgrades.reduce((latest, u) => u.activationheight > latest.activationheight ? u : latest)
        : null;

      supplyData = {
        chainSupply: chainSupplyZat / 100000000,
        transparent: transparent / 100000000,
        sprout: sprout / 100000000,
        sapling: sapling / 100000000,
        orchard: orchard / 100000000,
        lockbox: lockbox / 100000000,
        totalShielded: totalShielded / 100000000,
        shieldedPercentage: shieldedPercentage,
        sizeOnDisk: blockchainInfo.size_on_disk || 0,
        activeUpgrade: latestUpgrade?.name || null,
        chain: blockchainInfo.chain || 'unknown',
      };
    }

    // Calculate hashrate
    const blocks24h = parseInt(blocks_24h || 0);
    const tx24h = parseInt(tx_24h || 0);
    const avgBlockTime = blocks24h > 0 ? Math.round(86400 / blocks24h) : 75;
    const difficultyNum = parseFloat(difficulty || 0);
    const networkHashrate = difficultyNum / avgBlockTime;
    const hashrateInTH = (networkHashrate / 1e12).toFixed(2);

    // Calculate daily mining revenue
    const blockReward = 3.125; // Current ZEC block reward
    const dailyRevenue = blocks24h * blockReward;

    return {
      success: true,
      mining: {
        networkHashrate: `${hashrateInTH} TH/s`,
        networkHashrateRaw: networkHashrate,
        difficulty: difficultyNum,
        avgBlockTime, // in seconds
        blocks24h,
        blockReward,
        dailyRevenue,
      },
      network: {
        peers: peerCount,
        height: parseInt(height),
        protocolVersion: protocolVersion,
        subversion: subversion,
      },
      blockchain: {
        height: parseInt(height),
        latestBlockTime: parseInt(timestamp),
        syncProgress: 100, // Assume synced if we have recent blocks
        sizeBytes: blockchainSizeBytes,
        sizeGB: parseFloat(blockchainSizeGB),
        tx24h,
      },
      supply: supplyData,
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error('❌ [NETWORK] Error fetching stats:', error);
    throw error;
  }
}

/**
 * GET /api/network/stats
 *
 * Get network statistics (cached for 30s)
 */
app.get('/api/network/stats', async (req, res) => {
  try {
    // Try Redis cache first
    const cachedData = await getFromRedisCache(NETWORK_STATS_CACHE_KEY);
    if (cachedData) {
      return res.json({
        ...cachedData,
        cached: true,
        source: 'redis',
      });
    }

    // Fallback to in-memory cache
    const now = Date.now();
    if (networkStatsCache && (now - networkStatsCacheTime) < (NETWORK_STATS_CACHE_DURATION * 1000)) {
      return res.json({
        ...networkStatsCache,
        cached: true,
        source: 'memory',
      });
    }

    // Fetch fresh data
    const stats = await fetchNetworkStatsOptimized();

    // Update Redis cache
    await setInRedisCache(NETWORK_STATS_CACHE_KEY, stats, NETWORK_STATS_CACHE_DURATION);

    // Update in-memory cache (fallback)
    networkStatsCache = stats;
    networkStatsCacheTime = now;

    res.json(stats);
  } catch (error) {
    console.error('❌ [NETWORK] Error in API endpoint:', error);

    // Try Redis cache as fallback
    const cachedData = await getFromRedisCache(NETWORK_STATS_CACHE_KEY);
    if (cachedData) {
      return res.json({
        ...cachedData,
        cached: true,
        stale: true,
        source: 'redis',
        warning: 'Using stale Redis data due to fetch error',
      });
    }

    // Try in-memory cache as last resort
    if (networkStatsCache) {
      return res.json({
        ...networkStatsCache,
        cached: true,
        stale: true,
        source: 'memory',
        warning: 'Using stale memory data due to fetch error',
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch network stats',
    });
  }
});

/**
 * GET /api/network/fees
 *
 * Get estimated transaction fees (slow, standard, fast)
 */
app.get('/api/network/fees', async (req, res) => {
  try {
    console.log('💰 [FEES] Fetching fee estimates...');

    // Get recent transactions from mempool to estimate fees
    // For now, return static values (Zcash fees are very low and predictable)
    res.json({
      success: true,
      fees: {
        slow: 0.000005,      // ~0.0005 cents
        standard: 0.00001,   // ~0.001 cents
        fast: 0.000015,      // ~0.0015 cents
      },
      unit: 'ZEC',
      note: 'Zcash transaction fees are extremely low and predictable',
      timestamp: Date.now(),
    });

    console.log(`✅ [FEES] Fee estimates returned`);
  } catch (error) {
    console.error('❌ [FEES] Error fetching fees:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch fee estimates',
    });
  }
});

/**
 * GET /api/network/health
 *
 * Get Zebra node health status (Zebra 3.0+)
 * Checks if Zebra's built-in health endpoints are available
 */
app.get('/api/network/health', async (req, res) => {
  try {
    console.log('🏥 [HEALTH] Checking Zebra node health...');

    const zebraHealthUrl = process.env.ZEBRA_HEALTH_URL || 'http://127.0.0.1:8080';

    // Try to fetch Zebra's health endpoints (Zebra 3.0+)
    const [healthyRes, readyRes] = await Promise.allSettled([
      fetch(`${zebraHealthUrl}/healthy`).then(r => ({ status: r.status, ok: r.ok })).catch(() => null),
      fetch(`${zebraHealthUrl}/ready`).then(r => ({ status: r.status, ok: r.ok })).catch(() => null),
    ]);

    const healthy = healthyRes.status === 'fulfilled' && healthyRes.value?.ok;
    const ready = readyRes.status === 'fulfilled' && readyRes.value?.ok;

    // Fallback: check via RPC if health endpoints not available
    let fallbackHealthy = false;
    if (!healthy) {
      try {
        const blockchainInfo = await callZebraRPC('getblockchaininfo');
        fallbackHealthy = blockchainInfo && blockchainInfo.blocks > 0;
      } catch (error) {
        fallbackHealthy = false;
      }
    }

    res.json({
      success: true,
      zebra: {
        healthy: healthy || fallbackHealthy,
        ready: ready,
        healthEndpointAvailable: healthy,
        readyEndpointAvailable: ready,
      },
      note: healthy ? 'Zebra 3.0+ health endpoints available' : 'Using RPC fallback (Zebra < 3.0 or health endpoints not configured)',
      timestamp: Date.now(),
    });

    console.log(`✅ [HEALTH] Node healthy: ${healthy || fallbackHealthy}, ready: ${ready}`);
  } catch (error) {
    console.error('❌ [HEALTH] Error checking health:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to check node health',
    });
  }
});

/**
 * GET /api/network/peers
 *
 * Get detailed information about connected peers
 */
app.get('/api/network/peers', async (req, res) => {
  try {
    console.log('🌐 [PEERS] Fetching peer information...');

    // Get detailed peer info from Zebra
    const peerInfo = await callZebraRPC('getpeerinfo').catch(() => []);

    if (!Array.isArray(peerInfo)) {
      return res.json({
        success: true,
        count: 0,
        peers: [],
      });
    }

    // Format peer data for frontend
    // Note: Zebra returns minimal peer info (just address)
    // zcashd returns more details (version, ping, etc.)
    const peers = peerInfo.map((peer, index) => {
      // Extract country/region from IP (simplified)
      const addr = peer.addr || peer.address || 'unknown';
      const ip = addr.split(':')[0];

      return {
        id: index + 1,
        addr: addr,
        ip: ip,
        inbound: peer.inbound !== undefined ? peer.inbound : false,
        // Optional fields (may be null with Zebra)
        version: peer.version || null,
        subver: peer.subver || null,
        pingtime: peer.pingtime || null,
        conntime: peer.conntime || null,
      };
    });

    res.json({
      success: true,
      count: peers.length,
      peers,
      timestamp: Date.now(),
    });

    console.log(`✅ [PEERS] Returned ${peers.length} peers`);
  } catch (error) {
    console.error('❌ [PEERS] Error fetching peers:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch peer information',
    });
  }
});

// ============================================================================
// CROSS-CHAIN / NEAR INTENTS API
// ============================================================================

const { getNearIntentsClient, CHAIN_CONFIG } = require('./lib/near-intents');

/**
 * GET /api/crosschain/stats
 *
 * Get cross-chain ZEC swap statistics via NEAR Intents
 * Returns inflows, outflows, recent swaps, and volume metrics
 */
app.get('/api/crosschain/stats', async (req, res) => {
  try {
    const client = getNearIntentsClient();

    // Check if API key is configured
    if (!client.hasApiKey()) {
      return res.status(503).json({
        success: false,
        error: 'NEAR Intents API key not configured',
        message: 'Set NEAR_INTENTS_API_KEY environment variable',
        docsUrl: 'https://docs.near-intents.org/near-intents/integration/distribution-channels/intents-explorer-api',
      });
    }

    console.log('🌉 [CROSSCHAIN] Fetching cross-chain stats...');

    const stats = await client.getCrossChainStats();

    res.json({
      success: true,
      ...stats,
      chainConfig: CHAIN_CONFIG,
    });
  } catch (error) {
    console.error('❌ [CROSSCHAIN] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch cross-chain stats',
    });
  }
});

/**
 * GET /api/crosschain/inflows
 *
 * Get recent ZEC inflows (other chains → ZEC)
 */
app.get('/api/crosschain/inflows', async (req, res) => {
  try {
    const client = getNearIntentsClient();

    if (!client.hasApiKey()) {
      return res.status(503).json({
        success: false,
        error: 'NEAR Intents API key not configured',
      });
    }

    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const page = parseInt(req.query.page) || 1;

    const data = await client.getZecInflows({ limit, page });

    res.json({
      success: true,
      ...data,
    });
  } catch (error) {
    console.error('❌ [CROSSCHAIN] Inflows error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/crosschain/outflows
 *
 * Get recent ZEC outflows (ZEC → other chains)
 */
app.get('/api/crosschain/outflows', async (req, res) => {
  try {
    const client = getNearIntentsClient();

    if (!client.hasApiKey()) {
      return res.status(503).json({
        success: false,
        error: 'NEAR Intents API key not configured',
      });
    }

    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const page = parseInt(req.query.page) || 1;

    const data = await client.getZecOutflows({ limit, page });

    res.json({
      success: true,
      ...data,
    });
  } catch (error) {
    console.error('❌ [CROSSCHAIN] Outflows error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/crosschain/status
 *
 * Check if NEAR Intents integration is configured
 */
app.get('/api/crosschain/status', async (req, res) => {
  const client = getNearIntentsClient();

  res.json({
    success: true,
    configured: client.hasApiKey(),
    message: client.hasApiKey()
      ? 'NEAR Intents API configured'
      : 'NEAR Intents API key not set. Cross-chain features disabled.',
    docsUrl: 'https://docs.near-intents.org/near-intents/integration/distribution-channels/intents-explorer-api',
  });
});

// ============================================================================
// LIGHTWALLETD SCAN ENDPOINT
// ============================================================================

/**
 * POST /api/lightwalletd/scan
 *
 * Scan blocks for Orchard transactions using Lightwalletd
 * Returns compact blocks for client-side decryption
 */
app.post('/api/lightwalletd/scan', async (req, res) => {
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

// ============================================================================
// WEBSOCKET SERVER (Real-time updates)
// ============================================================================

let clients = new Set();

/**
 * Rate limit WebSocket connections using Redis
 * Returns true if allowed, false if rate limited
 */
async function checkWebSocketRateLimit(ip) {
  try {
    if (!redisClient.isOpen) {
      return true; // Allow if Redis is down
    }

    const key = `ws:ratelimit:${ip}`;
    const count = await redisClient.incr(key);

    if (count === 1) {
      // First connection, set 1-minute TTL
      await redisClient.expire(key, 60);
    }

    // Allow max 10 connections per minute per IP
    return count <= 10;
  } catch (err) {
    console.error('Redis rate limit error:', err);
    return true; // Allow if error
  }
}

wss.on('connection', async (ws, req) => {
  // Get client IP
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'unknown';

  // Check rate limit
  const allowed = await checkWebSocketRateLimit(ip);
  if (!allowed) {
    ws.close(1008, 'Rate limit exceeded. Max 10 connections per minute.');
    return;
  }

  clients.add(ws);

  ws.on('close', () => {
    clients.delete(ws);
  });

  ws.on('error', () => {
    clients.delete(ws);
  });

  // Send initial data immediately
  if (networkStatsCache) {
    ws.send(JSON.stringify({
      type: 'network_stats',
      data: networkStatsCache,
    }));
  }
});

// Broadcast message to all connected clients (local + Redis Pub/Sub)
async function broadcastToAll(message) {
  const messageStr = JSON.stringify(message);

  // Broadcast to local WebSocket clients
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });

  // Publish to Redis for multi-server support
  try {
    if (redisPub.isOpen) {
      await redisPub.publish('zcash:broadcast', messageStr);
    }
  } catch (err) {
    console.error('Redis publish error:', err);
  }
}

// Broadcast new block to all connected clients
function broadcastNewBlock(block) {
  broadcastToAll({
    type: 'new_block',
    data: block,
  });
}

// ============================================================================
// BACKGROUND JOBS
// ============================================================================

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

// Update network stats every 30 seconds and broadcast via WebSocket
async function updateNetworkStatsBackground() {
  try {
    console.log('📊 [BACKGROUND] Updating network stats...');

    // Fetch fresh stats
    const stats = await fetchNetworkStatsOptimized();

    // Update cache
    networkStatsCache = stats;
    networkStatsCacheTime = Date.now();

    // Broadcast to all connected WebSocket clients
    broadcastToAll({
      type: 'network_stats',
      data: stats,
    });

    console.log(`✅ [BACKGROUND] Network stats updated and broadcasted to ${clients.size} clients`);
  } catch (error) {
    console.error('❌ [BACKGROUND] Failed to update network stats:', error);
  }
}

// Run immediately on startup
updateNetworkStatsBackground();

// Then run every 30 seconds
setInterval(updateNetworkStatsBackground, 30000);

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
