'use strict';

/**
 * CipherScan Data Bot — Database Queries
 *
 * All read-only queries against the shared PostgreSQL database.
 * Each function takes a `pool` (pg.Pool) and returns structured data.
 */

// ─── Chain state ─────────────────────────────────────────────────────────────

async function getChainTip(pool) {
  const { rows } = await pool.query(
    'SELECT height, hash, timestamp FROM blocks ORDER BY height DESC LIMIT 1'
  );
  return rows[0] || null;
}

async function getAvgBlockTime1000(pool) {
  const { rows } = await pool.query(`
    SELECT
      (MAX(timestamp) - MIN(timestamp))::FLOAT / (COUNT(*) - 1) AS avg_seconds
    FROM (SELECT timestamp FROM blocks ORDER BY height DESC LIMIT 1000) sub
  `);
  return rows[0]?.avg_seconds ?? null;
}

// ─── Pool state ──────────────────────────────────────────────────────────────

async function getPoolBalances(pool) {
  const { rows } = await pool.query(`
    SELECT
      sprout_zat, sapling_zat, orchard_zat, ironwood_zat, transparent_zat
    FROM boundary_pool_snapshots
    ORDER BY boundary_height DESC
    LIMIT 1
  `);
  if (!rows[0]) return {};
  const r = rows[0];
  return {
    sprout: Number(r.sprout_zat),
    sapling: Number(r.sapling_zat),
    orchard: Number(r.orchard_zat),
    ironwood: Number(r.ironwood_zat),
    transparent: Number(r.transparent_zat),
  };
}

async function getShieldedSupplyShare(pool) {
  const { rows } = await pool.query(`
    SELECT ironwood_zat, orchard_zat, sapling_zat, sprout_zat
    FROM boundary_pool_snapshots
    ORDER BY boundary_height DESC LIMIT 1
  `);
  if (!rows[0]) return { totalZat: 0 };
  const p = rows[0];
  const totalZat = Number(p.ironwood_zat) + Number(p.orchard_zat) + Number(p.sapling_zat) + Number(p.sprout_zat);
  return { totalZat };
}

// ─── Shielded flows (migration-neutral SVR) ──────────────────────────────────

async function get24hFlows(pool) {
  const { rows } = await pool.query(`
    SELECT
      COALESCE(SUM(CASE WHEN flow_type = 'shield' THEN amount_zat ELSE 0 END), 0) AS shielded_zat,
      COALESCE(SUM(CASE WHEN flow_type = 'deshield' THEN amount_zat ELSE 0 END), 0) AS deshielded_zat,
      COALESCE(SUM(CASE WHEN flow_type = 'shield' AND pool = 'ironwood' THEN amount_zat ELSE 0 END), 0) AS ironwood_inflow_zat,
      COALESCE(SUM(CASE WHEN flow_type = 'deshield' AND pool = 'orchard' THEN amount_zat ELSE 0 END), 0) AS orchard_outflow_zat
    FROM shielded_flows
    WHERE block_time >= EXTRACT(EPOCH FROM (NOW() - INTERVAL '24 hours'))
      AND flow_type IN ('shield', 'deshield')
  `);
  const r = rows[0];
  const shielded = Number(r.shielded_zat);
  const deshielded = Number(r.deshielded_zat);
  const iwInflow = Number(r.ironwood_inflow_zat);
  const orcOutflow = Number(r.orchard_outflow_zat);

  const migrationComponent = Math.min(iwInflow, orcOutflow);
  const netShielded = shielded - migrationComponent;
  const netDeshielded = deshielded - migrationComponent;

  return { shielded, deshielded, netShielded, netDeshielded, migrationComponent };
}

// ─── Ironwood migration data ─────────────────────────────────────────────────

async function getIronwoodStats(pool) {
  const { rows } = await pool.query(`
    SELECT ironwood_pool_size, orchard_pool_size, sapling_pool_size, sprout_pool_size
    FROM privacy_stats ORDER BY updated_at DESC LIMIT 1
  `);

  const p = rows[0];
  const ironwoodZat = Number(p?.ironwood_pool_size ?? 0);
  const orchardZat = Number(p?.orchard_pool_size ?? 0);
  const orchardPlusIronwood = ironwoodZat + orchardZat;

  return {
    poolSizeZat: ironwoodZat,
    orchardBalanceZat: orchardZat,
    orchardToIronwoodPct: orchardPlusIronwood > 0 ? (ironwoodZat / orchardPlusIronwood * 100) : 0,
  };
}

