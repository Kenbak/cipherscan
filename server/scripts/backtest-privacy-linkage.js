#!/usr/bin/env node

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
require('dotenv').config({ path: path.join(__dirname, '../api/.env') });

const { Pool } = require('pg');
const {
  computePrivacyLinkageEdges,
  computePrivacyBatchClusters,
} = require('../api/privacy-linkage');

const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.replace('--', '').split('=');
  acc[key] = value === undefined ? true : value;
  return acc;
}, {});

const CONFIG = {
  period: parseInt(args.period, 10) || 30,
  minScore: parseInt(args['min-score'], 10) || 35,
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

function printSection(title) {
  console.log('');
  console.log(title);
  console.log('-'.repeat(title.length));
}

async function main() {
  try {
    const [edges, batchResult] = await Promise.all([
      computePrivacyLinkageEdges(pool, {
        timeWindowDays: CONFIG.period,
        minConfidence: CONFIG.minScore,
      }),
      computePrivacyBatchClusters(pool, {
        timeWindowDays: CONFIG.period,
        minConfidence: CONFIG.minScore,
      }),
    ]);

    const clusters = batchResult.clusters;
    const pairHigh = edges.filter((edge) => edge.warningLevel === 'HIGH');
    const pairAmbiguous = edges.filter((edge) => edge.ambiguityScore >= 40);
    const weirdAmountPairs = edges.filter((edge) => edge.amountWeirdnessScore >= 10);
    const batchHigh = clusters.filter((cluster) => cluster.warningLevel === 'HIGH');
    const batchAmbiguous = clusters.filter((cluster) => cluster.ambiguityScore >= 40);

    console.log('Privacy linkage backtest');
    console.log(`Window: last ${CONFIG.period} days`);
    console.log(`Threshold: ${CONFIG.minScore}/100`);

    printSection('Pair linkage summary');
    console.log(`Total pair edges: ${edges.length}`);
    console.log(`High confidence pair edges: ${pairHigh.length}`);
    console.log(`Weird-amount pair edges: ${weirdAmountPairs.length}`);
    console.log(`Ambiguous pair edges: ${pairAmbiguous.length}`);
    console.log(`Top 5 pair scores: ${edges.slice(0, 5).map((edge) => edge.confidenceScore).join(', ') || 'none'}`);

    printSection('Batch cluster summary');
    console.log(`Total clusters: ${clusters.length}`);
    console.log(`High confidence clusters: ${batchHigh.length}`);
    console.log(`Ambiguous clusters: ${batchAmbiguous.length}`);
    console.log(`Top 5 cluster scores: ${clusters.slice(0, 5).map((cluster) => cluster.confidenceScore).join(', ') || 'none'}`);

    printSection('Suggested review slices');
    console.log('Review these groups manually after threshold changes:');
    console.log(`- High-score weird amounts: ${weirdAmountPairs.slice(0, 5).map((edge) => edge.edgeHash.slice(0, 12)).join(', ') || 'none'}`);
    console.log(`- High ambiguity pairs: ${pairAmbiguous.slice(0, 5).map((edge) => edge.edgeHash.slice(0, 12)).join(', ') || 'none'}`);
    console.log(`- High ambiguity clusters: ${batchAmbiguous.slice(0, 5).map((cluster) => cluster.clusterHash.slice(0, 12)).join(', ') || 'none'}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Backtest failed:', error);
  process.exit(1);
});
