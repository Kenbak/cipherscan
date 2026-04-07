/**
 * Privacy Routes
 *
 * Handles privacy analysis and risk detection endpoints backed by
 * precomputed linkage edges and batch clusters.
 */

const express = require('express');
const router = express.Router();
const { validate } = require('../validation');

// Dependencies injected via app.locals
let pool;
let redisClient;
let queryPrivacyLinkageEdges;
let queryPrivacyBatchClusters;
let detectBatchDeshields;
let detectBatchForShield;
let getPrivacyGraph;

// Middleware to inject dependencies
router.use((req, res, next) => {
  pool = req.app.locals.pool;
  redisClient = req.app.locals.redisClient;
  queryPrivacyLinkageEdges = req.app.locals.queryPrivacyLinkageEdges;
  queryPrivacyBatchClusters = req.app.locals.queryPrivacyBatchClusters;
  detectBatchDeshields = req.app.locals.detectBatchDeshields;
  detectBatchForShield = req.app.locals.detectBatchForShield;
  getPrivacyGraph = req.app.locals.getPrivacyGraph;
  next();
});

function summarizeRiskRows(rows, period) {
  return {
    total: rows.length,
    highRisk: rows.filter((row) => row.warningLevel === 'HIGH').length,
    mediumRisk: rows.filter((row) => row.warningLevel === 'MEDIUM').length,
    avgScore: rows.length > 0
      ? Math.round(rows.reduce((sum, row) => sum + row.score, 0) / rows.length)
      : 0,
    period,
  };
}

function summarizeBatchRows(rows, period) {
  return {
    total: rows.length,
    highRisk: rows.filter((row) => row.warningLevel === 'HIGH').length,
    mediumRisk: rows.filter((row) => row.warningLevel === 'MEDIUM').length,
    totalZecFlagged: rows.reduce((sum, row) => sum + row.totalAmountZec, 0),
    period,
    filteredTotal: rows.length,
  };
}

router.get('/api/privacy/risks', validate('privacyRisks'), async (req, res) => {
  try {
    const { transactions, pagination } = await queryPrivacyLinkageEdges(pool, {
      limit: Number(req.query.limit),
      offset: Number(req.query.offset),
      minScore: Number(req.query.minScore),
      period: req.query.period,
      riskLevel: req.query.riskLevel,
      sort: req.query.sort,
    });

    const stats = summarizeRiskRows(transactions, req.query.period);
    stats.total = pagination.total;

    console.log(`✅ [PRIVACY RISKS] Returning ${transactions.length}/${pagination.total}`);

    res.json({
      success: true,
      transactions,
      stats,
      pagination,
    });
  } catch (error) {
    console.error('❌ [PRIVACY RISKS] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch privacy risks',
    });
  }
});

router.get('/api/privacy/linkage-edges', validate('privacyLinkageEdges'), async (req, res) => {
  try {
    const result = await queryPrivacyLinkageEdges(pool, {
      limit: Number(req.query.limit),
      offset: Number(req.query.offset),
      minScore: Number(req.query.minScore),
      period: req.query.period,
      riskLevel: req.query.riskLevel,
      sort: req.query.sort,
      txid: req.query.txid || null,
    });

    res.json({
      success: true,
      edges: result.transactions,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error('❌ [LINKAGE EDGES] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch linkage edges',
    });
  }
});

router.get('/api/privacy/batch-risks', validate('privacyBatchRisks'), async (req, res) => {
  try {
    const result = await queryPrivacyBatchClusters(pool, {
      limit: Number(req.query.limit),
      period: req.query.period,
      riskLevel: req.query.riskLevel,
      sort: req.query.sort,
      afterScore: req.query.afterScore ? Number(req.query.afterScore) : null,
      afterAmount: req.query.afterAmount ? Number(req.query.afterAmount) : null,
      minScore: Number(req.query.minScore || 35),
    });
    const stats = summarizeBatchRows(result.patterns, req.query.period);
    stats.total = result.pagination.total;

    res.json({
      success: true,
      patterns: result.patterns,
      pagination: result.pagination,
      stats,
      algorithm: {
        version: '2.0',
        description: 'Precomputed batch clusters with amount, timing, conservation, and ambiguity scoring',
      },
    });
  } catch (error) {
    console.error('❌ [BATCH RISKS] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to detect batch patterns',
    });
  }
});

