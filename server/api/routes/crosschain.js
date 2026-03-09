/**
 * Cross-chain Routes (NEAR Intents)
 * /api/crosschain/*
 */

const express = require('express');
const router = express.Router();
const { getNearIntentsClient, CHAIN_CONFIG } = require('../near-intents');
const { validate } = require('../validation');

/**
 * GET /api/crosschain/stats
 * Get cross-chain ZEC swap statistics via NEAR Intents
 */
router.get('/api/crosschain/stats', async (req, res) => {
  try {
    const client = getNearIntentsClient();

    // Check if API key is configured
    if (!client.hasApiKey()) {
      return res.status(503).json({
        success: false,
        error: 'NEAR Intents API key not configured',
        message: 'Set NEAR_INTENTS_API_KEY environment variable',
        docsUrl: 'https://docs.near-intents.org/near-intents/integration/distribution-channels/intents-explorer-api',
      });
    }

    console.log('🌉 [CROSSCHAIN] Fetching cross-chain stats...');

    const stats = await client.getCrossChainStats();

    res.json({
      success: true,
      ...stats,
      chainConfig: CHAIN_CONFIG,
    });
  } catch (error) {
    console.error('❌ [CROSSCHAIN] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch cross-chain stats',
    });
  }
});

/**
 * GET /api/crosschain/inflows
 * Get recent ZEC inflows (other chains → ZEC)
 */
