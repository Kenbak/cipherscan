/**
 * Read/write pool routing with circuit breaker.
 *
 * When REPLICA_DATABASE_URL is set, read queries are routed to the replica
 * as long as it is healthy and within acceptable lag. A circuit breaker
 * ensures that when the replica fails (unreachable, lagging, errors), all
 * reads automatically and instantly fall back to the primary — no stale
 * data, no user-visible errors.
 *
 * Circuit breaker states:
 *   CLOSED  — replica is healthy, reads go to replica
 *   OPEN    — replica is broken, all reads go to primary
 *   HALF_OPEN — probing replica with a single test query
 *
 * The smart read pool (createSmartReadPool) wraps this logic into a
 * drop-in replacement for pg.Pool, so routes need zero changes.
 */

const { Pool } = require('pg');
const { logSafeError, logSafeWarn } = require('./lib/safe-log');
const { measureRequestTiming } = require('./request-timing-context');

const MAX_ACCEPTABLE_LAG_BLOCKS = 3;
const FAILURE_THRESHOLD = 3;
const OPEN_DURATION_MS = 30_000;
const HEALTH_CHECK_INTERVAL_MS = 15_000;
const LAG_CHECK_INTERVAL_MS = 30_000;

// Client-side statement/query bound for the replica connection pool,
// mirroring the primary pool's own statement_timeout/query_timeout
// (server.js). Without this, a replica that's up but stuck (e.g. a
// recovery conflict, a long-held lock during hot_standby_feedback
// contention, or a half-open network path) can hang a query — and hence a
// route relying on the replica, or the periodic health check itself —
// indefinitely instead of failing fast into the primary fallback.
const REPLICA_QUERY_TIMEOUT_MS = 15_000;

// Hard upper bound on the periodic health-check probe and the lag check,
// independent of (and tighter than) REPLICA_QUERY_TIMEOUT_MS, so a hung
// replica is detected and marked as a failure well before the health
// check's own interval would otherwise elapse.
const REPLICA_HEALTH_CHECK_TIMEOUT_MS = 5_000;

/**
 * Races `promise` against a timer, rejecting with a clearly-labeled error
 * if `promise` hasn't settled within `timeoutMs`. Used to hard-bound the
 * replica health check and lag check so a hung connection can't stall
 * either past their own timeout, independent of whatever the underlying
 * driver/network stack would otherwise do.
 */
function withTimeout(promise, timeoutMs, label) {
  const wrapped = Promise.resolve(promise);
  // If the timeout wins the race below, `wrapped` may still reject later
  // (e.g. the query eventually errors on a hung connection) — observe that
  // separately so it doesn't surface as an unhandled rejection.
  wrapped.catch(() => {});

  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([wrapped, timeout]).finally(() => clearTimeout(timer));
}

const CircuitState = { CLOSED: 'CLOSED', OPEN: 'OPEN', HALF_OPEN: 'HALF_OPEN' };

let primaryPool = null;
let replicaPool = null;
let _lastLagCheck = 0;
let _cachedLag = 0;

let _circuitState = CircuitState.CLOSED;
let _consecutiveFailures = 0;
let _circuitOpenedAt = 0;
let _healthCheckTimer = null;

function configure({ primary, replica = null }) {
  primaryPool = primary;
  replicaPool = replica;
}

function configureFromEnv({ primary }) {
  primaryPool = primary;
  const replicaUrl = process.env.REPLICA_DATABASE_URL;
  if (replicaUrl) {
    replicaPool = new Pool({
      connectionString: replicaUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      // Client-side bounds mirroring the primary pool (server.js) — a
      // route or health probe hitting the replica can never hang past
      // this regardless of what the replica or the network is doing.
      statement_timeout: REPLICA_QUERY_TIMEOUT_MS,
      query_timeout: REPLICA_QUERY_TIMEOUT_MS,
      application_name: 'cipherscan-api-replica',
    });
    replicaPool.on('error', (err) => {
      logSafeError('[pool:replica] Idle client error:', err);
      _recordFailure();
    });
    console.log('[pool-routing] Replica pool configured — circuit breaker active');
    _startHealthCheck();
  }
}

function _recordFailure() {
  _consecutiveFailures++;
  if (_consecutiveFailures >= FAILURE_THRESHOLD && _circuitState === CircuitState.CLOSED) {
    _circuitState = CircuitState.OPEN;
    _circuitOpenedAt = Date.now();
    console.warn(`[circuit-breaker] OPENED after ${_consecutiveFailures} failures — reads falling back to primary`);
  }
}

function _recordSuccess() {
  if (_consecutiveFailures > 0 || _circuitState !== CircuitState.CLOSED) {
    console.log(`[circuit-breaker] Replica healthy — circuit CLOSED`);
  }
  _consecutiveFailures = 0;
  _circuitState = CircuitState.CLOSED;
}