router.get('/api/privacy/clusters', validate('privacyBatchRisks'), async (req, res) => {
  try {
    const result = await queryPrivacyBatchClusters(pool, {
      limit: Number(req.query.limit),
      period: req.query.period,
      riskLevel: req.query.riskLevel,
      sort: req.query.sort,
      afterScore: req.query.afterScore ? Number(req.query.afterScore) : null,
      afterAmount: req.query.afterAmount ? Number(req.query.afterAmount) : null,
      minScore: Number(req.query.minScore || 35),
    });

    res.json({
      success: true,
      clusters: result.patterns,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error('❌ [CLUSTERS] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch clusters',
    });
  }
});

router.get('/api/privacy/graph/:txid', validate('privacyGraph'), async (req, res) => {
  try {
    const graph = await getPrivacyGraph(pool, req.params.txid);
    res.json({ success: true, ...graph });
  } catch (error) {
    console.error('❌ [PRIVACY GRAPH] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch privacy graph',
    });
  }
});

router.get('/api/privacy/shield/:txid/batch', validate('privacyGraph'), async (req, res) => {
  try {
    const result = await detectBatchForShield(pool, req.params.txid);
    if (result.error) {
      return res.status(404).json({
        success: false,
        error: result.error,
      });
    }
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('❌ [BATCH CHECK] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to analyze shield for batch patterns',
    });
  }
});

/**
 * GET /api/privacy/patterns
 *
 * Get stored legacy patterns from the detected_patterns table.
 */
router.get('/api/privacy/patterns', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const patternType = req.query.type?.toUpperCase();
    const riskLevel = (req.query.riskLevel || 'ALL').toUpperCase();

    let whereClause = 'WHERE expires_at > NOW()';
    const params = [];
    let paramIndex = 1;

    if (patternType) {
      whereClause += ` AND pattern_type = $${paramIndex++}`;
      params.push(patternType);
    }

    if (riskLevel !== 'ALL') {
      whereClause += ` AND warning_level = $${paramIndex++}`;
      params.push(riskLevel);
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM detected_patterns ${whereClause}`,
      params
    );
    const totalCount = parseInt(countResult.rows[0]?.total) || 0;

    params.push(limit, offset);
    const result = await pool.query(`
      SELECT
        id,
        pattern_type,
        score,
        warning_level,
        shield_txids,
        deshield_txids,
        total_amount_zat / 100000000.0 as total_amount_zec,
        per_tx_amount_zat / 100000000.0 as per_tx_amount_zec,
        batch_count,
        first_tx_time,
        last_tx_time,
        time_span_hours,
        metadata,
        detected_at
      FROM detected_patterns
      ${whereClause}
      ORDER BY score DESC, detected_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, params);

    const patterns = result.rows.map(row => ({
      id: row.id,
      patternType: row.pattern_type,
      score: row.score,
      warningLevel: row.warning_level,
      shieldTxids: row.shield_txids || [],
      deshieldTxids: row.deshield_txids || [],
      totalAmountZec: parseFloat(row.total_amount_zec),
      perTxAmountZec: parseFloat(row.per_tx_amount_zec),
      batchCount: row.batch_count,
      firstTime: row.first_tx_time,
      lastTime: row.last_tx_time,
      timeSpanHours: parseFloat(row.time_span_hours),
      metadata: row.metadata,
      detectedAt: row.detected_at,
    }));

    res.json({
      success: true,
      patterns,
      pagination: {
        total: totalCount,
        limit,
        offset,
        returned: patterns.length,
        hasMore: offset + limit < totalCount,
      },
      note: 'Legacy detected_patterns view. Prefer /api/privacy/clusters for the new linkage pipeline.',
    });
  } catch (error) {
    if (error.code === '42P01') {
      return res.json({
        success: true,
        patterns: [],
        pagination: { total: 0, limit: 0, offset: 0, returned: 0, hasMore: false },
        note: 'Pattern detection table not yet initialized. Run the migration.',
      });
    }

    console.error('❌ [PATTERNS] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch patterns',
    });
  }
});

/**
 * GET /api/privacy/common-amounts
 *
 * Get the most common shielding amounts (for privacy education).
 * Users can "blend in" by using popular amounts.
 *
 * Query params:
 *   - period: 24h, 7d, 30d, 90d (default 7d)
 *   - limit: number of amounts to return (default 10, max 50)
 *   - chain: optional source chain (btc, eth, sol, etc.) — cross-references
 *            with cross_chain_swaps to find ZEC amounts that also have common
 *            source-side amounts, giving dual-chain anonymity.
 */

// Redis cache for cross-referenced results (keyed per chain + period)
const COMMON_AMOUNTS_CACHE_PREFIX = 'zcash:common_amounts:';
const COMMON_AMOUNTS_CACHE_TTL = 900; // 15 minutes

