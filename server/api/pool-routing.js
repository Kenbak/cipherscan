/**
 * Read/write pool routing seam for replica support.
 *
 * When REPLICA_DATABASE_URL is set, getReadPool() returns the replica pool
 * for eligible queries, gated by replicaLagBlocks(). Otherwise both
 * getReadPool() and getWritePool() return the primary pool.
 *
 * Endpoints safe to move to replica (lag-tolerant):
 *   rich-list, mining, analytics, transparent-exposed, privacy linkage
 *
 * Endpoints that must stay on primary (tip-sensitive):
 *   /api/info, /api/blocks*, /api/tx/:txid, /api/address/:address, WS tip
 */

const { Pool } = require('pg');

const MAX_ACCEPTABLE_LAG_BLOCKS = 3;

let primaryPool = null;
let replicaPool = null;
let _lastLagCheck = 0;
let _cachedLag = 0;
const LAG_CHECK_INTERVAL_MS = 30_000;

function configure({ primary, replica = null }) {
  primaryPool = primary;
  replicaPool = replica;
}

/**
 * Auto-configure from env vars. Called by server.js after the primary pool
 * is created. Creates a replica pool if REPLICA_DATABASE_URL is set.
 */
function configureFromEnv({ primary }) {
  primaryPool = primary;
  const replicaUrl = process.env.REPLICA_DATABASE_URL;
  if (replicaUrl) {
    replicaPool = new Pool({
      connectionString: replicaUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      application_name: 'cipherscan-api-replica',
    });
    console.log('[pool-routing] Replica pool configured from REPLICA_DATABASE_URL');
  }
}

function getWritePool() {
  if (!primaryPool) throw new Error('pool-routing: primary pool not configured');
  return primaryPool;
}

function getReadPool() {
  if (!replicaPool) return getWritePool();
  return replicaPool;
}

/**
 * Returns the replica pool for lag-tolerant reads, falling back to the
 * primary if the replica is too far behind or unavailable.
 */
async function getSafeReadPool() {
  if (!replicaPool) return getWritePool();
  const lag = await replicaLagBlocks();
  if (lag > MAX_ACCEPTABLE_LAG_BLOCKS) return getWritePool();
  return replicaPool;
}

async function replicaLagBlocks() {
  if (!replicaPool) return 0;
  const now = Date.now();
  if (now - _lastLagCheck < LAG_CHECK_INTERVAL_MS) return _cachedLag;
  try {
    const [primaryResult, replicaResult] = await Promise.all([
      primaryPool.query('SELECT MAX(height) AS h FROM blocks'),
      replicaPool.query('SELECT MAX(height) AS h FROM blocks'),
    ]);
    const primaryHeight = parseInt(primaryResult.rows[0]?.h, 10) || 0;
    const replicaHeight = parseInt(replicaResult.rows[0]?.h, 10) || 0;
    _cachedLag = Math.max(0, primaryHeight - replicaHeight);
    _lastLagCheck = now;
    return _cachedLag;
  } catch {
    _cachedLag = Infinity;
    _lastLagCheck = now;
    return Infinity;
  }
}

function hasReplica() {
  return replicaPool !== null;
}

module.exports = {
  configure,
  configureFromEnv,
  getWritePool,
  getReadPool,
  getSafeReadPool,
  replicaLagBlocks,
  hasReplica,
  MAX_ACCEPTABLE_LAG_BLOCKS,
};
