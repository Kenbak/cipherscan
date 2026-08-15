/**
 * Read/write pool routing seam for future replica support.
 *
 * Today both getReadPool() and getWritePool() return the same primary pool.
 * When a read replica is provisioned, getReadPool() will return the replica
 * pool for eligible queries, gated by replicaLagBlocks().
 *
 * Endpoints annotated as "can-move-to-replica" in the codebase:
 *   rich-list, mining, analytics, transparent-exposed, privacy linkage
 *
 * Endpoints that must stay on primary (tip-sensitive):
 *   /api/info, /api/blocks*, /api/tx/:txid, /api/address/:address, WS tip
 */

const MAX_ACCEPTABLE_LAG_BLOCKS = 3;

let primaryPool = null;
let replicaPool = null;

function configure({ primary, replica = null }) {
  primaryPool = primary;
  replicaPool = replica;
}

function getWritePool() {
  if (!primaryPool) throw new Error('pool-routing: primary pool not configured');
  return primaryPool;
}

function getReadPool() {
  if (!replicaPool) return getWritePool();
  return replicaPool;
}

async function replicaLagBlocks() {
  if (!replicaPool) return 0;
  try {
    const [primaryResult, replicaResult] = await Promise.all([
      primaryPool.query('SELECT MAX(height) AS h FROM blocks'),
      replicaPool.query('SELECT MAX(height) AS h FROM blocks'),
    ]);
    const primaryHeight = parseInt(primaryResult.rows[0]?.h, 10) || 0;
    const replicaHeight = parseInt(replicaResult.rows[0]?.h, 10) || 0;
    return Math.max(0, primaryHeight - replicaHeight);
  } catch {
    return Infinity;
  }
}

function isReplicaSafe() {
  return replicaPool === null;
}

module.exports = {
  configure,
  getWritePool,
  getReadPool,
  replicaLagBlocks,
  isReplicaSafe,
  MAX_ACCEPTABLE_LAG_BLOCKS,
};
