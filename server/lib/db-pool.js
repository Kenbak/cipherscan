'use strict';

const { Pool } = require('pg');

let _pool;
let _replicaPool;

/**
 * Returns a singleton pg Pool configured from standard env vars (primary DB).
 * Every standalone job/script should call this instead of instantiating
 * its own Pool — cuts ~10 lines of boilerplate per file.
 *
 * The API server (server.js) keeps its own pool for lifecycle reasons.
 *
 * @param {{ max?: number, idleTimeoutMillis?: number, statement_timeout?: number }} opts
 */
function getPool(opts = {}) {
  if (!_pool) {
    const { max, idleTimeoutMillis, ...extra } = opts;
    _pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      max: max || 5,
      idleTimeoutMillis: idleTimeoutMillis || 30000,
      ...extra,
    });
  }
  return _pool;
}

/**
 * Returns a singleton pool pointing at the read replica, if configured.
 * Falls back to the primary pool when REPLICA_DB_HOST is not set.
 *
 * Jobs that do heavy reads should call getReadPool() for scans and
 * getPool() (the primary) for writes.
 */
function getReadPool(opts = {}) {
  if (!process.env.REPLICA_DB_HOST) return getPool(opts);
  if (!_replicaPool) {
    const { max, idleTimeoutMillis, ...extra } = opts;
    _replicaPool = new Pool({
      host: process.env.REPLICA_DB_HOST,
      port: parseInt(process.env.REPLICA_DB_PORT || process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      max: max || 5,
      idleTimeoutMillis: idleTimeoutMillis || 30000,
      application_name: 'cipherscan-replica-reader',
      ...extra,
    });
  }
  return _replicaPool;
}

module.exports = { getPool, getReadPool };
