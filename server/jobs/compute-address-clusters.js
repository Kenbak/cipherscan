#!/usr/bin/env node
/**
 * Address Clustering via Common-Input Ownership Heuristic
 *
 * If multiple addresses appear as inputs in the same transaction, they are
 * controlled by the same entity (someone signed all of them). This job:
 *
 *   1. Streams all multi-input transactions in height-range batches
 *   2. Merges co-spent addresses using a union-find (disjoint set) structure
 *   3. Writes the resulting clusters to address_clusters + address_cluster_meta
 *
 * Safe to kill and re-run — it truncates and rebuilds each time.
 * Uses an advisory lock to prevent concurrent execution.
 *
 * Usage:
 *   node compute-address-clusters.js                    — full rebuild
 *   node compute-address-clusters.js --batch=50000      — custom batch size
 *   node compute-address-clusters.js --dry-run          — compute but don't write
 */

const { log, loadEnv, withAdvisoryLock } = require('../lib/job-utils');
loadEnv(__dirname);

const { getPool, getReadPool } = require('../lib/db-pool');

const pool = getPool({ max: 3, idleTimeoutMillis: 30000 });
// The scan phase (chain-tip lookup + per-batch multi-input tx read) never
// writes; the write phase (TRUNCATE + bulk INSERT) happens strictly after
// the whole scan completes and is fully separate in code, so the read half
// is safe to offload. A full-history rebuild batch can join a large slice
// of transaction_inputs/transactions, which may legitimately run past the
// 30s default — given an explicit longer bound here.
const CLUSTER_SCAN_STATEMENT_TIMEOUT_MS = 180_000;
const readPool = getReadPool({ max: 3, idleTimeoutMillis: 30000, statement_timeout: CLUSTER_SCAN_STATEMENT_TIMEOUT_MS });
const LOCK_ID = 839310;

const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.replace('--', '').split('=');
  acc[key] = value === undefined ? true : value;
  return acc;
}, {});

const BATCH_SIZE = parseInt(args.batch, 10) || 50000;
const DRY_RUN = args['dry-run'] === true;

// ─── Union-Find ────────────────────────────────────────────────────────────────

class UnionFind {
  constructor() {
    this.parent = new Map();
    this.rank = new Map();
  }

