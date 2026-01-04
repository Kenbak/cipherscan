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

// Import linkability functions (needed by transactionsRouter)
const { findLinkedTransactions } = require('./linkability');

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
app.locals.redisClient = redisClient;

// Block routes: /health, /api/info, /api/blocks, /api/block/:height
app.use(blocksRouter);

// Transaction routes: /api/tx/*, /api/mempool
app.use(transactionsRouter);

// Network routes: /api/network/*
app.use(networkRouter);

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

// ============================================================================
// CROSS-CHAIN / NEAR INTENTS API
// ============================================================================

const { getNearIntentsClient, CHAIN_CONFIG } = require('./near-intents');
const { getShieldedCountSince, getShieldedCountSimple, getShieldedCountDaily } = require('./stats-queries');

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
// SHIELDED STATS ENDPOINTS
// ============================================================================

/**
 * GET /api/stats/shielded-count
 *
 * Get the count of shielded transactions since a specific date.
 *
 * Query params:
 * - since: Required. ISO date string (e.g., "2024-01-01")
 * - detailed: Optional. If "true", returns full breakdown (slower)
 *
 * Example: /api/stats/shielded-count?since=2024-01-01
 * Example: /api/stats/shielded-count?since=2024-01-01&detailed=true
 */
app.get('/api/stats/shielded-count', async (req, res) => {
  try {
    const { since, detailed } = req.query;

    if (!since) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: since (e.g., ?since=2024-01-01)',
      });
    }

    let result;
    if (detailed === 'true') {
      result = await getShieldedCountSince(pool, since);
    } else {
      result = await getShieldedCountSimple(pool, since);
    }

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('❌ [STATS] Shielded count error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/stats/shielded-daily
 *
 * Get daily shielded transaction counts for a date range.
 *
 * Query params:
 * - since: Required. Start date (ISO format)
 * - until: Optional. End date (defaults to now)
 *
 * Example: /api/stats/shielded-daily?since=2024-01-01&until=2024-01-31
 */
app.get('/api/stats/shielded-daily', async (req, res) => {
  try {
    const { since, until } = req.query;

    if (!since) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: since (e.g., ?since=2024-01-01)',
      });
    }

    const result = await getShieldedCountDaily(pool, since, until);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('❌ [STATS] Shielded daily error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// LINKABILITY DETECTION ENDPOINT (Privacy Education)
// ============================================================================

// ============================================================================
// PRIVACY RISKS FEED ENDPOINT
// ============================================================================

/**
 * GET /api/privacy/risks
 *
 * Get recent linkable transaction pairs for the Privacy Risks page.
 * Returns detected round-trip transactions with scores.
 *
 * Query params:
 *   - limit: Max results (default 20, max 100)
 *   - minScore: Minimum linkability score (default 40)
 *   - period: Time period - 24h, 7d, 30d, 90d (default 7d)
 *   - riskLevel: Filter by HIGH, MEDIUM, or ALL (default ALL)
 */
app.get('/api/privacy/risks', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const minScore = Math.max(parseInt(req.query.minScore) || 40, 0);
    const riskLevel = (req.query.riskLevel || 'ALL').toUpperCase();
    const sortBy = req.query.sort === 'score' ? 'score' : 'recent';

    // Parse period
    const periodMap = {
      '24h': 24 * 3600,
      '7d': 7 * 24 * 3600,
      '30d': 30 * 24 * 3600,
      '90d': 90 * 24 * 3600,
    };
    const periodSeconds = periodMap[req.query.period] || periodMap['7d'];
    const minTime = Math.floor(Date.now() / 1000) - periodSeconds;

    console.log(`🔗 [PRIVACY RISKS] Fetching risks (limit=${limit}, minScore=${minScore}, period=${req.query.period || '7d'})`);

    // Import unified scoring function and helpers
    const { calculateLinkabilityScore, formatTimeDelta, getTransparentAddresses } = require('./linkability');

    // Minimum amount to consider (filter out dust - 0.001 ZEC = 100,000 zatoshis)
    const MIN_AMOUNT_ZAT = 100000;

    // Query: Find shield -> deshield pairs with similar amounts
    const pairsResult = await pool.query(`
      WITH recent_shields AS (
        SELECT txid, block_height, block_time, amount_zat, pool, transparent_addresses
        FROM shielded_flows
        WHERE flow_type = 'shield'
          AND block_time > $1
          AND amount_zat >= $2
      ),
      recent_deshields AS (
        SELECT txid, block_height, block_time, amount_zat, pool, transparent_addresses
        FROM shielded_flows
        WHERE flow_type = 'deshield'
          AND block_time > $1
          AND amount_zat >= $2
      )
      SELECT
        s.txid as shield_txid,
        s.block_height as shield_height,
        s.block_time as shield_time,
        s.amount_zat as shield_amount,
        s.pool as shield_pool,
        s.transparent_addresses as shield_addresses,
        d.txid as deshield_txid,
        d.block_height as deshield_height,
        d.block_time as deshield_time,
        d.amount_zat as deshield_amount,
        d.pool as deshield_pool,
        d.transparent_addresses as deshield_addresses,
        (d.block_time - s.block_time) as time_delta_seconds
      FROM recent_shields s
      JOIN recent_deshields d ON
        d.block_time > s.block_time
        AND d.block_time < s.block_time + (90 * 24 * 3600)
        AND ABS(d.amount_zat - s.amount_zat) < 100000
      ORDER BY d.block_time DESC
      LIMIT 5000
    `, [minTime, MIN_AMOUNT_ZAT]);

    // Count occurrences for rarity scoring (based on user's period filter)
    const rarityResult = await pool.query(`
      SELECT amount_zat, COUNT(*) as count
      FROM shielded_flows
      WHERE block_time > $1
      GROUP BY amount_zat
    `, [minTime]);

    const rarityCounts = new Map();
    rarityResult.rows.forEach(r => {
      rarityCounts.set(parseInt(r.amount_zat), parseInt(r.count));
    });

    // Score each pair using the unified scoring function
    const scoredPairs = pairsResult.rows.map(row => {
      const shieldAmount = parseInt(row.shield_amount);
      const deshieldAmount = parseInt(row.deshield_amount);
      const timeDelta = parseInt(row.time_delta_seconds);
      const occurrences = rarityCounts.get(shieldAmount) || 1;

      // Use unified scoring function (single source of truth)
      const { score, warningLevel, breakdown } = calculateLinkabilityScore(
        shieldAmount,
        deshieldAmount,
        timeDelta,
        occurrences
      );

      return {
        shieldTxid: row.shield_txid,
        shieldHeight: parseInt(row.shield_height),
        shieldTime: parseInt(row.shield_time),
        shieldAmount: shieldAmount / 100000000,
        shieldPool: row.shield_pool,
        shieldAddresses: row.shield_addresses || [],
        deshieldTxid: row.deshield_txid,
        deshieldHeight: parseInt(row.deshield_height),
        deshieldTime: parseInt(row.deshield_time),
        deshieldAmount: deshieldAmount / 100000000,
        deshieldPool: row.deshield_pool,
        deshieldAddresses: row.deshield_addresses || [],
        timeDelta: formatTimeDelta(timeDelta),
        timeDeltaSeconds: timeDelta,
        score,
        warningLevel,
        scoreBreakdown: breakdown,
      };
    });

    // Filter by minimum score and risk level BEFORE fetching addresses (for performance)
    let filteredPairs = scoredPairs.filter(p => p.score >= minScore);

    if (riskLevel === 'HIGH') {
      filteredPairs = filteredPairs.filter(p => p.warningLevel === 'HIGH');
    } else if (riskLevel === 'MEDIUM') {
      filteredPairs = filteredPairs.filter(p => p.warningLevel === 'MEDIUM');
    }

    // Sort based on request
    if (sortBy === 'score') {
      filteredPairs.sort((a, b) => b.score - a.score || b.deshieldTime - a.deshieldTime);
    } else {
      filteredPairs.sort((a, b) => b.deshieldTime - a.deshieldTime);
    }

    // Apply pagination
    const totalCount = filteredPairs.length;
    const topPairs = filteredPairs.slice(offset, offset + limit);

    // Fetch addresses for each pair (only for results we'll return)
    const resultsWithAddresses = await Promise.all(
      topPairs.map(async (pair) => {
        // Only fetch if not already populated
        const shieldAddrs = pair.shieldAddresses.length > 0
          ? pair.shieldAddresses
          : await getTransparentAddresses(pool, pair.shieldTxid, 'shield');
        const deshieldAddrs = pair.deshieldAddresses.length > 0
          ? pair.deshieldAddresses
          : await getTransparentAddresses(pool, pair.deshieldTxid, 'deshield');

        return {
          ...pair,
          shieldAddresses: shieldAddrs,
          deshieldAddresses: deshieldAddrs,
        };
      })
    );

    // Calculate stats from all filtered pairs
    const stats = {
      total: totalCount,
      highRisk: filteredPairs.filter(p => p.warningLevel === 'HIGH').length,
      mediumRisk: filteredPairs.filter(p => p.warningLevel === 'MEDIUM').length,
      avgScore: totalCount > 0
        ? Math.round(filteredPairs.reduce((sum, p) => sum + p.score, 0) / totalCount)
        : 0,
      period: req.query.period || '7d',
    };

    console.log(`✅ [PRIVACY RISKS] Found ${stats.total} pairs, returning ${resultsWithAddresses.length} (offset=${offset})`);

    res.json({
      success: true,
      transactions: resultsWithAddresses,
      stats,
      pagination: {
        total: totalCount,
        limit,
        offset,
        returned: resultsWithAddresses.length,
        hasMore: offset + limit < totalCount,
      },
    });
  } catch (error) {
    console.error('❌ [PRIVACY RISKS] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch privacy risks',
    });
  }
});