router.get('/api/crosschain/inflows', async (req, res) => {
  try {
    const client = getNearIntentsClient();

    if (!client.hasApiKey()) {
      return res.status(503).json({
        success: false,
        error: 'NEAR Intents API key not configured',
      });
    }

    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const page = parseInt(req.query.page) || 1;

    const data = await client.getZecInflows({ limit, page });

    res.json({
      success: true,
      ...data,
    });
  } catch (error) {
    console.error('❌ [CROSSCHAIN] Inflows error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/crosschain/outflows
 * Get recent ZEC outflows (ZEC → other chains)
 */
router.get('/api/crosschain/outflows', async (req, res) => {
  try {
    const client = getNearIntentsClient();

    if (!client.hasApiKey()) {
      return res.status(503).json({
        success: false,
        error: 'NEAR Intents API key not configured',
      });
    }

    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const page = parseInt(req.query.page) || 1;

    const data = await client.getZecOutflows({ limit, page });

    res.json({
      success: true,
      ...data,
    });
  } catch (error) {
    console.error('❌ [CROSSCHAIN] Outflows error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/crosschain/status
 * Check if NEAR Intents integration is configured
 */
router.get('/api/crosschain/status', async (req, res) => {
  const client = getNearIntentsClient();

  res.json({
    success: true,
    configured: client.hasApiKey(),
    message: client.hasApiKey()
      ? 'NEAR Intents API configured'
      : 'NEAR Intents API key not set. Cross-chain features disabled.',
    docsUrl: 'https://docs.near-intents.org/near-intents/integration/distribution-channels/intents-explorer-api',
  });
});

// ============================================================================
// Historical endpoints (from PostgreSQL cross_chain_swaps table)
// ============================================================================

/**
 * GET /api/crosschain/db-stats
 * Cross-chain stats entirely from PostgreSQL (cross_chain_swaps table).
 * Returns the same shape as /api/crosschain/stats for frontend compatibility.
 */
router.get('/api/crosschain/db-stats', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    if (!pool) {
      return res.status(503).json({
        success: false,
        error: 'Database pool not available',
      });
    }

    const twentyFourHoursAgo = "NOW() - INTERVAL '24 hours'";

    // Run all queries in parallel
    const [
      stats24hResult,
      statsAllTimeResult,
      inflowsByChainTokenResult,
      outflowsByChainTokenResult,
      recentSwapsResult,
      latencyResult,
    ] = await Promise.all([
      // 1. 24h volume and swap count
      pool.query(`
        SELECT
          COUNT(*)::int as swap_count,
          COALESCE(SUM(source_amount_usd), 0)::float as volume_usd
        FROM cross_chain_swaps
        WHERE status = 'SUCCESS'
          AND swap_created_at >= ${twentyFourHoursAgo}
      `),
      // 2. All-time totals
      pool.query(`
        SELECT
          COUNT(*)::int as swap_count,
          COALESCE(SUM(source_amount_usd), 0)::float as volume_usd
        FROM cross_chain_swaps
        WHERE status = 'SUCCESS'
      `),
      // 3. Inflows grouped by source_chain with token breakdown (24h)
      pool.query(`
        SELECT
          source_chain as chain,
          source_token as token,
          COALESCE(SUM(source_amount_usd), 0)::float as volume_usd
        FROM cross_chain_swaps
        WHERE status = 'SUCCESS'
          AND direction = 'inflow'
          AND swap_created_at >= ${twentyFourHoursAgo}
          AND source_chain IS NOT NULL
          AND source_chain != 'zec'
        GROUP BY source_chain, source_token
        ORDER BY source_chain, volume_usd DESC
      `),
      // 4. Outflows grouped by dest_chain with token breakdown (24h)
      pool.query(`
        SELECT
          dest_chain as chain,
          dest_token as token,
          COALESCE(SUM(dest_amount_usd), 0)::float as volume_usd
        FROM cross_chain_swaps
        WHERE status = 'SUCCESS'
          AND direction = 'outflow'
          AND swap_created_at >= ${twentyFourHoursAgo}
          AND dest_chain IS NOT NULL
          AND dest_chain != 'zec'
        GROUP BY dest_chain, dest_token
        ORDER BY dest_chain, volume_usd DESC
      `),
      // 5. Recent 20 swaps
      pool.query(`
        SELECT
          deposit_address, direction, source_chain, source_token, source_amount, source_amount_usd,
          dest_chain, dest_token, dest_amount, dest_amount_usd,
          zec_txid, source_tx_hashes, dest_tx_hashes, status, swap_created_at
        FROM cross_chain_swaps
        WHERE status = 'SUCCESS'
        ORDER BY swap_created_at DESC
        LIMIT 20
      `),
      // 6. Latency by chain — join with transactions table for ZEC block_time
      pool.query(`
        SELECT
          CASE WHEN ccs.direction = 'inflow' THEN ccs.source_chain ELSE ccs.dest_chain END as chain,
          COUNT(*)::int as swap_count,
          AVG((t.block_time - EXTRACT(EPOCH FROM ccs.swap_created_at)) / 60.0)::float as avg_minutes,
          PERCENTILE_CONT(0.5) WITHIN GROUP (
            ORDER BY (t.block_time - EXTRACT(EPOCH FROM ccs.swap_created_at)) / 60.0
          )::float as median_minutes
        FROM cross_chain_swaps ccs
        JOIN transactions t ON t.txid = ccs.zec_txid
        WHERE ccs.status = 'SUCCESS'
          AND ccs.matched = true
          AND ccs.zec_txid IS NOT NULL
          AND ((ccs.direction = 'inflow' AND ccs.source_chain != 'zec') OR (ccs.direction = 'outflow' AND ccs.dest_chain != 'zec'))
          AND (t.block_time - EXTRACT(EPOCH FROM ccs.swap_created_at)) > 0
          AND (t.block_time - EXTRACT(EPOCH FROM ccs.swap_created_at)) < 86400
        GROUP BY CASE WHEN ccs.direction = 'inflow' THEN ccs.source_chain ELSE ccs.dest_chain END
        ORDER BY swap_count DESC
      `),
    ]);

    const totalVolume24h = parseFloat(stats24hResult.rows[0]?.volume_usd || 0);
    const totalSwaps24h = parseInt(stats24hResult.rows[0]?.swap_count || 0);
    const totalSwapsAllTime = parseInt(statsAllTimeResult.rows[0]?.swap_count || 0);
    const totalVolumeAllTime = parseFloat(statsAllTimeResult.rows[0]?.volume_usd || 0);

    // Build inflows: { chain, chainName, totalVolume24h, tokens: [{ symbol, volume24h }] }
    const inflowsByChain = {};
    for (const r of inflowsByChainTokenResult.rows) {
      const chain = r.chain?.toLowerCase() || 'unknown';
      if (!inflowsByChain[chain]) {
        const config = CHAIN_CONFIG[chain] || { name: chain, color: '#888' };
        inflowsByChain[chain] = {
          chain,
          chainName: config.name || chain,
          totalVolume24h: 0,
          tokens: [],
        };
      }
      inflowsByChain[chain].totalVolume24h += parseFloat(r.volume_usd || 0);
      inflowsByChain[chain].tokens.push({
        symbol: r.token || 'UNKNOWN',
        volume24h: parseFloat(r.volume_usd || 0),
      });
    }
    const inflows = Object.values(inflowsByChain)
      .sort((a, b) => b.totalVolume24h - a.totalVolume24h)
      .map((c) => ({
        ...c,
        totalVolume24h: parseFloat(c.totalVolume24h.toFixed(2)),
        volumeUsd: parseFloat(c.totalVolume24h.toFixed(2)), // alias for frontend compatibility
      }));

    // Build outflows: same shape
    const outflowsByChain = {};
    for (const r of outflowsByChainTokenResult.rows) {
      const chain = r.chain?.toLowerCase() || 'unknown';
      if (!outflowsByChain[chain]) {
        const config = CHAIN_CONFIG[chain] || { name: chain, color: '#888' };
        outflowsByChain[chain] = {
          chain,
          chainName: config.name || chain,
          totalVolume24h: 0,
          tokens: [],
        };
      }
      outflowsByChain[chain].totalVolume24h += parseFloat(r.volume_usd || 0);
      outflowsByChain[chain].tokens.push({
        symbol: r.token || 'UNKNOWN',
        volume24h: parseFloat(r.volume_usd || 0),
      });
    }
    const outflows = Object.values(outflowsByChain)
      .sort((a, b) => b.totalVolume24h - a.totalVolume24h)
      .map((c) => ({
        ...c,
        totalVolume24h: parseFloat(c.totalVolume24h.toFixed(2)),
        volumeUsd: parseFloat(c.totalVolume24h.toFixed(2)), // alias for frontend compatibility
      }));

    // Format recent swaps
    const recentSwaps = recentSwapsResult.rows.map((r) => {
      const isInflow = r.direction === 'inflow';
      const sourceTxHash = Array.isArray(r.source_tx_hashes) && r.source_tx_hashes.length > 0 ? r.source_tx_hashes[0] : null;
      const destTxHash = Array.isArray(r.dest_tx_hashes) && r.dest_tx_hashes.length > 0 ? r.dest_tx_hashes[0] : r.zec_txid;
      return {
        id: r.deposit_address,
        timestamp: new Date(r.swap_created_at).getTime(),
        direction: isInflow ? 'in' : 'out',
        fromChain: isInflow ? (r.source_chain || 'unknown') : 'zec',
        toChain: isInflow ? 'zec' : (r.dest_chain || 'unknown'),
        fromAmount: parseFloat(isInflow ? r.source_amount : r.source_amount) || 0,
        fromSymbol: isInflow ? (r.source_token || 'UNKNOWN') : 'ZEC',
        toAmount: parseFloat(isInflow ? r.dest_amount : r.dest_amount) || 0,
        toSymbol: isInflow ? 'ZEC' : (r.dest_token || 'UNKNOWN'),
        amountUsd: parseFloat(isInflow ? r.source_amount_usd : r.dest_amount_usd) || 0,
        status: r.status || 'SUCCESS',
        zecTxid: r.zec_txid || null,
        sourceTxHash: isInflow ? sourceTxHash : r.zec_txid,
        destTxHash: isInflow ? r.zec_txid : destTxHash,
      };
    });

    const latencyByChain = latencyResult.rows.map((r) => {
      const chain = r.chain?.toLowerCase() || 'unknown';
      const config = CHAIN_CONFIG[chain] || { name: chain };
      return {
        chain,
        chainName: config.name || chain,
        avgMinutes: parseFloat(parseFloat(r.avg_minutes || 0).toFixed(1)),
        medianMinutes: parseFloat(parseFloat(r.median_minutes || 0).toFixed(1)),
        swapCount: parseInt(r.swap_count || 0),
      };
    });

    res.json({
      success: true,
      totalVolume24h: parseFloat(totalVolume24h.toFixed(2)),
      totalSwaps24h,
      totalSwapsAllTime,
      totalVolumeAllTime: parseFloat(totalVolumeAllTime.toFixed(2)),
      inflows,
      outflows,
      recentSwaps,
      latencyByChain,
      chainConfig: CHAIN_CONFIG,
    });
  } catch (error) {
    console.error('❌ [CROSSCHAIN] db-stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch cross-chain stats from database',
    });
  }
});

/**
 * GET /api/crosschain/trends
 * Historical volume trends from stored swap data
 * ?period=7d|30d|90d  &granularity=daily|weekly
 */
router.get('/api/crosschain/trends', validate('crosschainTrends'), async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const period = req.query.period || '30d';
    const granularity = req.query.granularity || 'daily';

    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const trunc = granularity === 'weekly' ? 'week' : 'day';

    const { rows } = await pool.query(`
      SELECT
        DATE_TRUNC($1, swap_created_at) as period,
        direction,
        COUNT(*) as swap_count,
        COALESCE(SUM(source_amount_usd), 0) as volume_usd
      FROM cross_chain_swaps
      WHERE status = 'SUCCESS'
        AND swap_created_at >= NOW() - ($2 || ' days')::INTERVAL
      GROUP BY period, direction
      ORDER BY period
    `, [trunc, days]);

    // Pivot into { period, inflow_volume, outflow_volume, inflow_count, outflow_count }
    const byPeriod = {};
    for (const r of rows) {
      const key = r.period.toISOString().slice(0, 10);
      if (!byPeriod[key]) byPeriod[key] = { date: key, inflowVolume: 0, outflowVolume: 0, inflowCount: 0, outflowCount: 0 };
      if (r.direction === 'inflow') {
        byPeriod[key].inflowVolume = parseFloat(r.volume_usd);
        byPeriod[key].inflowCount = parseInt(r.swap_count);
      } else {
        byPeriod[key].outflowVolume = parseFloat(r.volume_usd);
        byPeriod[key].outflowCount = parseInt(r.swap_count);
      }
    }

    const data = Object.values(byPeriod).sort((a, b) => a.date.localeCompare(b.date));

    // Compute period-over-period change
    let volumeChange = 0;
    if (data.length >= 2) {
      const half = Math.floor(data.length / 2);
      const recentHalf = data.slice(half);
      const olderHalf = data.slice(0, half);
      const recentVol = recentHalf.reduce((s, d) => s + d.inflowVolume + d.outflowVolume, 0);
      const olderVol = olderHalf.reduce((s, d) => s + d.inflowVolume + d.outflowVolume, 0);
      volumeChange = olderVol > 0 ? ((recentVol - olderVol) / olderVol * 100) : 0;
    }

    res.json({ success: true, period, granularity, volumeChange: parseFloat(volumeChange.toFixed(1)), data });
  } catch (error) {
    console.error('Trends error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/crosschain/history
 * Paginated historical swap list from DB
 * ?page=1&limit=25&direction=inflow|outflow&chain=eth
 */
router.get('/api/crosschain/history', validate('crosschainHistory'), async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 25, 1), 100);
    const offset = (page - 1) * limit;
    const direction = req.query.direction;
    const chain = req.query.chain;

    const conditions = ["status = 'SUCCESS'"];
    const params = [];
    let idx = 1;

    if (direction) { conditions.push(`direction = $${idx++}`); params.push(direction); }
    if (chain) { conditions.push(`(source_chain = $${idx} OR dest_chain = $${idx})`); params.push(chain); idx++; }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(`SELECT COUNT(*) as total FROM cross_chain_swaps ${where}`, params);
    const total = parseInt(countResult.rows[0].total);

    params.push(limit, offset);
    const { rows } = await pool.query(`
      SELECT deposit_address, direction, source_chain, source_token, source_amount, source_amount_usd,
             dest_chain, dest_token, dest_amount, dest_amount_usd,
             zec_txid, matched, swap_created_at,
             source_tx_hashes, dest_tx_hashes
      FROM cross_chain_swaps ${where}
      ORDER BY swap_created_at DESC
      LIMIT $${idx++} OFFSET $${idx}
    `, params);

    res.json({
      success: true,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      swaps: rows.map(r => ({
        id: r.deposit_address,
        direction: r.direction,
        sourceChain: r.source_chain,
        sourceToken: r.source_token,
        sourceAmount: parseFloat(r.source_amount),
        sourceAmountUsd: parseFloat(r.source_amount_usd),
        destChain: r.dest_chain,
        destToken: r.dest_token,
        destAmount: parseFloat(r.dest_amount),
        destAmountUsd: parseFloat(r.dest_amount_usd),
        zecTxid: r.zec_txid,
        matched: r.matched,
        timestamp: new Date(r.swap_created_at).getTime(),
        sourceTxHashes: r.source_tx_hashes,
        destTxHashes: r.dest_tx_hashes,
      })),
    });
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/crosschain/volume-by-chain
 * Aggregated volume by chain for a given period
 * ?period=7d|30d
 */
router.get('/api/crosschain/volume-by-chain', validate('volumeByChain'), async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const days = req.query.period === '7d' ? 7 : 30;

    const { rows } = await pool.query(`
      SELECT
        CASE WHEN direction = 'inflow' THEN source_chain ELSE dest_chain END as chain,
        direction,
        COUNT(*) as swap_count,
        COALESCE(SUM(source_amount_usd), 0) as volume_usd,
        COALESCE(AVG(source_amount_usd), 0) as avg_size_usd
      FROM cross_chain_swaps
      WHERE status = 'SUCCESS'
        AND swap_created_at >= NOW() - ($1 || ' days')::INTERVAL
      GROUP BY chain, direction
      ORDER BY volume_usd DESC
    `, [days]);

    res.json({ success: true, period: `${days}d`, chains: rows.map(r => ({
      chain: r.chain,
      direction: r.direction,
      swapCount: parseInt(r.swap_count),
      volumeUsd: parseFloat(parseFloat(r.volume_usd).toFixed(2)),
      avgSizeUsd: parseFloat(parseFloat(r.avg_size_usd).toFixed(2)),
    }))});
  } catch (error) {
    console.error('Volume by chain error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/crosschain/address/:address
 * Cross-chain activity for a specific ZEC address
 */
router.get('/api/crosschain/address/:address', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { address } = req.params;

    const { rows } = await pool.query(`
      SELECT deposit_address, direction, source_chain, source_token, source_amount, source_amount_usd,
             dest_chain, dest_token, dest_amount, dest_amount_usd,
             zec_txid, swap_created_at, source_tx_hashes, dest_tx_hashes
      FROM cross_chain_swaps
      WHERE zec_address = $1 AND status = 'SUCCESS' AND matched = true
      ORDER BY swap_created_at DESC
      LIMIT 50
    `, [address]);

    const totalVolumeUsd = rows.reduce((s, r) => s + (parseFloat(r.source_amount_usd) || 0), 0);
    const entryCount = rows.filter(r => r.direction === 'inflow').length;
    const exitCount = rows.filter(r => r.direction === 'outflow').length;

    res.json({
      success: true,
      address,
      totalSwaps: rows.length,
      totalVolumeUsd: parseFloat(totalVolumeUsd.toFixed(2)),
      entryCount,
      exitCount,
      swaps: rows.map(r => ({
        id: r.deposit_address,
        direction: r.direction,
        sourceChain: r.source_chain,
        sourceToken: r.source_token,
        sourceAmount: parseFloat(r.source_amount),
        sourceAmountUsd: parseFloat(r.source_amount_usd),
        destChain: r.dest_chain,
        destToken: r.dest_token,
        destAmount: parseFloat(r.dest_amount),
        destAmountUsd: parseFloat(r.dest_amount_usd),
        zecTxid: r.zec_txid,
        timestamp: new Date(r.swap_created_at).getTime(),
      })),
    });
  } catch (error) {
    console.error('Address crosschain error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/crosschain/popular-pairs
 * Top token+chain combos ranked by 30d swap count for dynamic sorting
 * Returns: [{ chain: "eth", token: "USDC", swapCount: 42 }, ...]
 */
router.get('/api/crosschain/popular-pairs', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { rows } = await pool.query(`
      SELECT
        CASE WHEN direction = 'inflow' THEN source_chain ELSE dest_chain END as chain,
        CASE WHEN direction = 'inflow' THEN source_token ELSE dest_token END as token,
        COUNT(*) as swap_count
      FROM cross_chain_swaps
      WHERE status = 'SUCCESS'
        AND swap_created_at >= NOW() - INTERVAL '30 days'
        AND source_token NOT IN ('UNKNOWN_TOKEN', 'UNKNOWN', 'OTHER')
        AND dest_token NOT IN ('UNKNOWN_TOKEN', 'UNKNOWN', 'OTHER')
      GROUP BY chain, token
      ORDER BY swap_count DESC
      LIMIT 100
    `);

    res.json({
      success: true,
      pairs: rows.map(r => ({
        chain: r.chain,
        token: r.token,
        swapCount: parseInt(r.swap_count),
      })),
    });
  } catch (error) {
    console.error('Popular pairs error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
