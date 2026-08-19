/**
 * Read/write pool routing seam for replica support.
 *
 * When REPLICA_DATABASE_URL is set, getReadPool() returns the replica pool
 * for eligible queries, gated by replicaLagBlocks(). Otherwise both
 * getReadPool() and getWritePool() return the primary pool.
 *
 * queryWithReplicaFallback() runs a query on the replica first and
 * automatically retries on the primary if the replica returns a recovery
 * conflict error (code 40001 / 40P01) — so the caller always gets data.
 *
 * Endpoints safe to move to replica (lag-tolerant):
 *   rich-list, mining, analytics, transparent-exposed, privacy linkage
 *
 * Endpoints that must stay on primary (tip-sensitive):
 *   /api/info, /api/blocks*, /api/tx/:txid, /api/address/:address, WS tip
 */

const { Pool } = require('pg');

const MAX_ACCEPTABLE_LAG_BLOCKS = 3;

const RECOVERY_CONFLICT_CODES = new Set([
  '40001', // serialization_failure
  '40P01', // deadlock_detected
  '57014', // query_canceled (includes recovery conflict cancels)
]);

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
    replicaPool.on('error', (err) => {
      console.error('[pool:replica] Idle client error:', err.message);
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

/**
 * Run a read query on the replica, retrying transparently on the primary
 * if the replica fails with a recovery conflict or cancellation error.
 * Callers get data even when the replica is applying WAL.
 */
async function queryWithReplicaFallback(text, params) {
  const readPool = getReadPool();
  if (readPool === primaryPool) {
    return primaryPool.query(text, params);
  }
  try {
    return await readPool.query(text, params);
  } catch (err) {
    const isConflict = RECOVERY_CONFLICT_CODES.has(err.code)
      || (err.message && err.message.includes('conflict with recovery'));
    if (isConflict) {
      console.warn('[pool-routing] Replica conflict, retrying on primary:', err.message);
      return primaryPool.query(text, params);
    }
    throw err;
  }
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
  queryWithReplicaFallback,
  replicaLagBlocks,
  hasReplica,
  MAX_ACCEPTABLE_LAG_BLOCKS,
};
