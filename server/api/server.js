/**
 * Zcash Explorer API Server
 * Express.js + PostgreSQL + WebSocket
 * Runs on Hetzner, serves data to Vercel frontend
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
const crypto = require('crypto');
const { createListCache } = require('./list-cache');

// Constant-time string comparison via fixed-length SHA-256 digests, so
// mismatched lengths or values never leak timing information. Used for
// service-key checks (HTTP + WebSocket) instead of === / Array.includes.
function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

// Checks `key` against every entry in `knownKeys` without early-returning,
// so the number of valid keys configured does not create a timing signal.
function isKnownServiceKey(key, knownKeys) {
  if (!key) return false;
  let matched = false;
  for (const known of knownKeys) {
    if (constantTimeEqual(key, known)) matched = true;
  }
  return matched;
}

// Redacts dynamic path segments (addresses, tx/block hashes, heights) before
// logging so request logs never contain queried identifiers or amounts.
function redactPathForLogging(path) {
  return path
    .split('/')
    .map((segment) => {
      if (/^[0-9a-fA-F]{64}$/.test(segment)) return ':txhash';
      if (/^[0-9a-fA-F]{40,66}$/.test(segment)) return ':hash';
      if (/^(t1|t3|zc|zs|u1|utest1|ztestsapling1|tm|tn)[0-9a-zA-Z]{10,}$/.test(segment)) {
        return ':address';
      }
      if (/^\d+$/.test(segment)) return ':n';
      return segment;
    })
    .join('/');
}

// Initialize Express
const app = express();
const server = http.createServer(app);

// Import routes
const blocksRouter = require('./routes/blocks');
const transactionsRouter = require('./routes/transactions');
const networkRouter = require('./routes/network');
const crosschainRouter = require('./routes/crosschain');
const statsRouter = require('./routes/stats');
const privacyRouter = require('./routes/privacy');
const scanRouter = require('./routes/scan');
const addressRouter = require('./routes/address');
const blendCheckRouter = require('./routes/blend-check');
const crosslinkRouter = require('./routes/crosslink');
const reorgsRouter = require('./routes/reorgs');
const poolsRouter = require('./routes/pools');
const miningRouter = require('./routes/mining');
const analyticsRouter = require('./routes/analytics');
const migrationRouter = require('./routes/migration');
const sitemapsRouter = require('./routes/sitemaps');
const transparentRouter = require('./routes/transparent');
const valuationRouter = require('./routes/valuation');
const pulseRouter = require('./routes/pulse');
const signalsRouter = require('../signals/api');

// Import privacy linkage functions
const {
  findLinkedTransactions,
  formatTimeDelta,
  getTransparentAddresses,
  detectBatchDeshields,
  detectBatchForShield,
  queryPrivacyLinkageEdges,
  queryPrivacyBatchClusters,
  getPrivacyGraph,
} = require('./privacy-linkage');

// Import Zebra gRPC client
const { ZebraGrpcClient } = require('./zebra-grpc');

// Import Fork Monitor
const { ForkMonitor } = require('./fork-monitor');
 
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
  // Bounds a runaway/heavy query instead of letting it pin a pool connection
  // indefinitely. Endpoints that need longer should use a cached/estimated
  // query pattern (see reltuples-based counts) rather than raising this.
  statement_timeout: 15000,
  query_timeout: 15000,
  application_name: 'cipherscan-api',
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection failed:', err);
    process.exit(1);
  }
  console.log('✅ Database connected:', res.rows[0].now);
});

// Read/write pool routing seam (both point to primary today)
const poolRouting = require('./pool-routing');
poolRouting.configure({ primary: pool });

// Make dependencies available to routes via app.locals
app.locals.pool = pool;
app.locals.poolRouting = poolRouting;

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
const listCache = createListCache({ redisClient });

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
// Shared HTTP agent: reuses TCP connections to zebrad instead of
const { callZebraRPC } = require('../lib/zebra-rpc');

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

// Trust proxy: exactly one hop (Caddy). With `true`, Express would trust the
// left-most X-Forwarded-For entry, which a client can set arbitrarily to
// spoof the IP used for rate limiting. `1` makes Express use the right-most
// entry, which Caddy appends and a client cannot override.
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// CORS configuration (only allow your domains)
const allowedOrigins = [
  'https://testnet.cipherscan.app',
  'https://cipherscan.app',
  'https://crosslink.cipherscan.app',
  'http://localhost:3000',
  'http://localhost:3001',
  ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : []),
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
  exposedHeaders: ['X-CipherScan-Cache', 'Server-Timing'],
}));

// Internal service API keys bypass rate limiting (comma-separated in env)
const SERVICE_API_KEYS = (process.env.SERVICE_API_KEYS || '').split(',').filter(Boolean);

// Our own frontend domains — never rate-limit browsers visiting CipherScan
const OWN_ORIGINS = [
  'https://cipherscan.app',
  'https://www.cipherscan.app',
  'https://testnet.cipherscan.app',
  'https://crosslink.cipherscan.app',
  'http://localhost:3000',
  'http://localhost:3001',
];

// WebSocket upgrades are gated here (no cookies/CORS involved in the
// handshake): allow a valid service key from any origin (CipherPay, internal
// services), allow our own frontend origins, and allow requests with no
// Origin header at all (native apps, curl, mobile clients reading public
// chain data). Reject only unrecognized cross-site browser origins.
const wss = new WebSocket.Server({
  server,
  verifyClient: (info, callback) => {
    const serviceKey = info.req.headers['x-service-key'];
    if (isKnownServiceKey(serviceKey, SERVICE_API_KEYS)) {
      return callback(true);
    }
    const origin = info.origin || info.req.headers['origin'];
    if (!origin || OWN_ORIGINS.includes(origin)) {
      return callback(true);
    }
    return callback(false, 403, 'Origin not allowed');
  },
});

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 600,
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Service key bypass (Vercel ISR, CipherPay, bots)
    const key = req.headers['x-service-key'];
    if (isKnownServiceKey(key, SERVICE_API_KEYS)) return true;
    // Own frontend bypass — browsers visiting our site send Origin or Referer
    const origin = req.headers['origin'] || '';
    const referer = req.headers['referer'] || '';
    if (OWN_ORIGINS.some(o => origin === o || referer.startsWith(o))) return true;
    return false;
  },
});

app.use(limiter);

// Body parser
app.use(express.json());

// Request logging — path is redacted (see redactPathForLogging) so
// addresses, tx/block hashes, and heights never reach application logs.
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${redactPathForLogging(req.path)}`);
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
app.locals.formatTimeDelta = formatTimeDelta;
app.locals.getTransparentAddresses = getTransparentAddresses;
app.locals.detectBatchDeshields = detectBatchDeshields;
app.locals.detectBatchForShield = detectBatchForShield;
app.locals.queryPrivacyLinkageEdges = queryPrivacyLinkageEdges;
app.locals.queryPrivacyBatchClusters = queryPrivacyBatchClusters;
app.locals.getPrivacyGraph = getPrivacyGraph;
app.locals.redisClient = redisClient;
app.locals.listCache = listCache;

// Block routes: /health, /api/info, /api/blocks, /api/block/:height
app.use(blocksRouter);

// Transaction routes: /api/tx/*, /api/mempool
app.use(transactionsRouter);

// Network routes: /api/network/*
app.use(networkRouter);

// Cross-chain routes: /api/crosschain/*
app.use(crosschainRouter);

// Stats routes: /api/stats/*, /api/privacy-stats
app.use(statsRouter);

// Privacy routes: /api/privacy/*
app.use(privacyRouter);

// Scan routes: /api/scan/*, /api/lightwalletd/*
app.use(scanRouter);

// Address routes: /api/address/*
app.use(addressRouter);

// Blend check routes: /api/blend-check
app.use(blendCheckRouter);

// Crosslink routes: /api/crosslink
app.use(crosslinkRouter);
app.use(reorgsRouter);
app.use(poolsRouter);

// Mining routes: /api/mining/*
app.use(miningRouter);
app.use(analyticsRouter);

// Orchard → Ironwood migration routes: /api/migration/*
app.use(migrationRouter);
app.use(sitemapsRouter);

// Transparent address analysis: /api/transparent/*
app.use(transparentRouter);
app.use(valuationRouter);
app.use(pulseRouter);

// Private trading signals: /api/signals/* (service-key protected)
app.use('/api/signals', signalsRouter);

// Count registered API routes (available as app.locals.apiRouteCount)
function countApiRoutes(app) {
  let count = 0;
  if (!app._router) return count;
  app._router.stack.forEach(layer => {
    if (layer.route && layer.route.path?.startsWith('/api/')) {
      count++;
    } else if (layer.name === 'router' && layer.handle?.stack) {
      layer.handle.stack.forEach(routeLayer => {
        if (routeLayer.route && routeLayer.route.path?.startsWith('/api/')) {
          count++;
        }
      });
    }
  });
  return count;
}
app.locals.apiRouteCount = countApiRoutes(app);
console.log(`📊 Registered ${app.locals.apiRouteCount} API routes`);

// ============================================================================
// WEBSOCKET SERVER (Real-time updates)
// ============================================================================

let clients = new Set();
let rawMempoolSubscribers = 0;

/**
 * In-process fallback limiter used only when Redis is unavailable, so the
 * WebSocket rate limit fails CLOSED (still bounded) instead of allowing
 * unlimited connections. Not shared across API instances, which is
 * acceptable for a fallback path.
 */
