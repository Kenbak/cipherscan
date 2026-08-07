#!/usr/bin/env node

const { loadEnv } = require('../lib/job-utils');
const { getPool } = require('../lib/db-pool');

loadEnv(__dirname);

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

const pool = getPool({ max: 2, idleTimeoutMillis: 10000 });

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
