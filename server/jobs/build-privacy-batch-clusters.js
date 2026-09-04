#!/usr/bin/env node

const { loadEnv } = require('../lib/job-utils');
const { getPool, getReadPool } = require('../lib/db-pool');

loadEnv(__dirname);

const {
  computePrivacyBatchClusters,
  upsertPrivacyBatchClusters,
  upsertPrivacyLinkageEdges,
} = require('../api/privacy-linkage');

const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.replace('--', '').split('=');
  acc[key] = value === undefined ? true : value;
  return acc;
}, {});

const CONFIG = {
  period: parseInt(args.period, 10) || 30,
  minBatchCount: parseInt(args['min-batch'], 10) || 3,
  minAmountZec: parseFloat(args['min-amount']) || 10,
  minScore: parseInt(args['min-score'], 10) || 35,
  limit: parseInt(args.limit, 10) || 12000,
  dryRun: args['dry-run'] === true,
};

const pool = getPool({ max: 2, idleTimeoutMillis: 10000 });
// computePrivacyBatchClusters() only ever SELECTs; the write pool is
// reserved for the upsert*() calls and the cleanup query below. Clearly
// separable because the compute/write phases already call different
// exported functions with the pool passed in as a parameter.
const readPool = getReadPool({ max: 2, idleTimeoutMillis: 10000 });

async function main() {
  const startedAt = Date.now();
  console.log('═'.repeat(60));
  console.log('PRIVACY BATCH CLUSTER BUILDER');
  console.log(`Period: ${CONFIG.period} days`);
  console.log(`Min batch count: ${CONFIG.minBatchCount}`);
  console.log(`Min amount: ${CONFIG.minAmountZec} ZEC`);
  console.log(`Min score: ${CONFIG.minScore}`);
  console.log(`Dry run: ${CONFIG.dryRun}`);
  console.log('═'.repeat(60));

  try {
    const { clusters, derivedEdges } = await computePrivacyBatchClusters(readPool, {
      timeWindowDays: CONFIG.period,
      minBatchCount: CONFIG.minBatchCount,
      minAmountZat: Math.round(CONFIG.minAmountZec * 100000000),
      minConfidence: CONFIG.minScore,
      limit: CONFIG.limit,
    });

    console.log(`Detected ${clusters.length} batch clusters`);
    console.log(`Derived ${derivedEdges.length} batch linkage edges`);

    if (!CONFIG.dryRun) {
      await upsertPrivacyBatchClusters(pool, clusters);
      if (derivedEdges.length > 0) {
        await upsertPrivacyLinkageEdges(pool, derivedEdges);
      }
      const cleanupResult = await pool.query('SELECT cleanup_expired_privacy_linkage() AS deleted');
      console.log(`Expired rows removed: ${cleanupResult.rows[0]?.deleted || 0}`);
    }

    const high = clusters.filter((cluster) => cluster.warningLevel === 'HIGH').length;
    const medium = clusters.filter((cluster) => cluster.warningLevel === 'MEDIUM').length;
    const totalZec = clusters.reduce((sum, cluster) => sum + cluster.totalAmountZat / 100000000, 0);

    for (const cluster of clusters.slice(0, 10)) {
      console.log(
        `[${cluster.warningLevel}] ${cluster.confidenceScore}/100 ${cluster.memberCount}x ${(cluster.representativeAmountZat / 100000000).toFixed(4)} ZEC`
      );
    }

    console.log(`High: ${high}`);
    console.log(`Medium: ${medium}`);
    console.log(`Total ZEC flagged: ${totalZec.toLocaleString()}`);
    console.log(`Elapsed: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
    console.log('═'.repeat(60));
  } finally {
    await pool.end();
    if (readPool !== pool) await readPool.end();
  }
}

main().catch((error) => {
  console.error('Failed to build privacy batch clusters:', error);
  process.exit(1);
});
