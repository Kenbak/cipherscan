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
    SELECT pool, balance_zat
    FROM boundary_pool_snapshots
    ORDER BY snapshot_height DESC
    LIMIT 10
  `);
  const balances = {};
  for (const r of rows) {
    if (!balances[r.pool]) balances[r.pool] = Number(r.balance_zat);
  }
  return balances;
}

async function getShieldedSupplyShare(pool) {
  const { rows } = await pool.query(`
    SELECT
      shielded_supply_zat,
      total_supply_zat,
      CASE WHEN total_supply_zat > 0
        THEN (shielded_supply_zat::FLOAT / total_supply_zat * 100)
        ELSE 0
      END AS shielded_pct
    FROM privacy_stats
    ORDER BY updated_at DESC LIMIT 1
  `);
  return rows[0] || null;
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
    SELECT
      COUNT(*) AS total_migrations,
      COALESCE(SUM(amount_zat), 0) AS total_volume_zat,
      COUNT(*) FILTER (WHERE block_time >= EXTRACT(EPOCH FROM (NOW() - INTERVAL '24 hours'))) AS migrations_24h,
      COALESCE(SUM(amount_zat) FILTER (WHERE block_time >= EXTRACT(EPOCH FROM (NOW() - INTERVAL '24 hours'))), 0) AS volume_24h_zat
    FROM shielded_flows
    WHERE pool = 'ironwood' AND flow_type = 'shield'
  `);
  return {
    totalMigrations: Number(rows[0].total_migrations),
    totalVolumeZat: Number(rows[0].total_volume_zat),
    migrations24h: Number(rows[0].migrations_24h),
    volume24hZat: Number(rows[0].volume_24h_zat),
  };
}

async function getZip318Compliance(pool) {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE
        ironwood_actions = 1 AND orchard_actions = 2
        AND anchor_compliant = true
        AND matched_denomination IS NOT NULL
      ) AS compliant
    FROM transactions t
    WHERE t.is_migration = true
      AND t.block_time >= EXTRACT(EPOCH FROM (NOW() - INTERVAL '24 hours'))
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
  return Number(rows[0]?.threshold ?? 0);
}

// ─── Fork/reorg events ───────────────────────────────────────────────────────

async function getRecentReorgs(pool, { since, minDepth }) {
  const { rows } = await pool.query(`
    SELECT
      fe.id,
      fe.depth,
      fe.detected_at,
      fe.old_tip_hash,
      fe.new_tip_hash,
      fe.old_tip_height,
      fe.new_tip_height
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
    SELECT pool_name, blocks_mined, pct_share
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
      COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_zat ELSE 0 END), 0) AS inflow_zat,
      COALESCE(SUM(CASE WHEN direction = 'out' THEN amount_zat ELSE 0 END), 0) AS outflow_zat
    FROM cross_chain_swaps
    WHERE completed_at >= NOW() - INTERVAL '24 hours'
      AND status = 'SUCCESS'
  `);
  return {
    swapCount: Number(rows[0].swap_count),
    inflowZat: Number(rows[0].inflow_zat),
    outflowZat: Number(rows[0].outflow_zat),
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
  getRecentReorgs,
  getMiningSnapshot,
  getCrossChain24h,
  isDuplicate,
  insertOutboxEntry,
  markPosted,
  markFailed,
};
