/**
 * PostgreSQL Database Client
 * Connects to the Zcash blockchain database
 */

import { Pool } from 'pg';

// Create a singleton connection pool
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'zcash_explorer_testnet',
      user: process.env.DB_USER || 'zcash_user',
      password: process.env.DB_PASSWORD,
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }
  return pool;
}

export async function query(text: string, params?: any[]) {
  const pool = getPool();
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;

  if (duration > 1000) {
    console.warn('Slow query detected:', { text, duration, rows: res.rowCount });
  }

  return res;
}

export async function getClient() {
  const pool = getPool();
  return pool.connect();
}
