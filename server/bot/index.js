'use strict';

/**
 * CipherScan Data Bot — Orchestrator
 *
 * Entry point for the bot service. Manages cron scheduling:
 *  - Every 5 minutes: realtime alerts (large flows, milestones, reorgs)
 *  - Daily at 08:00 UTC: daily digest
 *
 * Configuration via environment variables:
 *  - DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
 *  - X_ACCESS_TOKEN (OAuth2 user access token)
 *  - X_CLIENT_ID, X_CLIENT_SECRET, X_REFRESH_TOKEN (for token refresh)
 *  - BOT_DRY_RUN=1 (skip actual posting, log only)
 *  - BOT_DIGEST_HOUR=8 (UTC hour for daily digest, default 8)
 */

const { Pool } = require('pg');
const { XClient } = require('./lib/x-client');
const dailyDigest = require('./jobs/daily-digest');
const realtimeAlerts = require('./jobs/realtime-alerts');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'zcash_explorer_mainnet',
  user: process.env.DB_USER || 'zcash_user',
  password: process.env.DB_PASSWORD,
  max: 5,
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 5000,
});

const dryRun = process.env.BOT_DRY_RUN === '1';
const digestHour = parseInt(process.env.BOT_DIGEST_HOUR || '8');

const xClient = new XClient({
  accessToken: process.env.X_ACCESS_TOKEN || '',
  dryRun,
});

const logger = {
  info: (...args) => console.log(new Date().toISOString(), '[INFO]', ...args),
  warn: (...args) => console.warn(new Date().toISOString(), '[WARN]', ...args),
  error: (...args) => console.error(new Date().toISOString(), '[ERROR]', ...args),
};

let lastDigestDate = null;
let running = false;

async function tick() {
  if (running) return;
  running = true;

  try {
    // Realtime alerts every tick
    const alertResults = await realtimeAlerts.run(pool, xClient, { logger });
    if (alertResults.length > 0) {
      logger.info(`[Tick] ${alertResults.length} alert(s) posted`);
    }

    // Daily digest check
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const currentHour = now.getUTCHours();

    if (currentHour >= digestHour && lastDigestDate !== todayStr) {
      logger.info(`[Tick] Running daily digest for ${todayStr}`);
      await dailyDigest.run(pool, xClient, { date: todayStr, logger });
      lastDigestDate = todayStr;
    }
  } catch (err) {
    logger.error(`[Tick] Unhandled error: ${err.message}`);
  } finally {
    running = false;
  }
}

// ─── Startup ─────────────────────────────────────────────────────────────────

async function start() {
  logger.info(`CipherScan Data Bot starting (dry_run=${dryRun})`);

  try {
    const { rows } = await pool.query('SELECT NOW() as t, current_database() as db');
    logger.info(`Connected to ${rows[0].db} at ${rows[0].t}`);
  } catch (err) {
    logger.error(`Database connection failed: ${err.message}`);
    process.exit(1);
  }

  // Run immediately on start
  await tick();

  // Then every 5 minutes
  const INTERVAL_MS = 5 * 60 * 1000;
  setInterval(tick, INTERVAL_MS);
  logger.info(`Scheduled: alerts every 5m, digest at ${digestHour}:00 UTC`);
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down');
  await pool.end();
  process.exit(0);
});

start().catch((err) => {
  logger.error(`Fatal: ${err.message}`);
  process.exit(1);
});