async function getZip318Compliance(pool) {
  const { rows } = await pool.query(`
    WITH recent_migrations AS (
      SELECT
        t.ironwood_actions,
        t.orchard_actions,
        t.orchard_anchor,
        t.value_balance_ironwood
      FROM transactions t
      WHERE t.version = 6
        AND t.has_ironwood = true
        AND t.value_balance_orchard > 0
        AND t.value_balance_ironwood < 0
        AND t.block_time >= EXTRACT(EPOCH FROM (NOW() - INTERVAL '24 hours'))
    )
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE
        ironwood_actions = 1
        AND orchard_actions = 2
        AND orchard_anchor IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM blocks b
          WHERE b.final_orchard_root = rm.orchard_anchor
            AND b.height % 144 = 0
        )
      ) AS compliant
    FROM recent_migrations rm
  `);
  const total = Number(rows[0].total);
  const compliant = Number(rows[0].compliant);
  return { total, compliant, pct: total > 0 ? (compliant / total * 100) : 0 };
}

// ─── Large flow detection ────────────────────────────────────────────────────

async function getLargeFlows(pool, { minZat, since }) {
  const { rows } = await pool.query(`
    SELECT
      sf.txid,
      sf.amount_zat,
      sf.flow_type,
      sf.pool,
      sf.block_height,
      sf.block_time
    FROM shielded_flows sf
    WHERE sf.amount_zat >= $1
      AND sf.block_time >= $2
      AND sf.flow_type IN ('shield', 'deshield')
    ORDER BY sf.amount_zat DESC
    LIMIT 50
  `, [minZat, since]);
  return rows.map(r => ({
    txid: r.txid,
    amountZat: Number(r.amount_zat),
    direction: r.flow_type,
    pool: r.pool,
    blockHeight: Number(r.block_height),
    blockTime: Number(r.block_time),
  }));
}

async function getFlowPercentile(pool, { percentile, windowDays }) {
  const { rows } = await pool.query(`
    SELECT PERCENTILE_CONT($1) WITHIN GROUP (ORDER BY amount_zat) AS threshold
    FROM shielded_flows
    WHERE block_time >= EXTRACT(EPOCH FROM (NOW() - ($2 || ' days')::INTERVAL))
      AND flow_type IN ('shield', 'deshield')
  `, [percentile, windowDays]);
  return Math.floor(Number(rows[0]?.threshold ?? 0));
}

// ─── Fork/reorg events ───────────────────────────────────────────────────────

async function getRecentReorgs(pool, { since, minDepth }) {
  const { rows } = await pool.query(`
    SELECT
      fe.id,
      fe.depth,
      fe.detected_at,
      fe.fork_height,
      fe.canonical_tip,
      fe.description
    FROM fork_events fe
    WHERE fe.detected_at >= $1
      AND fe.depth >= $2
    ORDER BY fe.detected_at DESC
  `, [since, minDepth]);
  return rows;
}

// ─── Mining ──────────────────────────────────────────────────────────────────

async function getMiningSnapshot(pool) {
  const { rows } = await pool.query(`
    SELECT
      pool_name,
      blocks_mined,
      ROUND(blocks_mined::NUMERIC * 100.0 / NULLIF(SUM(blocks_mined) OVER (), 0), 1) AS pct_share
    FROM mining_behavior_daily
    WHERE date = (SELECT MAX(date) FROM mining_behavior_daily)
    ORDER BY blocks_mined DESC
    LIMIT 10
  `);
  return rows;
}

// ─── Cross-chain ─────────────────────────────────────────────────────────────

async function getCrossChain24h(pool) {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*) AS swap_count,
      COALESCE(SUM(CASE WHEN direction = 'inflow' THEN source_amount_usd ELSE 0 END), 0) AS inflow_usd,
      COALESCE(SUM(CASE WHEN direction = 'outflow' THEN dest_amount_usd ELSE 0 END), 0) AS outflow_usd
    FROM cross_chain_swaps
    WHERE swap_created_at >= NOW() - INTERVAL '24 hours'
      AND status = 'SUCCESS'
  `);
  return {
    swapCount: Number(rows[0].swap_count),
    inflowUsd: Number(rows[0].inflow_usd),
    outflowUsd: Number(rows[0].outflow_usd),
  };
}

// ─── Cross-chain whale swaps ──────────────────────────────────────────────

async function getRecentLargeSwaps(pool, { minUsd, since }) {
  const { rows } = await pool.query(`
    SELECT
      id,
      direction,
      source_chain,
      dest_chain,
      source_amount_usd,
      dest_amount_usd,
      zec_txid,
      swap_created_at
    FROM cross_chain_swaps
    WHERE swap_created_at >= $2
      AND GREATEST(COALESCE(source_amount_usd, 0), COALESCE(dest_amount_usd, 0)) >= $1
      AND status = 'completed'
    ORDER BY GREATEST(COALESCE(source_amount_usd, 0), COALESCE(dest_amount_usd, 0)) DESC
    LIMIT 20
  `, [minUsd, since]);
  return rows.map(r => ({
    id: r.id,
    direction: r.direction,
    sourceChain: r.source_chain,
    destChain: r.dest_chain,
    amountUsd: Math.max(Number(r.source_amount_usd || 0), Number(r.dest_amount_usd || 0)),
    zecTxid: r.zec_txid,
    createdAt: r.swap_created_at,
  }));
}

// ─── Privacy risk aggregates ──────────────────────────────────────────────

async function getRecentHighRiskLinkages(pool, { since }) {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*) AS high_count,
      COALESCE(SUM(src_amount_zat), 0) AS total_amount_zat
    FROM privacy_linkage_edges
    WHERE warning_level = 'HIGH'
      AND detected_at >= $1
  `, [since]);
  return {
    highCount: Number(rows[0].high_count),
    totalAmountZat: Number(rows[0].total_amount_zat),
  };
}