const wsFallbackLimiter = new Map(); // ip -> { count, resetAt }
function checkWebSocketRateLimitFallback(ip) {
  const now = Date.now();
  const entry = wsFallbackLimiter.get(ip);
  if (!entry || now >= entry.resetAt) {
    wsFallbackLimiter.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= 10;
}
// Periodic sweep so the fallback map cannot grow unbounded under sustained
// distinct-IP traffic while Redis is down.
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of wsFallbackLimiter) {
    if (now >= entry.resetAt) wsFallbackLimiter.delete(ip);
  }
}, 5 * 60_000).unref();

/**
 * Rate limit WebSocket connections using Redis
 * Returns true if allowed, false if rate limited
 */
async function checkWebSocketRateLimit(ip) {
  try {
    if (!redisClient.isOpen) {
      return checkWebSocketRateLimitFallback(ip);
    }

    const key = `ws:ratelimit:${ip}`;
    const count = await redisClient.incr(key);

    if (count === 1) {
      await redisClient.expire(key, 60);
    }

    return count <= 10;
  } catch (err) {
    console.error('Redis rate limit error:', err);
    return checkWebSocketRateLimitFallback(ip);
  }
}

wss.on('connection', async (ws, req) => {
  // Behind a single reverse proxy (Caddy), the right-most X-Forwarded-For
  // entry is the real client (Caddy appends it and a client cannot override
  // that final hop). The left-most entry is attacker-controlled.
  const xff = req.headers['x-forwarded-for'];
  const ip = (xff ? xff.split(',').pop().trim() : null) || req.socket.remoteAddress || 'unknown';

  const allowed = await checkWebSocketRateLimit(ip);
  if (!allowed) {
    ws.close(1008, 'Rate limit exceeded. Max 10 connections per minute.');
    return;
  }

  // Authenticate service clients via X-Service-Key header on upgrade
  const serviceKey = req.headers['x-service-key'];
  ws.isService = isKnownServiceKey(serviceKey, SERVICE_API_KEYS);
  ws.subscriptions = new Set();

  if (ws.isService) {
    console.log('🔑 [WS] Service client connected');
  }

  clients.add(ws);

  // Push current chain tip immediately so the client can detect staleness
  try {
    const tipResult = await pool.query(
      'SELECT height, hash, timestamp FROM blocks ORDER BY height DESC LIMIT 1'
    );
    if (tipResult.rows[0] && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'chain_tip',
        data: {
          height: parseInt(tipResult.rows[0].height),
          hash: tipResult.rows[0].hash,
          timestamp: parseInt(tipResult.rows[0].timestamp),
        },
      }));
    }
  } catch {
    // Non-fatal — client will receive the next new_block event
  }

  ws.on('message', (raw) => {
    if (!ws.isService) return;
    try {
      const msg = JSON.parse(raw);
      if (msg.subscribe === 'raw_mempool' && !ws.subscriptions.has('raw_mempool')) {
        ws.subscriptions.add('raw_mempool');
        rawMempoolSubscribers++;
        console.log(`📡 [WS] Service client subscribed to raw_mempool (${rawMempoolSubscribers} total)`);
        ws.send(JSON.stringify({ type: 'subscribed', channel: 'raw_mempool' }));
      } else if (msg.unsubscribe === 'raw_mempool' && ws.subscriptions.has('raw_mempool')) {
        ws.subscriptions.delete('raw_mempool');
        rawMempoolSubscribers = Math.max(0, rawMempoolSubscribers - 1);
        console.log(`📡 [WS] Service client unsubscribed from raw_mempool (${rawMempoolSubscribers} total)`);
        ws.send(JSON.stringify({ type: 'unsubscribed', channel: 'raw_mempool' }));
      }
    } catch {}
  });

  const cleanup = () => {
    if (ws.subscriptions.has('raw_mempool')) {
      rawMempoolSubscribers = Math.max(0, rawMempoolSubscribers - 1);
      console.log(`📡 [WS] raw_mempool subscriber disconnected (${rawMempoolSubscribers} remaining)`);
    }
    clients.delete(ws);
  };

  ws.on('close', cleanup);
  ws.on('error', cleanup);
});

