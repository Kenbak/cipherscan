/**
 * Stats Queries Module
 * Handles complex statistical queries for the Zcash Explorer API
 */

/**
 * Get shielded transaction count since a specific date
 * @param {Object} pool - PostgreSQL pool
 * @param {string} since - ISO date string (e.g., "2024-01-01")
 * @param {Object} options - Optional filters
 * @returns {Object} Shielded transaction statistics
 */
async function getShieldedCountSince(pool, since, options = {}) {
  const sinceDate = new Date(since);

  if (isNaN(sinceDate.getTime())) {
    throw new Error('Invalid date format. Use ISO format: YYYY-MM-DD');
  }

  // Convert to Unix timestamp (seconds)
  const sinceTimestamp = Math.floor(sinceDate.getTime() / 1000);

  // Main query: count shielded transactions with breakdown
  const query = `
    WITH shielded_txs AS (
      SELECT
        txid,
        block_time,
        has_sapling,
        has_orchard,
        COALESCE(shielded_spends, 0) as shielded_spends,
        COALESCE(shielded_outputs, 0) as shielded_outputs,
        COALESCE(orchard_actions, 0) as orchard_actions,
        -- Determine if fully shielded (no transparent inputs/outputs)
        CASE
          WHEN (COALESCE(shielded_spends, 0) > 0 OR COALESCE(orchard_actions, 0) > 0)
           AND (COALESCE(shielded_outputs, 0) > 0 OR COALESCE(orchard_actions, 0) > 0)
           AND NOT EXISTS (
             SELECT 1 FROM transaction_outputs o WHERE o.txid = t.txid
           )
           AND NOT EXISTS (
             SELECT 1 FROM transaction_inputs i WHERE i.txid = t.txid
           )
          THEN true
          ELSE false
        END as is_fully_shielded
      FROM transactions t
      WHERE block_time >= $1
        AND (
          has_sapling = true
          OR has_orchard = true
          OR COALESCE(shielded_spends, 0) > 0
          OR COALESCE(shielded_outputs, 0) > 0
          OR COALESCE(orchard_actions, 0) > 0
        )
    )
    SELECT
      COUNT(*) as total_shielded,
      COUNT(*) FILTER (WHERE has_sapling = true AND has_orchard = false) as sapling_only,
      COUNT(*) FILTER (WHERE has_orchard = true AND has_sapling = false) as orchard_only,
      COUNT(*) FILTER (WHERE has_sapling = true AND has_orchard = true) as both_pools,
      COUNT(*) FILTER (WHERE is_fully_shielded = true) as fully_shielded,
      MIN(block_time) as first_tx_time,
      MAX(block_time) as last_tx_time
    FROM shielded_txs
  `;

  const result = await pool.query(query, [sinceTimestamp]);
  const row = result.rows[0];

  return {
    since: since,
    queriedAt: new Date().toISOString(),
    totalShielded: parseInt(row.total_shielded) || 0,
    breakdown: {
      saplingOnly: parseInt(row.sapling_only) || 0,
      orchardOnly: parseInt(row.orchard_only) || 0,
      bothPools: parseInt(row.both_pools) || 0,
    },
    fullyShielded: parseInt(row.fully_shielded) || 0,
    partiallyShielded: (parseInt(row.total_shielded) || 0) - (parseInt(row.fully_shielded) || 0),
    timeRange: {
      firstTx: row.first_tx_time ? new Date(row.first_tx_time * 1000).toISOString() : null,
      lastTx: row.last_tx_time ? new Date(row.last_tx_time * 1000).toISOString() : null,
    }
  };
}

/**
 * Get shielded transaction count - simplified version (faster)
 * @param {Object} pool - PostgreSQL pool
 * @param {string} since - ISO date string
 * @returns {Object} Basic count
 */
async function getShieldedCountSimple(pool, since) {
  const sinceDate = new Date(since);

  if (isNaN(sinceDate.getTime())) {
    throw new Error('Invalid date format. Use ISO format: YYYY-MM-DD');
  }

  // Convert to Unix timestamp (seconds)
  const sinceTimestamp = Math.floor(sinceDate.getTime() / 1000);

  const query = `
    SELECT COUNT(*) as total
    FROM transactions
    WHERE block_time >= $1
      AND (
        has_sapling = true
        OR has_orchard = true
        OR COALESCE(shielded_spends, 0) > 0
        OR COALESCE(shielded_outputs, 0) > 0
        OR COALESCE(orchard_actions, 0) > 0
      )
  `;

  const result = await pool.query(query, [sinceTimestamp]);

  return {
    since: since,
    totalShielded: parseInt(result.rows[0].total) || 0,
  };
}

/**
 * Get daily shielded transaction counts for a date range
 * @param {Object} pool - PostgreSQL pool
 * @param {string} since - Start date (ISO format)
 * @param {string} until - End date (ISO format, optional - defaults to now)
 * @returns {Array} Daily counts
 */
async function getShieldedCountDaily(pool, since, until = null) {
  const sinceDate = new Date(since);
  const untilDate = until ? new Date(until) : new Date();

  if (isNaN(sinceDate.getTime())) {
    throw new Error('Invalid start date format. Use ISO format: YYYY-MM-DD');
  }

  // Convert to Unix timestamps (seconds)
  const sinceTimestamp = Math.floor(sinceDate.getTime() / 1000);
  const untilTimestamp = Math.floor(untilDate.getTime() / 1000);

  const query = `
    SELECT
      DATE(TO_TIMESTAMP(block_time)) as date,
      COUNT(*) as count
    FROM transactions
    WHERE block_time >= $1
      AND block_time < $2
      AND (
        has_sapling = true
        OR has_orchard = true
        OR COALESCE(shielded_spends, 0) > 0
        OR COALESCE(shielded_outputs, 0) > 0
        OR COALESCE(orchard_actions, 0) > 0
      )
    GROUP BY DATE(TO_TIMESTAMP(block_time))
    ORDER BY date ASC
  `;

  const result = await pool.query(query, [sinceTimestamp, untilTimestamp]);

  return {
    since: since,
    until: untilDate.toISOString().split('T')[0],
    totalDays: result.rows.length,
    totalShielded: result.rows.reduce((sum, r) => sum + parseInt(r.count), 0),
    daily: result.rows.map(r => ({
      date: r.date.toISOString().split('T')[0],
      count: parseInt(r.count),
    })),
  };
}

module.exports = {
  getShieldedCountSince,
  getShieldedCountSimple,
  getShieldedCountDaily,
};
