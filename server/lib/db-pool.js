'use strict';

const { Pool } = require('pg');

let _pool;
let _replicaPool;

// Query deadlines: bound how long any single query can run so a runaway
// analytical query in one job can't starve the pool's small connection
// count (jobs typically use max 2-5 connections) or hang a cron run
// indefinitely. `statement_timeout` is enforced server-side by Postgres;
// `query_timeout` is the pg driver's client-side timeout and is kept
// slightly higher so the server-side timeout is what normally fires first.
// Callers with a legitimate need for a different bound (e.g. a known-long
// backfill) can still override either via `opts`.
const DEFAULT_STATEMENT_TIMEOUT_MS = 30_000;
const DEFAULT_QUERY_TIMEOUT_MS = 35_000;

/**
 * Returns a singleton pg Pool configured from standard env vars (primary DB).
 * Every standalone job/script should call this instead of instantiating
 * its own Pool — cuts ~10 lines of boilerplate per file.
 *
 * The API server (server.js) keeps its own pool for lifecycle reasons.
 *
 * @param {{ max?: number, idleTimeoutMillis?: number, statement_timeout?: number, query_timeout?: number }} opts
 */
function getPool(opts = {}) {
  if (!_pool) {
    const { max, idleTimeoutMillis, statement_timeout, query_timeout, ...extra } = opts;
    _pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      max: max || 5,
      idleTimeoutMillis: idleTimeoutMillis || 30000,
      statement_timeout: statement_timeout ?? DEFAULT_STATEMENT_TIMEOUT_MS,
      query_timeout: query_timeout ?? DEFAULT_QUERY_TIMEOUT_MS,
      ...extra,
    });
  }
  return _pool;
}

/**
 * True when a read replica is configured for job/script read-routing
 * (REPLICA_DB_HOST env var). Lets callers decide/log whether reads will
 * actually be offloaded without instantiating a pool.
 *
 * Note: this is the standalone-job read-routing knob (REPLICA_DB_HOST +
 * REPLICA_DB_PORT). The API server's own replica routing (server.js /
 * pool-routing.js, circuit-breaker aware) is a separate subsystem keyed off
 * REPLICA_DATABASE_URL — the two are intentionally not unified here since
 * that would be an infra/env-var change outside this module's scope.
 */
function hasReadReplica() {
  return Boolean(process.env.REPLICA_DB_HOST);
}

/**
 * Returns a singleton pool pointing at the read replica, if configured.
 * Falls back to the primary pool when REPLICA_DB_HOST is not set.
 *
 * Jobs that do heavy reads should call getReadPool() for scans and
 * getPool() (the primary) for writes.
 */
function getReadPool(opts = {}) {
  if (!hasReadReplica()) return getPool(opts);
  if (!_replicaPool) {
    const { max, idleTimeoutMillis, statement_timeout, query_timeout, ...extra } = opts;
    _replicaPool = new Pool({
      host: process.env.REPLICA_DB_HOST,
      port: parseInt(process.env.REPLICA_DB_PORT || process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      max: max || 5,
      idleTimeoutMillis: idleTimeoutMillis || 30000,
      statement_timeout: statement_timeout ?? DEFAULT_STATEMENT_TIMEOUT_MS,
      query_timeout: query_timeout ?? DEFAULT_QUERY_TIMEOUT_MS,
      application_name: 'cipherscan-replica-reader',
      ...extra,
    });
  }
  return _replicaPool;
}

module.exports = { getPool, getReadPool, hasReadReplica };