// Keep WebSocket connections alive for long-running clients (screensaver mode).
// Sends a ping every 30s; terminates unresponsive clients after 35s.
const WS_PING_INTERVAL = 30_000;
const wsAliveCheck = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      clients.delete(ws);
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, WS_PING_INTERVAL);

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
});

wss.on('close', () => clearInterval(wsAliveCheck));

// Broadcast message to all connected clients (local + Redis Pub/Sub).
// serviceExtra: optional object merged into data for raw_mempool subscribers only.
async function broadcastToAll(message, serviceExtra = null) {
  const regularStr = JSON.stringify(message);

  let serviceStr = null;
  if (serviceExtra && rawMempoolSubscribers > 0) {
    serviceStr = JSON.stringify({
      ...message,
      data: { ...message.data, ...serviceExtra },
    });
  }

  clients.forEach((client) => {
    if (client.readyState !== WebSocket.OPEN) return;

    if (serviceStr && client.isService && client.subscriptions?.has('raw_mempool')) {
      client.send(serviceStr);
    } else {
      client.send(regularStr);
    }
  });

  // Publish regular payload to Redis for multi-server support
  try {
    if (redisPub.isOpen) {
      await redisPub.publish('zcash:broadcast', regularStr);
    }
  } catch (err) {
    console.error('Redis publish error:', err);
  }
}

