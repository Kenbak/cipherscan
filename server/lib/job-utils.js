'use strict';

const path = require('path');

/**
 * Shared utilities for CipherScan cron jobs and scripts.
 *
 * Provides: timestamped logging, dotenv loading, and advisory lock helpers
 * so every job doesn't need to redefine these from scratch.
 */

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
  console.log(`[${ts}] ${msg}`);
}

// ─── Environment ──────────────────────────────────────────────────────────────

/**
 * Load .env files from standard locations (job-local, then server/api/.env).
 * Call once at the top of each job entry point.
 *
 * @param {string} callerDir - pass `__dirname` from the calling file
 */
function loadEnv(callerDir) {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(callerDir, '.env') });
  dotenv.config({ path: path.join(callerDir, '../api/.env') });
}

// ─── Advisory Locks ───────────────────────────────────────────────────────────

/**
 * Run `fn(client)` while holding a PostgreSQL advisory lock.
 * If the lock is already held, logs a message and returns without running `fn`.
 *
 * @param {import('pg').PoolClient} client - connected PG client
 * @param {number} lockId - unique integer lock identifier
 * @param {(client: import('pg').PoolClient) => Promise<void>} fn
 */
async function withAdvisoryLock(client, lockId, fn) {
  const { rows } = await client.query(
    'SELECT pg_try_advisory_lock($1) AS acquired', [lockId]
  );
  if (!rows[0].acquired) {
    log('Another instance running — exiting.');
    return;
  }
  try {
    await fn(client);
  } finally {
    try { await client.query('SELECT pg_advisory_unlock($1)', [lockId]); } catch {}
  }
}

module.exports = { log, loadEnv, withAdvisoryLock };