function _shouldUseReplica() {
  if (!replicaPool) return false;
  if (_circuitState === CircuitState.CLOSED) return true;
  if (_circuitState === CircuitState.OPEN) {
    if (Date.now() - _circuitOpenedAt >= OPEN_DURATION_MS) {
      _circuitState = CircuitState.HALF_OPEN;
      console.log('[circuit-breaker] HALF_OPEN — probing replica');
      return true;
    }
    return false;
  }
  // HALF_OPEN: allow one probe
  return true;
}

function _startHealthCheck() {
  if (_healthCheckTimer) return;
  _healthCheckTimer = setInterval(async () => {
    if (!replicaPool) return;
    try {
      // Hard-bound independent of REPLICA_QUERY_TIMEOUT_MS: a health probe
      // that itself takes 15s to time out defeats the point of a 15s-
      // interval-adjacent health check, so this uses a tighter explicit
      // bound rather than relying solely on the pool-level query_timeout.
      const result = await withTimeout(
        replicaPool.query('SELECT 1 AS ok'),
        REPLICA_HEALTH_CHECK_TIMEOUT_MS,
        'replica health check',
      );
      if (result.rows[0]?.ok === 1) {
        const lag = await replicaLagBlocks();
        if (lag <= MAX_ACCEPTABLE_LAG_BLOCKS) {
          _recordSuccess();
        } else {
          _recordFailure();
        }
      } else {
        _recordFailure();
      }
    } catch {
      _recordFailure();
    }
  }, HEALTH_CHECK_INTERVAL_MS);
  _healthCheckTimer.unref();
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
 * Create a smart read pool that transparently routes queries through the
 * circuit breaker. Drop-in replacement for pg.Pool — same .query() API.
 *
 * When circuit is CLOSED → try replica, fall back to primary on ANY error.
 * When circuit is OPEN → go straight to primary (zero replica latency).
 * When circuit is HALF_OPEN → probe replica with one query.
 */
function createSmartReadPool() {
  return {
    async query(text, params) {
      return measureRequestTiming('database', async () => {
        if (!_shouldUseReplica()) {
          return primaryPool.query(text, params);
        }
        try {
          const result = await replicaPool.query(text, params);
          _recordSuccess();
          return result;
        } catch (err) {
          _recordFailure();
          logSafeWarn('[pool-routing] Replica query failed, falling back to primary:', err);
          return primaryPool.query(text, params);
        }
      });
    },
    async connect() {
      if (!_shouldUseReplica()) {
        return primaryPool.connect();
      }
      try {
        const client = await replicaPool.connect();
        _recordSuccess();
        return client;
      } catch (err) {
        _recordFailure();
        logSafeWarn('[pool-routing] Replica connect failed, falling back to primary:', err);
        return primaryPool.connect();
      }
    },
    get totalCount() { return (_shouldUseReplica() ? replicaPool : primaryPool).totalCount; },
    get idleCount() { return (_shouldUseReplica() ? replicaPool : primaryPool).idleCount; },
    get waitingCount() { return (_shouldUseReplica() ? replicaPool : primaryPool).waitingCount; },
    on(...args) { return primaryPool.on(...args); },
  };
}

async function queryWithReplicaFallback(text, params) {
  return measureRequestTiming('database', async () => {
    if (!_shouldUseReplica()) {
      return primaryPool.query(text, params);
    }
    try {
      const result = await replicaPool.query(text, params);
      _recordSuccess();
      return result;
    } catch (err) {
      _recordFailure();
      logSafeWarn('[pool-routing] Replica query failed, falling back to primary:', err);
      return primaryPool.query(text, params);
    }
  });
}

async function replicaLagBlocks() {
  if (!replicaPool) return 0;
  const now = Date.now();
  if (now - _lastLagCheck < LAG_CHECK_INTERVAL_MS) return _cachedLag;
  try {
    const [primaryResult, replicaResult] = await withTimeout(
      Promise.all([
        primaryPool.query('SELECT MAX(height) AS h FROM blocks'),
        replicaPool.query('SELECT MAX(height) AS h FROM blocks'),
      ]),
      REPLICA_HEALTH_CHECK_TIMEOUT_MS,
      'replica lag check',
    );
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

function getCircuitState() {
  return {
    state: _circuitState,
    consecutiveFailures: _consecutiveFailures,
    openedAt: _circuitOpenedAt || null,
    replicaConfigured: replicaPool !== null,
    cachedLagBlocks: Number.isFinite(_cachedLag) ? _cachedLag : null,
  };
}

module.exports = {
  configure,
  configureFromEnv,
  getWritePool,
  getReadPool,
  createSmartReadPool,
  queryWithReplicaFallback,
  replicaLagBlocks,
  hasReplica,
  getCircuitState,
  MAX_ACCEPTABLE_LAG_BLOCKS,
  REPLICA_QUERY_TIMEOUT_MS,
  REPLICA_HEALTH_CHECK_TIMEOUT_MS,
  withTimeout,
};