// In-memory canonical chain tip, updated on every new block (gRPC or poll).
// Routes include this in list-cache keys for chain-derived families so a
// reorg (same height, different hash) automatically invalidates stale data.
let chainTip = { height: 0, hash: '' };
app.locals.chainTip = chainTip;

// Broadcast new block to all connected clients
function broadcastNewBlock(block) {
  const h = parseInt(block.height, 10);
  if (h >= chainTip.height) {
    chainTip = { height: h, hash: block.hash || '' };
    app.locals.chainTip = chainTip;
  }
  broadcastToAll({
    type: 'new_block',
    data: block,
  });
  purgeChainTipCache();
}

// Purge the Next.js CDN cache for chain-tip tagged pages (on-demand ISR)
async function purgeChainTipCache() {
  const url = process.env.REVALIDATION_URL;
  const secret = process.env.REVALIDATE_SECRET;
  if (!url || !secret) return;

  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-revalidate-secret': secret,
      },
      body: JSON.stringify({ tag: 'chain-tip' }),
    });
  } catch (err) {
    // Non-fatal — ISR time-based fallback handles freshness
  }
}

// ============================================================================
// ZEBRA GRPC STREAMING (real-time mempool + blocks)
// ============================================================================

let grpcConnected = false;
let lastKnownHeight = 0;