  find(x) {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
      return x;
    }
    let root = x;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root);
    }
    // Path compression
    let current = x;
    while (current !== root) {
      const next = this.parent.get(current);
      this.parent.set(current, root);
      current = next;
    }
    return root;
  }

  union(a, b) {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) return;

    const rankA = this.rank.get(rootA);
    const rankB = this.rank.get(rootB);
    if (rankA < rankB) {
      this.parent.set(rootA, rootB);
    } else if (rankA > rankB) {
      this.parent.set(rootB, rootA);
    } else {
      this.parent.set(rootB, rootA);
      this.rank.set(rootA, rankA + 1);
    }
  }

  size() {
    return this.parent.size;
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await withAdvisoryLock(pool, LOCK_ID, async (client) => {
    log('═══════════════════════════════════════════════════════════');
    log('ADDRESS CLUSTER BUILDER — Common-Input Ownership Heuristic');
    log(`Batch size: ${BATCH_SIZE} blocks | Dry run: ${DRY_RUN}`);
    log('═══════════════════════════════════════════════════════════');

    // Get chain height
    const { rows: [{ max_height }] } = await readPool.query(
      `SELECT MAX(block_height) as max_height FROM transactions`
    );
    log(`Chain tip: block ${max_height}`);

    const uf = new UnionFind();
    let txsProcessed = 0;
    let mergeOps = 0;
    const startTime = Date.now();

    // Process in batches by block height
    for (let startHeight = 0; startHeight <= max_height; startHeight += BATCH_SIZE) {
      const endHeight = Math.min(startHeight + BATCH_SIZE - 1, max_height);

      // Get all (txid, address) pairs from multi-input transactions in this range
      const { rows } = await readPool.query(`
        SELECT i.txid, array_agg(DISTINCT i.address) as addresses
        FROM transaction_inputs i
        JOIN transactions t ON t.txid = i.txid
        WHERE t.block_height BETWEEN $1 AND $2
          AND i.address IS NOT NULL
        GROUP BY i.txid
        HAVING COUNT(DISTINCT i.address) >= 2
      `, [startHeight, endHeight]);

      for (const row of rows) {
        const addrs = row.addresses;
        // Merge all addresses in this tx into one cluster
        for (let i = 1; i < addrs.length; i++) {
          uf.union(addrs[0], addrs[i]);
          mergeOps++;
        }
        txsProcessed++;
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const pct = ((endHeight / max_height) * 100).toFixed(1);
      if ((startHeight / BATCH_SIZE) % 10 === 0 || endHeight >= max_height) {
        log(`  ${pct}% | blocks ${startHeight}-${endHeight} | ${txsProcessed} txs | ${uf.size()} addresses | ${elapsed}s`);
      }
    }

    log(`\nScan complete: ${txsProcessed} multi-input txs, ${mergeOps} merge ops, ${uf.size()} unique addresses`);

    // Build cluster map: address -> cluster_id (use numeric IDs)
    const clusterRoots = new Map(); // root address -> numeric ID
    let nextClusterId = 1;
    const clusterMembers = new Map(); // cluster_id -> count

    const addressEntries = []; // [address, cluster_id]

    for (const addr of uf.parent.keys()) {
      const root = uf.find(addr);
      if (!clusterRoots.has(root)) {
        clusterRoots.set(root, nextClusterId++);
        clusterMembers.set(clusterRoots.get(root), 0);
      }
      const cid = clusterRoots.get(root);
      clusterMembers.set(cid, clusterMembers.get(cid) + 1);
      addressEntries.push([addr, cid]);
    }

    const totalClusters = clusterRoots.size;
    let multiAddrClusters = 0;
    let largestCluster = 0;
    for (const count of clusterMembers.values()) {
      if (count >= 2) multiAddrClusters++;
      if (count > largestCluster) largestCluster = count;
    }

    log(`Clusters: ${totalClusters} total, ${multiAddrClusters} with 2+ addresses`);
    log(`Largest cluster: ${largestCluster} addresses`);
    log(`Singleton addresses (only seen with themselves): ${totalClusters - multiAddrClusters}`);

    if (DRY_RUN) {
      log('\n[DRY RUN] Skipping database write.');
      await pool.end();
      if (readPool !== pool) await readPool.end();
      return;
    }

    // Write to database
    log('\nWriting clusters to database...');

    await client.query('TRUNCATE address_clusters');
    await client.query('TRUNCATE address_cluster_meta');

    // Batch insert address_clusters (5000 rows at a time)
    const INSERT_BATCH = 5000;
    for (let i = 0; i < addressEntries.length; i += INSERT_BATCH) {
      const batch = addressEntries.slice(i, i + INSERT_BATCH);
      const values = [];
      const params = [];
      for (let j = 0; j < batch.length; j++) {
        const offset = j * 2;
        values.push(`($${offset + 1}, $${offset + 2})`);
        params.push(batch[j][0], batch[j][1]);
      }
      await client.query(
        `INSERT INTO address_clusters (address, cluster_id) VALUES ${values.join(',')}
         ON CONFLICT (address) DO UPDATE SET cluster_id = EXCLUDED.cluster_id, updated_at = NOW()`,
        params
      );
      if (i % 50000 === 0) {
        log(`  Written ${i + batch.length}/${addressEntries.length} addresses`);
      }
    }

    // Write cluster metadata (only clusters with 2+ members)
    const metaEntries = [...clusterMembers.entries()].filter(([, count]) => count >= 2);
    for (let i = 0; i < metaEntries.length; i += INSERT_BATCH) {
      const batch = metaEntries.slice(i, i + INSERT_BATCH);
      const values = [];
      const params = [];
      for (let j = 0; j < batch.length; j++) {
        const offset = j * 2;
        values.push(`($${offset + 1}, $${offset + 2})`);
        params.push(batch[j][0], batch[j][1]);
      }
      await client.query(
        `INSERT INTO address_cluster_meta (cluster_id, member_count) VALUES ${values.join(',')}
         ON CONFLICT (cluster_id) DO UPDATE SET member_count = EXCLUDED.member_count, updated_at = NOW()`,
        params
      );
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`\nDone! ${addressEntries.length} addresses in ${totalClusters} clusters written in ${elapsed}s`);
    log(`Multi-address clusters: ${multiAddrClusters} (largest: ${largestCluster})`);
  });

  await pool.end();
  if (readPool !== pool) await readPool.end();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
