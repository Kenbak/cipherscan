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


router.get('/api/privacy/risks', validate('privacyRisks'), async (req, res) => {
  try {
    const { transactions, pagination, riskBreakdown } = await queryPrivacyLinkageEdges(pool, {
      limit: Number(req.query.limit) || undefined,
      offset: Number(req.query.offset) || undefined,
      minScore: req.query.minScore != null ? Number(req.query.minScore) : undefined,
      period: req.query.period,
      riskLevel: req.query.riskLevel,
      sort: req.query.sort,
    });

    const stats = {
      total: pagination.total,
      highRisk: riskBreakdown.HIGH,
      mediumRisk: riskBreakdown.MEDIUM,
      lowRisk: riskBreakdown.LOW,
      avgScore: transactions.length > 0
        ? Math.round(transactions.reduce((sum, row) => sum + row.score, 0) / transactions.length)
        : 0,
      period: req.query.period,
    };

    console.log(`✅ [PRIVACY RISKS] Returning ${transactions.length}/${pagination.total} (H:${riskBreakdown.HIGH} M:${riskBreakdown.MEDIUM} L:${riskBreakdown.LOW})`);

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

    const stats = {
      total: result.pagination.total,
      highRisk: result.riskBreakdown.HIGH,
      mediumRisk: result.riskBreakdown.MEDIUM,
      lowRisk: result.riskBreakdown.LOW,
      totalZecFlagged: result.patterns.reduce((sum, p) => sum + (p.totalAmountZec || 0), 0),
      period: req.query.period,
      filteredTotal: result.pagination.returned,
    };

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

// ============================================================================
// FEE LANE ANONYMITY ANALYSIS (ZIP-317)
// ============================================================================

/**
 * GET /api/privacy/fee-lanes?period=30d
 *
 * Computes fee-per-action buckets for shielded transactions using the ZIP-317
 * formula: conventional_actions = max(2, logical_actions), where
 * logical_actions = max(vin, vout) + max(sapling_spends, sapling_outputs)
 *                   + orchard_actions + ironwood_actions.
 *
 * Buckets: standard (5000 zat/action), priority (20000), non-standard (other).
 */
router.get('/api/privacy/fee-lanes', async (req, res) => {
  try {
    const period = req.query.period || '30d';
    const periodDays = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
    const days = periodDays[period] || 30;

    const blocksPerDay = 1152;
    const tipResult = await pool.query('SELECT MAX(height) as tip FROM blocks');
    const tip = parseInt(tipResult.rows[0].tip);
    const minHeight = tip - (days * blocksPerDay);

    const cacheKey = `fee-lanes:${period}`;
    if (redisClient) {
      try {
        const cached = await redisClient.get(cacheKey);
        if (cached) return res.json(JSON.parse(cached));
      } catch (_) {}
    }

    const [summaryResult, historyResult] = await Promise.all([
      pool.query(`
        WITH fee_calc AS (
          SELECT
            fee,
            GREATEST(2,
              GREATEST(vin_count, vout_count) +
              GREATEST(shielded_spends, shielded_outputs) +
              orchard_actions +
              COALESCE(ironwood_actions, 0)
            ) AS conv_actions
          FROM transactions
          WHERE block_height >= $1
            AND is_coinbase = false
            AND fee > 0
            AND (has_sapling = true OR has_orchard = true OR has_ironwood = true)
        )
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE fee = 5000 * conv_actions) AS standard,
          COUNT(*) FILTER (WHERE fee = 20000 * conv_actions) AS priority,
          COUNT(*) FILTER (WHERE fee != 5000 * conv_actions AND fee != 20000 * conv_actions) AS non_standard
        FROM fee_calc
      `, [minHeight]),

      pool.query(`
        WITH fee_calc AS (
          SELECT
            fee,
            block_time,
            GREATEST(2,
              GREATEST(vin_count, vout_count) +
              GREATEST(shielded_spends, shielded_outputs) +
              orchard_actions +
              COALESCE(ironwood_actions, 0)
            ) AS conv_actions
          FROM transactions
          WHERE block_height >= $1
            AND is_coinbase = false
            AND fee > 0
            AND (has_sapling = true OR has_orchard = true OR has_ironwood = true)
        )
        SELECT
          to_char(to_timestamp(block_time), 'YYYY-MM-DD') AS date,
          COUNT(*) FILTER (WHERE fee = 5000 * conv_actions) AS standard,
          COUNT(*) FILTER (WHERE fee = 20000 * conv_actions) AS priority,
          COUNT(*) FILTER (WHERE fee != 5000 * conv_actions AND fee != 20000 * conv_actions) AS non_standard
        FROM fee_calc
        GROUP BY 1
        ORDER BY 1
      `, [minHeight]),
    ]);

    const s = summaryResult.rows[0];
    const total = parseInt(s.total);
    const standard = parseInt(s.standard);
    const priority = parseInt(s.priority);
    const nonStandard = parseInt(s.non_standard);

    const response = {
      success: true,
      period,
      totalShieldedTxs: total,
      buckets: {
        standard: { count: standard, pct: total > 0 ? Math.round((standard / total) * 1000) / 10 : 0 },
        priority: { count: priority, pct: total > 0 ? Math.round((priority / total) * 1000) / 10 : 0 },
        non_standard: { count: nonStandard, pct: total > 0 ? Math.round((nonStandard / total) * 1000) / 10 : 0 },
      },
      history: historyResult.rows.map(r => ({
        date: r.date,
        standard: parseInt(r.standard),
        priority: parseInt(r.priority),
        non_standard: parseInt(r.non_standard),
      })),
    };

    if (redisClient) {
      try { await redisClient.setEx(cacheKey, 3600, JSON.stringify(response)); } catch (_) {}
    }

    res.json(response);
  } catch (error) {
    console.error('❌ [FEE LANES] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to compute fee lane distribution' });
  }
});

// ============================================================================
// WALLET FINGERPRINTING
// ============================================================================

/**
 * GET /api/privacy/wallet-fingerprints?period=30d
 *
 * Returns on-chain match counts for known wallet fingerprint patterns.
 * Signals: action padding, expiry delta, nLockTime, fee strategy.
 */
router.get('/api/privacy/wallet-fingerprints', async (req, res) => {
  try {
    const period = req.query.period || '30d';
    const periodDays = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
    const days = periodDays[period] || 30;

    const blocksPerDay = 1152;
    const tipResult = await pool.query('SELECT MAX(height) as tip FROM blocks');
    const tip = parseInt(tipResult.rows[0].tip);
    const minHeight = tip - (days * blocksPerDay);

    const cacheKey = `wallet-fingerprints:${period}`;
    if (redisClient) {
      try {
        const cached = await redisClient.get(cacheKey);
        if (cached) return res.json(JSON.parse(cached));
      } catch (_) {}
    }

    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (
          WHERE orchard_actions = 2 AND vin_count = 0 AND vout_count = 0
            AND has_orchard = true
        ) AS zashi_2action,

        COUNT(*) FILTER (
          WHERE orchard_actions = 4 AND vin_count = 0 AND vout_count = 0
            AND has_orchard = true
        ) AS vizor_4action,

        COUNT(*) FILTER (
          WHERE expiry_height IS NOT NULL AND expiry_height > 0
            AND (expiry_height - block_height) = 20
            AND has_orchard = true
        ) AS brave_expiry20,

        COUNT(*) FILTER (
          WHERE expiry_height IS NOT NULL AND expiry_height > 0
            AND (expiry_height - block_height) = 40
            AND has_orchard = true
        ) AS reference_expiry40,

        COUNT(*) FILTER (
          WHERE expiry_height IS NOT NULL AND expiry_height > 0
            AND (expiry_height - block_height) = 100
            AND (has_orchard = true OR has_sapling = true)
        ) AS zkool_expiry100,

        COUNT(*) FILTER (
          WHERE locktime > 0 AND locktime < 500000000
            AND has_orchard = true
        ) AS nonzero_locktime_height,

        COUNT(*) FILTER (
          WHERE orchard_actions >= 2 AND vin_count = 0 AND vout_count = 0
            AND has_orchard = true
        ) AS total_fully_shielded_orchard,

        COUNT(*) FILTER (
          WHERE has_sapling = true OR has_orchard = true OR has_ironwood = true
        ) AS total_shielded
      FROM transactions
      WHERE block_height >= $1
        AND is_coinbase = false
        AND fee > 0
    `, [minHeight]);

    const r = result.rows[0];

    const wallets = [
      {
        name: 'ZODL (librustzcash)',
        description: 'Reference wallet (formerly Zashi) using the official Zcash SDK',
        signals: {
          fee: { value: '5000/action', confidence: 'high', source: 'librustzcash SDK (DEFAULT_TX_EXPIRY_DELTA)' },
          expiry: { value: '+40 blocks', matchCount: parseInt(r.reference_expiry40), confidence: 'high', source: 'librustzcash DEFAULT_TX_EXPIRY_DELTA = 40' },
          locktime: { value: '0', confidence: 'high', source: 'librustzcash (never set)' },
          actionPadding: { value: '2 actions (min pad)', matchCount: parseInt(r.zashi_2action), confidence: 'high', source: 'orchard BundleType::Transactional pads to 2' },
        },
      },
      {
        name: 'Vizor',
        description: 'Self-custody desktop wallet (chainapsis) with Flutter + Rust',
        signals: {
          fee: { value: '5000/action', confidence: 'high', source: 'uses librustzcash transaction builder' },
          expiry: { value: '+40 blocks', matchCount: parseInt(r.reference_expiry40), confidence: 'high', source: 'librustzcash SDK (same as ZODL)' },
          locktime: { value: '0', confidence: 'high', source: 'librustzcash (same as ZODL)' },
          actionPadding: { value: '4 actions always', matchCount: parseInt(r.vizor_4action), confidence: 'high', source: 'source review — always 4 change notes' },
        },
      },
      {
        name: 'Brave',
        description: 'Browser wallet with own C++ ZCash implementation',
        signals: {
          fee: { value: '5000/action', confidence: 'medium', source: 'ZIP-317 compliant (brave-core PR #32580)' },
          expiry: { value: '+20 blocks', matchCount: parseInt(r.brave_expiry20), confidence: 'high', source: 'zcashd legacy default (ZIP-203), brave-core uses zcash_primitives 0.x' },
          locktime: { value: 'Current height', matchCount: parseInt(r.nonzero_locktime_height), confidence: 'high', source: 'brave-core sets locktime = chain tip (anti-reorg)' },
          actionPadding: { value: '2 actions (min)', confidence: 'medium', source: 'uses standard Orchard builder padding' },
        },
      },
      {
        name: 'Zkool',
        description: 'Successor to YWallet (hhanh00), multi-account Rust+Flutter wallet with Warp Sync 2',
        signals: {
          fee: { value: '5000/action', confidence: 'high', source: 'uses librustzcash FeeRule (zip317)' },
          expiry: { value: '+100 (pre-Mar 2026), +40 (current)', matchCount: parseInt(r.zkool_expiry100), confidence: 'high', source: 'zkool2 commit 393bf2d fixed delta from 100→40 (Mar 10 2026)' },
          locktime: { value: '0', confidence: 'high', source: 'uses librustzcash Builder (locktime=0 default)' },
          actionPadding: { value: '2 actions (min)', confidence: 'high', source: 'standard Orchard builder via librustzcash' },
        },
        note: 'Post-fix: indistinguishable from ZODL. Historical shielded txs with +100 are likely Zkool.',
      },
      {
        name: 'YWallet (deprecated)',
        description: 'Deprecated mobile wallet, predecessor to Zkool. Custom Warp Sync engine.',
        signals: {
          fee: { value: '5000/action', confidence: 'medium', source: 'ZIP-317 compliant (own builder)' },
          expiry: { value: 'Unknown (custom builder)', confidence: 'low', source: 'deprecated, replaced by Zkool' },
          locktime: { value: 'Unknown', confidence: 'low', source: 'custom builder' },
          actionPadding: { value: 'Unknown', confidence: 'low', source: 'deprecated' },
        },
      },
      {
        name: 'Edge',
        description: 'Multi-coin wallet using Zcash SDK (librustzcash)',
        signals: {
          fee: { value: '5000/action', confidence: 'high', source: 'uses librustzcash SDK' },
          expiry: { value: '+40 blocks', confidence: 'high', source: 'librustzcash SDK (same as ZODL)' },
          locktime: { value: '0', confidence: 'high', source: 'librustzcash SDK (same as ZODL)' },
          actionPadding: { value: '2 actions (min)', confidence: 'high', source: 'standard Orchard padding via SDK' },
        },
        note: 'Indistinguishable from ZODL on-chain',
      },
      {
        name: 'Unstoppable',
        description: 'Multi-coin wallet using Zcash SDK (librustzcash)',
        signals: {
          fee: { value: '5000/action', confidence: 'high', source: 'uses librustzcash SDK' },
          expiry: { value: '+40 blocks', confidence: 'high', source: 'librustzcash SDK (same as ZODL)' },
          locktime: { value: '0', confidence: 'high', source: 'librustzcash SDK (same as ZODL)' },
          actionPadding: { value: '2 actions (min)', confidence: 'high', source: 'standard Orchard padding via SDK' },
        },
        note: 'Indistinguishable from ZODL on-chain',
      },
    ];

    const response = {
      success: true,
      period,
      totalShielded: parseInt(r.total_shielded),
      totalFullyShieldedOrchard: parseInt(r.total_fully_shielded_orchard),
      wallets,
    };

    if (redisClient) {
      try { await redisClient.setEx(cacheKey, 3600, JSON.stringify(response)); } catch (_) {}
    }

    res.json(response);
  } catch (error) {
    console.error('❌ [WALLET FINGERPRINTS] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to compute wallet fingerprints' });
  }
});

module.exports = router;