const zebraGrpc = new ZebraGrpcClient(
  process.env.ZEBRA_GRPC_URL || null,
  {
    onMempoolChange: async (change) => {
      if (change.type === 'ADDED') {
        try {
          const tx = await callZebraRPC('getrawtransaction', [change.txid, 1]);
          if (tx) {
            const orchardActions = tx.orchard?.actions?.length || 0;
            const ironwoodActions = tx.ironwood?.actions?.length || 0;
            const data = {
              txid: change.txid,
              size: tx.size || 0,
              fee: tx.fee || 0,
              hasOrchard: orchardActions > 0,
              hasSapling: (tx.vShieldedSpend?.length || 0) > 0 || (tx.vShieldedOutput?.length || 0) > 0,
              hasIronwood: ironwoodActions > 0,
              orchardActions,
              ironwoodActions,
              valueBalanceOrchard: tx.orchard?.valueBalance || 0,
              valueBalanceIronwood: tx.ironwood?.valueBalance || 0,
              inputCount: tx.vin?.length || 0,
              outputCount: tx.vout?.length || 0,
              time: Math.floor(Date.now() / 1000),
            };

            // tx.hex is included in the verbose response — pass it to
            // service subscribers without an extra RPC call.
            const serviceExtra = (rawMempoolSubscribers > 0 && tx.hex)
              ? { raw_hex: tx.hex }
              : null;

            broadcastToAll({ type: 'mempool_tx', data }, serviceExtra);
          }
        } catch (err) {
          broadcastToAll({ type: 'mempool_tx', data: { txid: change.txid } });
        }
      } else if (change.type === 'MINED') {
        broadcastToAll({ type: 'mempool_removed', data: { txid: change.txid, reason: 'mined' } });
      } else if (change.type === 'INVALIDATED') {
        broadcastToAll({ type: 'mempool_removed', data: { txid: change.txid, reason: 'invalidated' } });
      }
    },

    onChainTipChange: async (tip) => {
      lastKnownHeight = tip.height;

      // Wait briefly for cipherscan-rust indexer to process the block
      await new Promise(r => setTimeout(r, 500));

      try {
        const blockResult = await pool.query('SELECT * FROM blocks WHERE height = $1', [tip.height]);
        if (blockResult.rows.length > 0) {
          broadcastNewBlock(blockResult.rows[0]);
        } else {
          broadcastNewBlock({ height: tip.height, hash: tip.hash });
        }
      } catch (err) {
        broadcastNewBlock({ height: tip.height, hash: tip.hash });
      }
    },

    onConnectionChange: (connected) => {
      grpcConnected = connected;
    },
  }
);

zebraGrpc.start();

// Fork Monitor: poll external lightwalletd nodes for chain tip comparison
const forkMonitor = new ForkMonitor({ pool, grpc, CompactTxStreamer });
forkMonitor.start();
app.locals.forkMonitor = forkMonitor;

// Fallback: poll for new blocks every 10s when gRPC is not connected
setInterval(async () => {
  if (grpcConnected) return;

  try {
    const result = await pool.query('SELECT MAX(height) as max_height FROM blocks');
    const currentHeight = result.rows[0]?.max_height || 0;

    if (currentHeight > lastKnownHeight) {
      console.log(`📦 New block detected (poll fallback): ${currentHeight}`);

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

// Expose gRPC + WebSocket status for health checks
app.get('/api/grpc-status', (req, res) => {
  const serviceClients = [...clients].filter(c => c.isService && c.readyState === WebSocket.OPEN).length;
  res.json({
    connected: grpcConnected,
    url: process.env.ZEBRA_GRPC_URL ? 'configured' : 'not configured',
    websocket: {
      clients: [...clients].filter(c => c.readyState === WebSocket.OPEN).length,
      serviceClients,
      rawMempoolSubscribers,
    },
  });
});

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
  forkMonitor.stop();
  server.close(() => {
    pool.end(() => {
      console.log('Database pool closed');
      process.exit(0);
    });
  });
});