async function getRecentBatchClusters(pool, { since }) {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*) AS cluster_count,
      COALESCE(SUM(member_count), 0) AS total_members,
      COALESCE(SUM(total_amount_zat), 0) AS total_amount_zat
    FROM privacy_batch_clusters
    WHERE detected_at >= $1
      AND warning_level IN ('HIGH', 'MEDIUM')
  `, [since]);
  return {
    clusterCount: Number(rows[0].cluster_count),
    totalMembers: Number(rows[0].total_members),
    totalAmountZat: Number(rows[0].total_amount_zat),
  };
}

// ─── Outbox operations ───────────────────────────────────────────────────────

async function isDuplicate(pool, dedupKey) {
  const { rows } = await pool.query(
    `SELECT 1 FROM social_post_outbox WHERE dedup_key = $1 AND status IN ('posted', 'dry_run')`,
    [dedupKey]
  );
  return rows.length > 0;
}

async function insertOutboxEntry(pool, { postType, dedupKey, content, metadata, status }) {
  const { rows } = await pool.query(`
    INSERT INTO social_post_outbox (post_type, dedup_key, content, metadata, status)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (dedup_key) DO NOTHING
    RETURNING id
  `, [postType, dedupKey, content, JSON.stringify(metadata || {}), status || 'pending']);
  return rows[0]?.id ?? null;
}

async function markPosted(pool, id, xPostId) {
  await pool.query(`
    UPDATE social_post_outbox
    SET status = 'posted', x_post_id = $2, posted_at = NOW(), attempts = attempts + 1, updated_at = NOW()
    WHERE id = $1
  `, [id, xPostId]);
}

async function markFailed(pool, id, errorMessage) {
  await pool.query(`
    UPDATE social_post_outbox
    SET status = 'failed', error_message = $2, attempts = attempts + 1, updated_at = NOW()
    WHERE id = $1
  `, [id, errorMessage]);
}

// ─── Pool migration alerts ───────────────────────────────────────────────────

async function getLargeMigrations(pool, { minZat, since }) {
  const { rows } = await pool.query(`
    SELECT t.txid, t.block_height, t.block_time,
           t.value_balance_orchard, t.value_balance_ironwood,
           ABS(t.value_balance_ironwood) as amount_zat
    FROM transactions t
    WHERE t.block_time >= $1
      AND t.vin_count = 0
      AND t.vout_count = 0
      AND t.value_balance_orchard > 0
      AND t.value_balance_ironwood < 0
      AND ABS(t.value_balance_ironwood) >= $2
    ORDER BY ABS(t.value_balance_ironwood) DESC
    LIMIT 20
  `, [since, minZat]);
  return rows.map(r => ({
    txid: r.txid,
    blockHeight: Number(r.block_height),
    blockTime: Number(r.block_time),
    amountZat: Math.abs(Number(r.value_balance_ironwood)),
    fromPool: 'orchard',
    toPool: 'ironwood',
  }));
}

module.exports = {
  getChainTip,
  getAvgBlockTime1000,
  getPoolBalances,
  getShieldedSupplyShare,
  get24hFlows,
  getIronwoodStats,
  getZip318Compliance,
  getLargeFlows,
  getFlowPercentile,
  getLargeMigrations,
  getRecentReorgs,
  getMiningSnapshot,
  getCrossChain24h,
  getRecentLargeSwaps,
  getRecentHighRiskLinkages,
  getRecentBatchClusters,
  isDuplicate,
  insertOutboxEntry,
  markPosted,
  markFailed,
};
