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
const fs = require('fs');

// Initialize Express
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Import routes
const blocksRouter = require('./routes/blocks');
const transactionsRouter = require('./routes/transactions');
const networkRouter = require('./routes/network');
const crosschainRouter = require('./routes/crosschain');
const statsRouter = require('./routes/stats');
const privacyRouter = require('./routes/privacy');
const scanRouter = require('./routes/scan');

// Import linkability functions
const { findLinkedTransactions, calculateLinkabilityScore, formatTimeDelta, getTransparentAddresses } = require('./linkability');

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

// Make dependencies available to routes via app.locals
app.locals.pool = pool;

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
 * Reads cookie authentication from file (like the indexer does)
 */
async function callZebraRPC(method, params = []) {
  const rpcUrl = process.env.ZEBRA_RPC_URL || 'http://127.0.0.1:18232';
  const cookieFile = process.env.ZEBRA_RPC_COOKIE_FILE || '/root/.cache/zebra/.cookie';

  // Read cookie from file (format: __cookie__:password)
  let auth = '';
  try {
    const cookie = fs.readFileSync(cookieFile, 'utf8').trim();
    auth = Buffer.from(cookie).toString('base64');
  } catch (err) {
    console.warn('⚠️  Could not read Zebra cookie file:', err.message);
    // Fallback to env vars if cookie file not found
  const rpcUser = process.env.ZCASH_RPC_USER || '__cookie__';
  const rpcPassword = process.env.ZCASH_RPC_PASSWORD || '';
    auth = Buffer.from(`${rpcUser}:${rpcPassword}`).toString('base64');
  }

  const requestBody = JSON.stringify({
    jsonrpc: '1.0',
    id: 'zcash-explorer',
    method,
    params,
  });
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
// ROUTES (Modular)
// ============================================================================

// Make additional dependencies available to routes
app.locals.callZebraRPC = callZebraRPC;
app.locals.CompactTxStreamer = CompactTxStreamer;
app.locals.grpc = grpc;
app.locals.findLinkedTransactions = findLinkedTransactions;
app.locals.calculateLinkabilityScore = calculateLinkabilityScore;
app.locals.formatTimeDelta = formatTimeDelta;
app.locals.getTransparentAddresses = getTransparentAddresses;
app.locals.redisClient = redisClient;

// Block routes: /health, /api/info, /api/blocks, /api/block/:height
app.use(blocksRouter);

// Transaction routes: /api/tx/*, /api/mempool
app.use(transactionsRouter);

// Network routes: /api/network/*
app.use(networkRouter);

// Cross-chain routes: /api/crosschain/*
app.use(crosschainRouter);

// Stats routes: /api/stats/*
app.use(statsRouter);

// Privacy routes: /api/privacy/*
app.use(privacyRouter);

// Scan routes: /api/lightwalletd/*
app.use(scanRouter);

// ============================================================================
// API ROUTES (Legacy - to be refactored)
// ============================================================================

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

// Privacy routes now in routes/privacy.js
// Scan routes now in routes/scan.js

// ============================================================================
// WEBSOCKET SERVER (Real-time updates)
// ============================================================================

// NOTE: The following routes have been moved to their respective modules:
// - GET /api/privacy/risks -> routes/privacy.js
// - GET /api/privacy/common-amounts -> routes/privacy.js
// - POST /api/lightwalletd/scan -> routes/scan.js

// ============================================================================
// LEGACY ROUTES (To be migrated in future phases)
// ============================================================================

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

  // Client can call /api/network/stats to get initial data
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

// Network stats background update moved to routes/network.js
// The module handles caching internally

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