/**
 * GET /api/privacy/common-amounts
 *
 * Get the most common shielding amounts (for privacy education).
 * Users can "blend in" by using popular amounts.
 *
 * Query params:
 *   - period: 24h, 7d, 30d (default 7d)
 *   - limit: number of amounts to return (default 10, max 50)
 */
app.get('/api/privacy/common-amounts', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);

    // Parse period
    const periodMap = {
      '24h': 24 * 3600,
      '7d': 7 * 24 * 3600,
      '30d': 30 * 24 * 3600,
    };
    const periodSeconds = periodMap[req.query.period] || periodMap['7d'];
    const minTime = Math.floor(Date.now() / 1000) - periodSeconds;

    // Minimum amount to consider (0.01 ZEC = 1,000,000 zatoshis)
    // This filters out dust and 0-value transactions
    const MIN_AMOUNT_ZAT = 1000000;

    // Round amounts to 2 decimal places (in ZEC) for grouping
    // This groups 0.501 and 0.502 together as ~0.50
    const result = await pool.query(`
      SELECT
        ROUND(amount_zat / 100000000.0, 2) as amount_zec,
        COUNT(*) as tx_count,
        COUNT(DISTINCT txid) as unique_txs
      FROM shielded_flows
      WHERE block_time > $1
        AND amount_zat >= $2
      GROUP BY ROUND(amount_zat / 100000000.0, 2)
      ORDER BY tx_count DESC
      LIMIT $3
    `, [minTime, MIN_AMOUNT_ZAT, limit]);

    // Get total transactions in period for percentage calculation
    const totalResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM shielded_flows
      WHERE block_time > $1
        AND amount_zat >= $2
    `, [minTime, MIN_AMOUNT_ZAT]);

    const totalTxs = parseInt(totalResult.rows[0]?.total) || 1;

    const commonAmounts = result.rows.map(row => ({
      amountZec: parseFloat(row.amount_zec),
      txCount: parseInt(row.tx_count),
      percentage: ((parseInt(row.tx_count) / totalTxs) * 100).toFixed(1),
      blendingScore: Math.min(100, Math.round((parseInt(row.tx_count) / totalTxs) * 1000)), // Higher = better for privacy
    }));

    console.log(`✅ [COMMON AMOUNTS] Returning ${commonAmounts.length} amounts for period ${req.query.period || '7d'}`);

    res.json({
      success: true,
      period: req.query.period || '7d',
      totalTransactions: totalTxs,
      amounts: commonAmounts,
      tip: 'Using common amounts helps you blend in with other transactions, making linkability analysis harder.',
    });
  } catch (error) {
    console.error('❌ [COMMON AMOUNTS] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch common amounts',
    });
  }
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
