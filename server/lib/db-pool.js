'use strict';

const { Pool } = require('pg');

let _pool;

/**
 * Returns a singleton pg Pool configured from standard env vars.
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

module.exports = { getPool };
