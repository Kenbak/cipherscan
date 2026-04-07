#!/usr/bin/env node

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
require('dotenv').config({ path: path.join(__dirname, '../api/.env') });

const { Pool } = require('pg');
const {
  computePrivacyLinkageEdges,
  upsertPrivacyLinkageEdges,
} = require('../api/privacy-linkage');

const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.replace('--', '').split('=');
  acc[key] = value === undefined ? true : value;
  return acc;
}, {});

const CONFIG = {
  period: parseInt(args.period, 10) || 30,
  minScore: parseInt(args['min-score'], 10) || 35,
  limit: parseInt(args.limit, 10) || 8000,
  dryRun: args['dry-run'] === true,
};

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 2,
      idleTimeoutMillis: 10000,
    })
  : new Pool({
      host: process.env.DB_HOST || process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || process.env.POSTGRES_PORT || '5432', 10),
      database: process.env.DB_NAME || process.env.POSTGRES_DATABASE || 'zcash_explorer',
      user: process.env.DB_USER || process.env.POSTGRES_USER || 'postgres',
      password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || '',
      max: 2,
      idleTimeoutMillis: 10000,
    });

async function main() {
  const startedAt = Date.now();
  console.log('═'.repeat(60));
  console.log('PRIVACY LINKAGE EDGE BUILDER');
  console.log(`Period: ${CONFIG.period} days`);
  console.log(`Min score: ${CONFIG.minScore}`);
  console.log(`Dry run: ${CONFIG.dryRun}`);
  console.log('═'.repeat(60));

  try {
    const edges = await computePrivacyLinkageEdges(pool, {
      timeWindowDays: CONFIG.period,
      minConfidence: CONFIG.minScore,
      limit: CONFIG.limit,
    });

    console.log(`Detected ${edges.length} linkage edges`);

    if (!CONFIG.dryRun) {
      await upsertPrivacyLinkageEdges(pool, edges);
      const cleanupResult = await pool.query('SELECT cleanup_expired_privacy_linkage() AS deleted');
      console.log(`Expired rows removed: ${cleanupResult.rows[0]?.deleted || 0}`);
    }

    const high = edges.filter((edge) => edge.warningLevel === 'HIGH').length;
    const medium = edges.filter((edge) => edge.warningLevel === 'MEDIUM').length;
    const top = edges.slice(0, 10);
    for (const edge of top) {
      console.log(
        `[${edge.warningLevel}] ${edge.confidenceScore}/100 ${edge.srcTxid.slice(0, 10)}... -> ${edge.dstTxid.slice(0, 10)}...`
      );
    }

    console.log(`High: ${high}`);
    console.log(`Medium: ${medium}`);
    console.log(`Elapsed: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
    console.log('═'.repeat(60));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Failed to build privacy linkage edges:', error);
  process.exit(1);
});