router.get('/api/privacy/common-amounts', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
    const chain = (req.query.chain || '').toLowerCase();

    const periodMap = {
      '24h': 24 * 3600,
      '7d': 7 * 24 * 3600,
      '30d': 30 * 24 * 3600,
      '90d': 90 * 24 * 3600,
    };
    const periodKey = req.query.period || '7d';
    const periodSeconds = periodMap[periodKey] || periodMap['7d'];
    const minTime = Math.floor(Date.now() / 1000) - periodSeconds;
    const MIN_AMOUNT_ZAT = 1000000;

    // Try Redis cache
    const cacheKey = `${COMMON_AMOUNTS_CACHE_PREFIX}${chain || 'all'}:${periodKey}`;
    if (redisClient && redisClient.isOpen) {
      try {
        const cached = await redisClient.get(cacheKey);
        if (cached) return res.json(JSON.parse(cached));
      } catch {}
    }

    // Base query: common ZEC shielding amounts from shielded_flows
    const result = await pool.query(`
      SELECT
        ROUND(amount_zat / 100000000.0, 2) as amount_zec,
        COUNT(*) as tx_count,
        COUNT(DISTINCT txid) as unique_txs
      FROM shielded_flows
      WHERE block_time > $1
        AND amount_zat >= $2
      GROUP BY ROUND(amount_zat / 100000000.0, 2)
      ORDER BY tx_count DESC
      LIMIT $3
    `, [minTime, MIN_AMOUNT_ZAT, limit]);

    const totalResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM shielded_flows
      WHERE block_time > $1
        AND amount_zat >= $2
    `, [minTime, MIN_AMOUNT_ZAT]);

    const totalTxs = parseInt(totalResult.rows[0]?.total) || 1;

    // If chain is specified, cross-reference with cross_chain_swaps
    // to find how many swaps from that chain landed on each ZEC amount
    let chainSwapCounts = {};
    let chainSourceAmounts = {};
    if (chain) {
      const zecAmounts = result.rows.map(r => parseFloat(r.amount_zec));
      if (zecAmounts.length > 0) {
        const crossRef = await pool.query(`
          SELECT
            ROUND(dest_amount::numeric, 2) as zec_amount,
            COUNT(*) as swap_count,
            ROUND(AVG(source_amount)::numeric, 6) as avg_source_amount,
            source_token
          FROM cross_chain_swaps
          WHERE source_chain = $1
            AND direction = 'inflow'
            AND status = 'SUCCESS'
            AND swap_created_at >= NOW() - INTERVAL '${periodKey === '90d' ? '90 days' : periodKey === '30d' ? '30 days' : periodKey === '24h' ? '1 day' : '7 days'}'
            AND ROUND(dest_amount::numeric, 2) = ANY($2::numeric[])
          GROUP BY ROUND(dest_amount::numeric, 2), source_token
          ORDER BY swap_count DESC
        `, [chain, zecAmounts]);

        for (const row of crossRef.rows) {
          const key = parseFloat(row.zec_amount);
          chainSwapCounts[key] = (chainSwapCounts[key] || 0) + parseInt(row.swap_count);
          if (!chainSourceAmounts[key]) {
            chainSourceAmounts[key] = {
              avgAmount: parseFloat(row.avg_source_amount),
              token: row.source_token,
            };
          }
        }
      }
    }

    const commonAmounts = result.rows.map(row => {
      const amountZec = parseFloat(row.amount_zec);
      const entry = {
        amountZec,
        txCount: parseInt(row.tx_count),
        percentage: ((parseInt(row.tx_count) / totalTxs) * 100).toFixed(1),
        blendingScore: Math.min(100, Math.round((parseInt(row.tx_count) / totalTxs) * 1000)),
      };

      if (chain && chainSwapCounts[amountZec]) {
        entry.chainSwapCount = chainSwapCounts[amountZec];
        entry.sourceAmount = chainSourceAmounts[amountZec]?.avgAmount || null;
        entry.sourceToken = chainSourceAmounts[amountZec]?.token || null;
        entry.dualBlendScore = entry.blendingScore + Math.min(50, chainSwapCounts[amountZec]);
      }

      return entry;
    });

    // When chain is specified, sort by dual blend score (best on both sides first)
    if (chain) {
      commonAmounts.sort((a, b) => (b.dualBlendScore || b.blendingScore) - (a.dualBlendScore || a.blendingScore));
    }

    const response = {
      success: true,
      period: periodKey,
      chain: chain || null,
      totalTransactions: totalTxs,
      amounts: commonAmounts,
      tip: chain
        ? `Amounts that blend in on both the ${chain.toUpperCase()} and Zcash sides for maximum privacy.`
        : 'Using common amounts helps you blend in with other transactions, making linkability analysis harder.',
    };

    // Cache in Redis
    if (redisClient && redisClient.isOpen) {
      try { await redisClient.setEx(cacheKey, COMMON_AMOUNTS_CACHE_TTL, JSON.stringify(response)); } catch {}
    }

    res.json(response);
  } catch (error) {
    console.error('❌ [COMMON AMOUNTS] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch common amounts',
    });
  }
});

/**
 * GET /api/privacy/recommended-swap-amounts
 *
 * Privacy-aware swap amount recommendations based on cross-chain swap patterns.
 * Suggests amounts that blend into the highest-density anonymity sets.
 *
 * Query params:
 *   - chain: Source chain (eth, sol, btc, etc.)
 *   - token: Source token (USDC, BTC, etc.)
 */
router.get('/api/privacy/recommended-swap-amounts', validate('recommendedAmounts'), async (req, res) => {
  try {
    const chain = (req.query.chain || '').toLowerCase();
    const token = (req.query.token || '').toUpperCase();

    if (!chain || !token) {
      return res.status(400).json({
        success: false,
        error: 'chain and token query params required',
      });
    }

    // Stablecoins have price ~$1; non-stablecoins need a sanity check
    // to filter out mislabeled entries (e.g., USDC amounts tagged as SOL)
    const stablecoins = ['USDC', 'USDT', 'DAI', 'BUSD', 'TUSD', 'UST', 'FRAX'];
    const isStable = stablecoins.includes(token);

    // For non-stablecoins: exclude entries where amount ≈ amount_usd (implied price ~$1),
    // and also exclude extreme outliers beyond the 95th percentile
    let sanityFilter = '';
    if (!isStable) {
      sanityFilter = `
        AND (source_amount_usd = 0 OR ABS(source_amount_usd / NULLIF(source_amount, 0) - 1) > 0.3)
        AND source_amount < (
          SELECT COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY source_amount), 1e18)
          FROM cross_chain_swaps
          WHERE source_chain = $1 AND source_token = $2 AND status = 'SUCCESS'
            AND (source_amount_usd = 0 OR ABS(source_amount_usd / NULLIF(source_amount, 0) - 1) > 0.3)
        )`;
    }

    const { rows } = await pool.query(`
      SELECT
        source_amount as exact_amount,
        COUNT(*) as swap_count
      FROM cross_chain_swaps
      WHERE source_chain = $1 AND source_token = $2
        AND direction = 'inflow' AND status = 'SUCCESS'
        AND source_amount > 0
        AND source_token != 'UNKNOWN_TOKEN'
        AND swap_created_at >= NOW() - INTERVAL '7 days'
        ${sanityFilter}
      GROUP BY source_amount
      ORDER BY swap_count DESC, source_amount
      LIMIT 50
    `, [chain, token]);

    if (rows.length === 0) {
      return res.json({
        success: true,
        chain,
        token,
        recommendations: [],
        tip: `Not enough ${token} swap data from ${chain.toUpperCase()} this week to generate recommendations.`,
      });
    }

    // Group amounts that are within 2% of each other (same "intended" amount)
    const grouped = [];
    const used = new Set();
    for (let i = 0; i < rows.length; i++) {
      if (used.has(i)) continue;
      const amt = parseFloat(rows[i].exact_amount);
      let count = parseInt(rows[i].swap_count);
      for (let j = i + 1; j < rows.length; j++) {
        if (used.has(j)) continue;
        const other = parseFloat(rows[j].exact_amount);
        if (amt > 0 && Math.abs(other - amt) / amt <= 0.02) {
          count += parseInt(rows[j].swap_count);
          used.add(j);
        }
      }
      grouped.push({ amount: amt, swapCount: count });
      used.add(i);
    }

    grouped.sort((a, b) => b.swapCount - a.swapCount);

    const totalSwaps = grouped.reduce((s, g) => s + g.swapCount, 0);

    const recommendations = grouped
      .slice(0, 5)
      .map(g => {
        const pct = (g.swapCount / totalSwaps) * 100;
        return {
          amount: g.amount,
          swapCount: g.swapCount,
          percentage: parseFloat(pct.toFixed(1)),
          blendingScore: pct >= 10 ? 'high' : pct >= 5 ? 'medium' : 'low',
        };
      });

    const topRec = recommendations[0];
    const tip = topRec
      ? `Using common amounts makes your swap harder to trace. ${topRec.percentage}% of ${chain.toUpperCase()}→ZEC swaps this week used ~${topRec.amount} ${token}.`
      : '';

    res.json({
      success: true,
      chain,
      token,
      recommendations,
      tip,
    });
  } catch (error) {
    // Table may not exist yet
    if (error.code === '42P01') {
      return res.json({
        success: true,
        chain: req.query.chain,
        token: req.query.token,
        recommendations: [],
        tip: 'Cross-chain swap data is being collected. Recommendations coming soon.',
      });
    }
    console.error('Recommended amounts error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
